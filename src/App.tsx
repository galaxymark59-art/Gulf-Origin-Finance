import { useEffect, useMemo, useState, type ReactNode } from "react";
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
} from "lucide-react";
import { supabase } from "./client";
import { native } from "./native";
import { FinanceEngine } from "./engine";
import { getLock } from "./security";
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
import { Reports } from "./components/Reports";
import { Settings } from "./components/Settings";
import { receiptFile, shareFile, saveFile, exportWorkbook } from "./documents";
export function App() {
  const [session, setSession] = useState<Session | null>();
  const [recovery, setRecovery] = useState(false);
  const [locked, setLocked] = useState<boolean>();
  const [lockOwner, setLockOwner] = useState<string>();
  const [startupError, setStartupError] = useState<"session" | "lock">();
  const [setup, setSetup] = useState(false);
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
          setSetup(native && !lock);
          setLocked(Boolean(lock));
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
    let last = Date.now();
    const activity = () => {
      last = Date.now();
    };
    const timer = setInterval(() => {
      if (Date.now() - last > 300000)
        void getLock(session.user.id).then((l) => {
          if (l) setLocked(true);
        });
    }, 15000);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    const handle = native
      ? CapacitorApp.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) {
            void getLock(session.user.id).then((l) => {
              if (l) setLocked(true);
            });
            supabase.auth.stopAutoRefresh();
          } else supabase.auth.startAutoRefresh();
        })
      : undefined;
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      void handle?.then((h) => h.remove());
    };
  }, [session?.user.id]);
  let content: ReactNode;
  if (startupError)
    content = (
      <div className="loading" role="alert">
        <img src="/logo.svg" alt="" width="60" />
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
        <img src="/logo.svg" alt="" width="60" />
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
        onUnlock={() => {
          setLocked(false);
          setSetup(false);
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
      {content}
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
}: {
  session: Session;
  language: Language;
  setLanguage: (l: Language) => void;
  onLock: () => void;
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
    "merchant" | "edit" | "payment" | "adjustment" | "reversal"
  >();
  const [reversal, setReversal] = useState<Entry>();
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
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
      const file = await receiptFile(r, state.owner);
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
              "PDF downloaded. File sharing is unavailable in this browser.",
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
    { id: "settings", label: t("More", "المزيد"), icon: SettingsIcon },
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
          <img src="/logo.svg" alt="" width="42" />
          <span>
            Gulf Origin<small>FINANCE WORKSPACE</small>
          </span>
        </a>
        <div className="workspace-tag">
          <span className="workspace-dot" />
          {t("Private owner workspace", "مساحة عمل خاصة للمالك")}
        </div>
        <nav aria-label={t("Main navigation", "التنقل الرئيسي")}>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={
                page === item.id ||
                (page === "merchant" && item.id === "merchants")
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
                state.receipts.filter((r) => r.status !== "confirmed_sent")
                  .length > 0 && (
                  <b>
                    {
                      state.receipts.filter(
                        (r) => r.status !== "confirmed_sent",
                      ).length
                    }
                  </b>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={19} />
          <strong>{t("Made for your business", "مصمم لأعمالك")}</strong>
          <p>
            {t("Simple records. Lasting clarity.", "قيود بسيطة ووضوح دائم.")}
          </p>
          <small>Gulf Origin International</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Gulf Origin <span>/</span>{" "}
            {navigation.find((n) => n.id === page)?.label || merchant?.name}
          </div>
          <div className="topbar-actions">
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
              className="owner-avatar"
              aria-label={t("Owner settings", "إعدادات المالك")}
              onClick={() => setPage("settings")}
            >
              AM
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
              onMerchant={openMerchant}
              onAdd={() => setModal("merchant")}
            />
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
                <button className="secondary" onClick={() => setModal("edit")}>
                  {t("Edit merchant", "تعديل التاجر")}
                </button>
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
              <div className="workspace-actions">
                <button className="primary" onClick={() => setModal("payment")}>
                  <Plus size={18} />
                  {t("Record payment", "تسجيل دفعة")}
                </button>
                <button
                  className="secondary"
                  onClick={() => setModal("adjustment")}
                >
                  {t("Adjust balance", "تعديل الرصيد")}
                </button>
                <button
                  className="secondary"
                  onClick={async () => {
                    try {
                      await exportWorkbook(
                        state,
                        state.entries.filter(
                          (e) => e.merchant_id === merchant.id,
                        ),
                        merchant,
                      );
                      notify(t("Statement saved.", "تم حفظ الكشف."));
                    } catch {
                      notify(
                        t(
                          "Statement export failed. Please retry.",
                          "فشل تصدير الكشف. أعد المحاولة.",
                        ),
                      );
                    }
                  }}
                >
                  <Download size={17} />
                  {t("Download statement", "تنزيل كشف الحساب")}
                </button>
              </div>
              {merchant.notes && (
                <p className="merchant-notes">{merchant.notes}</p>
              )}
              <section className="card">
                <div className="section-heading">
                  <h2>{t("Complete merchant ledger", "سجل التاجر الكامل")}</h2>
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
                  <h1>{t("Your collection ledger.", "سجل التحصيل.")}</h1>
                  <p>
                    {t(
                      "A complete, permanent history of payments and adjustments.",
                      "سجل دائم وكامل للدفعات والتعديلات.",
                    )}
                  </p>
                </div>
                <button className="primary" onClick={openPayment}>
                  <Plus size={18} />
                  {t("Record payment", "تسجيل دفعة")}
                </button>
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
            <Reports state={state} actions={actions} notify={notify} />
          ) : (
            <Settings
              state={state}
              engine={engine}
              onLock={onLock}
              notify={notify}
            />
          )}
        </div>
      </main>
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
            modal === "merchant"
              ? t("Add merchant", "إضافة تاجر")
              : modal === "edit"
                ? t("Edit merchant", "تعديل التاجر")
                : modal === "payment"
                  ? t("Record payment", "تسجيل دفعة")
                  : modal === "adjustment"
                    ? t("Adjust balance", "تعديل الرصيد")
                    : t("Reverse transaction", "عكس المعاملة")
          }
          onClose={() => setModal(undefined)}
        >
          {modal === "merchant" || modal === "edit" ? (
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
                  "This adds a permanent reversal. The original transaction stays in the ledger.",
                  "يضيف هذا قيداً عكسياً دائماً مع الاحتفاظ بالمعاملة الأصلية.",
                )}
              </p>
              <div className="balance-preview">
                <span>{reversal.reference}</span>
                <strong>{money(reversal.delta)}</strong>
              </div>
              <button
                className="primary full"
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
                        note: "Reversal of " + reversal.reference,
                      },
                    });
                    setModal(undefined);
                    notify(
                      t(
                        "Reversal saved locally.",
                        "تم حفظ القيد العكسي محلياً.",
                      ),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("Confirm reversal", "تأكيد العكس")}
              </button>
            </>
          ) : (
            <EntryForm
              merchants={state.merchants}
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
