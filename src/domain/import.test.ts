import { describe, expect, it } from "vitest";
import { importSince, periodSinceBackup } from "./import";

describe("chosen SMS history window", () => {
  it("uses calendar months and keeps the chosen four-month boundary", () => {
    const since = importSince(4, new Date(2026, 9, 13, 14, 30))!;
    expect([
      since.getFullYear(),
      since.getMonth(),
      since.getDate(),
      since.getHours(),
      since.getMinutes(),
    ]).toEqual([2026, 5, 13, 14, 30]);
  });
  it("clamps month-end dates, including leap years", () => {
    expect(importSince(1, new Date(2024, 2, 31))!.getDate()).toBe(29);
    expect(importSince(1, new Date(2026, 2, 31))!.getDate()).toBe(28);
  });
  it("uses a calendar year and only expands to all history explicitly", () => {
    expect(importSince(12, new Date(2024, 1, 29))!.getFullYear()).toBe(2023);
    expect(importSince(12, new Date(2024, 1, 29))!.getDate()).toBe(28);
    expect(importSince(0)).toBeNull();
    expect(() => importSince(-1)).toThrow();
  });
});

describe("history period after a Drive restore", () => {
  const now = new Date("2026-10-24T12:00:00+05:30");
  it("picks the shortest period that reaches the backup date", () => {
    expect(periodSinceBackup("2026-10-12T09:00:00.000Z", now)).toBe(1);
    expect(periodSinceBackup("2026-08-02T09:00:00.000Z", now)).toBe(3);
    expect(periodSinceBackup("2026-06-30T09:00:00.000Z", now)).toBe(4);
    expect(periodSinceBackup("2026-01-15T09:00:00.000Z", now)).toBe(12);
    expect(periodSinceBackup("2024-01-01T00:00:00.000Z", now)).toBe(0);
  });
  it("falls back to one month for an unreadable or future date", () => {
    expect(periodSinceBackup("not a date", now)).toBe(1);
    expect(periodSinceBackup("2027-01-01T00:00:00.000Z", now)).toBe(1);
  });
});
