import { describe, it, expect } from "vitest";
import { Transaction, netSpend } from "./model";
import {
  filterLedger,
  interpretQuestion,
  equivalentPeriods,
  merchantTotals,
  validDay,
} from "./ledger";
const row = (
  id: string,
  at: string,
  patch: Partial<Transaction> = {},
): Transaction => ({
  id,
  at,
  amount: 10000,
  merchant: "Swiggy",
  bank: "HDFC",
  account: "1234",
  category: "Food & dining",
  kind: "purchase",
  review: false,
  excluded: false,
  note: "",
  source: "sample",
  reason: "fixture",
  ...patch,
});
describe("ledger queries", () => {
  const rows = [
    row("a", "2026-10-01T12:00:00"),
    row("b", "2026-10-13T23:59:59", { amount: 2500, kind: "refund" }),
    row("c", "2026-10-14T00:00:00"),
    row("d", "2026-09-30T23:59:59"),
    row("e", "2026-10-12T12:00:00", {
      bank: "Axis",
      account: "5678",
      kind: "card_payment",
    }),
  ];
  it("includes both date boundaries and excludes outside rows", () =>
    expect(
      filterLedger(rows, {
        range: { start: "2026-10-01", end: "2026-10-13", label: "chosen" },
      }).map((t) => t.id),
    ).toEqual(["b", "e", "a"]));
  it("combines account/type/category/search without changing spending arithmetic", () => {
    const matches = filterLedger(rows, {
      account: "HDFC 1234",
      category: "Food & dining",
      kind: "refund",
      query: "1234",
    });
    expect(matches.map((t) => t.id)).toEqual(["b"]);
    expect(netSpend(matches)).toBe(-2500);
  });
  it("normalizes merchant names and subtracts refunds, excluding repayments", () => {
    expect(
      merchantTotals([
        row("1", "2026-10-01", { merchant: " SWIGGY " }),
        row("2", "2026-10-02", {
          merchant: "swiggy",
          kind: "refund",
          amount: 2500,
        }),
        row("3", "2026-10-03", { kind: "card_payment" }),
      ])[0].amount,
    ).toBe(7500);
  });
  it("rejects impossible dates", () => {
    expect(validDay("2026-02-29")).toBe(false);
    expect(validDay("2024-02-29")).toBe(true);
  });
  it("compares equal completed days and handles shorter months", () => {
    const p = equivalentPeriods("2026-10", new Date(2026, 9, 13));
    expect(p.current.end).toBe("2026-10-12");
    expect(p.previous.end).toBe("2026-09-12");
    expect(equivalentPeriods("2026-03", new Date(2026, 9, 13)).days).toBe(28);
    expect(equivalentPeriods("2026-10", new Date(2026, 9, 1)).days).toBe(0);
  });
  it("interprets rolling two-month questions explicitly and preserves exact merchant matching", () => {
    const answer = interpretQuestion(
      "How much did I spend on food last two months?",
      new Date(2026, 9, 13),
    );
    expect(answer.ok && answer.filter.range?.start).toBe("2026-08-13");
    expect(answer.ok && answer.filter.category).toBe("Food & dining");
    const merchant = interpretQuestion(
      "at Swiggy this month",
      new Date(2026, 9, 13),
    );
    expect(merchant.ok && filterLedger(rows, merchant.filter).length).toBe(4);
  });
  it("abstains for ambiguous/unrecognized/unsupported questions", () => {
    for (const q of [
      "food and shopping this month",
      "how much tomorrow",
      "food last 0 months",
      "what is my bank balance",
      "travel this month",
    ])
      expect(interpretQuestion(q).ok).toBe(false);
  });
  it("keeps refund evidence in account/category/date drill-downs without including unrelated repayments", () => {
    const entries = [
      row("purchase", "2026-10-01T12:00:00", {
        amount: 100000,
        reference: "same-original-reference",
      }),
      row("first-partial", "2026-10-02T12:00:00", {
        amount: 12500,
        kind: "refund",
        reference: "refund-reference-one",
      }),
      row("second-partial", "2026-10-03T12:00:00", {
        amount: 2500,
        kind: "refund",
        reference: "refund-reference-two",
      }),
      row("other-account", "2026-10-03T12:00:00", {
        amount: 1500,
        kind: "refund",
        bank: "Axis",
        account: "1234",
      }),
      row("excluded", "2026-10-03T12:00:00", {
        amount: 2000,
        kind: "refund",
        excluded: true,
      }),
      row("repayment", "2026-10-03T12:00:00", {
        kind: "card_payment",
        amount: 50000,
      }),
      row("old-refund", "2026-09-30T12:00:00", {
        kind: "refund",
        amount: 2000,
      }),
    ];
    const filtered = filterLedger(entries, {
      range: { start: "2026-10-01", end: "2026-10-03", label: "chosen" },
      account: "HDFC 1234",
      category: "Food & dining",
      merchant: " SWIGGY ",
    });
    expect(filtered.map((t) => t.id)).toEqual([
      "second-partial",
      "excluded",
      "repayment",
      "first-partial",
      "purchase",
    ]);
    expect(netSpend(filtered)).toBe(85000);
    expect(netSpend(filterLedger(filtered, { kind: "refund" }))).toBe(-15000);
    expect(merchantTotals(filtered)).toEqual([
      { merchant: "Swiggy", amount: 85000, count: 5 },
    ]);
  });
  it("uses leap-year/month-end calendar ranges without dropping cents in question answers", () => {
    const answer = interpretQuestion(
      "total last 1 months",
      new Date(2024, 2, 31, 12),
    );
    expect(answer.ok && answer.filter.range).toEqual({
      start: "2024-02-29",
      end: "2024-03-31",
      label: "last 1 months",
    });
    if (!answer.ok)
      throw new Error("Expected an explicitly interpreted month range");
    const matches = filterLedger(
      [
        row("before", "2024-02-28T23:59:59", { amount: 12345 }),
        row("boundary", "2024-02-29T00:00:00", { amount: 10029 }),
        row("refund", "2024-03-31T23:59:59", { kind: "refund", amount: 29 }),
        row("after", "2024-04-01T00:00:00", { amount: 99999 }),
      ],
      answer.filter,
    );
    expect(matches.map((t) => t.id)).toEqual(["refund", "boundary"]);
    expect(netSpend(matches)).toBe(10000);
  });
});
