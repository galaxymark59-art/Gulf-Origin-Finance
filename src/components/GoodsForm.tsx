import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  day,
  halalas,
  money,
  type State,
  type Merchant,
  type Operation,
  type ItemLine,
} from "../domain";
import { goodsTotal, lineTotal, quantity } from "../finance";
import { Field } from "./Common";
import { writeLocal } from "../storage";
type DraftLine = {
  id: string;
  description: string;
  quantity: string;
  price: string;
};
const blank = (): DraftLine => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: "1",
  price: "",
});
const encoded = (buffer: ArrayBuffer) => {
  let s = "";
  for (const b of new Uint8Array(buffer)) s += String.fromCharCode(b);
  return btoa(s);
};
export function GoodsForm({
  state,
  kind,
  selected,
  onSave,
}: {
  state: State;
  kind: "invoice" | "return";
  selected?: Merchant;
  onSave: (op: Operation, share: boolean) => Promise<void>;
}) {
  const today = day(new Date().toISOString());
  const [mid, setMid] = useState(selected?.id || "");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blank()]);
  const [original, setOriginal] = useState("");
  const [file, setFile] = useState<File>();
  const [hash, setHash] = useState("");
  const [notice, setNotice] = useState("");
  const [pdfText, setPdfText] = useState("");
  const [reportedTotal, setReportedTotal] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [credit, setCredit] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const merchant = state.merchants.find((m) => m.id === mid);
  let total = 0;
  let valid = false;
  try {
    total = goodsTotal(
      lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: quantity(l.quantity),
        unit_price: halalas(l.price),
        total: lineTotal(quantity(l.quantity), halalas(l.price)),
      })),
    );
    valid = true;
  } catch {}
  const update = (id: string, key: keyof DraftLine, value: string) => {
    setLines((current) =>
      current.map((l) => (l.id === id ? { ...l, [key]: value } : l)),
    );
    setReviewed(false);
  };
  async function upload(pdf: File) {
    setBusy(true);
    setError("");
    setReviewed(false);
    try {
      if (pdf.type !== "application/pdf" || pdf.size > 10485760)
        throw Error("Choose a PDF smaller than 10 MB.");
      const bytes = await pdf.arrayBuffer();
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      if (
        state.entries.some(
          (e) => e.kind === "invoice" && e.document?.file_hash === digest,
        )
      )
        throw Error(
          "This PDF is already attached to a saved or pending invoice.",
        );
      setFile(pdf);
      setHash(digest);
      const extracted = await (
        await import("../pdf-import")
      ).readInvoicePdf(pdf);
      setNotice(extracted.notice);
      setPdfText(extracted.text);
      setReportedTotal(extracted.total);
      if (extracted.reference) setReference(extracted.reference);
      if (extracted.date) setDate(extracted.date);
      const match = state.merchants.find(
        (m) => m.name.toLowerCase() === extracted.merchant.toLowerCase(),
      );
      if (match) setMid(match.id);
      if (extracted.items.length)
        setLines(
          extracted.items.map((l) => ({
            id: crypto.randomUUID(),
            description: l.description,
            quantity: l.quantity,
            price: l.price,
          })),
        );
    } catch (e) {
      setNotice(
        "The PDF could not be read automatically. Enter its details manually and check the original PDF.",
      );
      setError(e instanceof Error ? e.message : "Unable to read PDF.");
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!merchant) throw Error("Choose a merchant.");
      if (!reviewed)
        throw Error("Check the details and tick the review box before saving.");
      const items: ItemLine[] = lines.map((l) => {
        const q = quantity(l.quantity),
          p = halalas(l.price);
        return {
          id: l.id,
          description: l.description.trim(),
          quantity: q,
          unit_price: p,
          total: lineTotal(q, p),
        };
      });
      const amount = goodsTotal(items);
      const delta = kind === "invoice" ? amount : -amount;
      if (date > today) throw Error("Choose today or an earlier date.");
      if (merchant.balance + delta < 0 && !credit)
        throw Error("Confirm the credit balance before saving this return.");
      if (
        kind === "invoice" &&
        state.entries.some(
          (x) =>
            x.kind === "invoice" &&
            x.merchant_id === mid &&
            x.document?.reference.trim().toLowerCase() ===
              reference.trim().toLowerCase(),
        )
      )
        throw Error(
          "This invoice reference is already saved for this merchant.",
        );
      const id = crypto.randomUUID();
      const created_at = new Date().toISOString();
      const document = {
        reference: reference.trim(),
        date,
        lines: items,
        ...(original ? { original_invoice: original } : {}),
        ...(file
          ? {
              file_hash: hash,
              original_path: `${state.businessOwner}/${id}/${hash}.pdf`,
            }
          : {}),
      };
      if (file)
        await writeLocal("original:" + id, encoded(await file.arrayBuffer()));
      const form = new FormData(e.currentTarget);
      await onSave(
        {
          id,
          kind: "entry",
          expected: merchant.balance,
          created_at,
          payload: {
            id,
            merchant_id: mid,
            kind,
            amount,
            delta,
            previous: merchant.balance,
            balance: merchant.balance + delta,
            method: kind,
            note: String(form.get("note") || ""),
            occurred_at: date + "T00:00:00+03:00",
            created_at,
            reference: "",
            document,
            allow_credit: credit,
          },
        },
        (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
          "share",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save. Please retry.",
      );
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <p className="hint">
        {kind === "invoice"
          ? "Add goods supplied to a merchant. This increases the amount they owe once."
          : "Enter goods returned by a merchant. This reduces what they owe and does not count as cash received."}
      </p>
      {!selected && (
        <Field label="Merchant">
          <select
            required
            value={mid}
            onChange={(e) => {
              setMid(e.target.value);
              setOriginal("");
            }}
          >
            <option value="">Choose merchant</option>
            {state.merchants
              .filter((m) => !m.deleted_at)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.prefix}
                </option>
              ))}
          </select>
        </Field>
      )}
      {merchant && (
        <div className="balance-preview">
          <small>{merchant.name} · Money still due</small>
          <strong>{money(merchant.balance)}</strong>
        </div>
      )}
      {kind === "invoice" && (
        <Field label="Read an existing invoice PDF (optional)">
          <input
            type="file"
            accept="application/pdf"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          {file && <small>{file.name} · Original PDF will be kept.</small>}
        </Field>
      )}
      {notice && (
        <p className="alert" role="status">
          {notice}
          {reportedTotal && (
            <>
              {" "}
              PDF total found: SAR {reportedTotal}. Compare it with the reviewed
              total below.
            </>
          )}
        </p>
      )}
      {pdfText && (
        <details>
          <summary>Show text read from PDF</summary>
          <pre className="pdf-extracted">{pdfText}</pre>
        </details>
      )}
      <div className="form-grid">
        <Field
          label={kind === "invoice" ? "Invoice reference" : "Return reference"}
        >
          <input
            required
            maxLength={100}
            value={reference}
            onChange={(e) => {
              setReference(e.target.value);
              setReviewed(false);
            }}
          />
        </Field>
        <Field label={kind === "invoice" ? "Invoice date" : "Return date"}>
          <input
            required
            type="date"
            max={today}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setReviewed(false);
            }}
          />
        </Field>
      </div>
      {kind === "return" && (
        <Field label="Original invoice (if known)">
          <select
            value={original}
            onChange={(e) => {
              setOriginal(e.target.value);
              const invoice = state.entries.find(
                (x) => x.id === e.target.value,
              );
              if (invoice?.document)
                setLines(
                  invoice.document.lines.map((l) => ({
                    id: l.id,
                    description: l.description,
                    quantity: String(l.quantity / 1000),
                    price: (l.unit_price / 100).toFixed(2),
                  })),
                );
              setReviewed(false);
            }}
          >
            <option value="">Not linked to an invoice</option>
            {state.entries
              .filter(
                (e) =>
                  e.merchant_id === mid &&
                  e.kind === "invoice" &&
                  !e.pending &&
                  !state.entries.some((x) => x.reverses === e.id),
              )
              .map((e) => (
                <option value={e.id} key={e.id}>
                  {e.document?.reference || e.reference} · {money(e.amount)}
                </option>
              ))}
          </select>
        </Field>
      )}
      <div className="item-lines">
        {lines.map((line, i) => (
          <div className="item-line" key={line.id}>
            <Field label={`Item ${i + 1}`}>
              <input
                required
                maxLength={300}
                value={line.description}
                onChange={(e) => update(line.id, "description", e.target.value)}
              />
            </Field>
            <div className="form-grid">
              <Field label="Quantity">
                <input
                  required
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) => update(line.id, "quantity", e.target.value)}
                />
              </Field>
              <Field label="Unit price · SAR">
                <input
                  required
                  inputMode="decimal"
                  value={line.price}
                  onChange={(e) => update(line.id, "price", e.target.value)}
                />
              </Field>
            </div>
            <button
              type="button"
              className="link"
              disabled={lines.length === 1}
              onClick={() => {
                setLines((rows) => rows.filter((l) => l.id !== line.id));
                setReviewed(false);
              }}
            >
              <Trash2 size={14} /> Remove item
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="secondary"
        disabled={lines.length >= 500}
        onClick={() => {
          setLines((rows) => [...rows, blank()]);
          setReviewed(false);
        }}
      >
        <Plus size={16} /> Add item
      </button>
      <div className="balance-preview">
        <small>{kind === "invoice" ? "Goods total" : "Return total"}</small>
        <strong>{money(total)}</strong>
        {merchant && (
          <small>
            Money still due after saving:{" "}
            {money(merchant.balance + (kind === "invoice" ? total : -total))}
          </small>
        )}
      </div>
      <p className="hint">
        Each item total is rounded to the nearest halala; half a halala rounds
        up.
      </p>
      <Field label="Reason / note (optional)">
        <textarea name="note" maxLength={1000} />
      </Field>
      {merchant && kind === "return" && merchant.balance < total && (
        <label className="check">
          <input
            type="checkbox"
            checked={credit}
            onChange={(e) => setCredit(e.target.checked)}
          />{" "}
          I confirm the remaining credit balance.
        </label>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => setReviewed(e.target.checked)}
          required
        />{" "}
        I checked the merchant, date, items and total.
      </label>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="primary" disabled={busy || !valid}>
          {busy
            ? "Saving…"
            : kind === "invoice"
              ? "Save invoice"
              : "Save return"}
        </button>
        <button className="secondary" value="share" disabled={busy || !valid}>
          Save & share PDF
        </button>
      </div>
    </form>
  );
}
