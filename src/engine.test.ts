import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  disk: new Map(),
  rpc: vi.fn(),
  owner: vi.fn(),
}));
vi.mock("./storage", () => ({
  readLocal: async (k: string) => structuredClone(mocks.disk.get(k) || null),
  writeLocal: async (k: string, v: unknown) => {
    mocks.disk.set(k, structuredClone(v));
  },
}));
vi.mock("./client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.owner }) }),
    }),
  },
}));
import { FinanceEngine } from "./engine";
import { emptyState, type Operation } from "./domain";
import type { Merchant, Entry } from "./domain";
const fixture = () => ({
  ...emptyState("owner"),
  member: {
    id: "owner",
    owner_id: "owner",
    name: "Owner",
    email: "owner@example.test",
    role: "owner" as const,
    active: true,
    permissions: {},
  },
});
beforeEach(() => {
  mocks.disk.clear();
  mocks.disk.set("state:owner", fixture());
  mocks.rpc.mockReset();
  mocks.owner.mockResolvedValue({ data: { id: "owner" }, error: null });
  vi.stubGlobal("navigator", { onLine: false });
});
it("durably saves queued operations and restores them in a new engine", async () => {
  const first = new FinanceEngine("owner");
  await first.initialize();
  const op: Operation = {
    id: "stable-id",
    kind: "business",
    payload: { name: "Gulf Origin" },
    created_at: new Date().toISOString(),
  };
  await first.enqueue(op);
  const restarted = new FinanceEngine("owner");
  await restarted.initialize();
  expect(restarted.state.queue).toEqual([op]);
  expect(restarted.view().business.name).toBe("Gulf Origin");
});
it("retains the original operation ID when the server commits but its response snapshot is lost", async () => {
  const engine = new FinanceEngine("owner");
  await engine.initialize();
  const op: Operation = {
    id: "stable-id",
    kind: "business",
    payload: { name: "Gulf Origin" },
    created_at: new Date().toISOString(),
  };
  await engine.enqueue(op);
  vi.stubGlobal("navigator", { onLine: true });
  mocks.rpc
    .mockResolvedValueOnce({ data: {}, error: null })
    .mockResolvedValueOnce({ data: null, error: { message: "fetch failed" } });
  await engine.sync();
  expect(engine.state.queue[0].id).toBe("stable-id");
  mocks.rpc
    .mockResolvedValueOnce({ data: {}, error: null })
    .mockResolvedValueOnce({
      data: { ...fixture(), business: { name: "Gulf Origin" } },
      error: null,
    });
  await engine.sync();
  expect(engine.state.queue).toHaveLength(0);
  const commits = mocks.rpc.mock.calls.filter(
    (c) => c[0] === "commit_operation",
  );
  expect(commits[0][1].p.id).toBe(commits[1][1].p.id);
});
it("does not claim a save when durable storage rejects it", async () => {
  const storage = await import("./storage");
  const write = vi
    .spyOn(storage, "writeLocal")
    .mockRejectedValueOnce(Error("Disk full"));
  const engine = new FinanceEngine("owner");
  await engine.initialize();
  await expect(
    engine.enqueue({
      id: "not-saved",
      kind: "share",
      payload: {},
      created_at: "",
    }),
  ).rejects.toThrow("Disk full");
  expect(engine.state.queue).toHaveLength(0);
  write.mockRestore();
});

it("saves all selected deletions together and recovers them after restart", async () => {
  const state = fixture();
  state.merchants = [
    { id: "merchant", balance: 20000, version: 1 } as Merchant,
  ];
  state.entries = [1, 2].map(
    (i) =>
      ({
        id: "paid-" + i,
        merchant_id: "merchant",
        kind: "payment",
        amount: 10000,
        delta: -10000,
        created_at: "2026-10-14T10:0" + i + ":00Z",
        occurred_at: "2026-10-14T10:0" + i + ":00Z",
        reference: "QA " + i,
        note: "",
        method: "cash",
      }) as Entry,
  );
  mocks.disk.set("state:owner", state);
  const engine = new FinanceEngine("owner");
  await engine.initialize();
  const storage = await import("./storage");
  const write = vi.spyOn(storage, "writeLocal");
  expect(
    await engine.deleteSelected(
      "entries",
      state.entries.map((e) => e.id),
    ),
  ).toBe(2);
  expect(write).toHaveBeenCalledTimes(1);
  const restarted = new FinanceEngine("owner");
  await restarted.initialize();
  expect(restarted.state.queue).toEqual(engine.state.queue);
  expect(restarted.view().merchants[0].balance).toBe(40000);
  write.mockRestore();
});

it("persists an owner's theme without changing finance or archive records", async () => {
  const state = fixture();
  state.business.deleted_merchants = { archived: "2026-10-14T10:00:00Z" };
  state.merchants = [{ id: "merchant", balance: 40000 } as Merchant];
  mocks.disk.set("state:owner", state);
  const engine = new FinanceEngine("owner");
  await engine.initialize();
  await engine.changeTheme("obsidian-amber");
  const restarted = new FinanceEngine("owner");
  await restarted.initialize();
  expect(restarted.view().business.theme).toBe("obsidian-amber");
  expect(restarted.view().business.deleted_merchants).toEqual(
    state.business.deleted_merchants,
  );
  expect(restarted.view().merchants[0].balance).toBe(40000);
  expect(restarted.view().entries).toEqual(state.entries);
  expect(restarted.state.queue).toHaveLength(1);
  await expect(restarted.changeTheme("unknown-theme")).rejects.toThrow(
    "Choose a theme",
  );
});

it("does not allow collectors or viewers to save a business theme", async () => {
  for (const role of ["collector", "viewer"] as const) {
    const state = fixture();
    mocks.disk.set("state:owner", {
      ...state,
      member: { ...state.member, role },
    });
    const engine = new FinanceEngine("owner");
    await engine.initialize();
    await expect(engine.changeTheme("royal-blue")).rejects.toThrow(
      "Only a business owner",
    );
    expect(engine.state.queue).toEqual([]);
  }
});
