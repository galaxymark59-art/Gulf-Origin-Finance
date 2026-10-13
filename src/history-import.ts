import { day, halalas, type State } from "./domain";
export type Sheet = { name: string; rows: string[][] };
export type ImportField =
  | "name"
  | "phone"
  | "opening"
  | "date"
  | "kind"
  | "amount"
  | "reference"
  | "method"
  | "note"
  | "balance"
  | "payment"
  | "invoice"
  | "return";
export type Mapping = Record<ImportField, number>;
export const importFields: [ImportField, string][] = [
  ["name", "Merchant name"],
  ["phone", "Phone number"],
  ["opening", "Amount owed before the first payment"],
  ["date", "Transaction date"],
  ["kind", "Transaction type"],
  ["amount", "Transaction amount"],
  ["reference", "Old receipt or invoice number"],
  ["method", "How the payment was received"],
  ["note", "Notes"],
  ["balance", "Amount owed after this row"],
  ["payment", "Payments received (separate column)"],
  ["invoice", "Goods supplied (separate column)"],
  ["return", "Goods returned (separate column)"],
];
const aliases: Record<ImportField, string[]> = {
  name: [
    "merchant",
    "merchant name",
    "customer",
    "customer name",
    "party",
    "party name",
    "shop",
    "اسم التاجر",
  ],
  phone: ["phone", "phone number", "mobile", "contact number", "رقم الهاتف"],
  opening: [
    "opening",
    "opening balance",
    "opening outstanding",
    "opening amount",
    "previous balance",
  ],
  date: ["date", "transaction date", "payment date", "invoice date", "تاريخ"],
  kind: ["type", "transaction type", "kind"],
  amount: ["amount", "transaction amount", "value"],
  reference: [
    "reference",
    "receipt",
    "receipt number",
    "invoice number",
    "ref",
    "voucher number",
  ],
  method: ["method", "payment method", "mode"],
  note: ["note", "notes", "description", "details"],
  balance: [
    "balance",
    "closing balance",
    "outstanding",
    "current balance",
    "amount due",
    "running balance",
  ],
  payment: [
    "payment",
    "payment received",
    "payments received",
    "paid",
    "credit",
    "collection",
    "amount received",
  ],
  invoice: [
    "new invoice",
    "invoice amount",
    "goods supplied",
    "debit",
    "sales",
  ],
  return: ["returns", "return amount", "goods returned"],
};
const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ");
export function guessMapping(headers: string[]): Mapping {
  return Object.fromEntries(
    importFields.map(([key]) => [
      key,
      headers.findIndex((h) => aliases[key].includes(norm(h))),
    ]),
  ) as Mapping;
}
export function parseCsv(text: string): string[][] {
  const delimiter =
    (text.split(/\r?\n/)[0].match(/;/g)?.length || 0) >
    (text.split(/\r?\n/)[0].match(/,/g)?.length || 0)
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted)
    throw Error("A quoted cell is unfinished. Please check the CSV file.");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
