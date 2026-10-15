import { describe, expect, it } from "vitest";
import { filterLedger, merchantTotals, monthRange } from "./ledger";
import {
  categoryTotals,
  mergeTransactions,
  netSpend,
  type Transaction,
} from "./model";

// Synthetic scale fixture: each ten-row block contributes exactly ₹575.
// Half of the blocks post in September, half in October. No bank SMS is used.
const block: Pick<Transaction, "amount" | "kind" | "category" | "excluded">[] =
  [
    {
      amount: 10000,
      kind: "purchase",
      category: "Food & dining",
      excluded: false,
    },
    {
      amount: 2500,
      kind: "refund",
      category: "Food & dining",
      excluded: false,
    },
    {
      amount: 100000,
      kind: "income",
      category: "Uncategorized",
      excluded: false,
    },
    {
      amount: 100000,
      kind: "transfer",
      category: "Uncategorized",
      excluded: false,
    },
    {
      amount: 100000,
      kind: "card_payment",
      category: "Uncategorized",
      excluded: false,
    },
    {
      amount: 100000,
      kind: "cash",
      category: "Uncategorized",
      excluded: false,
    },
    {
      amount: 10000,
      kind: "purchase",
      category: "Food & dining",
      excluded: true,
    },
    { amount: 2500, kind: "refund", category: "Food & dining", excluded: true },
    { amount: 20000, kind: "purchase", category: "Transport", excluded: false },
    { amount: 30000, kind: "purchase", category: "Shopping", excluded: false },
  ];
const history: Transaction[] = Array.from({ length: 10000 }, (_, index) => ({
  ...block[index % 10],
  id: `scale-${index}`,
  merchant: `Synthetic merchant ${Math.floor(index / 10) % 100}`,
  bank: "Synthetic bank",
  account: Math.floor(index / 10) % 2 ? "2000" : "1000",
  at: index < 5000 ? "2026-09-15T12:00:00Z" : "2026-10-15T12:00:00Z",
  review: index % 10 === 0,
  note: "Scale fixture",
  source: "sms",
  reason: "Synthetic scale fixture",
}));

describe("ten-thousand-row financial history", () => {
  it("keeps exact totals and contributing rows across dates, accounts and categories", () => {
    expect(netSpend(history)).toBe(57500000);
    const october = filterLedger(history, { range: monthRange("2026-10") });
    expect(october).toHaveLength(5000);
    expect(netSpend(october)).toBe(28750000);
    const foodAccount = filterLedger(history, {
      range: monthRange("2026-10"),
      category: "Food & dining",
      account: "Synthetic bank 1000",
    });
    expect(foodAccount).toHaveLength(1000);
    expect(netSpend(foodAccount)).toBe(1875000);
    expect(categoryTotals(october)).toEqual([
      { category: "Shopping", amount: 15000000 },
      { category: "Transport", amount: 10000000 },
      { category: "Food & dining", amount: 3750000 },
    ]);
  });
  it("aggregates repeated merchants without losing exclusions or refunds", () => {
    const merchants = merchantTotals(history);
    expect(merchants).toHaveLength(100);
    expect(
      merchants.every(
        (entry) => entry.count === 100 && entry.amount === 575000,
      ),
    ).toBe(true);
  });
  it("replays a complete history without rewriting a correction or collapsing distinct events", () => {
    const corrected = {
      ...history[0],
      note: "Confirmed manually",
      category: "Transport" as const,
      review: false,
    };
    const current = [corrected, ...history.slice(1)];
    const extra = { ...history[0], id: "another-real-event" };
    const merged = mergeTransactions(current, [...history, extra]);
    expect(merged).toHaveLength(10001);
    expect(merged.find((entry) => entry.id === corrected.id)).toEqual(
      corrected,
    );
    expect(merged.find((entry) => entry.id === extra.id)).toEqual(extra);
    expect(netSpend(merged)).toBe(57510000);
  });
});
