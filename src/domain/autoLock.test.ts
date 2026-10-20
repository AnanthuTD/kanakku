import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_LOCK_DELAY, shouldLockAfterBackground } from "./autoLock";

describe("background auto-lock grace period", () => {
  it("defaults to a one-minute grace period", () => {
    expect(DEFAULT_AUTO_LOCK_DELAY).toBe(60_000);
  });

  it("keeps the journal open before the selected timeout", () => {
    expect(shouldLockAfterBackground(60_000, 10_000, 69_999)).toBe(false);
  });

  it("locks at the timeout boundary and after it", () => {
    expect(shouldLockAfterBackground(60_000, 10_000, 70_000)).toBe(true);
    expect(shouldLockAfterBackground(60_000, 10_000, 80_000)).toBe(true);
  });

  it("supports immediate locking", () => {
    expect(shouldLockAfterBackground(0, 10_000, 10_000)).toBe(true);
  });
});
