import { describe, expect, it } from "vitest";
import { importSince } from "./import";

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
