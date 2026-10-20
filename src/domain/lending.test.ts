import { describe, expect, it } from "vitest";
import {
  applyLinkedLoans,
  loanOutstanding,
  restoreLentTransaction,
  validLoan,
  type LoanRecord,
} from "./lending";
import type { Transaction } from "./model";
import { netSpend } from "./model";

const loan: LoanRecord = {
  id: "loan-1",
  person: "Maya",
  amount: 50_000,
  lentAt: "2026-10-20T10:00:00.000Z",
  dueDate: "2026-11-01",
  remind: true,
  note: "Trip booking",
  repayments: [
    { id: "repayment-1", amount: 10_000, at: "2026-10-25T10:00:00.000Z" },
  ],
  transactionId: "sms-1",
};

describe("money lent tracking", () => {
  it("keeps linked loan transactions excluded if a refresh restores their old classification", () => {
    const stalePurchase: Transaction = {
      id: "sms-1",
      amount: 50_000,
      merchant: "A/c ••46975",
      account: "1234",
      bank: "Kerala Gramin Bank",
      at: loan.lentAt,
      category: "Uncategorized",
      kind: "purchase",
      review: true,
      excluded: false,
      note: "",
      source: "sms",
      reason: "Bank transfer",
    };
    const restored = applyLinkedLoans([stalePurchase], [loan]);
    expect(restored[0]).toMatchObject({
      merchant: "Maya",
      originalMerchant: "A/c ••46975",
      category: "Friends & family",
      kind: "lent",
      review: false,
    });
  });

  it("reconciles both linked loan rows and removes their purchase amounts from spending", () => {
    const first: Transaction = {
      id: "sms-1",
      amount: 50_000,
      merchant: "A/c ••46975",
      account: "1234",
      bank: "Kerala Gramin Bank",
      at: loan.lentAt,
      category: "Uncategorized",
      kind: "purchase",
      review: true,
      excluded: false,
      note: "",
      source: "sms",
      reason: "Bank transfer",
    };
    const second = { ...first, id: "sms-2", amount: 80_000 };
    const secondLoan = {
      ...loan,
      id: "loan-2",
      person: "Arun",
      transactionId: "sms-2",
    };
    const repaired = applyLinkedLoans([first, second], [loan, secondLoan]);
    expect(repaired.map((transaction) => transaction.kind)).toEqual([
      "lent",
      "lent",
    ]);
    expect(netSpend(repaired)).toBe(0);
  });

  it("subtracts partial repayments from the open balance", () => {
    expect(loanOutstanding(loan)).toBe(40_000);
    expect(
      loanOutstanding({
        ...loan,
        repayments: [{ id: "full", amount: 50_000, at: loan.lentAt }],
      }),
    ).toBe(0);
  });

  it("validates loan records and refuses overpayment or malformed dates", () => {
    expect(validLoan(loan)).toBe(true);
    expect(
      validLoan({
        ...loan,
        repayments: [{ id: "too-much", amount: 50_001, at: loan.lentAt }],
      }),
    ).toBe(false);
    expect(validLoan({ ...loan, dueDate: "tomorrow" })).toBe(false);
    expect(validLoan({ ...loan, remind: "yes" })).toBe(false);
  });

  it("restores the original payee classification when lending is undone", () => {
    const before: Transaction = {
      id: "sms-1",
      amount: 50_000,
      merchant: "A/c ••46975",
      account: "1234",
      bank: "Kerala Gramin Bank",
      at: loan.lentAt,
      category: "Uncategorized",
      kind: "transfer",
      review: true,
      excluded: false,
      note: "",
      source: "sms",
      reason: "Bank transfer",
    };
    const marked: Transaction = {
      ...before,
      merchant: "Maya",
      originalMerchant: before.merchant,
      category: "Friends & family",
      kind: "lent",
      review: false,
      reason: "Money lent; repayment tracked separately",
      classification: { method: "user", version: "lending-v1" },
    };
    const linkedLoan: LoanRecord = {
      ...loan,
      repayments: [],
      previousTransaction: {
        merchant: before.merchant,
        category: before.category,
        kind: before.kind,
        review: before.review,
        reason: before.reason,
      },
    };
    const restored = restoreLentTransaction(marked, linkedLoan);
    expect(restored.merchant).toBe(before.merchant);
    expect(restored.kind).toBe("transfer");
    expect(restored.category).toBe("Uncategorized");
    expect(restored.review).toBe(true);
  });
});
