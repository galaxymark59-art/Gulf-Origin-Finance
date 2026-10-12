import { useState } from "react";
import { Download } from "lucide-react";
import { day, money, collection, type State } from "../domain";
import { useText } from "../i18n";
import { exportWorkbook } from "../documents";
import { Ledger, type EntryActions } from "./Views";
export function Reports({
  state,
  actions,
  notify,
}: {
  state: State;
  actions: EntryActions;
  notify: (message: string) => void;
}) {
  const t = useText();
  const today = day(new Date().toISOString());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  function preset(n: string) {
    const d = new Date(today + "T12:00:00+03:00");
    let end = today;
    if (n === "yesterday") {
      d.setUTCDate(d.getUTCDate() - 1);
      end = day(d.toISOString());
    }
    if (n === "week") d.setUTCDate(d.getUTCDate() - 6);
    if (n === "month") d.setUTCDate(1);
    if (n === "last") {
      d.setUTCDate(0);
      end = day(d.toISOString());
      d.setUTCDate(1);
    }
    setFrom(day(d.toISOString()));
    setTo(end);
  }
  const entries = state.entries.filter(
    (e) => day(e.occurred_at) >= from && day(e.occurred_at) <= to,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {t("KNOW WHERE YOU STAND", "اعرف موقفك المالي")}
          </p>
          <h1>
            {t("Reports that reconcile.", "تقارير دقيقة وقابلة للمطابقة.")}
          </h1>
          <p>
            {t(
              "Collection totals include payments and payment reversals only.",
              "إجماليات التحصيل تشمل الدفعات وقيودها العكسية فقط.",
            )}
          </p>
        </div>
        <button
          className="primary"
          disabled={busy || !entries.length}
          onClick={async () => {
            setBusy(true);
            try {
              await exportWorkbook(state, entries);
              notify(t("Excel report saved.", "تم حفظ تقرير إكسل."));
            } catch {
              notify(
                t("Export failed. Please retry.", "فشل التصدير. أعد المحاولة."),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={17} />
          {busy
            ? t("Exporting…", "جار التصدير…")
            : t("Export Excel", "تصدير إكسل")}
        </button>
      </div>
      <div className="card">
        <div className="periods">
          {[
            ["today", t("Today", "اليوم")],
            ["yesterday", t("Yesterday", "أمس")],
            ["week", t("Week", "الأسبوع")],
            ["month", t("Month", "الشهر")],
            ["last", t("Last month", "الشهر الماضي")],
          ].map(([key, label]) => (
            <button className="secondary" key={key} onClick={() => preset(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="toolbar">
          <label>
            {t("From", "من")}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={to}
            />
          </label>
          <label>
            {t("To", "إلى")}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              min={from}
            />
          </label>
          <span className="hint">Asia/Riyadh · SAR</span>
        </div>
      </div>
      <div className="stats three">
        <article className="stat featured">
          <span>{t("Net collections", "صافي التحصيل")}</span>
          <strong>{money(collection(entries, from, to))}</strong>
          <small>
            {entries.filter((e) => e.kind === "payment").length}{" "}
            {t("payments", "دفعة")}
          </small>
        </article>
        <article className="stat">
          <span>{t("Net balance adjustments", "صافي تعديلات الرصيد")}</span>
          <strong>
            {money(
              entries
                .filter(
                  (e) =>
                    e.kind === "adjustment" ||
                    (e.kind === "reversal" && e.method === "adjustment"),
                )
                .reduce((n, e) => n + e.delta, 0),
            )}
          </strong>
          <small>{t("Excluded from collections", "مستبعدة من التحصيل")}</small>
        </article>
        <article className="stat">
          <span>{t("Receipts pending send", "إيصالات تنتظر الإرسال")}</span>
          <strong>
            {
              state.receipts.filter(
                (r) =>
                  entries.some((e) => e.id === r.transaction_id) &&
                  r.status !== "confirmed_sent",
              ).length
            }
          </strong>
          <small>
            {t("Owner confirmation required", "تحتاج تأكيد المالك")}
          </small>
        </article>
      </div>
      <section className="card">
        <div className="section-heading">
          <h2>{t("Transaction details", "تفاصيل المعاملات")}</h2>
          <span className="badge">
            {entries.length} {t("records", "قيد")}
          </span>
        </div>
        <Ledger
          key={from + to}
          state={state}
          entries={entries}
          actions={actions}
        />
      </section>
    </>
  );
}
