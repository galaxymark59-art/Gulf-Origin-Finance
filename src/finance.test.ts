import { expect, it, vi, beforeEach } from "vitest";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  emptyState,
  defaultBusiness,
  type Entry,
  type CashMovement,
  type State,
} from "./domain";
import {
  cashDay,
  cashPosting,
  savingsPeriod,
  lineTotal,
  quantity,
  can,
  isOverdue,
  merchantHistory,
} from "./finance";
import {
  cashReport,
  reportExcel,
  reportPdf,
  savingsReport,
  transactionReport,
  paymentReport,
} from "./exports";
vi.mock("./native", () => ({ native: false, SecureVault: {} }));
vi.mock("./client", () => ({ supabase: {} }));
function state(): State {
  const s = emptyState("a");
  s.member = {
    id: "a",
    owner_id: "a",
    name: "Test owner",
    email: "qa@example.test",
    role: "owner",
    active: true,
    permissions: {},
  };
  s.members = [s.member];
  s.business = {
    ...defaultBusiness,
    authorized: "Test owner · fictional QA only",
  };
  s.cashAccounts = [
    {
      id: "a",
      owner_id: "a",
      start_on: "2026-10-01",
      opening_cash: 100000,
      created_by: "a",
    },
  ];
  s.savingsAccount = {
    owner_id: "a",
    start_on: "2026-10-01",
    opening_savings: 50000,
  };
  s.merchants = [
    {
      id: "m",
      name: "Fictional Merchant",
      phone: "+966500000001",
      contact: "",
      address: "",
      city: "",
      notes: "",
      prefix: "QA",
      language: "en",
      balance: 400000,
      opening: 500000,
      sequence: 2,
      version: 2,
      created_at: "2026-10-01T07:00:00Z",
    },
  ];
  s.entries = [
    {
      id: "opening",
      merchant_id: "m",
      owner_id: "a",
      created_by: "a",
      kind: "opening",
      amount: 0,
      delta: 500000,
      previous: 0,
      balance: 500000,
      method: "adjustment",
      note: "Opening",
      occurred_at: "2026-10-01T07:00:00Z",
      created_at: "2026-10-01T07:00:00Z",
      reference: "QA OPEN",
    },
    {
      id: "payment",
      merchant_id: "m",
      owner_id: "a",
      created_by: "a",
      kind: "payment",
      amount: 100000,
      delta: -100000,
      previous: 500000,
      balance: 400000,
      method: "cash",
      note: "QA only",
      occurred_at: "2026-10-13T07:00:00Z",
      created_at: "2026-10-13T07:00:00Z",
      reference: "QA 001",
    },
  ];
  const movement = (
    id: string,
    kind: CashMovement["kind"],
    amount: number,
    destination = "cash",
  ): CashMovement => ({
    id,
    owner_id: "a",
    created_by: "a",
    cash_user: "a",
    kind,
    amount,
    ...cashPosting(kind, amount, destination),
    destination,
    note: "Fictional QA " + id,
    reference: "QA-" + id,
    occurred_at: "2026-10-13T08:00:00Z",
    created_at: "2026-10-13T08:00:00Z",
  });
  s.cashMovements = [
    movement("expense", "expense", 20000),
    movement("purchase", "purchase", 10000),
    movement("saved", "savings_deposit", 30000),
    movement("direct", "savings_withdrawal", 10000, "purchase"),
  ];
  return s;
}
beforeEach(async () => {
  const f = await readFile("public/fonts/Amiri-Regular.ttf");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(f)),
  );
});
it("rounds fractional goods exactly once in integer halalas", () => {
  expect(quantity("1.005")).toBe(1005);
  expect(lineTotal(1005, 100)).toBe(101);
  expect(() => quantity("0")).toThrow();
  expect(() => lineTotal(1000, NaN)).toThrow();
});
it("keeps cash, invoice due and direct savings purchases separate", () => {
  const s = state(),
    c = cashDay(s, "2026-10-13");
  expect(c.closing).toBe(140000);
  expect(
    c.available - c.expenses - (c.purchases - 10000) - c.saved - c.otherPaid,
  ).toBe(c.closing);
  expect(savingsPeriod(s, "2026-10-13", "2026-10-13").closing).toBe(70000);
  expect(c.purchases).toBe(20000);
  expect(
    merchantHistory(s, s.merchants[0], "2026-10-04", "2026-10-13"),
  ).toMatchObject({ opening: 500000, closing: 400000 });
});
it("attributes a manager's reversal to the original cash holder", () => {
  const s = state();
  const original = s.entries[1];
  s.entries.push({
    ...original,
    id: "reversed",
    created_by: "manager",
    cash_user: "a",
    kind: "reversal",
    delta: 100000,
    reverses: original.id,
  });
  expect(cashDay(s, "2026-10-13", "a").collected).toBe(0);
});
it("uses recorded due dates and denies viewer writes regardless of grants", () => {
  const s = state(),
    m = s.merchants[0];
  expect(isOverdue(m, "2026-10-13")).toBe(false);
  expect(isOverdue({ ...m, due_on: "2026-10-12" }, "2026-10-13")).toBe(true);
  expect(isOverdue({ ...m, due_on: "2026-10-13" }, "2026-10-13")).toBe(false);
  const viewer = {
    ...s.member!,
    role: "viewer" as const,
    permissions: { record_transactions: true, export_reports: false },
  };
  expect(can(viewer, "record_transactions")).toBe(false);
  expect(can(viewer, "export_reports")).toBe(false);
  expect(
    can({ ...viewer, permissions: { export_reports: true } }, "export_reports"),
  ).toBe(true);
});
it("exports the same cash and savings figures as the ledger into real PDF and Excel files", async () => {
  const s = state(),
    model = cashReport(s, "2026-10-13");
  expect(model.sections.map((x) => x.title[0])).toEqual([
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
  ]);
  expect(model.sections[6].rows.find((r) => r[0] === "Cash in hand")?.[1]).toBe(
    140000,
  );
  const excel = await reportExcel(model);
  const ExcelJS = (await import("exceljs")).default,
    wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await excel.arrayBuffer());
  const rows = wb.getWorksheet("Report")!.getSheetValues() as unknown[][];
  expect(rows.some((r) => r?.[1] === "Cash in hand" && r?.[2] === 1400)).toBe(
    true,
  );
  const pdf = await reportPdf(model);
  expect(
    new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 8)),
  ).toContain("%PDF");
  await mkdir("docs/qa", { recursive: true });
  await writeFile(
    "docs/qa/mcube-cash.pdf",
    new Uint8Array(await pdf.arrayBuffer()),
  );
  await writeFile(
    "docs/qa/mcube-cash.xlsx",
    new Uint8Array(await excel.arrayBuffer()),
  );
  const savings = savingsReport(s, "2026-10-13", "2026-10-13");
  expect(savings.sections[0].rows.at(-1)?.[6]).toBe(70000);
  expect(
    transactionReport(s, "2026-10-13", "2026-10-13").sections,
  ).toHaveLength(2);
}, 60000);
it("shares this payment and the previous 15 days while excluding later and older transactions", async () => {
  const s = state(),
    payment = s.entries[1];
  s.entries[0].occurred_at = s.entries[0].created_at = "2026-09-01T07:00:00Z";
  payment.previous = 496000;
  payment.balance = 396000;
  s.merchants[0].balance = 396000;
  const within = {
    ...payment,
    id: "prior",
    reference: "QA PRIOR",
    amount: 2000,
    delta: -2000,
    previous: 502000,
    balance: 500000,
    occurred_at: "2026-09-28T07:00:00Z",
    created_at: "2026-09-28T07:00:00Z",
  };
  const outside = {
    ...within,
    id: "old",
    reference: "QA OLD",
    occurred_at: "2026-09-27T07:00:00Z",
    created_at: "2026-09-27T07:00:00Z",
  };
  const later = {
    ...payment,
    id: "later",
    reference: "QA LATER",
    created_at: "2026-10-13T08:00:00Z",
  };
  s.entries = [outside, within, ...s.entries, later];
  const receipt = {
    id: "qa-receipt",
    transaction_id: payment.id,
    merchant_id: "m",
    owner_id: "a",
    reference: payment.reference,
    snapshot: {
      business: {...s.business,name:"Previous business name"},
      merchant: s.merchants[0],
      entry: payment,
    },
    created_at: payment.created_at,
  } as any;
  const model = paymentReport(receipt, s),
    rows = model.sections[1].rows;
  expect(model.business.name).toBe("Mcube Exporters");
  expect(rows.some((r) => String(r[1]).includes("QA PRIOR"))).toBe(true);
  expect(rows.some((r) => String(r[1]).includes("This payment"))).toBe(true);
  expect(
    rows.some(
      (r) =>
        String(r[1]).includes("QA OLD") || String(r[1]).includes("QA LATER"),
    ),
  ).toBe(false);
  expect(model.sections[0].rows[0][1]).toBe(100000);
  const pdf = await reportPdf(model);
  await writeFile(
    "docs/qa/mcube-payment-history.pdf",
    new Uint8Array(await pdf.arrayBuffer()),
  );
});
