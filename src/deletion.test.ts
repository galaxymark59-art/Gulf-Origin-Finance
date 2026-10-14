import { expect, it } from "vitest";
import { deletedIds, deletionNote, merchantDeletion } from "./deletion";
import {
  collection,
  emptyState,
  visibleState,
  type Entry,
  type Merchant,
} from "./domain";

it("deleting a collection cancels its balance effect without losing the audit records", () => {
  const state = emptyState("owner");
  state.merchants = [
    {
      id: "merchant",
      name: "Fictional",
      balance: 40000,
      version: 2,
    } as Merchant,
  ];
  const paid = {
    id: "payment",
    merchant_id: "merchant",
    kind: "payment",
    amount: 10000,
    delta: -10000,
    method: "cash",
    note: "",
    occurred_at: "2026-10-14T10:00:00Z",
  } as Entry;
  state.entries = [paid];
  state.queue = [
    {
      id: "deletion",
      kind: "entry",
      created_at: "2026-10-14T10:10:00Z",
      payload: {
        ...paid,
        id: "deletion",
        kind: "reversal",
        delta: 10000,
        reverses: paid.id,
        note: deletionNote("QA 001"),
      },
    },
  ];
  const view = visibleState(state);
  const deleted = deletedIds(view.entries);
  expect(view.merchants[0].balance).toBe(50000);
  expect(view.entries).toHaveLength(2);
  expect(view.entries.filter((e) => !deleted.has(e.id))).toHaveLength(0);
  expect(collection(view.entries, "2026-10-14", "2026-10-14")).toBe(0);
  expect(deletedIds([{ ...paid, note: deletionNote("QA 001") }]).size).toBe(0);
});

it("merchant deletion and restore preserve its history and saved balance", () => {
  const state = emptyState("owner");
  state.merchants = [
    {
      id: "merchant",
      name: "Fictional",
      balance: 50000,
      version: 1,
    } as Merchant,
  ];
  state.entries = [
    { id: "opening", merchant_id: "merchant", kind: "opening" } as Entry,
  ];
  state.queue = [merchantDeletion(state, "merchant", true)];
  const deleted = visibleState(state);
  expect(deleted.merchants.filter((m) => !m.deleted_at)).toHaveLength(0);
  expect(deleted.merchants[0].balance).toBe(50000);
  deleted.queue = [merchantDeletion(deleted, "merchant", false)];
  const restored = visibleState(deleted);
  expect(restored.merchants.filter((m) => !m.deleted_at)).toHaveLength(1);
  expect(restored.entries).toEqual(state.entries);
});
