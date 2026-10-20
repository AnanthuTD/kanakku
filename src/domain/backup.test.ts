import { describe, expect, it } from "vitest";
import { makeJournalBackup, parseJournalBackup } from "./backup";
import type { Transaction } from "./model";

const payment: Transaction = {
  id: "sms-1",
  amount: 12345,
  merchant: "Cafe",
  account: "••1234",
  bank: "SBI",
  at: "2026-10-20T10:30:00.000Z",
  category: "Food & dining",
  kind: "purchase",
  review: false,
  excluded: false,
  note: "Lunch with Maya",
  source: "sms",
  reason: "Merchant match",
  receipt: {
    version: 1,
    merchant: "Cafe",
    currency: "INR",
    items: [],
    warnings: [],
    reconciliation: "matches",
    confidence: "high",
  },
};

describe("encrypted Drive journal archive data", () => {
  it("keeps saved transaction context, bill details, rules and preferences", () => {
    const backup = makeJournalBackup(
      [payment],
      [{ merchant: "Cafe", category: "Food & dining", alias: "Corner Cafe" }],
      { recurringDecisions: { "Cafe:monthly": "confirmed" } },
      new Date("2026-10-20T12:00:00.000Z"),
    );
    const restored = parseJournalBackup(JSON.parse(JSON.stringify(backup)));
    expect(restored).toMatchObject({
      transactions: [
        { id: "sms-1", note: "Lunch with Maya", receipt: { merchant: "Cafe" } },
      ],
      rules: [{ alias: "Corner Cafe" }],
      metadata: { recurringDecisions: { "Cafe:monthly": "confirmed" } },
    });
  });

  it("keeps user-created categories and allows them on transactions and rules", () => {
    const backup = makeJournalBackup(
      [{ ...payment, category: "Family" }],
      [{ merchant: "Maya", category: "Family" }],
      { recurringDecisions: {}, customCategories: ["Family"] },
    );
    const restored = parseJournalBackup(JSON.parse(JSON.stringify(backup)));
    expect(restored.transactions[0].category).toBe("Family");
    expect(restored.rules[0].category).toBe("Family");
    expect(restored.metadata.customCategories).toEqual(["Family"]);
  });

  it("includes money lent, repayment history and reminders in the Drive archive", () => {
    const loan = {
      id: "loan-1",
      person: "Maya",
      amount: 50_000,
      lentAt: "2026-10-20T10:00:00.000Z",
      dueDate: "2026-11-01",
      remind: true,
      note: "Trip booking",
      transactionId: "sms-1",
      repayments: [
        { id: "repayment-1", amount: 10_000, at: "2026-10-21T10:00:00.000Z" },
      ],
    };
    const backup = makeJournalBackup(
      [{ ...payment, id: "sms-1", kind: "lent" }],
      [],
      { recurringDecisions: {}, loans: [loan] },
    );
    const restored = parseJournalBackup(JSON.parse(JSON.stringify(backup)));
    expect(restored.metadata.loans).toEqual([loan]);
    expect(restored.transactions[0].kind).toBe("lent");
    expect(() =>
      parseJournalBackup({
        ...backup,
        transactions: [{ ...payment, id: "sms-1", kind: "purchase" }],
      }),
    ).toThrow(/invalid transaction/);
    expect(() => parseJournalBackup({
      ...backup,
      metadata: { ...backup.metadata, loans: [{ ...loan, amount: 500 }] },
    })).toThrow(/lending record/);
  });

  it("rejects unsupported formats, malformed values, and unknown transaction kinds", () => {
    expect(() => parseJournalBackup({ format: "other", version: 1 })).toThrow(
      /not supported/,
    );
    const base = makeJournalBackup([payment], [], { recurringDecisions: {} });
    expect(() => parseJournalBackup({ ...base, version: 2 })).toThrow(
      /not supported/,
    );
    expect(() =>
      parseJournalBackup({
        ...base,
        transactions: [{ ...payment, amount: -1 }],
      }),
    ).toThrow(/failed validation/);
    expect(() =>
      parseJournalBackup({
        ...base,
        transactions: [{ ...payment, kind: "unknown" }],
      }),
    ).toThrow(/failed validation/);
  });
});
