import type { State, Operation, Entry, CashMovement } from "./domain";

// Merchant archives use the existing owner-protected business settings operation.
// This also works for imported merchants that have no phone number yet.
export function merchantDeletion(
  state: State,
  id: string,
  deleted: boolean,
): Operation {
  const stamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    kind: "business",
    created_at: stamp,
    payload: {
      ...state.business,
      deleted_merchants: {
        ...state.business.deleted_merchants,
        [id]: deleted ? stamp : "",
      },
    },
  };
}

// Deleting money entries uses the existing audited reversal operation.
// Keep both records for balances, cash calculations, reports and issued receipts.
export const deletionNote = (reference: string) =>
  "Deleted entry: " + reference;
export function deletedIds(
  records: readonly {
    id: string;
    kind: string;
    note: string;
    reverses?: string;
  }[],
): Set<string> {
  const ids = new Set<string>();
  for (const record of records) {
    if (
      record.kind === "reversal" &&
      record.reverses &&
      record.note.startsWith("Deleted entry: ")
    ) {
      ids.add(record.id);
      ids.add(record.reverses);
    }
  }
  return ids;
}

// Determine cancellations before filtering by date, merchant or recorded-by.
// A cancellation of yesterday's collection is not negative income today.
export function activeRecords<
  T extends { id: string; kind: string; reverses?: string },
>(records: readonly T[]): T[] {
  const cancelled = new Set<string>();
  for (const record of records) {
    if (record.kind === "reversal" && record.reverses) {
      cancelled.add(record.id);
      cancelled.add(record.reverses);
    }
  }
  return records.filter((record) => !cancelled.has(record.id));
}

export function deletableEntries(state: State): Entry[] {
  return activeRecords(state.entries).filter(
    (e) =>
      !e.pending &&
      ["payment", "adjustment", "invoice", "return"].includes(e.kind),
  );
}

export function activeLedgerEntries(state: State): Entry[] {
  const removedMerchants = new Set(
    state.merchants
      .filter((merchant) => merchant.deleted_at)
      .map((merchant) => merchant.id),
  );
  return activeRecords(state.entries).filter(
    (entry) => !removedMerchants.has(entry.merchant_id),
  );
}

export function entryDeletions(
  state: State,
  ids: readonly string[],
): Operation[] {
  const selected = new Set(ids);
  const available = deletableEntries(state);
  // An invoice cannot leave its linked returns active after deletion.
  for (const e of available) {
    if (
      e.kind === "return" &&
      e.document?.original_invoice &&
      selected.has(e.document.original_invoice)
    )
      selected.add(e.id);
  }
  const entries = available
    .filter((e) => selected.has(e.id))
    .sort(
      (a, b) =>
        Number(b.kind === "return") - Number(a.kind === "return") ||
        b.created_at.localeCompare(a.created_at),
    );
  const balances = new Map(state.merchants.map((m) => [m.id, m.balance]));
  const stamp = new Date().toISOString();
  return entries.map((e) => {
    const expected = balances.get(e.merchant_id);
    if (expected === undefined)
      throw Error("Merchant not found. Sync and retry.");
    balances.set(e.merchant_id, expected - e.delta);
    const id = crypto.randomUUID();
    return {
      id,
      kind: "entry",
      expected,
      created_at: stamp,
      payload: {
        ...e,
        id,
        kind: "reversal",
        delta: -e.delta,
        reverses: e.id,
        allow_credit: true,
        occurred_at: stamp,
        created_at: stamp,
        note: deletionNote(e.reference),
      },
    };
  });
}

export function deletableCash(state: State): CashMovement[] {
  return activeRecords(state.cashMovements).filter(
    (e) =>
      !e.pending &&
      !["reversal", "transfer_in", "transfer_out"].includes(e.kind) &&
      (e.created_by === state.owner ||
        state.member?.role === "owner" ||
        state.member?.permissions.manage_users),
  );
}

export function cashDeletions(
  state: State,
  ids: readonly string[],
): Operation[] {
  const selected = new Set(ids),
    stamp = new Date().toISOString();
  // Undo withdrawals/spending before removing the money that funded them.
  return deletableCash(state)
    .filter((e) => selected.has(e.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((e) => {
      const id = crypto.randomUUID();
      return {
        id,
        kind: "cash_entry",
        created_at: stamp,
        payload: {
          ...e,
          id,
          kind: "reversal",
          reverses: e.id,
          cash_delta: -e.cash_delta,
          savings_delta: -e.savings_delta,
          expense: -e.expense,
          purchase: -e.purchase,
          occurred_at: stamp,
          created_at: stamp,
          note: deletionNote(e.reference),
        },
      };
    });
}

export function merchantDeletions(
  state: State,
  ids: readonly string[],
): Operation[] {
  const merchants = state.merchants.filter(
    (m) => ids.includes(m.id) && !m.deleted_at,
  );
  if (!merchants.length) return [];
  const operation = merchantDeletion(state, "", true);
  const stamp = operation.created_at;
  operation.payload.deleted_merchants = {
    ...state.business.deleted_merchants,
    ...Object.fromEntries(merchants.map((m) => [m.id, stamp])),
  };
  return [operation];
}
