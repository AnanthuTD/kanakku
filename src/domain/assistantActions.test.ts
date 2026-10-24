import { describe, expect, it, vi } from "vitest";
import { findAssistantExpenseMatches, persistAssistantUpdate } from "./assistantActions";
import type { Transaction } from "./model";

const tx = (values: Record<string, unknown> = {}) => ({
  id: "sms-1", amount: 25350, at: "2026-10-19T09:00:00.000Z", merchant: "Amazon",
  kind: "purchase", excluded: false, ...values,
});

describe("findAssistantExpenseMatches", () => {
  it("finds a same-merchant, near-amount purchase from the previous week", () => {
    expect(findAssistantExpenseMatches([tx()], {
      amountRupees: 253.5, merchant: "amazon", date: "2026-10-21",
    })).toHaveLength(1);
  });
  it("does not suggest a match for distant, different-merchant or excluded payments", () => {
    expect(findAssistantExpenseMatches([
      tx({ id: "old", at: "2026-10-01T09:00:00.000Z" }),
      tx({ id: "other", merchant: "Cafe" }),
      tx({ id: "excluded", excluded: true }),
    ], { amountRupees: 253.5, merchant: "Amazon", date: "2026-10-21" })).toEqual([]);
  });
  it("does not match loans, transfers, or duplicate alerts", () => {
    expect(findAssistantExpenseMatches([
      tx({ id: "loan", kind: "lent" }),
      tx({ id: "transfer", kind: "transfer" }),
      tx({ id: "duplicate", duplicateOf: "sms-1" }),
    ], { amountRupees: 253.5, date: "2026-10-21" })).toEqual([]);
  });
});

describe("persistAssistantUpdate", () => {
  it("persists transaction edits and recurring status together in one call", async () => {
    const transaction: Transaction = {
      id: "sms-1", amount: 25350, at: "2026-10-19T09:00:00.000Z", merchant: "Amazon",
      account: "•• 1234", bank: "Example Bank", category: "Shopping", kind: "purchase",
      review: false, excluded: false, note: "", source: "sms", reason: "alert",
    };
    const persist = vi.fn(async () => {});
    const initialDecisions = { other: "ignored" as const };

    const result = await persistAssistantUpdate({
      transactions: [transaction],
      recurringDecisions: initialDecisions,
      transactionId: transaction.id,
      recurringKey: "amazon-key",
      patch: { merchant: "Amazon Prime", category: "Entertainment", note: "annual", markRecurring: true },
      persist,
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(result.transactions, result.recurringDecisions);
    expect(result.transactions[0]).toMatchObject({
      merchant: "Amazon Prime", category: "Entertainment", note: "annual",
      classification: { method: "user" },
    });
    expect(result.recurringDecisions).toEqual({ other: "ignored", "amazon-key": "confirmed" });
    expect(result.previous[0]).toEqual(transaction);
    expect(result.previousRecurringDecisions).toBe(initialDecisions);
  });

  it("does not persist if the transaction disappeared before applying the change", async () => {
    const persist = vi.fn(async () => {});
    await expect(persistAssistantUpdate({
      transactions: [], recurringDecisions: {}, transactionId: "missing", recurringKey: "key",
      patch: { markRecurring: true }, persist,
    })).rejects.toThrow("no longer in your journal");
    expect(persist).not.toHaveBeenCalled();
  });
});
