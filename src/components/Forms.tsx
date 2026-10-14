import { useState, type FormEvent } from "react";
import { Field } from "./Common";
import { useText } from "../i18n";
import {
  halalas,
  money,
  type Merchant,
  type Entry,
  type Operation,
} from "../domain";
type Enqueue = (op: Operation) => Promise<void>;
export function MerchantForm({
  merchant,
  onSave,
}: {
  merchant?: Merchant;
  onSave: Enqueue;
}) {
  const t = useText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      const id = merchant?.id || crypto.randomUUID();
      const profile = {
        ...merchant,
        id,
        name: String(f.get("name")).trim(),
        phone: String(f.get("phone")).trim(),
        contact: String(f.get("contact") || ""),
        city: String(f.get("city") || ""),
        address: String(f.get("address") || ""),
        notes: String(f.get("notes") || ""),
        due_on: String(f.get("due_on") || ""),
        prefix: String(f.get("prefix")).trim().toUpperCase(),
        language: String(f.get("language")),
        opening:
          merchant?.opening || halalas(String(f.get("opening") || "0"), true),
        balance:
          merchant?.balance || halalas(String(f.get("opening") || "0"), true),
        sequence: merchant?.sequence || 0,
        version: merchant?.version || 0,
        created_at: merchant?.created_at || new Date().toISOString(),
      };
      await onSave({
        id: crypto.randomUUID(),
        kind: merchant ? "edit_merchant" : "merchant",
        payload: profile,
        expected: merchant?.version,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <Field label={t("Merchant / business name", "اسم التاجر")}>
        <input
          name="name"
          defaultValue={merchant?.name}
          required
          maxLength={150}
        />
      </Field>
      <div className="form-grid">
        <Field
          label={t(
            "WhatsApp number with country code",
            "رقم واتساب مع رمز البلد",
          )}
        >
          <input
            name="phone"
            type="tel"
            placeholder="+9665…"
            pattern="\+[1-9][0-9]{7,14}"
            defaultValue={merchant?.phone}
            required
          />
        </Field>
        <Field label={t("Unique receipt prefix", "بادئة الإيصال")}>
          <input
            name="prefix"
            defaultValue={merchant?.prefix}
            placeholder="AY"
            pattern="[A-Za-z0-9]{1,12}"
            required
            maxLength={12}
          />
        </Field>
        <Field label={t("Contact person", "الشخص المسؤول")}>
          <input name="contact" defaultValue={merchant?.contact} />
        </Field>
        <Field label={t("City", "المدينة")}>
          <input name="city" defaultValue={merchant?.city} />
        </Field>
        <Field label={t("Receipt language", "لغة الإيصال")}>
          <select name="language" defaultValue={merchant?.language || "en"}>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </Field>
        {!merchant && (
          <Field
            label={t("Opening outstanding · SAR", "الرصيد الافتتاحي · ر.س")}
          >
            <input
              name="opening"
              inputMode="decimal"
              defaultValue="0"
              required
            />
          </Field>
        )}
      </div>
      <Field label="Payment due date (optional)">
        <input name="due_on" type="date" defaultValue={merchant?.due_on} />
        <small>
          Set the agreed payment date. Overdue reminders appear after this date
          while money is still due.
        </small>
      </Field>
      <Field label={t("Address", "العنوان")}>
        <input name="address" defaultValue={merchant?.address} />
      </Field>
      <Field label={t("Notes", "ملاحظات")}>
        <textarea
          name="notes"
          defaultValue={merchant?.notes}
          maxLength={1000}
        />
      </Field>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <button className="primary full" disabled={busy}>
        {busy ? t("Saving…", "جار الحفظ…") : t("Save merchant", "حفظ التاجر")}
      </button>
    </form>
  );
}
export function EntryForm({
  merchants,
  selected,
  kind,
  onSave,
}: {
  merchants: Merchant[];
  selected?: Merchant;
  kind: "payment" | "adjustment";
  onSave: (op: Operation, share: boolean) => Promise<void>;
}) {
  const t = useText();
  const [mid, setMid] = useState(selected?.id || "");
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credit, setCredit] = useState(false);
  const m = merchants.find((m) => m.id === mid);
  let delta = 0;
  try {
    delta =
      halalas(amount || "0") * (kind === "payment" ? -1 : Number(direction));
  } catch {}
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (!m) throw Error(t("Choose a merchant.", "اختر تاجراً."));
      const n = halalas(amount);
      if (!n)
        throw Error(
          t(
            "Amount must be greater than zero.",
            "يجب أن يكون المبلغ أكبر من صفر.",
          ),
        );
      if (m.balance + delta < 0 && !credit)
        throw Error(
          t(
            "Confirm the credit balance to continue.",
            "أكد الرصيد الدائن للمتابعة.",
          ),
        );
      const form = new FormData(e.currentTarget);
      const id = crypto.randomUUID();
      const stamp = String(form.get("date"));
      const occurred_at = stamp
        ? new Date(stamp + ":00+03:00").toISOString()
        : new Date().toISOString();
      if (new Date(occurred_at).getTime() > Date.now() + 300000)
        throw Error(
          t(
            "Choose a date and time that is not in the future.",
            "اختر تاريخاً ووقتاً ليسا في المستقبل.",
          ),
        );
      const entry: Entry = {
        // Record time is validated before enqueueing so invalid drafts cannot block sync.
        id,
        merchant_id: m.id,
        kind,
        amount: kind === "payment" ? n : 0,
        delta,
        previous: m.balance,
        balance: m.balance + delta,
        method: kind === "payment" ? String(form.get("method")) : "adjustment",
        note: String(form.get("note") || ""),
        occurred_at,
        created_at: new Date().toISOString(),
        reference: "",
      };
      await onSave(
        {
          id,
          kind: "entry",
          payload: { ...entry, allow_credit: credit },
          expected: m.balance,
          created_at: new Date().toISOString(),
        },
        (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
          "share",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="section-guide">
        <strong>
          {kind === "payment"
            ? "Money received from a merchant"
            : "Fix a mistake in the amount owed"}
        </strong>
        <p>
          {kind === "payment"
            ? "Enter money the merchant has paid you. Their amount owed goes down. For money you spend, open More → Cash & expenses."
            : "Use this only when the amount owed is wrong. For example, if it is SAR 100 too high, choose Reduce and enter 100. No cash is collected or spent."}
        </p>
      </div>
      {!selected && (
        <>
          <Field label={t("Find merchant", "البحث عن تاجر")}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(
                "Search name, number or prefix",
                "الاسم أو الرقم أو البادئة",
              )}
            />
          </Field>
          <Field label={t("Merchant", "التاجر")}>
            <select
              value={mid}
              onChange={(e) => setMid(e.target.value)}
              required
            >
              <option value="">{t("Choose merchant", "اختر تاجراً")}</option>
              {merchants
                .filter((m) =>
                  (m.name + m.phone + m.prefix)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .slice(0, 100)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.prefix}
                  </option>
                ))}
            </select>
          </Field>
        </>
      )}
      {m && (
        <div className="balance-preview">
          <small>
            {m.name} · {t("Amount owed now", "الرصيد الحالي")}
          </small>
          <strong>{money(m.balance)}</strong>
        </div>
      )}
      {kind === "adjustment" && (
        <Field label={t("What needs correcting?", "اتجاه التعديل")}>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option value="1">
              {t("Increase what the merchant owes", "زيادة الرصيد")}
            </option>
            <option value="-1">
              {t("Reduce what the merchant owes", "تخفيض الرصيد")}
            </option>
          </select>
        </Field>
      )}
      <Field
        label={t(
          kind === "payment"
            ? "Money received · SAR"
            : "Correction amount · SAR",
          "المبلغ · ر.س",
        )}
      >
        <input
          className="amount-input"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          autoFocus
        />
      </Field>
      {m && (
        <div className="new-balance">
          <span>{t("Amount owed after saving", "الرصيد الجديد")}</span>
          <strong>{money(m.balance + delta)}</strong>
        </div>
      )}
      {m && m.balance + delta < 0 && (
        <label className="check">
          <input
            type="checkbox"
            checked={credit}
            onChange={(e) => setCredit(e.target.checked)}
          />
          {t(
            "I confirm this creates a credit balance.",
            "أؤكد إنشاء رصيد دائن.",
          )}
        </label>
      )}
      <div className="form-grid">
        {kind === "payment" && (
          <Field label={t("How did you receive the money?", "طريقة الدفع")}>
            <select name="method">
              <option value="cash">{t("Cash", "نقداً")}</option>
              <option value="bank">{t("Bank transfer", "تحويل بنكي")}</option>
              <option value="card">{t("Card", "بطاقة")}</option>
            </select>
          </Field>
        )}
        <Field
          label={t(
            "Date / time (Riyadh, optional)",
            "التاريخ / الوقت (الرياض، اختياري)",
          )}
        >
          <input name="date" type="datetime-local" />
        </Field>
      </div>
      <Field label={t("What is this for? (optional)", "ملاحظة / سبب")}>
        <textarea name="note" maxLength={1000} />
      </Field>
      <p className="hint">
        {t(
          "Your saved history is kept. To undo a mistake, open the saved entry and choose Undo entry. If you are offline, the final receipt is ready after reconnecting.",
          "القيود غير قابلة للتعديل. تصحح الأخطاء بقيد عكسي. يخصص المرجع النهائي بعد المزامنة.",
        )}
      </p>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="secondary" disabled={busy} value="save">
          {t(kind === "payment" ? "Save collection" : "Save correction", "حفظ")}
        </button>
        <button className="primary" disabled={busy} value="share">
          {busy
            ? t("Saving…", "جار الحفظ…")
            : t(
                kind === "payment"
                  ? "Save collection & share PDF"
                  : "Save correction & share PDF",
                "حفظ ومشاركة PDF",
              )}
        </button>
      </div>
    </form>
  );
}
