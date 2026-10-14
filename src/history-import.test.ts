import { expect, it } from "vitest";
import { emptyState } from "./domain";
import {
  parseCsv,
  guessMapping,
  planHistory,
  importDate,
  combineHistorySheets,
} from "./history-import";
const options = {
  defaultName: "",
  defaultKind: "payment" as const,
  balanceDate: "2026-10-01",
  monthFirst: false,
};
it("joins a merchant balance sheet with a separate year of payment history", () => {
  const sheets = combineHistorySheets([
    { name: "Merchants", rows: parseCsv("Merchant name,Balance\nOne,3500") },
    {
      name: "Payments",
      rows: parseCsv(
        "Merchant name,Date,Payment,Reference\nOne,2025-10-14,1000,A\n,2026-10-01,500,B",
      ),
    },
  ]);
  expect(sheets).toHaveLength(3);
  const p = planHistory(
    sheets[0].rows,
    guessMapping(sheets[0].rows[0]),
    emptyState("owner"),
    options,
  );
  expect(p.issues).toEqual([]);
  expect(p.merchants[0]).toMatchObject({ opening: 500000, closing: 350000 });
  expect(p.merchants[0].rows).toHaveLength(2);
});
it("reads quoted merchant names and keeps one year of dated payments with exact balances", () => {
  const rows = parseCsv(
    'Merchant name,Opening balance,Date,Amount,Reference,Notes\n"Shop, One",5000,14/10/2025,1000,OLD-1,"First\npayment"\n"Shop, One",,01/10/2026,500,OLD-2,Second',
  );
  const p = planHistory(
    rows,
    guessMapping(rows[0]),
    emptyState("owner"),
    options,
  );
  expect(p.issues).toEqual([]);
  expect(p.merchants).toHaveLength(1);
  expect(p.merchants[0]).toMatchObject({
    name: "Shop, One",
    opening: 500000,
    closing: 350000,
    start_on: "2025-10-14",
  });
  expect(p.merchants[0].rows[0].note).toContain("\n");
});
it("derives a reviewed opening from the closing balance and never guesses an unknown balance", () => {
  const rows = parseCsv(
    "Merchant,Date,Payment,Reference,Balance\nOne,2025-10-14,1000,A,4000\nOne,2026-10-01,500,B,3500",
  );
  const p = planHistory(
    rows,
    guessMapping(rows[0]),
    emptyState("owner"),
    options,
  );
  expect(p.issues).toEqual([]);
  expect(p.merchants[0].opening).toBe(500000);
  const unknown = parseCsv("Merchant,Date,Payment\nOne,2025-10-14,1000");
  expect(
    planHistory(
      unknown,
      guessMapping(unknown[0]),
      emptyState("owner"),
      options,
    ).issues.join(),
  ).toContain("unknown balance");
});
it("flags duplicate references and leaves merchants already in the app unchanged", () => {
  const rows = parseCsv(
    "Merchant,Opening,Date,Payment,Reference\nExisting,5000,2025-10-14,1000,A\nExisting,,2026-10-01,500,A",
  );
  const s = emptyState("owner");
  s.merchants = [{ name: "Existing", phone: "" } as any];
  const p = planHistory(rows, guessMapping(rows[0]), s, options);
  expect(p.merchants[0].existing).toBe(true);
  expect(p.issues.join()).toContain("repeats");
  expect(() => importDate("31/02/2025")).toThrow();
  expect(importDate("10/14/2025", true)).toBe("2025-10-14");
});
it("uses the latest dated balance in reverse-ordered files and rejects unclear decimal commas", () => {
  const rows = parseCsv(
    "Merchant;Date;Payment;Reference;Balance\nOne;2026-10-01;500;B;3500\nOne;2025-10-14;1000;A;4000",
  );
  expect(
    planHistory(rows, guessMapping(rows[0]), emptyState("owner"), options)
      .merchants[0].opening,
  ).toBe(500000);
  rows[1][2] = "1,50";
  expect(
    planHistory(
      rows,
      guessMapping(rows[0]),
      emptyState("owner"),
      options,
    ).issues.join(),
  ).toContain("unclear comma");
});
it("asks for review of identical unnumbered payments instead of adding them silently", () => {
  const rows = parseCsv(
    "Merchant,Opening,Date,Payment\nOne,5000,2025-10-14,1000\nOne,,2025-10-14,1000",
  );
  expect(
    planHistory(
      rows,
      guessMapping(rows[0]),
      emptyState("owner"),
      options,
    ).issues.join(),
  ).toContain("Check for a duplicate");
});
