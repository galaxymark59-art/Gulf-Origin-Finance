import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  let cached = new Response("old G logo");
  const cache = {
    put: vi.fn(async (_key: unknown, response: Response) => {
      cached = response.clone();
    }),
  };
  const caches = {
    keys: vi.fn(async () => [
      "gulf-origin-shell-v2",
      "mcube-shell-v3",
      "unrelated-cache",
    ]),
    delete: vi.fn(async () => true),
    open: vi.fn(async () => cache),
    match: vi.fn(async () => cached.clone()),
  };
  const fetch = vi.fn(async () => new Response("current M logo"));
  const self = {
    location: { origin: "https://app.example.test" },
    clients: { claim: vi.fn(async () => {}) },
    addEventListener: (name: string, handler: any) => {
      handlers[name] = handler;
    },
  };
  runInNewContext(source, { self, caches, fetch, URL });
  return { handlers, caches, cache, fetch };
}
describe("browser updates", () => {
  it("replaces the legacy shell cache without touching other device data", async () => {
    const w = worker();
    let completion: Promise<void> | undefined;
    w.handlers.activate({
      waitUntil: (promise: Promise<void>) => {
        completion = promise;
      },
    });
    await completion;
    expect(w.caches.delete.mock.calls).toEqual([["gulf-origin-shell-v2"]]);
  });
  it("refreshes a stable logo URL online and retains an offline fallback", async () => {
    const w = worker();
    let response: Promise<Response> | undefined;
    const event = {
      request: {
        url: "https://app.example.test/logo.svg",
        method: "GET",
        mode: "cors",
      },
      respondWith: (promise: Promise<Response>) => {
        response = promise;
      },
    };
    w.handlers.fetch(event);
    expect(await (await response!).text()).toBe("current M logo");
    expect(w.cache.put).toHaveBeenCalled();
    w.fetch.mockRejectedValueOnce(new Error("offline"));
    w.handlers.fetch(event);
    expect(await (await response!).text()).toBe("current M logo");
  });
});
