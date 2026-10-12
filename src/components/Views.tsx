import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Share2,
  Check,
  Undo2,
  Search,
  Plus,
  ChevronRight,
} from "lucide-react";
import {
  money,
  day,
  dateTime,
  collection,
  type State,
  type Merchant,
  type Entry,
} from "../domain";
import { useText } from "../i18n";
import { Empty } from "./Common";
export type EntryActions = {
  download: (e: Entry) => void;
  share: (e: Entry) => void;
  sent: (e: Entry) => void;
  reverse: (e: Entry) => void;
};
export function Ledger({
  state,
  entries,
  actions,
}: {
  state: State;
  entries: Entry[];
  actions: EntryActions;
}) {
  const t = useText();
  const [page, setPage] = useState(0);
  const sorted = [...entries].reverse();
  return !entries.length ? (
    <Empty
      title={t("No transactions yet", "لا توجد معاملات بعد")}
      detail={t(
        "Your collection history will appear here.",
        "سيظهر سجل التحصيل هنا.",
      )}
    />
  ) : (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Merchant / reference", "التاجر / المرجع")}</th>
              <th>{t("Date", "التاريخ")}</th>
              <th>{t("Type", "النوع")}</th>
              <th>{t("Amount", "المبلغ")}</th>
              <th>{t("Outstanding", "الرصيد")}</th>
              <th>{t("Receipt", "الإيصال")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(page * 30, (page + 1) * 30).map((e) => {
              const r = state.receipts.find((r) => r.transaction_id === e.id);
              const reversed = state.entries.some((x) => x.reverses === e.id);
              return (
                <tr key={e.id}>
                  <td>
                    <strong>
                      {
                        state.merchants.find((m) => m.id === e.merchant_id)
                          ?.name
                      }
                    </strong>
                    <small>{e.reference}</small>
                  </td>
                  <td>{dateTime(e.occurred_at)}</td>
                  <td>
                    <span
                      className={
                        "badge " + (e.kind === "payment" ? "green" : "")
                      }
                    >
                      {e.kind === "payment"
                        ? t("Payment", "دفعة")
                        : e.kind === "adjustment"
                          ? t("Adjustment", "تعديل")
                          : e.kind === "reversal"
                            ? t("Reversal", "عكس")
                            : t("Opening", "افتتاحي")}
                    </span>
                    {e.pending && (
                      <small className="pending">
                        {t("Pending sync", "بانتظار المزامنة")}
                      </small>
                    )}
                  </td>
                  <td className={e.kind === "payment" ? "positive" : ""}>
                    {money(e.kind === "payment" ? e.amount : e.delta)}
                  </td>
                  <td>{money(e.balance)}</td>
                  <td>
                    {r ? (
                      <>
                        <div className="row-actions">
                          <button
                            className="icon"
                            title={t("Download PDF", "تنزيل PDF")}
                            aria-label={t("Download PDF", "تنزيل PDF")}
                            onClick={() => actions.download(e)}
                          >
                            <Download size={17} />
                          </button>
                          <button
                            className="icon"
                            title={t("Share PDF", "مشاركة PDF")}
                            aria-label={t("Share PDF", "مشاركة PDF")}
                            onClick={() => actions.share(e)}
                          >
                            <Share2 size={17} />
                          </button>
                          {r.status !== "confirmed_sent" && (
                            <button
                              className="icon"
                              title={t(
                                "Mark manually sent",
                                "تأكيد الإرسال يدوياً",
                              )}
                              aria-label={t(
                                "Mark manually sent",
                                "تأكيد الإرسال يدوياً",
                              )}
                              onClick={() => actions.sent(e)}
                            >
                              <Check size={17} />
                            </button>
                          )}
                          {!reversed &&
                            ["payment", "adjustment"].includes(e.kind) && (
                              <button
                                className="icon"
                                title={t("Reverse entry", "عكس القيد")}
                                aria-label={t("Reverse entry", "عكس القيد")}
                                onClick={() => actions.reverse(e)}
                              >
                                <Undo2 size={17} />
                              </button>
                            )}
                        </div>
                        <small>
                          {r.status === "confirmed_sent"
                            ? t(
                                "Manually confirmed sent",
                                "تم تأكيد الإرسال يدوياً",
                              )
                            : r.status === "share_initiated"
                              ? t("Share initiated", "بدأت المشاركة")
                              : r.status === "failed"
                                ? t("Share failed · retry", "فشلت المشاركة")
                                : t("Ready to share", "جاهز للمشاركة")}
                        </small>
                      </>
                    ) : (
                      <small>
                        {e.pending
                          ? t("Available after sync", "متاح بعد المزامنة")
                          : "—"}
                      </small>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {entries.length > 30 && (
        <div className="pagination">
          <button
            className="secondary"
            onClick={() => setPage(page - 1)}
            disabled={!page}
          >
            {t("Previous", "السابق")}
          </button>
          <span>
            {page + 1} / {Math.ceil(entries.length / 30)}
          </span>
          <button
            className="secondary"
            onClick={() => setPage(page + 1)}
            disabled={(page + 1) * 30 >= entries.length}
          >
            {t("Next", "التالي")}
          </button>
        </div>
      )}
    </>
  );
}
export function Dashboard({
  state,
  onMerchant,
  onPayment,
  onAdd,
  actions,
}: {
  state: State;
  onMerchant: (m: Merchant) => void;
  onPayment: () => void;
  onAdd: () => void;
  actions: EntryActions;
}) {
  const t = useText();
  const today = day(new Date().toISOString());
  const month = today.slice(0, 7) + "-01";
  const outstanding = state.merchants.reduce(
    (n, m) => n + Math.max(0, m.balance),
    0,
  );
  const credit = state.merchants.reduce(
    (n, m) => n + Math.max(0, -m.balance),
    0,
  );
  const pending = state.merchants.filter((m) => m.balance > 0);
  const week = Array.from({ length: 7 }, (_, i) => {
    const stamp = new Date(today + "T12:00:00+03:00");
    stamp.setUTCDate(stamp.getUTCDate() - 6 + i);
    const d = day(stamp.toISOString());
    return {
      day: d,
      value: collection(state.entries, d, d),
      label: new Intl.DateTimeFormat("en", {
        weekday: "short",
        timeZone: "Asia/Riyadh",
      }).format(stamp),
    };
  });
  const max = Math.max(...week.map((x) => x.value), 1);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {t("YOUR BUSINESS, AT A GLANCE", "نظرة على أعمالك")}
          </p>
          <h1>
            {t("A clear view of your collections.", "رؤية واضحة لتحصيلاتك.")}
          </h1>
          <p>
            {new Intl.DateTimeFormat("en-GB", {
              timeZone: "Asia/Riyadh",
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date())}{" "}
            · Riyadh
          </p>
        </div>
        <div className="actions">
          <button className="secondary" onClick={onAdd}>
            <Plus size={17} />
            {t("Add merchant", "إضافة تاجر")}
          </button>
          <button className="primary" onClick={onPayment}>
            <Plus size={17} />
            {t("Record payment", "تسجيل دفعة")}
          </button>
        </div>
      </div>
      <div className="stats">
        <article className="stat featured">
          <div>
            <span>{t("Total outstanding", "إجمالي المستحقات")}</span>
            <ArrowUpRight size={21} />
          </div>
          <strong>{money(outstanding)}</strong>
          <small>
            {pending.length}{" "}
            {t("merchants with pending balances", "تاجر لديهم مستحقات")}
          </small>
        </article>
        <article className="stat">
          <div>
            <span>{t("Collected today", "تحصيل اليوم")}</span>
            <ArrowDownLeft size={21} />
          </div>
          <strong>{money(collection(state.entries, today, today))}</strong>
          <small>
            {t(
              "Actual payments, net of reversals",
              "الدفعات الفعلية بعد القيود العكسية",
            )}
          </small>
        </article>
        <article className="stat">
          <div>
            <span>{t("Collected this month", "تحصيل الشهر")}</span>
            <ArrowDownLeft size={21} />
          </div>
          <strong>{money(collection(state.entries, month, today))}</strong>
          <small>{t("Adjustments excluded", "باستثناء تعديلات الرصيد")}</small>
        </article>
        <article className="stat">
          <div>
            <span>{t("Total merchants", "عدد التجار")}</span>
            <span className="mini-logo">GO</span>
          </div>
          <strong>{state.merchants.length}</strong>
          <small>
            {state.merchants.filter((m) => m.balance <= 0).length}{" "}
            {t("settled or in credit", "مسدد أو دائن")}
          </small>
        </article>
      </div>
      <div className="dashboard-grid">
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>{t("Weekly collections", "التحصيل الأسبوعي")}</h2>
              <p>
                {t(
                  "Cash received over the last seven days",
                  "المبالغ المستلمة خلال سبعة أيام",
                )}
              </p>
            </div>
            <span className="badge">{t("This week", "هذا الأسبوع")}</span>
          </div>
          <div
            className="chart"
            role="img"
            aria-label={week
              .map((x) => x.label + " " + money(x.value))
              .join(", ")}
          >
            {week.map((x) => (
              <div className="chart-column" key={x.day}>
                <span>{money(x.value)}</span>
                <div className="bar-area">
                  <div
                    className="bar"
                    style={{ height: Math.max(3, (x.value / max) * 100) + "%" }}
                  />
                </div>
                <small>{x.label}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>{t("Collection priorities", "أولويات التحصيل")}</h2>
              <p>
                {t("Highest outstanding balances", "أعلى الأرصدة المستحقة")}
              </p>
            </div>
          </div>
          {!pending.length ? (
            <Empty
              title={t("All clear", "كل شيء واضح")}
              detail={t(
                "Merchants with outstanding balances appear here.",
                "سيظهر التجار ذوو الأرصدة المستحقة هنا.",
              )}
            />
          ) : (
            <div className="priority-list">
              {[...pending]
                .sort((a, b) => b.balance - a.balance)
                .slice(0, 5)
                .map((m) => (
                  <button key={m.id} onClick={() => onMerchant(m)}>
                    <span className="avatar">
                      {m.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <strong>{m.name}</strong>
                      <small>
                        {m.prefix} · {m.city || m.phone}
                      </small>
                    </span>
                    <b>{money(m.balance)}</b>
                    <ChevronRight size={16} />
                  </button>
                ))}
            </div>
          )}
          <div className="subtle-summary">
            <span>
              {t("Unsent receipts", "إيصالات غير مرسلة")}{" "}
              <b>
                {
                  state.receipts.filter((r) => r.status !== "confirmed_sent")
                    .length
                }
              </b>
            </span>
            {credit > 0 && (
              <span>
                {t("Merchant credits", "أرصدة دائنة")} {money(credit)}
              </span>
            )}
          </div>
        </section>
      </div>
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>{t("Recent activity", "النشاط الأخير")}</h2>
            <p>
              {t(
                "Your latest payments and balance movements",
                "آخر الدفعات وحركات الرصيد",
              )}
            </p>
          </div>
          <span className="badge">
            {state.queue.length
              ? t("Includes pending local records", "تتضمن قيوداً محلية معلقة")
              : t("Cloud confirmed", "مؤكد في السحابة")}
          </span>
        </div>
        <Ledger
          state={state}
          entries={state.entries.slice(-8)}
          actions={actions}
        />
      </section>
    </>
  );
}
export function Merchants({
  state,
  onMerchant,
  onAdd,
}: {
  state: State;
  onMerchant: (m: Merchant) => void;
  onAdd: () => void;
}) {
  const t = useText();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(0);
  const merchants = state.merchants
    .filter((m) =>
      (m.name + m.phone + m.prefix + m.contact)
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .filter(
      (m) =>
        filter === "all" ||
        (filter === "outstanding" ? m.balance > 0 : m.balance <= 0),
    )
    .sort((a, b) =>
      sort === "balance"
        ? b.balance - a.balance
        : sort === "recent"
          ? (b.last_payment || "").localeCompare(a.last_payment || "")
          : a.name.localeCompare(b.name),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {t("YOUR MERCHANT DIRECTORY", "دليل التجار")}
          </p>
          <h1>
            {t(
              "Good relationships. Clear balances.",
              "علاقات طيبة وأرصدة واضحة.",
            )}
          </h1>
          <p>
            {state.merchants.length}{" "}
            {t(
              "merchants, registered once and always ready.",
              "تاجر مسجل وجاهز دائماً.",
            )}
          </p>
        </div>
        <button className="primary" onClick={onAdd}>
          <Plus size={17} />
          {t("Add merchant", "إضافة تاجر")}
        </button>
      </div>
      <div className="toolbar">
        <div className="search">
          <Search size={19} />
          <input
            type="search"
            aria-label={t("Search merchants", "البحث عن تجار")}
            placeholder={t(
              "Search name, phone or prefix",
              "ابحث بالاسم أو الهاتف أو البادئة",
            )}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <select
          aria-label="Balance filter"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">{t("All merchants", "كل التجار")}</option>
          <option value="outstanding">
            {t("Outstanding", "لديهم مستحقات")}
          </option>
          <option value="settled">
            {t("Settled / credit", "مسدد / دائن")}
          </option>
        </select>
        <select
          aria-label="Sort merchants"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="name">{t("Name", "الاسم")}</option>
          <option value="balance">
            {t("Highest outstanding", "أعلى المستحقات")}
          </option>
          <option value="recent">{t("Recent payments", "أحدث الدفعات")}</option>
        </select>
      </div>
      {!merchants.length ? (
        <section className="card">
          <Empty
            title={
              search
                ? t("No matching merchants", "لا يوجد تجار مطابقون")
                : t("Your first merchant starts here", "ابدأ بإضافة أول تاجر")
            }
            detail={t(
              "Add their details once. Every payment and receipt stays connected.",
              "أضف البيانات مرة واحدة واربط كل الدفعات والإيصالات.",
            )}
            action={
              !search && (
                <button className="primary" onClick={onAdd}>
                  {t("Add merchant", "إضافة تاجر")}
                </button>
              )
            }
          />
        </section>
      ) : (
        <>
          <div className="merchant-grid">
            {merchants.slice(page * 30, (page + 1) * 30).map((m) => (
              <button
                className="merchant-card"
                key={m.id}
                onClick={() => onMerchant(m)}
              >
                <div className="merchant-top">
                  <span className="avatar">
                    {m.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="badge">{m.prefix}</span>
                  <ChevronRight size={17} />
                </div>
                <h2>{m.name}</h2>
                <p>{m.city || m.phone}</p>
                <small>{t("Current outstanding", "الرصيد الحالي")}</small>
                <strong>{money(m.balance)}</strong>
                <footer>
                  {m.last_payment
                    ? t("Last payment ", "آخر دفعة ") + dateTime(m.last_payment)
                    : t("No payments yet", "لا توجد دفعات بعد")}
                  <span>{m.language === "ar" ? "العربية" : "EN"}</span>
                </footer>
              </button>
            ))}
          </div>
          <div className="pagination">
            <button
              className="secondary"
              disabled={!page}
              onClick={() => setPage(page - 1)}
            >
              {t("Previous", "السابق")}
            </button>
            <span>
              {Math.min(page * 30 + 1, merchants.length)}–
              {Math.min((page + 1) * 30, merchants.length)} / {merchants.length}
            </span>
            <button
              className="secondary"
              disabled={(page + 1) * 30 >= merchants.length}
              onClick={() => setPage(page + 1)}
            >
              {t("Next", "التالي")}
            </button>
          </div>
        </>
      )}
    </>
  );
}
