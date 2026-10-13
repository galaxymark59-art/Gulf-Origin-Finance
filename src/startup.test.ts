import { afterEach, expect, it, vi } from "vitest";
import { withStartupTimeout } from "./startup";

afterEach(() => vi.useRealTimers());

it("surfaces a stalled native session read within the startup deadline", async () => {
  vi.useFakeTimers();
  const result = withStartupTimeout(new Promise(() => {}));
  const assertion = expect(result).rejects.toThrow("STARTUP_TIMEOUT");
  await vi.advanceTimersByTimeAsync(15000);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});

it("preserves secure storage errors instead of treating them as a signed-out session", async () => {
  vi.useFakeTimers();
  const failure = new Error("Secure storage could not be read.");
  await expect(withStartupTimeout(Promise.reject(failure))).rejects.toBe(
    failure,
  );
  expect(vi.getTimerCount()).toBe(0);
});

it("returns the saved session unchanged and clears the startup timer", async () => {
  vi.useFakeTimers();
  const session = { user: { id: "owner" } };
  await expect(withStartupTimeout(Promise.resolve(session))).resolves.toBe(
    session,
  );
  expect(vi.getTimerCount()).toBe(0);
});
