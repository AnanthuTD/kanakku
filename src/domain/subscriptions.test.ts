import { describe, expect, it } from "vitest";
import { Transaction } from "./model";
import { detectRecurringPayments, recurringKey } from "./subscriptions";

const row = (
  id: string,
  day: string,
  patch: Partial<Transaction> = {},
): Transaction => ({
  id,
  at: `${day}T12:00:00`,
  merchant: "Netflix",
  bank: "HDFC",
  account: "4821",
  amount: 64900,
  category: "Entertainment",
  kind: "purchase",
  review: false,
  excluded: false,
  note: "",
  source: "sms",
  reason: "fixture",
  ...patch,
});
const monthly = () => [
  row("j", "2026-07-10"),
  row("a", "2026-08-10"),
  row("s", "2026-09-10"),
];
const now = new Date("2026-10-01T12:00:00");
describe("local recurring-payment evidence", () => {
  it("requires repeated charges, not just a subscription brand name", () => {
    expect(detectRecurringPayments(monthly().slice(0, 2), now)).toEqual([]);
    const [candidate] = detectRecurringPayments(monthly(), now);
    expect(candidate).toMatchObject({
      type: "subscription",
      cadence: "monthly",
      confidence: "likely",
      estimatedNextAt: "2026-10-10",
      usualAmount: 64900,
      transactionIds: ["j", "a", "s"],
    });
  });
  it("recognises end-of-month billing across February and leap years", () => {
    const dates = ["2024-01-31", "2024-02-29", "2024-03-31"];
    expect(
      detectRecurringPayments(
        dates.map((d, i) => row(String(i), d)),
        new Date("2024-04-01T12:00:00"),
      )[0].estimatedNextAt,
    ).toBe("2024-04-30");
  });
  it("does not shift a fixed 29th billing day to the end of the next month", () => {
    const dates = ["2024-01-29", "2024-02-29", "2024-03-29"];
    expect(
      detectRecurringPayments(
        dates.map((d, i) => row(String(i), d)),
        new Date("2024-04-01T12:00:00"),
      )[0].estimatedNextAt,
    ).toBe("2024-04-29");
  });
  it("allows a missing month only with enough other consecutive cycles and lowers confidence", () => {
    const dates = [
      "2026-04-10",
      "2026-05-10",
      "2026-06-10",
      "2026-08-10",
      "2026-09-10",
    ];
    const [candidate] = detectRecurringPayments(
      dates.map((d, i) => row(String(i), d)),
      now,
    );
    expect(candidate).toMatchObject({
      cadence: "monthly",
      confidence: "possible",
    });
    expect(candidate.evidence.some((e) => e.includes("missing"))).toBe(true);
    expect(
      detectRecurringPayments(
        dates.slice(2).map((d, i) => row(String(i), d)),
        now,
      ),
    ).toEqual([]);
  });
  it("recognises weekly and annual patterns with sufficient evidence", () => {
    const weekly = ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"].map(
      (d, i) => row(String(i), d),
    );
    expect(detectRecurringPayments(weekly, now)[0]).toMatchObject({
      cadence: "weekly",
      estimatedNextAt: "2026-09-29",
    });
    const yearly = ["2024-09-01", "2025-09-01", "2026-09-01"].map((d, i) =>
      row(String(i), d),
    );
    expect(detectRecurringPayments(yearly, now)[0]).toMatchObject({
      cadence: "yearly",
      estimatedNextAt: "2027-09-01",
    });
    expect(detectRecurringPayments(weekly.slice(0, 3), now)).toEqual([]);
    expect(detectRecurringPayments(yearly.slice(0, 2), now)).toEqual([]);
  });
  it("does not treat excluded, unreviewed, income, repayment, or transfer rows as charges", () => {
    for (const patch of [
      { excluded: true },
      { review: true },
      { category: "Uncategorized" as const },
      { kind: "income" as const },
      { kind: "card_payment" as const },
      { kind: "transfer" as const },
    ]) {
      expect(
        detectRecurringPayments(
          monthly().map((t) => ({ ...t, ...patch })),
          now,
        ),
      ).toEqual([]);
    }
  });
  it("does not combine different cards or bank accounts", () => {
    expect(
      detectRecurringPayments(
        monthly().map((t, i) => ({ ...t, account: String(i) })),
        now,
      ),
    ).toEqual([]);
  });
  it("does not gain evidence from duplicate IDs or imported bank references", () => {
    const rows = monthly()
      .slice(0, 2)
      .map((t, i) => ({ ...t, reference: String(i) }));
    expect(
      detectRecurringPayments(
        [...rows, ...rows, { ...rows[1], id: "imported-again" }],
        now,
      ),
    ).toEqual([]);
    expect(
      detectRecurringPayments([...monthly(), ...monthly()], now)[0]
        .transactionIds,
    ).toHaveLength(3);
  });
  it("keeps distinct reference namespaces separate for refunds and purchases", () => {
    const rows = monthly().map((t) => ({ ...t, reference: t.id }));
    expect(
      detectRecurringPayments(
        [...rows, row("r", "2026-09-11", { kind: "refund", reference: "s" })],
        now,
      ),
    ).toEqual([]);
  });
  it("pairs a full refund once and removes its charge from pattern evidence", () => {
    const rows = [...monthly(), row("r", "2026-09-11", { kind: "refund" })];
    expect(detectRecurringPayments(rows, now)).toEqual([]);
    const four = [
      ...monthly(),
      row("o", "2026-10-10"),
      row("r", "2026-10-11", { kind: "refund" }),
    ];
    const [candidate] = detectRecurringPayments(
      four,
      new Date("2026-10-12T12:00:00"),
    );
    expect(candidate.transactionIds).toEqual(["j", "a", "s"]);
    expect(candidate.evidence.some((e) => e.includes("refunded"))).toBe(true);
  });
  it("does not remove a charge for an earlier or partial refund", () => {
    expect(
      detectRecurringPayments(
        [...monthly(), row("r", "2026-07-01", { kind: "refund" })],
        now,
      ),
    ).toHaveLength(1);
    expect(
      detectRecurringPayments(
        [...monthly(), row("r", "2026-09-11", { kind: "refund", amount: 100 })],
        now,
      ),
    ).toHaveLength(1);
  });
  it("labels rent as a recurring bill and suppresses unresolved personal payments", () => {
    expect(
      detectRecurringPayments(
        monthly().map((t) => ({ ...t, merchant: "Rent", category: "Home" })),
        now,
      )[0].type,
    ).toBe("bill");
    expect(
      detectRecurringPayments(
        monthly().map((t) => ({ ...t, merchant: "Rahul S", category: "Home" })),
        now,
      ),
    ).toEqual([]);
    expect(
      detectRecurringPayments(
        monthly().map((t) => ({
          ...t,
          merchant: "rahul@upi",
          category: "Transport",
        })),
        now,
      ),
    ).toEqual([]);
    expect(
      detectRecurringPayments(
        monthly().map((t) => ({
          ...t,
          merchant: "Rahul S",
          category: "Home",
          note: "Rent",
        })),
        now,
      )[0].type,
    ).toBe("bill");
  });
  it("shows shopping patterns as recurring spending, never automatic subscriptions", () => {
    expect(
      detectRecurringPayments(
        monthly().map((t) => ({
          ...t,
          merchant: "Amazon",
          category: "Shopping",
        })),
        now,
      )[0],
    ).toMatchObject({ type: "recurring", confidence: "possible" });
  });
  it("reduces confidence for changing amounts and rejects large variations", () => {
    expect(
      detectRecurringPayments(
        monthly().map((t, i) => ({ ...t, amount: 64900 + i * 2000 })),
        now,
      )[0].confidence,
    ).toBe("possible");
    expect(
      detectRecurringPayments(
        monthly().map((t, i) => ({ ...t, amount: 64900 + i * 30000 })),
        now,
      ),
    ).toEqual([]);
  });
  it("rejects irregular shopping dates and ambiguous same-day repeated charges", () => {
    expect(
      detectRecurringPayments(
        [
          row("a", "2026-07-10"),
          row("b", "2026-08-20"),
          row("c", "2026-09-10"),
        ],
        now,
      ),
    ).toEqual([]);
    expect(
      detectRecurringPayments(
        [
          ...monthly(),
          row("same-day", "2026-09-10", { reference: "another-charge" }),
        ],
        now,
      ),
    ).toEqual([]);
  });
  it("retains old evidence as stale without claiming the plan is active or due", () => {
    const [candidate] = detectRecurringPayments(
      monthly(),
      new Date("2027-01-01T12:00:00"),
    );
    expect(candidate).toMatchObject({
      status: "no_recent_charge",
      confidence: "possible",
      estimatedNextAt: "2026-10-10",
    });
  });
  it("ignores malformed, non-positive, future, and fractional-paise records", () => {
    for (const patch of [
      { at: "not-a-date" },
      { at: "2030-01-01T12:00:00" },
      { amount: -1 },
      { amount: 1.1 },
    ])
      expect(
        detectRecurringPayments(
          monthly().map((t) => ({ ...t, ...patch })),
          now,
        ),
      ).toEqual([]);
  });
  it("uses a stable account-specific key and never mutates the ledger", () => {
    expect(
      recurringKey(row("a", "2026-07-10", { merchant: "  NETFLIX " })),
    ).toBe(recurringKey(row("b", "2026-07-10")));
    const rows = monthly(),
      before = JSON.stringify(rows);
    detectRecurringPayments(rows, now);
    expect(JSON.stringify(rows)).toBe(before);
  });
  it("accepts a price rise exactly at the variation limit and rejects one paise beyond", () => {
    const prices = [10000, 10000, 12000];
    const rows = monthly().map((t, i) => ({ ...t, amount: prices[i] }));
    expect(detectRecurringPayments(rows, now)[0]).toMatchObject({
      usualAmount: 10000,
      minAmount: 10000,
      maxAmount: 12000,
      confidence: "possible",
    });
    expect(
      detectRecurringPayments(
        rows.map((t, i) => (i === 2 ? { ...t, amount: 12001 } : t)),
        now,
      ),
    ).toEqual([]);
  });
  it("does not erase a major plan-price change by considering only its newest charges", () => {
    const dates = [
      "2026-04-10",
      "2026-05-10",
      "2026-06-10",
      "2026-07-10",
      "2026-08-10",
      "2026-09-10",
    ];
    expect(
      detectRecurringPayments(
        dates.map((d, i) =>
          row(String(i), d, {
            amount: i < 3 ? 10000 : 18000,
          }),
        ),
        now,
      ),
    ).toEqual([]);
  });
  it("rejects consecutive missing monthly cycles and a skipped weekly charge", () => {
    for (const dates of [
      ["2026-03-10", "2026-05-10", "2026-07-10", "2026-08-10", "2026-09-10"],
      ["2026-08-25", "2026-09-01", "2026-09-15", "2026-09-22"],
    ])
      expect(
        detectRecurringPayments(
          dates.map((d, i) => row(String(i), d)),
          now,
        ),
      ).toEqual([]);
  });
  it("clamps month-end estimates in a non-leap February and across a year boundary", () => {
    const february = ["2025-10-31", "2025-11-30", "2025-12-31", "2026-01-31"];
    expect(
      detectRecurringPayments(
        february.map((d, i) => row(String(i), d)),
        new Date("2026-02-01T12:00:00"),
      )[0].estimatedNextAt,
    ).toBe("2026-02-28");
    expect(
      detectRecurringPayments(
        february.slice(0, 3).map((d, i) => row(String(i), d)),
        new Date("2026-01-01T12:00:00"),
      )[0].estimatedNextAt,
    ).toBe("2026-01-31");
  });
  it("uses calendar-year estimates for leap-day annual charges", () => {
    const dates = ["2024-02-29", "2025-02-28", "2026-02-28"];
    const [candidate] = detectRecurringPayments(
      dates.map((d, i) => row(String(i), d)),
      now,
    );
    expect(candidate).toMatchObject({
      cadence: "yearly",
      estimatedNextAt: "2027-02-28",
      status: "expected",
    });
    expect(
      detectRecurringPayments(
        dates.map((d, i) => row(String(i), d)),
        new Date("2027-03-15T12:00:00"),
      )[0],
    ).toMatchObject({ status: "no_recent_charge", confidence: "possible" });
  });
  it("treats the grace boundary as expected, then marks history stale without moving the estimate", () => {
    expect(
      detectRecurringPayments(monthly(), new Date("2026-10-17T23:00:00"))[0]
        .status,
    ).toBe("expected");
    expect(
      detectRecurringPayments(monthly(), new Date("2026-10-18T00:00:00"))[0],
    ).toMatchObject({
      status: "no_recent_charge",
      estimatedNextAt: "2026-10-10",
    });
  });
  it("keeps same suffixes at different banks and independent complete accounts separate", () => {
    const rows = [
      ...monthly(),
      ...monthly().map((t) => ({ ...t, id: `sbi-${t.id}`, bank: "SBI" })),
      ...monthly().map((t) => ({ ...t, id: `card-${t.id}`, account: "9531" })),
    ];
    const candidates = detectRecurringPayments(rows, now);
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map((c) => c.key)).size).toBe(3);
    expect(candidates.every((c) => c.transactionIds.length === 3)).toBe(true);
  });
  it("does not match equal refunds with a conflicting explicit reference", () => {
    const rows = monthly().map((t) => ({ ...t, reference: `charge-${t.id}` }));
    const [candidate] = detectRecurringPayments(
      [
        ...rows,
        row("refund", "2026-09-11", {
          kind: "refund",
          reference: "different-charge",
        }),
      ],
      now,
    );
    expect(candidate.transactionIds).toEqual(["j", "a", "s"]);
    expect(candidate.evidence.some((e) => e.includes("refunded"))).toBe(false);
  });
  it("combines explicitly linked partial refund fragments only when they fully reverse one charge", () => {
    const rows = monthly().map((t) => ({ ...t, reference: t.id }));
    const first = row("refund-a", "2026-09-11", {
      kind: "refund",
      reference: "s",
      amount: 20000,
    });
    const second = row("refund-b", "2026-09-12", {
      kind: "refund",
      reference: "s",
      amount: 44900,
    });
    const [partiallyRefunded] = detectRecurringPayments([...rows, first], now);
    expect(partiallyRefunded).toMatchObject({
      confidence: "possible",
      usualAmount: 64900,
    });
    expect(
      partiallyRefunded.evidence.some((e) => e.includes("partial refund")),
    ).toBe(true);
    expect(detectRecurringPayments([...rows, first, second], now)).toEqual([]);
    // Re-importing one fragment must not turn a partial refund into a full one.
    expect(
      detectRecurringPayments(
        [...rows, first, { ...first, id: "reimport" }],
        now,
      ),
    ).toHaveLength(1);
    // Fragments without explicit linkage cannot be summed on time/amount alone.
    expect(
      detectRecurringPayments(
        [
          ...rows,
          { ...first, reference: undefined },
          { ...second, reference: undefined },
        ],
        now,
      ),
    ).toHaveLength(1);
  });
  it("does not pair an unreferenced same-amount refund outside the proximity window", () => {
    expect(
      detectRecurringPayments(
        [...monthly(), row("late-refund", "2026-09-30", { kind: "refund" })],
        now,
      )[0].transactionIds,
    ).toEqual(["j", "a", "s"]);
  });
  it("does not mistake a personal payee or a known non-subscription shop for subscription enrolment", () => {
    for (const merchant of [
      "Friend",
      "Rahul S.",
      "Person",
      "maya@okhdfcbank",
    ]) {
      expect(
        detectRecurringPayments(
          monthly().map((t) => ({ ...t, merchant, category: "Shopping" })),
          now,
        ),
      ).toEqual([]);
    }
    expect(
      detectRecurringPayments(
        monthly().map((t) => ({
          ...t,
          merchant: "Prime Supermarket",
          category: "Groceries",
        })),
        now,
      )[0],
    ).toMatchObject({ type: "recurring", confidence: "possible" });
  });
  it("orders offset timestamps by actual chronology and gives a stable result for shuffled inputs", () => {
    const rows = monthly().map((t, i) => ({
      ...t,
      at: `${["2026-07-10", "2026-08-10", "2026-09-10"][i]}T12:00:00+05:30`,
    }));
    expect(detectRecurringPayments([rows[2], rows[0], rows[1]], now)).toEqual(
      detectRecurringPayments(rows, now),
    );
  });
});
