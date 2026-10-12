import { it, expect, vi, beforeEach } from "vitest";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  defaultBusiness,
  emptyState,
  type Receipt,
  type Entry,
  type Merchant,
} from "./domain";
vi.mock("./native", () => ({ native: false, SecureVault: {} }));
vi.mock("./storage", () => {
  const records = new Map();
  return {
    readLocal: async (k: string) => records.get(k) || null,
    writeLocal: async (k: string, v: unknown) => {
      records.set(k, v);
    },
  };
});
vi.mock("./client", () => ({
  supabase: {
    storage: {
      from: () => ({
        download: async () => ({ data: null }),
        upload: async () => ({ error: null }),
      }),
    },
  },
}));
import { receiptFile, exportWorkbook } from "./documents";
const merchant: Merchant = {
  id: "qa",
  name: "Ayan Grocery",
  phone: "+966500000001",
  contact: "",
  city: "Riyadh",
  address: "",
  notes: "",
  prefix: "AY",
  language: "en",
  balance: 500000,
  opening: 600000,
  sequence: 1,
  version: 2,
  created_at: "2026-10-13T07:00:00Z",
};
const entry: Entry = {
  id: "qa-payment",
  merchant_id: "qa",
  kind: "payment",
  amount: 100000,
  delta: -100000,
  previous: 600000,
  balance: 500000,
  method: "cash",
  note: "QA sample — not an issued business receipt",
  occurred_at: "2026-10-13T07:00:00Z",
  created_at: "2026-10-13T07:00:00Z",
  reference: "AY 001",
};
beforeEach(async () => {
  vi.stubGlobal("navigator", { onLine: false });
  const font = await readFile("public/fonts/Amiri-Regular.ttf");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(font)),
  );
});
it("generates a genuine English PDF with the immutable snapshot", async () => {
  const r: Receipt = {
    id: "qa-en",
    merchant_id: "qa",
    transaction_id: entry.id,
    reference: "AY 001",
    snapshot: { business: defaultBusiness, merchant, entry },
    status: "generated",
  };
  const file = await receiptFile(r, "qa-owner");
  expect(file.type).toBe("application/pdf");
  expect((await file.text()).startsWith("%PDF-")).toBe(true);
  expect(file.size).toBeGreaterThan(5000);
  await mkdir("docs/qa", { recursive: true });
  await writeFile(
    "docs/qa/sample-en.pdf",
    new Uint8Array(await file.arrayBuffer()),
  );
});
it("generates Arabic PDF using the embedded Arabic font", async () => {
  const r: Receipt = {
    id: "qa-ar",
    merchant_id: "qa",
    transaction_id: entry.id,
    reference: "AR 001",
    snapshot: {
      business: defaultBusiness,
      merchant: { ...merchant, name: "متجر الخليج", language: "ar" },
      entry: { ...entry, reference: "AR 001", note: "نسخة اختبار" },
    },
    status: "generated",
  };
  const file = await receiptFile(r, "qa-owner");
  expect((await file.text()).startsWith("%PDF-")).toBe(true);
  await mkdir("docs/qa", { recursive: true });
  await writeFile(
    "docs/qa/sample-ar.pdf",
    new Uint8Array(await file.arrayBuffer()),
  );
});
it("exports a real XLSX with SAR 1000 cash and SAR 3000 adjustment separately", async () => {
  let captured: Blob | undefined;
  const spy = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    captured = blob as Blob;
    return "blob:qa";
  });
  vi.stubGlobal("document", {
    createElement: () => ({ href: "", download: "", click: () => {} }),
  });
  const s = emptyState("qa");
  s.merchants = [merchant];
  s.entries = [
    entry,
    {
      ...entry,
      id: "qa-adj",
      kind: "adjustment",
      amount: 0,
      delta: 300000,
      previous: 500000,
      balance: 800000,
      method: "adjustment",
      reference: "AY 002",
    },
  ];
  await exportWorkbook(s, s.entries);
  expect(captured).toBeDefined();
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await captured!.arrayBuffer());
  const ws = wb.getWorksheet("Collections")!;
  expect(ws.getCell("F8").value).toBe(1000);
  expect(ws.getCell("G8").value).toBe(3000);
  await mkdir("docs/qa", { recursive: true });
  await writeFile(
    "docs/qa/sample-report.xlsx",
    new Uint8Array(await captured!.arrayBuffer()),
  );
  spy.mockRestore();
}, 60000);
