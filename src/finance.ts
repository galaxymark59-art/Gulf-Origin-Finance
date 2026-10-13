import {
  day,
  emptyState,
  money,
  type State,
  type Member,
  type Permission,
  type Entry,
  type ItemLine,
  type Merchant,
  type CashMovement,
} from "./domain";

export function can(member: Member | null, permission: Permission): boolean {
  if (!member?.active) return false;
  if (member.role === "owner") return true;
  if (
    member.role === "viewer" &&
    permission !== "view_records" &&
    permission !== "export_reports"
  )
    return false;
  const defaults: Record<Permission, boolean> = {
    view_records: true,
    record_transactions: member.role === "collector",
    export_reports: member.role === "collector",
    manage_cash: member.role === "collector",
    manage_users: false,
    manage_owners: false,
  };
  return member.permissions[permission] ?? defaults[permission];
}

// Older encrypted caches are extended in memory. Existing entries and pending IDs survive.
export function normalizeState(value: State, user: string): State {
  const defaults = emptyState(user);
  return {
    ...defaults,
    ...value,
    businessOwner: value.businessOwner || user,
    merchants: value.merchants || [],
    entries: value.entries || [],
    receipts: value.receipts || [],
    queue: value.queue || [],
    members: value.members || [],
    cashAccounts: value.cashAccounts || [],
    cashMovements: value.cashMovements || [],
    cashChecks: value.cashChecks || [],
  };
}

export function quantity(value: string): number {
  if (!/^\d{1,6}(\.\d{1,3})?$/.test(value.trim()))
    throw Error("Enter a quantity with up to three decimal places.");
  const [whole, part = ""] = value.trim().split(".");
  const result = Number(whole) * 1000 + Number(part.padEnd(3, "0"));
  if (!result) throw Error("Quantity must be greater than zero.");
  return result;
}
export function lineTotal(q: number, unitPrice: number): number {
  if (
    !Number.isSafeInteger(q) ||
    q <= 0 ||
    q > 999999999 ||
    !Number.isSafeInteger(unitPrice) ||
    unitPrice < 0 ||
    unitPrice > 999999999999
  )
    throw Error("Check the quantity and price.");
  // Round each line to the nearest halala, with a half halala rounded up.
  const total = (BigInt(q) * BigInt(unitPrice) + 500n) / 1000n;
  if (total > 999999999999n) throw Error("The invoice amount is too large.");
  return Number(total);
}
export function goodsTotal(lines: ItemLine[]): number {
  if (!lines.length || lines.length > 500)
    throw Error("Add between 1 and 500 items.");
  const result = lines.reduce((sum, line) => {
    if (
      !line.description.trim() ||
      line.total !== lineTotal(line.quantity, line.unit_price)
    )
      throw Error("Check each item's name, quantity and price.");
    return sum + line.total;
  }, 0);
  if (!Number.isSafeInteger(result) || result <= 0 || result > 999999999999)
    throw Error(
      "The total must be greater than zero and within the amount limit.",
    );
  return result;
}
export const actor = (entry: Entry) => entry.created_by || entry.owner_id || "";
export const cashActor = (entry: Entry) => entry.cash_user || actor(entry);
export function cashFromPayment(entry: Entry): number {
  return entry.method === "cash"
    ? entry.kind === "payment"
      ? entry.amount
      : entry.kind === "reversal"
        ? -entry.amount
        : 0
    : 0;
}
export const isOverdue = (
  merchant: Merchant,
  today = day(new Date().toISOString()),
) =>
  merchant.balance > 0 && Boolean(merchant.due_on && merchant.due_on < today);
export function reminderText(merchant: Merchant, business: string): string {
  if (merchant.balance <= 0 || !merchant.due_on)
    throw Error("This merchant has no payment due date or unpaid balance.");
  return `Hello ${merchant.contact || merchant.name}, this is a payment reminder from ${business}. The amount still due is ${money(merchant.balance)}. The payment due date was ${merchant.due_on}. Please let us know when you can pay. Thank you.`;
}
export function reminderUrl(merchant: Merchant, business: string): string {
  if (!/^\+[1-9]\d{7,14}$/.test(merchant.phone))
    throw Error(
      "Add the merchant's WhatsApp number with its country code first.",
    );
  return `https://wa.me/${merchant.phone.slice(1)}?text=${encodeURIComponent(reminderText(merchant, business))}`;
}

export function cashPosting(
  kind: CashMovement["kind"],
  amount: number,
  destination = "cash",
) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 999999999999)
    throw Error("Enter a valid positive amount.");
  const p = { cash_delta: 0, savings_delta: 0, expense: 0, purchase: 0 };
  if (kind === "expense") {
    p.cash_delta = -amount;
    p.expense = amount;
  } else if (kind === "purchase") {
    p.cash_delta = -amount;
    p.purchase = amount;
  } else if (kind === "other_in" || kind === "transfer_in")
    p.cash_delta = amount;
  else if (kind === "other_out" || kind === "transfer_out")
    p.cash_delta = -amount;
  else if (kind === "savings_deposit") {
    p.cash_delta = -amount;
    p.savings_delta = amount;
  } else if (kind === "savings_withdrawal") {
    p.savings_delta = -amount;
    if (destination === "cash") p.cash_delta = amount;
    else if (destination === "expense") p.expense = amount;
    else if (destination === "purchase") p.purchase = amount;
    else if (destination !== "other")
      throw Error("Choose where the money from savings went.");
  } else throw Error("Use a reversal to correct an existing cash entry.");
  return p;
}

