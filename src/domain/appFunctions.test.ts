import { describe, expect, it } from "vitest";
import { Transaction } from "./model";
import { makeAssistantSnapshot } from "./appFunctions";
import { recurringKey } from "./subscriptions";

const row = (values: Partial<Transaction> = {}): Transaction => ({
  id: "sms-private-id",
  amount: 25000,
  merchant: "Cafe",
  account: "•• 1234",
  bank: "Example Bank",
  at: "2026-10-19T13:20:00.000Z",
  category: "Food & dining",
  kind: "purchase",
  review: false,
  excluded: false,
  note: "private note",
  source: "sms",
  reason: "parsed alert",
  ...values,
});

describe("makeAssistantSnapshot", () => {
  it("keeps the local search index available to the native function service", () => {
    const snapshot = JSON.parse(
      makeAssistantSnapshot([row(), row({ source: "sample" })]),
    );
    const rows = snapshot.transactions;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      merchant: "Cafe",
      amount: 250,
      spendAmount: 250,
      source: "sms",
    });
    expect(rows[0]).toHaveProperty("id", "sms-private-id");
    expect(rows[0]).toHaveProperty("note", "private note");
    expect(rows[0]).not.toHaveProperty("reason");
  });

  it("uses Kanakku counted-spend semantics for loans, transfers, exclusions and refunds", () => {
    const rows = JSON.parse(
      makeAssistantSnapshot([
        row(),
        row({ id: "loan", kind: "lent" }),
        row({ id: "transfer", kind: "transfer" }),
        row({ id: "excluded", excluded: true }),
        row({ id: "refund", kind: "refund" }),
      ]),
    );
    expect(rows.transactions.map((item: { spendAmount: number }) => item.spendAmount)).toEqual([
      250,
      0,
      0,
      0,
      -250,
    ]);
  });

  it("provides recurring candidates without private transaction details and respects ignored patterns", () => {
    const rows = [
      row({ id: "aug", merchant: "Netflix", at: "2026-08-10T09:00:00.000Z", category: "Entertainment" }),
      row({ id: "sep", merchant: "Netflix", at: "2026-09-10T09:00:00.000Z", category: "Entertainment" }),
      row({ id: "oct", merchant: "Netflix", at: "2026-10-10T09:00:00.000Z", category: "Entertainment" }),
    ];
    const snapshot = JSON.parse(makeAssistantSnapshot(rows));
    expect(snapshot.recurringPayments).toHaveLength(1);
    expect(snapshot.recurringPayments[0]).toMatchObject({
      merchant: "Netflix",
      type: "subscription",
      cadence: "monthly",
      decision: "suggested",
    });
    expect(snapshot.recurringPayments[0]).not.toHaveProperty("transactionIds");
    expect(JSON.parse(makeAssistantSnapshot(rows, { [recurringKey(rows[0])]: "ignored" })).recurringPayments).toEqual([]);
  });
});
