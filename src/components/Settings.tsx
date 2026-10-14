import appMark from "../assets/mcube-logo.svg";
import { useEffect, useState, type FormEvent } from "react";
import {
  Building2,
  ShieldCheck,
  RefreshCw,
  Download,
  LockKeyhole,
  LogOut,
  Bell,
} from "lucide-react";
import { Field } from "./Common";
import { useText } from "../i18n";
import { type State, type Operation, type Business } from "../domain";
import { FinanceEngine } from "../engine";
import { setPin } from "../security";
import { native } from "../native";
import { supabase } from "../client";
import { downloadBlob } from "../documents";
import { can } from "../finance";
import { ChangePassword } from "./ChangePassword";
import { NotificationSettings } from "./NotificationSettings";
import { type usePaymentAlerts } from "../notifications";
export function Settings({
  state,
  engine,
  onLock,
  notify,
  initialTab = "business",
  alerts,
}: {
  state: State;
  engine: FinanceEngine;
  onLock: () => void;
  notify: (s: string) => void;
  initialTab?: string;
  alerts: ReturnType<typeof usePaymentAlerts>;
}) {
  const t = useText();
  const [tab, setTab] = useState(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);
  const [busy, setBusy] = useState(false);
  const [logo, setLogo] = useState(state.business.logo);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = new FormData(e.currentTarget);
      const b = { ...state.business, logo };
      for (const key of [
        "name",
        "phone",
        "email",
        "address",
        "city",
        "vat",
        "footer",
        "authorized",
      ] as const)
        b[key] = String(data.get(key) || "");
      await engine.enqueue({
        id: crypto.randomUUID(),
        kind: "business",
        payload: b as unknown as Record<string, unknown>,
        created_at: new Date().toISOString(),
      });
      notify(
        t(
          "Business profile saved on this device.",
          "تم حفظ بيانات الشركة على الجهاز.",
        ),
      );
    } catch {
      notify(
        t(
          "Profile could not be saved. Please retry.",
          "تعذر حفظ البيانات. أعد المحاولة.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("MAKE IT YOURS", "اضبط مساحة عملك")}</p>
          <h1>{t("Settings", "مساحة عمل يمكنك الوثوق بها.")}</h1>
          <p>
            {t(
              "Update business details, protect the app and back up your records.",
              "إعداد لمرة واحدة وإيصالات موحدة دائماً.",
            )}
          </p>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {[
            ["business", t("Business profile", "بيانات الشركة"), Building2],
            ["security", t("Security", "الأمان"), ShieldCheck],
            ...(state.member?.id === state.businessOwner &&
            state.member?.role === "owner"
              ? [["notifications", "Payment alerts", Bell]]
              : []),
            [
              "sync",
              t("Sync & backup", "المزامنة والنسخ الاحتياطي"),
              RefreshCw,
            ],
          ].map(([key, label, Icon]) => (
            <button
              key={String(key)}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(String(key))}
            >
              {typeof Icon !== "string" && <Icon size={19} />}
              <span>{String(label)}</span>
            </button>
          ))}
        </nav>
        <section className="card settings-content">
          {tab === "notifications" && (
            <NotificationSettings
              state={state}
              events={alerts.events}
              onRead={alerts.markRead}
              notify={notify}
            />
          )}
          {tab === "business" && (
            <>
              <h2>{t("Business profile", "بيانات الشركة")}</h2>
              <p className="hint">
                {t(
                  "These details appear on new receipts. Receipts already issued keep their original details.",
                  "تستخدم في كل إيصال جديد وتبقى الإيصالات السابقة ثابتة.",
                )}
              </p>
              <form onSubmit={save}>
                <fieldset
                  disabled={!can(state.member, "manage_users")}
                  className="plain-fieldset"
                >
                  <div className="logo-upload">
                    {logo ? (
                      <img src={logo} alt="Business logo" />
                    ) : (
                      <img src={appMark} alt="Mcube Exporters" />
                    )}
                    <Field
                      label={t(
                        "Company logo · PNG or JPEG, under 500 KB",
                        "شعار الشركة · PNG أو JPEG أقل من 500 كيلوبايت",
                      )}
                    >
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (
                            f.size > 500000 ||
                            !["image/png", "image/jpeg"].includes(f.type)
                          ) {
                            notify(
                              t(
                                "Choose a PNG or JPEG under 500 KB.",
                                "اختر صورة PNG أو JPEG أقل من 500 كيلوبايت.",
                              ),
                            );
                            return;
                          }
                          const r = new FileReader();
                          r.onload = () => setLogo(String(r.result));
                          r.readAsDataURL(f);
                        }}
                      />
                    </Field>
                  </div>
                  <Field label={t("Business name", "اسم الشركة")}>
                    <input
                      name="name"
                      defaultValue={state.business.name}
                      required
                      maxLength={150}
                    />
                  </Field>
                  <div className="form-grid">
                    {(
                      [
                        ["phone", t("Phone / WhatsApp", "الهاتف / واتساب")],
                        ["email", t("Email", "البريد الإلكتروني")],
                        ["city", t("City", "المدينة")],
                        [
                          "vat",
                          t(
                            "VAT registration (optional)",
                            "رقم ضريبة القيمة المضافة (اختياري)",
                          ),
                        ],
                        ["address", t("Address", "العنوان")],
                        ["authorized", t("Authorized name", "اسم المفوض")],
                      ] as [keyof Business, string][]
                    ).map(([key, label]) => (
                      <Field key={key} label={label}>
                        <input
                          name={key}
                          defaultValue={String(state.business[key] || "")}
                        />
                      </Field>
                    ))}
                  </div>
                  <Field label={t("Receipt footer", "تذييل الإيصال")}>
                    <textarea
                      name="footer"
                      defaultValue={state.business.footer}
                    />
                  </Field>
                  <p className="hint">Saudi Arabia · SAR</p>
                  <button className="primary" disabled={busy}>
                    {busy
                      ? t("Saving…", "جار الحفظ…")
                      : t("Save profile", "حفظ البيانات")}
                  </button>
                </fieldset>
              </form>
            </>
          )}
          {tab === "security" && (
            <>
              <h2>{t("Security & app lock", "الأمان وقفل التطبيق")}</h2>
              <p>
                {t(
                  "Your sign-in stays saved. Returning within 30 seconds does not lock the app. After 30 seconds away or two minutes without activity, unlock with your PIN or fingerprint.",
                  "يبقى تسجيل الدخول محفوظاً. فترة سماح 30 ثانية عند العودة. بعدها أو بعد دقيقتين دون نشاط افتح بالرمز أو البصمة.",
                )}
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const f = new FormData(form);
                  const pin = String(f.get("pin"));
                  if (pin !== String(f.get("confirm"))) {
                    notify(t("PINs do not match.", "الرمزان غير متطابقين."));
                    return;
                  }
                  setBusy(true);
                  try {
                    await setPin(state.owner, pin, f.get("biometric") === "on");
                    notify(t("App PIN saved.", "تم حفظ رمز التطبيق."));
                    form.reset();
                    onLock();
                  } catch (e) {
                    notify(
                      e instanceof Error ? e.message : "Unable to save PIN.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <div className="form-grid">
                  <Field
                    label={t(
                      "New four or six digit PIN",
                      "رمز جديد من أربعة أو ستة أرقام",
                    )}
                  >
                    <input
                      name="pin"
                      type="password"
                      inputMode="numeric"
                      pattern="([0-9]{4}|[0-9]{6})"
                      required
                    />
                  </Field>
                  <Field label={t("Confirm PIN", "تأكيد الرمز")}>
                    <input
                      name="confirm"
                      type="password"
                      inputMode="numeric"
                      required
                    />
                  </Field>
                </div>
                {native && (
                  <label className="check">
                    <input type="checkbox" name="biometric" />
                    {t(
                      "Allow fingerprint / device biometrics",
                      "السماح بالبصمة / القياسات الحيوية",
                    )}
                  </label>
                )}
                <button className="primary" disabled={busy}>
                  {t("Save app lock", "حفظ قفل التطبيق")}
                </button>
              </form>
              <div className="security-actions">
                <button className="secondary" onClick={onLock}>
                  <LockKeyhole size={18} />
                  {t("Lock now", "قفل الآن")}
                </button>
                <button
                  className="secondary"
                  onClick={async () => {
                    if (state.queue.length) {
                      notify(
                        t(
                          "Sync pending records before signing out.",
                          "زامن القيود المعلقة قبل تسجيل الخروج.",
                        ),
                      );
                      return;
                    }
                    await supabase.auth.signOut();
                  }}
                >
                  <LogOut size={18} />
                  {t("Sign out", "تسجيل الخروج")}
                </button>
              </div>
              <ChangePassword
                onDone={() => notify("Your password was changed.")}
              />
              <p className="hint">
                {t(
                  "Password recovery is available on the sign-in screen.",
                  "استعادة كلمة المرور متاحة في شاشة تسجيل الدخول.",
                )}
              </p>
            </>
          )}
          {tab === "sync" && (
            <>
              <h2>{t("Sync & backup", "المزامنة والنسخ الاحتياطي")}</h2>
              <div className="sync-summary">
                <span>{t("Last confirmed sync", "آخر مزامنة مؤكدة")}</span>
                <strong>
                  {state.lastSync
                    ? new Date(state.lastSync).toLocaleString()
                    : t("Not synced yet", "لم تتم المزامنة بعد")}
                </strong>
                <span>{t("Pending operations", "عمليات معلقة")}</span>
                <strong>{state.queue.length}</strong>
              </div>
              <button
                className="primary"
                disabled={engine.syncing}
                onClick={() => void engine.sync()}
              >
                <RefreshCw size={17} />
                {t("Sync now", "مزامنة الآن")}
              </button>
              {state.queue.map((op) => (
                <div className="queue-item" key={op.id}>
                  <strong>
                    {op.kind} · {op.id.slice(0, 8)}
                  </strong>
                  <p>
                    {op.error ||
                      t(
                        "Saved locally, waiting to sync.",
                        "محفوظة محلياً وتنتظر المزامنة.",
                      )}
                  </p>
                  {op.kind === "entry" && op.error && !op.conflict && (
                    <>
                      <p>
                        {t(
                          "Use the time this record was saved to correct an invalid selected date. Amount and operation ID stay the same.",
                          "استخدم وقت حفظ القيد لتصحيح التاريخ مع الحفاظ على المبلغ ومعرف العملية.",
                        )}{" "}
                        {new Date(op.created_at).toLocaleString("en-GB", {
                          timeZone: "Asia/Riyadh",
                        })}{" "}
                        (Riyadh)
                      </p>
                      <button
                        className="secondary"
                        onClick={async () => {
                          try {
                            await engine.correctRejectedEntryTime(op.id);
                            notify(
                              t(
                                "Pending date corrected. Retrying sync.",
                                "تم تصحيح التاريخ وإعادة المزامنة.",
                              ),
                            );
                          } catch {
                            notify(
                              t(
                                "Unable to correct this pending record.",
                                "تعذر تصحيح القيد.",
                              ),
                            );
                          }
                        }}
                      >
                        {t(
                          "Use save time & retry",
                          "استخدام وقت الحفظ وإعادة المحاولة",
                        )}
                      </button>
                    </>
                  )}
                  {op.conflict && (
                    <>
                      <p>
                        {t(
                          "The cloud balance changed. Review the merchant balance before accepting this operation against the updated cloud balance. The resulting balance may be a credit.",
                          "تغير الرصيد في السحابة. راجع رصيد التاجر قبل قبول العملية على الرصيد المحدث. قد ينتج رصيد دائن.",
                        )}
                      </p>
                      <button
                        className="secondary"
                        onClick={() => {
                          if (
                            confirm(
                              t(
                                "Apply this pending operation to the latest cloud balance, allowing a credit if needed?",
                                "تطبيق العملية على أحدث رصيد والسماح برصيد دائن عند الحاجة؟",
                              ),
                            )
                          )
                            void engine.resolve(op.id);
                        }}
                      >
                        {t(
                          "Review & accept updated balance",
                          "قبول الرصيد المحدث",
                        )}
                      </button>
                    </>
                  )}
                </div>
              ))}
              <hr />
              <h3>{t("Portable encrypted backup", "نسخة احتياطية مشفرة")}</h3>
              <p>
                {t(
                  "Export an encrypted copy including pending records. Keep the backup password in a safe place. It is needed to recover the file.",
                  "صدّر نسخة مشفرة تشمل القيود المعلقة واحتفظ بكلمة مرور النسخة في مكان آمن.",
                )}
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    const password = String(
                      new FormData(e.currentTarget).get("backupPassword"),
                    );
                    const salt = crypto.getRandomValues(new Uint8Array(16));
                    const iv = crypto.getRandomValues(new Uint8Array(12));
                    const raw = await crypto.subtle.importKey(
                      "raw",
                      new TextEncoder().encode(password),
                      "PBKDF2",
                      false,
                      ["deriveKey"],
                    );
                    const key = await crypto.subtle.deriveKey(
                      {
                        name: "PBKDF2",
                        salt,
                        iterations: 310000,
                        hash: "SHA-256",
                      },
                      raw,
                      { name: "AES-GCM", length: 256 },
                      false,
                      ["encrypt"],
                    );
                    const cipher = await crypto.subtle.encrypt(
                      { name: "AES-GCM", iv },
                      key,
                      new TextEncoder().encode(
                        JSON.stringify(await engine.backup()),
                      ),
                    );
                    await downloadBlob(
                      new Blob(
                        [
                          JSON.stringify({
                            version: 1,
                            salt: Array.from(salt),
                            iv: Array.from(iv),
                            cipher: Array.from(new Uint8Array(cipher)),
                          }),
                        ],
                        { type: "application/json" },
                      ),
                      "Mcube-encrypted-backup.json",
                    );
                    notify(
                      t(
                        "Encrypted backup downloaded.",
                        "تم تنزيل النسخة المشفرة.",
                      ),
                    );
                  } catch {
                    notify(
                      t(
                        "Backup failed. Please retry.",
                        "فشل النسخ الاحتياطي. أعد المحاولة.",
                      ),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Field
                  label={t(
                    "Backup password (12+ characters)",
                    "كلمة مرور النسخة (12 حرفاً على الأقل)",
                  )}
                >
                  <input
                    name="backupPassword"
                    type="password"
                    minLength={12}
                    required
                  />
                </Field>
                <button className="secondary" disabled={busy}>
                  <Download size={17} />
                  {t("Export encrypted backup", "تصدير نسخة مشفرة")}
                </button>
              </form>
              <h3 style={{ marginTop: 28 }}>
                {t("Recover pending records", "استعادة القيود المعلقة")}
              </h3>
              <p className="hint">
                {t(
                  "Confirmed records are loaded from Supabase. This recovers missing pending operations using their original IDs and preserves existing cloud history.",
                  "تحمل القيود المؤكدة من السحابة وتستعاد العمليات المعلقة بمعرفاتها الأصلية مع الحفاظ على السجل.",
                )}
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  const file = form.get("backup") as File;
                  setBusy(true);
                  try {
                    if (!file || file.size > 50000000)
                      throw Error("Choose an encrypted backup under 50 MB.");
                    const data = JSON.parse(await file.text());
                    if (data.version !== 1)
                      throw Error("Unsupported backup version.");
                    const raw = await crypto.subtle.importKey(
                      "raw",
                      new TextEncoder().encode(
                        String(form.get("restorePassword")),
                      ),
                      "PBKDF2",
                      false,
                      ["deriveKey"],
                    );
                    const key = await crypto.subtle.deriveKey(
                      {
                        name: "PBKDF2",
                        salt: new Uint8Array(data.salt),
                        iterations: 310000,
                        hash: "SHA-256",
                      },
                      raw,
                      { name: "AES-GCM", length: 256 },
                      false,
                      ["decrypt"],
                    );
                    const decoded = await crypto.subtle.decrypt(
                      { name: "AES-GCM", iv: new Uint8Array(data.iv) },
                      key,
                      new Uint8Array(data.cipher),
                    );
                    await engine.restoreBackup(
                      JSON.parse(new TextDecoder().decode(decoded)),
                    );
                    notify(
                      t(
                        "Backup recovered. Review any sync conflicts.",
                        "تمت الاستعادة. راجع تعارضات المزامنة.",
                      ),
                    );
                  } catch (error) {
                    notify(
                      error instanceof Error && error.name !== "OperationError"
                        ? error.message
                        : t(
                            "The backup password is incorrect or the file is damaged.",
                            "كلمة المرور غير صحيحة أو الملف تالف.",
                          ),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Field label={t("Encrypted backup file", "ملف النسخة المشفرة")}>
                  <input
                    name="backup"
                    type="file"
                    accept="application/json,.json"
                    required
                  />
                </Field>
                <Field label={t("Backup password", "كلمة مرور النسخة")}>
                  <input name="restorePassword" type="password" required />
                </Field>
                <button className="secondary" disabled={busy}>
                  {t("Recover backup", "استعادة النسخة")}
                </button>
              </form>
            </>
          )}
          <footer className="version">Mcube Exporters · v1.1.1</footer>
        </section>
      </div>
    </>
  );
}