export function cashDay(
  state: State,
  date: string,
  scope: string | null = null,
) {
  const accounts = state.cashAccounts.filter(
    (a) => (!scope || a.id === scope) && a.start_on <= date,
  );
  const accountByUser = new Map(accounts.map((a) => [a.id, a]));
  const eligible = (user: string, stamp: string) => {
    const a = accountByUser.get(user);
    return Boolean(a && day(stamp) >= a.start_on && day(stamp) <= date);
  };
  const payments = state.entries.filter(
    (e) => eligible(cashActor(e), e.occurred_at) && cashFromPayment(e) !== 0,
  );
  const movements = state.cashMovements.filter((e) =>
    eligible(e.cash_user, e.occurred_at),
  );
  const beforePayments = payments
    .filter((e) => day(e.occurred_at) < date)
    .reduce((s, e) => s + cashFromPayment(e), 0);
  const beforeMoves = movements
    .filter((e) => day(e.occurred_at) < date)
    .reduce((s, e) => s + e.cash_delta, 0);
  const opening =
    accounts.reduce((s, a) => s + a.opening_cash, 0) +
    beforePayments +
    beforeMoves;
  const todayPayments = payments.filter((e) => day(e.occurred_at) === date);
  const todayMoves = state.cashMovements.filter(
    (e) =>
      day(e.occurred_at) === date &&
      (!scope || e.cash_user === scope) &&
      (e.cash_delta === 0 || eligible(e.cash_user, e.occurred_at)),
  );
  const effectiveKind = (e: CashMovement) =>
    e.kind === "reversal"
      ? state.cashMovements.find((x) => x.id === e.reverses)?.kind
      : e.kind;
  const collected = todayPayments.reduce((s, e) => s + cashFromPayment(e), 0);
  const otherIn = todayMoves
    .filter((e) => ["other_in", "transfer_in"].includes(effectiveKind(e) || ""))
    .reduce((s, e) => s + e.cash_delta, 0);
  const otherPaid = -todayMoves
    .filter((e) =>
      ["other_out", "transfer_out"].includes(effectiveKind(e) || ""),
    )
    .reduce((s, e) => s + e.cash_delta, 0);
  const withdrawnToCash = todayMoves
    .filter(
      (e) =>
        effectiveKind(e) === "savings_withdrawal" && e.destination === "cash",
    )
    .reduce((s, e) => s + e.cash_delta, 0);
  const expenses = todayMoves.reduce((s, e) => s + e.expense, 0);
  const purchases = todayMoves.reduce((s, e) => s + e.purchase, 0);
  // Reversals carry negative category amounts, so corrections reconcile without rewriting history.
  const saved = todayMoves
    .filter((e) => effectiveKind(e) === "savings_deposit")
    .reduce((s, e) => s + e.savings_delta, 0);
  const closing =
    opening + collected + todayMoves.reduce((s, e) => s + e.cash_delta, 0);
  const accountUsers = new Set(
    state.cashAccounts.filter((a) => a.start_on <= date).map((a) => a.id),
  );
  const missing = [
    ...new Set(
      state.entries
        .filter(
          (e) =>
            (!scope || cashActor(e) === scope) &&
            day(e.occurred_at) === date &&
            cashFromPayment(e) !== 0 &&
            !accountUsers.has(cashActor(e)),
        )
        .map(cashActor),
    ),
  ];
  const checks = state.cashChecks
    .filter((c) => c.date === date && c.scope_user === scope && !c.pending)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const check = checks.at(-1);
  return {
    date,
    scope,
    accounts,
    opening,
    collected,
    otherIn,
    otherPaid,
    withdrawnToCash,
    available: opening + collected + otherIn + withdrawnToCash,
    expenses,
    purchases,
    saved,
    closing,
    payments: todayPayments,
    movements: todayMoves,
    missing,
    configured: accounts.length > 0 && missing.length === 0,
    check,
    changedSinceCheck: Boolean(check && check.expected !== closing),
    pending:
      todayPayments.some((e) => e.pending) || todayMoves.some((e) => e.pending),
  };
}

export function savingsPeriod(state: State, from: string, to: string) {
  const account = state.savingsAccount;
  const relevant = state.cashMovements.filter(
    (e) =>
      account &&
      day(e.occurred_at) >= account.start_on &&
      day(e.occurred_at) <= to &&
      e.savings_delta !== 0,
  );
  const opening =
    (account && account.start_on <= to ? account.opening_savings : 0) +
    relevant
      .filter((e) => day(e.occurred_at) < from)
      .reduce((s, e) => s + e.savings_delta, 0);
  const entries = relevant.filter((e) => day(e.occurred_at) >= from);
  return {
    opening,
    added: entries
      .filter((e) => e.savings_delta > 0)
      .reduce((s, e) => s + e.savings_delta, 0),
    withdrawn: -entries
      .filter((e) => e.savings_delta < 0)
      .reduce((s, e) => s + e.savings_delta, 0),
    closing: opening + entries.reduce((s, e) => s + e.savings_delta, 0),
    entries,
  };
}

export function merchantHistory(
  state: State,
  merchant: Merchant,
  from: string,
  to: string,
) {
  const all = state.entries
    .filter((e) => e.merchant_id === merchant.id)
    .sort(
      (a, b) =>
        a.occurred_at.localeCompare(b.occurred_at) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    );
  const opening = all
    .filter((e) => day(e.occurred_at) < from)
    .reduce((n, e) => n + e.delta, 0);
  const entries = all.filter(
    (e) => day(e.occurred_at) >= from && day(e.occurred_at) <= to,
  );
  return {
    opening,
    entries,
    closing: opening + entries.reduce((s, e) => s + e.delta, 0),
  };
}
