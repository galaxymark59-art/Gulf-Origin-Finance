import { expect, it } from "vitest";
import {
  deletedIds,
  deletionNote,
  merchantDeletion,
  entryDeletions,
  activeRecords,
} from "./deletion";
import { cashDay, savingsPeriod } from "./finance";
import { transactionReport } from "./exports";
import {
  collection,
  emptyState,
  visibleState,
  type Entry,
  type Merchant,
  type CashMovement,
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

it("removes deleted collections before day, month and collector filters", () => {
  const state = emptyState("owner");
  const original = {
    id: "payment",
    merchant_id: "merchant",
    kind: "payment",
    amount: 550000,
    delta: -550000,
    method: "cash",
    note: "",
    created_by: "collector",
    cash_user: "collector",
    occurred_at: "2026-09-30T10:00:00Z",
    created_at: "2026-09-30T10:00:00Z",
    reference: "QA 1",
  } as Entry;
  const cancellation = {
    ...original,
    id: "cancelled",
    kind: "reversal",
    delta: 550000,
    created_by: "owner",
    reverses: original.id,
    note: deletionNote(original.reference),
    occurred_at: "2026-10-14T10:00:00Z",
  } as Entry;
  state.entries = [original, cancellation];
  state.cashAccounts = [
    {
      id: "collector",
      owner_id: "owner",
      created_by: "owner",
      start_on: "2026-09-01",
      opening_cash: 0,
    },
  ];
  expect(collection(state.entries, "2026-10-14", "2026-10-14")).toBe(0);
  expect(collection(state.entries, "2026-09-01", "2026-09-30")).toBe(0);
  expect(
    collection(
      state.entries.filter((e) => e.created_by === "collector"),
      "2026-09-01",
      "2026-10-14",
      state.entries,
    ),
  ).toBe(0);
  expect(cashDay(state, "2026-10-14").collected).toBe(0);
  expect(cashDay(state, "2026-10-14").closing).toBe(0);
  expect(cashDay(state, "2026-09-30").collected).toBe(0);
  expect(
    transactionReport(state, "2026-10-14", "2026-10-14").sections[0].rows,
  ).toEqual([]);
  expect(state.entries).toHaveLength(2);
});

it("does not turn a deleted savings deposit into a withdrawal on another day", () => {
  const state = emptyState("owner");
  state.savingsAccount = {
    owner_id: "owner",
    start_on: "2026-10-01",
    opening_savings: 0,
  };
  const saved = {
    id: "saved",
    kind: "savings_deposit",
    savings_delta: 30000,
    occurred_at: "2026-10-10T10:00:00Z",
    note: "Saved",
  } as CashMovement;
  state.cashMovements = [
    saved,
    {
      ...saved,
      id: "cancel",
      kind: "reversal",
      savings_delta: -30000,
      reverses: saved.id,
      occurred_at: "2026-10-14T10:00:00Z",
      note: deletionNote("QA 2"),
    },
  ];
  expect(savingsPeriod(state, "2026-10-14", "2026-10-14")).toMatchObject({
    opening: 0,
    added: 0,
    withdrawn: 0,
    closing: 0,
    entries: [],
  });
});

it("bulk deletion includes linked returns first and updates each expected balance", () => {
  const state = emptyState("owner");
  state.merchants = [
    { id: "merchant", balance: 70000, version: 1 } as Merchant,
  ];
  const invoice = {
    id: "invoice",
    merchant_id: "merchant",
    kind: "invoice",
    amount: 100000,
    delta: 100000,
    created_at: "2026-10-12T10:00:00Z",
    reference: "QA 1",
  } as Entry;
  const returned = {
    ...invoice,
    id: "return",
    kind: "return",
    amount: 20000,
    delta: -20000,
    document: { original_invoice: "invoice" },
    created_at: "2026-10-13T10:00:00Z",
  } as Entry;
  const paid = {
    ...invoice,
    id: "paid",
    kind: "payment",
    amount: 10000,
    delta: -10000,
    created_at: "2026-10-14T10:00:00Z",
  } as Entry;
  state.entries = [invoice, returned, paid];
  const operations = entryDeletions(state, [invoice.id, paid.id, paid.id]);
  expect(operations.map((op) => op.payload.reverses)).toEqual([
    returned.id,
    paid.id,
    invoice.id,
  ]);
  expect(operations.map((op) => op.expected)).toEqual([70000, 90000, 100000]);
  state.queue = operations;
  const view = visibleState(state);
  expect(view.merchants[0].balance).toBe(0);
  expect(activeRecords(view.entries)).toEqual([]);
  expect(entryDeletions(view, [invoice.id, paid.id])).toEqual([]);
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
