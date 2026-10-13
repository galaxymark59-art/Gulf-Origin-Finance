import { expect, it } from "vitest";
import { shouldLockOnReturn, shouldLockForInactivity } from "./lock-policy";
it("gives a 30-second return grace period and locks at its boundary", () => {
  expect(shouldLockOnReturn(true, 1000, 30999)).toBe(false);
  expect(shouldLockOnReturn(true, 1000, 31000)).toBe(true);
  expect(shouldLockOnReturn(true, null, 31000)).toBe(false);
  expect(shouldLockOnReturn(false, 1000, 31000)).toBe(false);
});
it("requires a PIN after two minutes of inactivity without ending the session", () => {
  expect(shouldLockForInactivity(true, 1000, 120999)).toBe(false);
  expect(shouldLockForInactivity(true, 1000, 121000)).toBe(true);
});
