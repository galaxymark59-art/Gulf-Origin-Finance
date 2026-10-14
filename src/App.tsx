import { deletionNote, merchantDeletion, deletedIds } from "./deletion";
import appMark from "./assets/mcube-logo.svg";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { App as CapacitorApp } from "@capacitor/app";
import {
  LayoutDashboard,
  Users,
  Wallet,
  BarChart3,
  Settings as SettingsIcon,
  Plus,
  RefreshCw,
  Globe,
  ArrowLeft,
  Download,
  ShieldCheck,
  Bell,
  Trash2,
} from "lucide-react";
import { supabase } from "./client";
import { native } from "./native";
import { desktop } from "./desktop";
import { FinanceEngine } from "./engine";
import { getLock } from "./security";
import { shouldLockOnReturn, shouldLockForInactivity } from "./lock-policy";
import { withStartupTimeout } from "./startup";
import { LanguageContext, useText } from "./i18n";
import {
  money,
  collection,
  day,
  friendly,
  type Language,
  type Merchant,
  type Entry,
  type Operation,
} from "./domain";
import { Auth, LockScreen } from "./components/Auth";
import { Modal, Field } from "./components/Common";
import { MerchantForm, EntryForm } from "./components/Forms";
import {
  Dashboard,
  Merchants,
  Ledger,
  type EntryActions,
} from "./components/Views";
import { Reports } from "./components/FinanceReports";
import { Settings } from "./components/Settings";
import {
  receiptFile,
  paymentReceiptFile,
  shareFile,
  saveFile,
} from "./documents";
import { can, isOverdue, reminderUrl, reminderText } from "./finance";
import { Goods } from "./components/Goods";
import { GoodsForm } from "./components/GoodsForm";
import { Cash, Savings } from "./components/Cash";
import { More } from "./components/More";
import { personLabel, personName, initials } from "./presentation";
import { Users as UserAccounts } from "./components/Users";
import { exportReport, statementReport } from "./exports";
import { ChangePassword } from "./components/ChangePassword";
import { usePaymentAlerts } from "./notifications";
import { applyTheme, themeLogo } from "./themes";
const ExistingRecords = lazy(() => import("./components/ExistingRecords"));
export function App() {
  const [session, setSession] = useState<Session | null>();
  const alerts = usePaymentAlerts(session);
  const [recovery, setRecovery] = useState(false);
  const [locked, setLocked] = useState<boolean>();
  const [lockOwner, setLockOwner] = useState<string>();
  const [startupError, setStartupError] = useState<"session" | "lock">();
  const [setup, setSetup] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [privateCover, setPrivateCover] = useState(false);
  const backgroundAt = useRef<number | null>(null);
  const [language, setLanguage] = useState<Language>(
    (localStorage.getItem("gulf-language") as Language) || "en",
  );
  useEffect(() => {
    let active = true;
    void withStartupTimeout(supabase.auth.getSession())
      .then(({ data, error }) => {
        if (error) throw error;
        if (active) setSession(data.session);
      })
      .catch(() => {
        if (active) setStartupError("session");
      });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (!active) return;
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!session?.user.id) {
      setLocked(false);
      setLockOwner(undefined);
      return;
    }
    let active = true;
    void withStartupTimeout(getLock(session.user.id))
      .then((lock) => {
        if (active) {
          setSetup((native || Boolean(desktop)) && !lock);
          setLocked(Boolean(lock));
          setHasPin(Boolean(lock));
          setLockOwner(session.user.id);
        }
      })
      .catch(() => {
        if (active) setStartupError("lock");
      });
    return () => {
      active = false;
    };
  }, [session?.user.id]);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    localStorage.setItem("gulf-language", language);
  }, [language]);
  useEffect(() => {
    if (!session) return;
    if (desktop) void supabase.auth.startAutoRefresh();
    let last = Date.now();
    const activity = () => {
      last = Date.now();
    };
    const timer = setInterval(() => {
      if (shouldLockForInactivity(hasPin, last, Date.now())) setLocked(true);
    }, 15000);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    const activeChange = (isActive: boolean) => {
      if (!isActive) {
        backgroundAt.current = Date.now();
        setPrivateCover(true);
        if (native) supabase.auth.stopAutoRefresh();
      } else {
        if (shouldLockOnReturn(hasPin, backgroundAt.current, Date.now()))
          setLocked(true);
        backgroundAt.current = null;
        last = Date.now();
        setPrivateCover(false);
        if (native) supabase.auth.startAutoRefresh();
      }
    };
    const handle = native
      ? CapacitorApp.addListener("appStateChange", ({ isActive }) =>
          activeChange(isActive),
        )
      : undefined;
    const desktopOff = desktop?.onActiveChange(activeChange);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      void handle?.then((h) => h.remove());
      desktopOff?.();
    };
  }, [session?.user.id, hasPin]);
  let content: ReactNode;
  if (startupError)
    content = (
      <div className="loading" role="alert">
        <img src={appMark} alt="" width="60" />
        <h2>Unable to open your workspace</h2>
        <p>
          {startupError === "session"
            ? "Your saved sign-in could not be read. Check your connection and retry."
            : "Your encrypted device storage could not be opened. Check available device space and retry."}
        </p>
        <p>Your saved records have not been cleared.</p>
        <button className="primary" onClick={() => location.reload()}>
          Retry opening app
        </button>
      </div>
    );
  else if (session === undefined || (session && lockOwner !== session.user.id))
    content = (
      <div className="loading">
        <img src={appMark} alt="" width="60" />
        <p>Opening your workspace…</p>
      </div>
    );
  else if (!session) content = <Auth />;
  else if (locked || setup)
    content = (
      <LockScreen
        owner={session.user.id}
        email={session.user.email || ""}
        setup={setup}
        onUnlock={(needsSetup = false) => {
          setLocked(false);
          setSetup(needsSetup);
          setHasPin(!needsSetup);
        }}
      />
    );
  else
    content = (
      <Workspace
        key={session.user.id}
        session={session}
        language={language}
        setLanguage={setLanguage}
        alerts={alerts}
        onLock={() =>
          void getLock(session.user.id).then((l) => {
            if (l) setLocked(true);
            else setSetup(true);
          })
        }
      />
    );
  return (
    <LanguageContext value={language}>
      <div hidden={privateCover}>{content}</div>
      {alerts.toast && (
        <div className="toast" role="status">
          {alerts.toast}
        </div>
      )}
      {privateCover && (
        <div className="privacy-cover">
          <img src={appMark} alt="" width="60" />
          <p>Mcube Exporters · Private workspace</p>
        </div>
      )}
      {recovery && session && (
        <PasswordRecovery onDone={() => setRecovery(false)} />
      )}
    </LanguageContext>
  );
}
function PasswordRecovery({ onDone }: { onDone: () => void }) {
  const [message, setMessage] = useState("");
  return (
    <Modal title="Set a new password" onClose={onDone}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (f.get("password") !== f.get("confirm")) {
            setMessage("Passwords do not match.");
            return;
          }
          const { error } = await supabase.auth.updateUser({
            password: String(f.get("password")),
          });
          if (error) setMessage(friendly(error.message));
          else onDone();
        }}
      >
        <Field label="New password">
          <input
            type="password"
            name="password"
            minLength={12}
            required
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm password">
          <input
            type="password"
            name="confirm"
            required
            autoComplete="new-password"
          />
        </Field>
        {message && <p className="alert">{message}</p>}
        <button className="primary full">Save password</button>
      </form>
    </Modal>
  );
}
function Workspace({
  session,
  language,
  setLanguage,
  onLock,
  alerts,
}: {
  session: Session;
  language: Language;
  setLanguage: (l: Language) => void;
  onLock: () => void;
  alerts: ReturnType<typeof usePaymentAlerts>;
}) {
  const t = useText();
  const engine = useMemo(
    () => new FinanceEngine(session.user.id),
    [session.user.id],
  );
  const [, render] = useState(0);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [selected, setSelected] = useState<string>();
  const [modal, setModal] = useState<
    | "merchant"
    | "edit"
    | "payment"
    | "adjustment"
    | "reversal"
    | "invoice"
    | "return"
    | "statement"
    | "reminder"
    | "delete-merchant"
  >();
  const [reversal, setReversal] = useState<Entry>();
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [reportUser, setReportUser] = useState("");
  const [settingsTab, setSettingsTab] = useState("business");
  useEffect(() => {
    const unsubscribe = engine.subscribe(() => render((n) => n + 1));
    let alive = true;
    void engine
      .initialize()
      .then(() => {
        if (alive) {
          setReady(true);
          void engine.sync();
        }
      })
      .catch(() => {
        if (alive)
          setToast(
            t(
              "Local storage could not be opened. Free device space and reopen the app.",
              "تعذر فتح التخزين المحلي. حرر مساحة وأعد فتح التطبيق.",
            ),
          );
      });
    const online = () => void engine.sync();
    window.addEventListener("online", online);
    const offline = () => render((n) => n + 1);
    window.addEventListener("offline", offline);
    const timer = setInterval(online, 60000);
    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      clearInterval(timer);
    };
  }, [engine]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  const state = engine.view();
  useLayoutEffect(() => {
    if (ready) applyTheme(state.business.theme);
  }, [ready, state.business.theme]);
  const deletedEntryIds = deletedIds(state.entries);
  useEffect(() => {
    if (!native) return;
    const listener = CapacitorApp.addListener("backButton", () => {
      if (modal) setModal(undefined);
      else if (page !== "dashboard") {
        setPage("dashboard");
        setSelected(undefined);
      } else void CapacitorApp.exitApp();
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [modal, page]);
  const merchant = state.merchants.find((m) => m.id === selected);
  const notify = (message: string) => setToast(message);
  async function receiptAction(
    e: Entry,
    action: "download" | "share" | "sent",
  ) {
    if (busy) return;
    setBusy(true);
    try {
      const r = engine.view().receipts.find((r) => r.transaction_id === e.id);
      if (!r)
        throw Error(
          t(
            "Sync this transaction before creating its final PDF.",
            "زامن هذه المعاملة قبل إنشاء PDF النهائي.",
          ),
        );
      if (action === "sent") {
        await engine.enqueue({
          id: crypto.randomUUID(),
          kind: "share",
          payload: { id: r.id, status: "confirmed_sent" },
          created_at: new Date().toISOString(),
        });
        notify(
          t("Marked as manually confirmed sent.", "تم تأكيد الإرسال يدوياً."),
        );
        return;
      }
      const file =
        e.kind === "payment"
          ? await paymentReceiptFile(r, state)
          : await receiptFile(r, state.businessOwner);
      if (action === "download") {
        await saveFile(file);
        notify(t("PDF saved.", "تم حفظ PDF."));
      } else {
        const initiated = await shareFile(file);
        if (initiated) {
          await engine.enqueue({
            id: crypto.randomUUID(),
            kind: "share",
            payload: { id: r.id, status: "share_initiated" },
            created_at: new Date().toISOString(),
          });
          notify(
            t(
              "Share opened. Confirm manually after sending in WhatsApp.",
              "فتحت المشاركة. أكد الإرسال يدوياً بعد الإرسال في واتساب.",
            ),
          );
        } else
          notify(
            t(
              "PDF saved. Attach it in WhatsApp to share.",
              "تم تنزيل PDF. مشاركة الملفات غير متاحة في هذا المتصفح.",
            ),
          );
      }
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : t(
              "Receipt action failed. Retry from the ledger.",
              "فشلت العملية. أعد المحاولة من السجل.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  const actions: EntryActions = {
    bulkDelete: async (ids) => {
      const count = await engine.deleteSelected("entries", ids);
      notify(count + " entries deleted on this device. Syncing to the cloud.");
    },
    download: (e) => void receiptAction(e, "download"),
    share: (e) => void receiptAction(e, "share"),
    sent: (e) => void receiptAction(e, "sent"),
    reverse: (e) => {
      setReversal(e);
      setModal("reversal");
    },
  };
  const navigation = [
    {
      id: "dashboard",
      label: t("Dashboard", "الرئيسية"),
      icon: LayoutDashboard,
    },
    { id: "merchants", label: t("Merchants", "التجار"), icon: Users },
    { id: "collections", label: t("Collections", "التحصيل"), icon: Wallet },
    { id: "reports", label: t("Reports", "التقارير"), icon: BarChart3 },
    { id: "more", label: t("More", "المزيد"), icon: SettingsIcon },
  ];
  const openMerchant = (m: Merchant) => {
    setSelected(m.id);
    setPage("merchant");
  };
  const openPayment = () => {
    setSelected(undefined);
    setModal("payment");
  };
  const synced =
    state.queue.length === 0 && Boolean(state.lastSync) && !engine.error;
  const writable = can(state.member, "record_transactions");
  async function saveEntry(op: Operation, share: boolean) {
    await engine.enqueue(op);
    setModal(undefined);
    notify("Saved on this device. Syncing to the cloud.");
    if (share) {
      await engine.sync();
      await engine.whenIdle();
      const entry = engine.view().entries.find((e) => e.id === op.id);
      if (entry && !entry.pending) await receiptAction(entry, "share");
      else notify("Saved offline. Share the final PDF after syncing.");
    }
  }
  if (engine.accessDenied)
    return (
      <div className="loading" role="alert">
        <img src={appMark} alt="" width="60" />
        <h2>Account access is unavailable</h2>
        <p>
          Ask an owner to check your account and permissions. Your pending
          records are still saved securely.
        </p>
        <button className="primary" onClick={() => void engine.sync()}>
          Check access again
        </button>
        <button
          className="secondary"
          onClick={() => void supabase.auth.signOut()}
        >
          Sign out
        </button>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("dashboard");
          }}
        >
          <img src={themeLogo(state.business.theme)} alt="" width="42" />
          <span>
            Mcube Exporters<small>FINANCE WORKSPACE</small>
          </span>
        </a>
        <div className="workspace-tag">
          <span className="workspace-dot" />
          {personLabel(state)}
        </div>
        <nav aria-label={t("Main navigation", "التنقل الرئيسي")}>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={
                page === item.id ||
                (page === "merchant" && item.id === "merchants") ||
                ([
                  "settings",
                  "invoices",
                  "returns",
                  "cash",
                  "savings",
                  "users",
                ].includes(page) &&
                  item.id === "more")
                  ? "active"
                  : ""
              }
              onClick={() => {
                setPage(item.id);
                setSelected(undefined);
              }}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.id === "collections" &&
                state.receipts.filter(
                  (r) =>
                    r.status !== "confirmed_sent" &&
                    !deletedEntryIds.has(r.transaction_id),
                ).length > 0 && (
                  <b>
                    {
                      state.receipts.filter(
                        (r) =>
                          r.status !== "confirmed_sent" &&
                          !deletedEntryIds.has(r.transaction_id),
                      ).length
                    }
                  </b>
                )}
            </button>
          ))}
        </nav>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Mcube Exporters <span>/</span>{" "}
            {navigation.find((n) => n.id === page)?.label ||
              merchant?.name ||
              (
                {
                  settings: "Settings",
                  invoices: "Goods supplied",
                  returns: "Goods returned",
                  cash: "Cash & expenses",
                  savings: "Savings",
                  users: "People & access",
                  import: "Import records",
                } as Record<string, string>
              )[page] ||
              "Workspace"}
            <small className="mobile-account-name">{personLabel(state)}</small>
          </div>
          <div className="topbar-actions">
            {state.member?.id === state.businessOwner &&
              state.member?.role === "owner" && (
                <button
                  className="icon"
                  aria-label="Collection alerts"
                  title="Collection alerts"
                  onClick={() => {
                    setSettingsTab("notifications");
                    setPage("settings");
                  }}
                >
                  <Bell size={19} />
                  {alerts.events.filter((e) => !e.seen_at).length > 0 && (
                    <b>{alerts.events.filter((e) => !e.seen_at).length}</b>
                  )}
                </button>
              )}
            <button
              className={
                "sync-indicator " +
                (!synced || !navigator.onLine ? "pending" : "")
              }
              onClick={() => void engine.sync()}
              title={t("Sync now", "مزامنة الآن")}
            >
              <span className="status-dot" />
              {engine.syncing
                ? t("Syncing…", "تجري المزامنة…")
                : !navigator.onLine
                  ? t("Offline", "غير متصل")
                  : !synced
                    ? state.queue.length
                      ? state.queue.length + " " + t("pending", "معلق")
                      : t("Awaiting sync", "بانتظار المزامنة")
                    : t("Synced", "تمت المزامنة")}
            </button>
            <button
              className="icon"
              aria-label={t("Switch language", "تغيير اللغة")}
              title={t("Switch language", "تغيير اللغة")}
              onClick={() => setLanguage(language === "en" ? "ar" : "en")}
            >
              <Globe size={19} />
            </button>
            <button
              className="account-menu"
              aria-label={personLabel(state) + ". Open my settings"}
              title={personLabel(state)}
              onClick={() => {
                setSettingsTab("business");
                setPage("settings");
              }}
            >
              <span className="owner-avatar">
                {initials(personName(state))}
              </span>
              <span className="account-name">{personLabel(state)}</span>
            </button>
          </div>
        </header>
        <div className="content">
          {engine.error && (
            <div className="alert" role="alert">
              {engine.error}{" "}
              <button className="link" onClick={() => setPage("settings")}>
                {t("Open sync settings", "فتح إعدادات المزامنة")}
              </button>
            </div>
          )}
          {state.queue.length > 0 && (
            <div className="local-banner">
              {t(
                "Includes locally saved records awaiting cloud confirmation.",
                "تتضمن قيوداً محفوظة محلياً وتنتظر تأكيد السحابة.",
              )}
            </div>
          )}
          {!ready ? (
            <div className="loading">
              {t("Loading your records…", "جار تحميل القيود…")}
            </div>
          ) : page === "dashboard" ? (
            <Dashboard
              state={state}
              onMerchant={openMerchant}
              onPayment={openPayment}
              onAdd={() => setModal("merchant")}
              actions={actions}
            />
          ) : page === "merchants" ? (
            <Merchants
              state={state}
              onDelete={async (ids) => {
                await engine.deleteSelected("merchants", ids);
                notify(
                  "Merchants moved to Deleted merchants. Syncing to the cloud.",
                );
              }}
              onMerchant={openMerchant}
              onAdd={() => setModal("merchant")}
              onImport={() => setPage("import")}
            />
          ) : page === "import" ? (
            <Suspense fallback={<p>Opening file import…</p>}>
              <ExistingRecords
                state={state}
                engine={engine}
                onDone={() => setPage("merchants")}
              />
            </Suspense>
          ) : page === "merchant" && merchant ? (
            <>
              <button
                className="link back"
                onClick={() => setPage("merchants")}
              >
                <ArrowLeft size={17} />
                {t("Merchants", "التجار")}
              </button>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {merchant.prefix} ·{" "}
                    {merchant.language === "ar" ? "العربية" : "English"}{" "}
                    {t("receipts", "إيصالات")}
                  </p>
                  <h1>{merchant.name}</h1>
                  <p>
                    {[merchant.phone, merchant.city, merchant.contact]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {writable && (
                  <button
                    className="secondary"
                    onClick={() => setModal("edit")}
                  >
                    {t("Edit merchant", "تعديل التاجر")}
                  </button>
                )}
              </div>
              <div className="stats three">
                <article className="stat featured">
                  <span>{t("Current outstanding", "الرصيد الحالي")}</span>
                  <strong>{money(merchant.balance)}</strong>
                </article>
                <article className="stat">
                  <span>{t("Opening balance", "الرصيد الافتتاحي")}</span>
                  <strong>{money(merchant.opening)}</strong>
                </article>
                <article className="stat">
                  <span>{t("Collected, all time", "إجمالي التحصيل")}</span>
                  <strong>
                    {money(
                      collection(
                        state.entries.filter(
                          (e) => e.merchant_id === merchant.id,
                        ),
                        "1900-01-01",
                        "2999-12-31",
                      ),
                    )}
                  </strong>
                </article>
              </div>
              {merchant.deleted_at && (
                <p className="alert">
                  This merchant is deleted. Their saved history is kept below.
                </p>
              )}
              <div className="workspace-actions">
                {can(state.member, "manage_users") &&
                  (merchant.deleted_at ? (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await engine.enqueue(
                            merchantDeletion(state, merchant.id, false),
                          );
                          notify("Merchant restored.");
                        } catch (error) {
                          notify(
                            error instanceof Error
                              ? friendly(error.message)
                              : "Unable to restore merchant.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Restore merchant
                    </button>
                  ) : (
                    <button
                      className="secondary danger"
                      onClick={() => setModal("delete-merchant")}
                    >
                      <Trash2 size={17} /> Delete merchant
                    </button>
                  ))}
                {writable && !merchant.deleted_at && (
                  <>
                    <button
                      className="primary"
                      onClick={() => setModal("payment")}
                    >
                      <Plus size={18} />
                      {t("Add collection", "تسجيل دفعة")}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setModal("adjustment")}
                    >
                      {t("Correct amount owed", "تعديل الرصيد")}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setModal("invoice")}
                    >
                      Add goods supplied
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setModal("return")}
                    >
                      Add goods returned
                    </button>
                  </>
                )}
                {can(state.member, "export_reports") && (
                  <button
                    className="secondary"
                    onClick={() => setModal("statement")}
                  >
                    <Download size={17} />
                    {t("Download statement", "تنزيل كشف الحساب")}
                  </button>
                )}
                {isOverdue(merchant) && writable && (
                  <button
                    className="secondary"
                    onClick={() => setModal("reminder")}
                  >
                    WhatsApp reminder
                  </button>
                )}
              </div>
              <p className="hint">
                Add collection means money received from this merchant. For
                goods sold or returned, use the goods buttons. Correct amount
                owed fixes a mistake in the amount due; it does not record cash.{" "}
                {merchant.due_on
                  ? "Payment due: " + merchant.due_on
                  : "Set a payment due date in Edit merchant to enable overdue reminders."}
              </p>
              {merchant.notes && (
                <p className="merchant-notes">{merchant.notes}</p>
              )}
              <section className="card">
                <div className="section-heading">
                  <h2>{t("Merchant history", "سجل التاجر الكامل")}</h2>
                </div>
                <Ledger
                  key={merchant.id}
                  state={state}
                  entries={state.entries.filter(
                    (e) => e.merchant_id === merchant.id,
                  )}
                  actions={actions}
                />
              </section>
            </>
          ) : page === "collections" ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {t("EVERY MOVEMENT, ACCOUNTED FOR", "كل حركة مسجلة")}
                  </p>
                  <h1>{t("Collections", "سجل التحصيل.")}</h1>
                  <p>
                    {t(
                      "See money received from merchants and changes to what they owe. Add expenses in More → Cash & expenses.",
                      "سجل دائم وكامل للدفعات والتعديلات.",
                    )}
                  </p>
                </div>
                {writable && (
                  <button className="primary" onClick={openPayment}>
                    <Plus size={18} />
                    {t("Add collection", "تسجيل دفعة")}
                  </button>
                )}
              </div>
              <section className="card">
                <Ledger
                  state={state}
                  entries={state.entries}
                  actions={actions}
                />
              </section>
            </>
          ) : page === "reports" ? (
            <Reports
              key={reportUser}
              state={state}
              actions={actions}
              notify={notify}
              initialUser={reportUser}
            />
          ) : page === "invoices" || page === "returns" ? (
            <Goods
              key={page}
              state={state}
              kind={page === "invoices" ? "invoice" : "return"}
              onAdd={() => setModal(page === "invoices" ? "invoice" : "return")}
              onMerchant={openMerchant}
              actions={actions}
              notify={notify}
            />
          ) : page === "cash" ? (
            <Cash
              state={state}
              onDelete={async (ids) => {
                await engine.deleteSelected("cash", ids);
                notify("Entries deleted on this device. Syncing to the cloud.");
              }}
              onSave={(op) => engine.enqueue(op)}
              notify={notify}
            />
          ) : page === "savings" ? (
            <Savings
              state={state}
              onDelete={async (ids) => {
                await engine.deleteSelected("cash", ids);
                notify("Entries deleted on this device. Syncing to the cloud.");
              }}
              onSave={(op) => engine.enqueue(op)}
              notify={notify}
            />
          ) : page === "users" ? (
            <UserAccounts
              state={state}
              notify={notify}
              onRefresh={() => engine.sync()}
              onHistory={(id) => {
                setReportUser(id);
                setPage("reports");
              }}
            />
          ) : page === "more" ? (
            <More state={state} onOpen={setPage} />
          ) : (
            <Settings
              state={state}
              engine={engine}
              onLock={onLock}
              notify={notify}
              initialTab={settingsTab}
              alerts={alerts}
            />
          )}
        </div>
      </main>
      {state.member?.must_change_password && (
        <Modal title="Choose your own password" required onClose={() => {}}>
          <p>
            An owner gave you a temporary password. Change it before continuing.
          </p>
          <ChangePassword onDone={() => void engine.sync()} />
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {busy && (
        <div className="working" role="status">
          {t("Preparing document…", "جار تجهيز المستند…")}
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "delete-merchant"
              ? "Delete merchant?"
              : modal === "merchant"
                ? t("Add merchant", "إضافة تاجر")
                : modal === "invoice"
                  ? "Add goods supplied"
                  : modal === "return"
                    ? "Add goods returned"
                    : modal === "statement"
                      ? "Merchant statement"
                      : modal === "reminder"
                        ? "WhatsApp payment reminder"
                        : modal === "edit"
                          ? t("Edit merchant", "تعديل التاجر")
                          : modal === "payment"
                            ? t("Add collection", "تسجيل دفعة")
                            : modal === "adjustment"
                              ? t("Correct amount owed", "تعديل الرصيد")
                              : t("Delete entry", "عكس المعاملة")
          }
          onClose={() => setModal(undefined)}
        >
          {modal === "delete-merchant" && merchant ? (
            <>
              <p>
                Delete <strong>{merchant.name}</strong> from your merchant list?
                Saved payments and receipts stay in history. You can restore the
                merchant from Deleted merchants.
              </p>
              <p className="hint">
                The saved record keeps its amount owed:{" "}
                {money(merchant.balance)}.
              </p>
              <button
                className="primary danger full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await engine.enqueue(
                      merchantDeletion(state, merchant.id, true),
                    );
                    setModal(undefined);
                    setPage("merchants");
                    setSelected(undefined);
                    notify(
                      "Merchant deleted. You can restore it from Deleted merchants.",
                    );
                  } catch (error) {
                    notify(
                      error instanceof Error
                        ? friendly(error.message)
                        : "Unable to delete merchant.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Delete merchant
              </button>
            </>
          ) : modal === "statement" && merchant ? (
            <Statement state={state} merchant={merchant} notify={notify} />
          ) : modal === "reminder" && merchant ? (
            <>
              <p>
                Check the message before opening WhatsApp. You choose when to
                send it.
              </p>
              <textarea
                readOnly
                rows={6}
                value={reminderText(merchant, state.business.name)}
              />
              <a
                className="primary full"
                href={reminderUrl(merchant, state.business.name)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open WhatsApp reminder
              </a>
            </>
          ) : modal === "invoice" || modal === "return" ? (
            <GoodsForm
              state={state}
              selected={merchant}
              kind={modal}
              onSave={saveEntry}
            />
          ) : modal === "merchant" || modal === "edit" ? (
            <MerchantForm
              merchant={modal === "edit" ? merchant : undefined}
              onSave={async (op) => {
                await engine.enqueue(op);
                setModal(undefined);
                notify(
                  t(
                    "Merchant saved on this device.",
                    "تم حفظ التاجر على الجهاز.",
                  ),
                );
              }}
            />
          ) : modal === "reversal" && reversal ? (
            <>
              <p>
                {t(
                  "Delete this entry? Its effect on the merchant balance and cash is cancelled. It is removed from the main list. A copy stays under Deleted entries for your records.",
                  "يضيف هذا قيداً عكسياً دائماً مع الاحتفاظ بالمعاملة الأصلية.",
                )}
              </p>
              <div className="balance-preview">
                <span>{reversal.reference}</span>
                <strong>{money(reversal.delta)}</strong>
              </div>
              <button
                className="primary danger full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const m = state.merchants.find(
                      (m) => m.id === reversal.merchant_id,
                    )!;
                    const id = crypto.randomUUID();
                    await engine.enqueue({
                      id,
                      kind: "entry",
                      expected: m.balance,
                      created_at: new Date().toISOString(),
                      payload: {
                        ...reversal,
                        id,
                        kind: "reversal",
                        delta: -reversal.delta,
                        reverses: reversal.id,
                        allow_credit: true,
                        occurred_at: new Date().toISOString(),
                        note: deletionNote(reversal.reference),
                      },
                    });
                    setModal(undefined);
                    notify(
                      t(
                        "Entry deleted. A copy is kept under Deleted entries.",
                        "تم حفظ القيد العكسي محلياً.",
                      ),
                    );
                  } catch (error) {
                    notify(
                      error instanceof Error
                        ? friendly(error.message)
                        : "Unable to delete. Please retry.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("Delete entry", "تأكيد العكس")}
              </button>
            </>
          ) : (
            <EntryForm
              merchants={state.merchants.filter((m) => !m.deleted_at)}
              selected={merchant}
              kind={modal === "adjustment" ? "adjustment" : "payment"}
              onSave={async (op, share) => {
                await engine.enqueue(op);
                setModal(undefined);
                notify(
                  t(
                    "Saved on this device. Syncing to the cloud.",
                    "تم الحفظ على الجهاز. جار المزامنة مع السحابة.",
                  ),
                );
                if (share) {
                  await engine.sync();
                  await engine.whenIdle();
                  const entry = engine
                    .view()
                    .entries.find((e) => e.id === op.id);
                  if (entry && !entry.pending)
                    await receiptAction(entry, "share");
                  else
                    notify(
                      t(
                        "Saved offline. Share the final PDF after syncing.",
                        "تم الحفظ دون اتصال. شارك PDF النهائي بعد المزامنة.",
                      ),
                    );
                }
              }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
function Statement({
  state,
  merchant,
  notify,
}: {
  state: import("./domain").State;
  merchant: Merchant;
  notify: (s: string) => void;
}) {
  const today = day(new Date().toISOString()),
    [from, setFrom] = useState(
      day(new Date(Date.now() - 9 * 86400000).toISOString()),
    ),
    [to, setTo] = useState(today),
    [busy, setBusy] = useState(false);
  async function download(format: "pdf" | "xlsx") {
    setBusy(true);
    try {
      await exportReport(statementReport(state, merchant, from, to), format);
      notify("Merchant statement saved.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Export failed. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p>
        Starts with the latest 10 days. Choose earlier dates for a longer
        history. Each payment, invoice, return and correction has its own row.
      </p>
      <div className="form-grid">
        <Field label="From">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      <div className="actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() => void download("pdf")}
        >
          Export PDF
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void download("xlsx")}
        >
          Export Excel
        </button>
      </div>
    </>
  );
}
