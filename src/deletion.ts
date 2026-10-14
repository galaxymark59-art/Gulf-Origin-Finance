import type { State, Operation } from "./domain";

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
