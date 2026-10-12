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
beforeEach(() => {
  mocks.disk.clear();
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
      data: { ...emptyState("owner"), business: { name: "Gulf Origin" } },
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
