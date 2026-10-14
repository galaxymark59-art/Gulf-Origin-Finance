import { mcubeLogo } from "./branding";
export type Language = "en" | "ar";
export type Role = "owner" | "collector" | "viewer";
export type Permission =
  | "view_records"
  | "record_transactions"
  | "export_reports"
  | "manage_cash"
  | "manage_users"
  | "manage_owners";
export type Member = {
  id: string;
  owner_id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  permissions: Partial<Record<Permission, boolean>>;
  last_activity?: string;
  must_change_password?: boolean;
};
export type ItemLine = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};
export type GoodsDocument = {
  reference: string;
  date: string;
  lines: ItemLine[];
  original_invoice?: string;
  original_path?: string;
  file_hash?: string;
};
export type CashAccount = {
  id: string;
  owner_id: string;
  start_on: string;
  opening_cash: number;
  created_by: string;
};
export type SavingsAccount = {
  owner_id: string;
  start_on: string;
  opening_savings: number;
};
export type CashKind =
  | "expense"
  | "purchase"
  | "other_in"
  | "other_out"
  | "savings_deposit"
  | "savings_withdrawal"
  | "transfer_out"
  | "transfer_in"
  | "reversal";
export type CashMovement = {
  id: string;
  owner_id: string;
  created_by: string;
  cash_user: string;
  kind: CashKind;
  amount: number;
  cash_delta: number;
  savings_delta: number;
  expense: number;
  purchase: number;
  destination: string;
  reference: string;
  note: string;
  occurred_at: string;
  created_at: string;
  reverses?: string;
  transfer_user?: string;
  pending?: boolean;
};
export type CashCheck = {
  id: string;
  owner_id: string;
  created_by: string;
  scope_user: string | null;
  date: string;
  counted: number;
  expected: number;
  difference: number;
  note: string;
  reference: string;
  created_at: string;
  pending?: boolean;
};
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
  due_on?: string;
};
export type Entry = {
  id: string;
  merchant_id: string;
  kind:
    | "opening"
    | "payment"
    | "adjustment"
    | "reversal"
    | "invoice"
    | "return";
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
  created_by?: string;
  cash_user?: string;
  document?: GoodsDocument;
  reverses?: string;
  pending?: boolean;
};
export type Receipt = {
  id: string;
  transaction_id: string;
  merchant_id: string;
  reference: string;
  snapshot: {
    business: Business;
    merchant: Merchant;
    entry: Entry;
    history?: { from: string; to: string; opening: number; entries: Entry[] };
  };
  status: "generated" | "share_initiated" | "confirmed_sent" | "failed";
};
export type Operation = {
  id: string;
  kind:
    | "merchant"
    | "edit_merchant"
    | "entry"
    | "business"
    | "share"
    | "cash_account"
    | "savings_account"
    | "cash_entry"
    | "cash_check";
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
  businessOwner: string;
  member: Member | null;
  members: Member[];
  cashAccounts: CashAccount[];
  savingsAccount: SavingsAccount | null;
  cashMovements: CashMovement[];
  cashChecks: CashCheck[];
};
export const defaultBusiness: Business = {
  name: "Mcube Exporters",
  phone: "",
  email: "",
  address: "",
  city: "",
  vat: "",
  footer: "Thank you for your payment.",
  authorized: "",
  logo: mcubeLogo,
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
  businessOwner: owner,
  member: null,
  members: [],
  cashAccounts: [],
  savingsAccount: null,
  cashMovements: [],
  cashChecks: [],
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
  }).format(n === 0 ? 0 : n / 100);
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
          : e.kind === "reversal" &&
              !["adjustment", "invoice", "return"].includes(e.method)
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
  if (op.kind === "cash_account")
    s.cashAccounts.push(op.payload as unknown as CashAccount);
  if (op.kind === "savings_account")
    s.savingsAccount = op.payload as unknown as SavingsAccount;
  if (op.kind === "cash_entry") {
    const movement = {
      ...op.payload,
      id: op.id,
      pending: true,
      reference: "Pending " + op.id.slice(0, 8),
    } as unknown as CashMovement;
    s.cashMovements.push(movement);
    if (movement.kind === "transfer_out" && movement.transfer_user)
      s.cashMovements.push({
        ...movement,
        id: op.id + ":in",
        cash_user: movement.transfer_user,
        kind: "transfer_in",
        cash_delta: movement.amount,
        transfer_user: movement.cash_user,
        reference: movement.reference + " IN",
      });
  }
  if (op.kind === "cash_check")
    s.cashChecks.push({
      ...op.payload,
      id: op.id,
      pending: true,
      reference: "Pending " + op.id.slice(0, 8),
    } as unknown as CashCheck);
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
  if (message.includes("DUPLICATE_RETURN"))
    return "This return reference is already saved for this merchant. Open the existing return instead.";
  if (message.includes("REVERSE_RETURNS_FIRST"))
    return "Correct the linked returns before reversing this invoice.";
  if (
    message.includes("invoice_reference_unique") ||
    message.includes("invoice_file_unique")
  )
    return "This invoice is already saved. Open the existing invoice instead.";
  if (
    message.includes("cash_accounts_pkey") ||
    message.includes("savings_accounts_pkey")
  )
    return "The opening amount is already set. Use a cash or savings entry for later changes.";
  if (message.includes("INSUFFICIENT_CASH"))
    return "There is not enough cash recorded for this payment. Check the opening cash and money received first.";
  if (message.includes("ACCOUNT_DISABLED"))
    return "This account is disabled. Ask an owner to restore access.";
  if (message.includes("PERMISSION_DENIED"))
    return "Your account does not have permission for this action.";
  if (message.includes("DUPLICATE_INVOICE"))
    return "This invoice is already saved. Open the existing invoice instead.";
  if (message.includes("CASH_SETUP_REQUIRED"))
    return "Set the opening cash for each person included in this check first.";
  if (message.includes("SAVINGS_SETUP_REQUIRED"))
    return "Enter the savings already in the locker before recording savings changes.";
  if (message.includes("INSUFFICIENT_SAVINGS"))
    return "There is not enough money in savings for this withdrawal.";
  if (message.includes("RETURN_EXCEEDS_INVOICE"))
    return "The returns would exceed the original invoice. Check the items and amounts.";
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