export async function readHistoryFile(file: File): Promise<Sheet[]> {
  if (file.size > 20 * 1024 * 1024)
    throw Error(
      "Choose a file smaller than 20 MB. Split a larger file into smaller files.",
    );
  if (/\.csv$/i.test(file.name))
    return [{ name: file.name, rows: parseCsv(await file.text()) }];
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default,
      wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    return wb.worksheets
      .map((ws) => {
        const rows: string[][] = [];
        ws.eachRow((row) => {
          const cells: string[] = [];
          for (let i = 1; i <= ws.columnCount; i++) {
            const value = row.getCell(i);
            cells.push(
              value.value instanceof Date
                ? value.value.toISOString().slice(0, 10)
                : value.text,
            );
          }
          if (cells.some((x) => x.trim())) rows.push(cells);
        });
        return { name: ws.name, rows };
      })
      .filter((s) => s.rows.length);
  }
  if (/\.pdf$/i.test(file.name)) {
    const { readPdfTable } = await import("./history-pdf");
    return [{ name: file.name, rows: await readPdfTable(file) }];
  }
  throw Error(
    "Choose an Excel .xlsx file, CSV file or PDF. Save an older .xls file as .xlsx first.",
  );
}
export function importDate(value: string, monthFirst = false): string {
  let y: string, m: string, d: string;
  const text = value.trim();
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(text))
    [y, m, d] = text.split(/[-/.]/);
  else if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(text)) {
    const parts = text.split(/[-/.]/);
    [d, m, y] = monthFirst ? [parts[1], parts[0], parts[2]] : parts;
  } else throw Error("Use a full date, such as 2025-10-14 or 14/10/2025.");
  const result = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`,
    date = new Date(result + "T12:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== result ||
    result > day(new Date().toISOString()) ||
    result < "1900-01-01"
  )
    throw Error("The date is invalid or in the future.");
  return result;
}
function amount(value: string) {
  const text = value.replace(/SAR|ر\.س/g, "").trim();
  if (text.includes(",") && !/^-?\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(text))
    throw Error(
      "Use a dot for decimals, such as 1000.50. This amount has an unclear comma.",
    );
  return halalas(text.replaceAll(",", ""), true);
}
export type HistoryRow = {
  id: string;
  kind: "payment" | "invoice" | "return" | "adjustment";
  amount: number;
  reference: string;
  occurred_at: string;
  method: string;
  note: string;
};
export type ImportMerchant = {
  id: string;
  opening_id: string;
  name: string;
  phone: string;
  opening: number;
  closing: number;
  start_on: string;
  rows: HistoryRow[];
  existing: boolean;
};
export function planHistory(
  rows: string[][],
  mapping: Mapping,
  state: State,
  options: {
    defaultName: string;
    defaultKind: HistoryRow["kind"] | "none";
    balanceDate: string;
    monthFirst: boolean;
  },
) {
  const groups = new Map<
      string,
      {
        name: string;
        phone: string;
        opening?: number;
        observed?: number;
        observedDate?: string;
        start: string;
        rows: HistoryRow[];
        existing: boolean;
        hasBalance: boolean;
      }
    >(),
    issues: string[] = [];
  if (rows.length > 10001)
    issues.push(
      "Import up to 10,000 transaction rows at a time. Split a larger sheet into separate files.",
    );
  rows.slice(1).forEach((row, index) => {
    if (!row.some((v) => v.trim())) return;
    const get = (key: ImportField) =>
      mapping[key] < 0 ? "" : (row[mapping[key]] || "").trim();
    try {
      const name = get("name") || options.defaultName.trim();
      if (!name)
        throw Error(
          "Choose the merchant-name column, or enter the merchant name for this file.",
        );
      if (name.length > 150) throw Error("The merchant name is too long.");
      const phone = get("phone").replace(/[\s()-]/g, "");
      if (phone && !/^\+[1-9]\d{7,14}$/.test(phone))
        throw Error(
          "Phone numbers need a country code, such as +966. Leave a missing phone blank.",
        );
      let g = groups.get(norm(name));
      if (!g) {
        g = {
          name,
          phone,
          start: importDate(options.balanceDate),
          rows: [],
          existing: state.merchants.some(
            (m) => norm(m.name) === norm(name) || (phone && m.phone === phone),
          ),
          hasBalance: false,
        };
        groups.set(norm(name), g);
      }
      if (g.phone && phone && g.phone !== phone)
        throw Error(
          "This merchant has two different phone numbers. Check the file.",
        );
      if (phone) g.phone = phone;
      if (get("opening")) {
        const n = amount(get("opening"));
        if (g.opening !== undefined && g.opening !== n)
          throw Error("This merchant has different opening balances.");
        g.opening = n;
      }
      const records: { kind: HistoryRow["kind"]; amount: number }[] = [];
      for (const kind of ["payment", "invoice", "return"] as const)
        if (get(kind)) {
          const n = amount(get(kind));
          if (n < 0)
            throw Error("Payments, invoices and returns must be positive.");
          if (n) records.push({ kind, amount: n });
        }
      if (get("amount")) {
        const raw = norm(get("kind")),
          kind =
            (
              {
                payment: "payment",
                collection: "payment",
                paid: "payment",
                "payment received": "payment",
                invoice: "invoice",
                sale: "invoice",
                "goods added": "invoice",
                return: "return",
                "goods returned": "return",
                adjustment: "adjustment",
                correction: "adjustment",
              } as Partial<Record<string, HistoryRow["kind"]>>
            )[raw] || (!raw ? options.defaultKind : undefined);
        if (!kind || kind === "none")
          throw Error(
            "Choose what the amount column means. Unknown transaction types need correction.",
          );
        if (records.length)
          throw Error(
            "Choose either the amount column or the separate payments/invoices/returns columns.",
          );
        const n = amount(get("amount"));
        if (!n || (n < 0 && kind !== "adjustment"))
          throw Error("Check the transaction amount.");
        records.push({ kind, amount: n });
      }
      if (records.length) {
        const date = importDate(get("date"), options.monthFirst);
        g.start = date < g.start ? date : g.start;
        const reference = get("reference") || `FILE-ROW-${index + 2}`;
        records.forEach((record, i) => {
          if (reference.length > 70)
            throw Error("The old reference must be 70 characters or less.");
          let method = norm(get("method")) || "other";
          if (!["cash", "bank", "card", "other"].includes(method))
            throw Error("Payment method must be cash, bank, card or other.");
          g!.rows.push({
            id: crypto.randomUUID(),
            ...record,
            reference:
              reference + (records.length > 1 ? "-" + record.kind : ""),
            occurred_at: date + "T12:00:00+03:00",
            method,
            note: get("note"),
          });
        });
      }
      if (get("balance")) {
        const observedDate = records.length
          ? importDate(get("date"), options.monthFirst)
          : g.start;
        if (!g.observedDate || observedDate >= g.observedDate) {
          g.observed = amount(get("balance"));
          g.observedDate = observedDate;
        }
        g.hasBalance = true;
      }
    } catch (error) {
      issues.push(
        `Row ${index + 2}: ${error instanceof Error ? error.message : "Check this row."}`,
      );
    }
  });
  const merchants: ImportMerchant[] = [];
  for (const g of groups.values()) {
    g.rows.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const delta = g.rows.reduce(
      (sum, r) =>
        sum +
        (r.kind === "payment" || r.kind === "return" ? -r.amount : r.amount),
      0,
    );
    if (g.opening === undefined) {
      if (g.observed !== undefined) g.opening = g.observed - delta;
      else if (!g.existing) {
        issues.push(
          `${g.name}: add an opening amount or a final amount owed. An unknown balance cannot be treated as zero.`,
        );
        continue;
      } else g.opening = 0;
    }
    const closing = g.opening + delta;
    if (!Number.isSafeInteger(closing) || Math.abs(closing) > 999999999999) {
      issues.push(`${g.name}: the total is too large.`);
      continue;
    }
    if (g.hasBalance && closing !== g.observed)
      issues.push(
        `${g.name}: opening amount and transactions do not match the last balance in the file.`,
      );
    const refs = new Set<string>(),
      unnumbered = new Set<string>();
    for (const row of g.rows) {
      const key = row.kind + ":" + row.reference;
      if (refs.has(key))
        issues.push(
          `${g.name}: reference ${row.reference} repeats. Check for duplicate transactions.`,
        );
      refs.add(key);
      if (row.reference.startsWith("FILE-ROW-")) {
        const details = [
          row.occurred_at,
          row.kind,
          row.amount,
          row.method,
          row.note,
        ].join("|");
        if (unnumbered.has(details))
          issues.push(
            `${g.name}: two unnumbered rows have the same date and amount. Check for a duplicate, or add the original receipt numbers if both are real.`,
          );
        unnumbered.add(details);
      }
    }
    merchants.push({
      id: crypto.randomUUID(),
      opening_id: crypto.randomUUID(),
      name: g.name,
      phone: g.phone,
      opening: g.opening,
      closing,
      start_on: g.start,
      rows: g.rows,
      existing: g.existing,
    });
  }
  return { merchants, issues };
}
