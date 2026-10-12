export type Language = "en" | "ar";
export type Business = {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  vat: string;
  footer: string;
  authorized: string;
  logo: string;
  language: Language;
};
export type Merchant = {
  id: string;
  name: string;
  phone: string;
  contact: string;
  city: string;
  address: string;
  notes: string;
  prefix: string;
  language: Language;
  balance: number;
  opening: number;
  sequence: number;
  version: number;
  created_at: string;
  last_payment?: string;
};
export type Entry = {
  id: string;
  merchant_id: string;
  kind: "opening" | "payment" | "adjustment" | "reversal";
  amount: number;
  delta: number;
  previous: number;
  balance: number;
  method: string;
  note: string;
  occurred_at: string;
  created_at: string;
  reference: string;
  owner_id?: string;
  reverses?: string;
  pending?: boolean;
};
export type Receipt = {
  id: string;
  transaction_id: string;
  merchant_id: string;
  reference: string;
  snapshot: { business: Business; merchant: Merchant; entry: Entry };
  status: "generated" | "share_initiated" | "confirmed_sent" | "failed";
};
export type Operation = {
  id: string;
  kind: "merchant" | "edit_merchant" | "entry" | "business" | "share";
  payload: Record<string, unknown>;
  expected?: number;
  created_at: string;
  error?: string;
  conflict?: boolean;
};
export type State = {
  merchants: Merchant[];
  entries: Entry[];
  receipts: Receipt[];
  business: Business;
  queue: Operation[];
  lastSync: string;
  owner: string;
};
export const defaultBusiness: Business = {
  name: "Gulf Origin International",
  phone: "",
  email: "",
  address: "",
  city: "",
  vat: "",
  footer: "Thank you for your payment.",
  authorized: "",
  logo: "",
  language: "en",
};
export const emptyState = (owner: string): State => ({
  merchants: [],
  entries: [],
  receipts: [],
  business: defaultBusiness,
  queue: [],
  lastSync: "",
  owner,
});
export function halalas(value: string, signed = false): number {
  const s = value.trim();
  if (!(signed ? /^-?\d{1,10}(\.\d{1,2})?$/ : /^\d{1,10}(\.\d{1,2})?$/).test(s))
    throw Error("Enter an amount with up to two decimal places.");
  const negative = s.startsWith("-");
  const [whole, fraction = ""] = s.replace("-", "").split(".");
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 999999999999)
    throw Error("Amount is too large.");
  return negative ? -n : n;
}
export const money = (n: number, language: Language = "en") =>
  new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(n / 100);
export const day = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
export const dateTime = (iso: string, language: Language = "en") =>
  new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-GB", {
    timeZone: "Asia/Riyadh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
export function collection(entries: Entry[], from: string, to: string) {
  return entries
    .filter((e) => day(e.occurred_at) >= from && day(e.occurred_at) <= to)
    .reduce(
      (n, e) =>
        n +
        (e.kind === "payment"
          ? e.amount
          : e.kind === "reversal" && e.method !== "adjustment"
            ? -e.amount
            : 0),
      0,
    );
}
export function applyPending(state: State, op: Operation): State {
  const s = structuredClone(state);
  if (op.kind === "merchant") {
    const m = op.payload as unknown as Merchant;
    m.version = 1;
    s.merchants.push(m);
    s.entries.push({
      id: op.id,
      merchant_id: m.id,
      kind: "opening",
      amount: 0,
      delta: m.opening,
      previous: 0,
      balance: m.opening,
      method: "adjustment",
      note: "Opening balance",
      occurred_at: op.created_at,
      created_at: op.created_at,
      reference: "Pending " + op.id.slice(0, 8),
      pending: true,
    });
  }
  if (op.kind === "edit_merchant") {
    const index = s.merchants.findIndex((m) => m.id === op.payload.id);
    if (index >= 0)
      s.merchants[index] = {
        ...s.merchants[index],
        ...op.payload,
        version: s.merchants[index].version + 1,
      } as Merchant;
  }
  if (op.kind === "entry") {
    const e = op.payload as unknown as Entry;
    const m = s.merchants.find((m) => m.id === e.merchant_id);
    if (!m) throw Error("Merchant not found.");
    const delta = e.kind === "payment" ? -e.amount : e.delta;
    const entry = {
      ...e,
      delta,
      previous: m.balance,
      balance: m.balance + delta,
      pending: true,
      reference: "Pending " + op.id.slice(0, 8),
    };
    m.balance = entry.balance;
    m.version++;
    if (e.kind === "payment") m.last_payment = e.occurred_at;
    s.entries.push(entry);
  }
  if (op.kind === "business") s.business = op.payload as unknown as Business;
  if (op.kind === "share") {
    const r = s.receipts.find((r) => r.id === op.payload.id);
    if (r) r.status = op.payload.status as Receipt["status"];
  }
  s.queue.push(op);
  return s;
}
export function visibleState(base: State): State {
  return base.queue.reduce<State>((s, op) => applyPending(s, op), {
    ...base,
    queue: [],
  });
}
export function friendly(message: string) {
  if (message.includes("INVALID_DATE"))
    return "The transaction time is in the future in Riyadh. Correct the pending date in Sync and retry.";
  if (message.includes("BALANCE_CONFLICT"))
    return "The cloud balance changed. Review and resolve this operation in Sync.";
  if (message.includes("PREFIX_IN_USE") || message.includes("duplicate key"))
    return "That merchant prefix is already in use. Choose another prefix.";
  if (message.includes("OWNER_ONLY"))
    return "This account is not the authorized owner. Contact the project administrator.";
  if (message.includes("OVERPAYMENT"))
    return "Confirm the credit balance before saving this overpayment.";
  if (message.includes("Invalid login credentials"))
    return "The email or password is incorrect.";
  if (message.includes("network") || message.includes("fetch"))
    return "Connection unavailable. Your pending records remain saved on this device.";
  return "This action could not be completed. Please retry. If it persists, check the project setup.";
}
