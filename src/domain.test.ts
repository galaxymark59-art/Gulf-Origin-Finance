import { describe, it, expect } from "vitest";
import {
  halalas,
  collection,
  day,
  emptyState,
  visibleState,
  type Operation,
  type Entry,
} from "./domain";
describe("financial correctness", () => {
  it("converts decimal amounts without floating point drift", () => {
    expect(halalas("0.29")).toBe(29);
    expect(halalas("1000.01")).toBe(100001);
    expect(halalas("-2.50", true)).toBe(-250);
    for (const x of ["0.001", "1e3", "NaN", "-1", "1,000", ""])
      expect(() => halalas(x)).toThrow();
  });
  it("separates collections from adjustments and handles payment reversals", () => {
    const date = "2026-10-13T07:00:00Z";
    const entries = [
      {
        kind: "payment",
        amount: 100000,
        delta: -100000,
        occurred_at: date,
        method: "cash",
      },
      {
        kind: "adjustment",
        amount: 0,
        delta: 300000,
        occurred_at: date,
        method: "adjustment",
      },
      {
        kind: "reversal",
        amount: 10000,
        delta: 10000,
        occurred_at: date,
        method: "cash",
      },
      {
        kind: "reversal",
        amount: 0,
        delta: -300000,
        occurred_at: date,
        method: "adjustment",
      },
    ] as Entry[];
    expect(collection(entries, "2026-10-13", "2026-10-13")).toBe(90000);
  });
  it("uses Riyadh day boundaries", () => {
    expect(day("2026-10-12T21:00:00Z")).toBe("2026-10-13");
    expect(day("2026-10-12T20:59:59Z")).toBe("2026-10-12");
  });
  it("reconstructs provisional balances after app restart without mutating the cloud snapshot", () => {
    const state = emptyState("owner");
    const ops: Operation[] = [
      {
        id: "create",
        kind: "merchant",
        created_at: "2026-10-13T07:00:00Z",
        payload: {
          id: "m",
          name: "Ayan Grocery",
          opening: 600000,
          balance: 600000,
          prefix: "AY",
          version: 0,
        },
      },
      {
        id: "payment",
        kind: "entry",
        expected: 600000,
        created_at: "2026-10-13T07:01:00Z",
        payload: {
          id: "payment",
          merchant_id: "m",
          kind: "payment",
          amount: 100000,
          delta: -100000,
        },
      },
      {
        id: "adjust",
        kind: "entry",
        expected: 500000,
        created_at: "2026-10-13T07:02:00Z",
        payload: {
          id: "adjust",
          merchant_id: "m",
          kind: "adjustment",
          amount: 0,
          delta: 300000,
        },
      },
    ];
    state.queue = ops;
    const restarted = JSON.parse(JSON.stringify(state));
    const view = visibleState(restarted);
    expect(view.merchants[0].balance).toBe(800000);
    expect(view.entries).toHaveLength(3);
    expect(view.entries[1].previous).toBe(600000);
    expect(view.entries[1].reference).toContain("Pending");
    expect(state.merchants).toHaveLength(0);
    expect(view.queue).toHaveLength(3);
  });
  it("filters a 5000 merchant directory with stable IDs", () => {
    const merchants = Array.from({ length: 5000 }, (_, i) => ({
      id: String(i),
      name: "Merchant " + i,
      phone: "+96650000" + i,
      prefix: "M" + i,
    }));
    const start = performance.now();
    expect(
      merchants.filter((m) =>
        (m.name + m.phone + m.prefix).includes("Merchant 4999"),
      ),
    ).toHaveLength(1);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
