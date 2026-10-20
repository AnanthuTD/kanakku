import { describe, expect, it } from "vitest";
import { loanOutstanding, validLoan, type LoanRecord } from "./lending";

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
});
