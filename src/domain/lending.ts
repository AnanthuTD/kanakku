import { validDay } from "./ledger";

export interface LoanRepayment {
  id: string;
  amount: number;
  at: string;
  note?: string;
}

export interface LoanRecord {
  id: string;
  person: string;
  amount: number;
  lentAt: string;
  dueDate: string | null;
  remind: boolean;
  note: string;
  repayments: LoanRepayment[];
  /** Links a bank-SMS transaction so the outflow is not counted as spending. */
  transactionId?: string;
}

export function loanOutstanding(loan: LoanRecord): number {
  return Math.max(
    0,
    loan.amount -
      loan.repayments.reduce((sum, repayment) => sum + repayment.amount, 0),
  );
}

export function validLoan(value: unknown): value is LoanRecord {
  if (!value || typeof value !== "object") return false;
  const loan = value as Record<string, unknown>;
  return (
    typeof loan.id === "string" &&
    loan.id.length > 0 &&
    loan.id.length <= 100 &&
    typeof loan.person === "string" &&
    loan.person.trim().length > 0 &&
    loan.person.length <= 80 &&
    Number.isSafeInteger(loan.amount) &&
    (loan.amount as number) > 0 &&
    typeof loan.lentAt === "string" &&
    !Number.isNaN(Date.parse(loan.lentAt)) &&
    (loan.dueDate === null ||
      (typeof loan.dueDate === "string" && validDay(loan.dueDate))) &&
    typeof loan.remind === "boolean" &&
    typeof loan.note === "string" &&
    loan.note.length <= 500 &&
    Array.isArray(loan.repayments) &&
    loan.repayments.length <= 1000 &&
    loan.repayments.every((item) => {
      if (!item || typeof item !== "object") return false;
      const repayment = item as Record<string, unknown>;
      return (
        typeof repayment.id === "string" &&
        repayment.id.length > 0 &&
        repayment.id.length <= 100 &&
        Number.isSafeInteger(repayment.amount) &&
        (repayment.amount as number) > 0 &&
        typeof repayment.at === "string" &&
        !Number.isNaN(Date.parse(repayment.at)) &&
        (repayment.note === undefined ||
          (typeof repayment.note === "string" && repayment.note.length <= 200))
      );
    }) &&
    (loan.transactionId === undefined ||
      (typeof loan.transactionId === "string" &&
        loan.transactionId.length <= 256)) &&
    (loan as unknown as LoanRecord).repayments.reduce(
      (sum, repayment) => sum + repayment.amount,
      0,
    ) <= (loan.amount as number)
  );
}
