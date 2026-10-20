import { validDay } from "./ledger";
import type { Category, Kind, Transaction } from "./model";

export interface PreviousTransactionState {
  merchant: string;
  category: Category;
  kind: Kind;
  review: boolean;
  reason: string;
  classification?: Transaction["classification"];
}

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
  /** Original classification so an accidental lending mark can be undone. */
  previousTransaction?: PreviousTransactionState;
}

export function loanOutstanding(loan: LoanRecord): number {
  return Math.max(
    0,
    loan.amount -
      loan.repayments.reduce((sum, repayment) => sum + repayment.amount, 0),
  );
}

export function restoreLentTransaction(
  transaction: Transaction,
  loan: LoanRecord,
): Transaction {
  if (loan.transactionId !== transaction.id) return transaction;
  const previous = loan.previousTransaction;
  return {
    ...transaction,
    ...(previous ?? {
      kind: "purchase" as const,
      category: "Friends & family",
      review: false,
      reason: "Removed from money lent; counted as spending",
    }),
    merchant:
      previous?.merchant ||
      transaction.originalMerchant ||
      transaction.merchant,
  };
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
    (loan.previousTransaction === undefined ||
      (() => {
        const previous = loan.previousTransaction as Record<string, unknown>;
        const kinds: Kind[] = [
          "purchase",
          "income",
          "refund",
          "transfer",
          "card_payment",
          "cash",
          "lent",
        ];
        return (
          typeof previous.merchant === "string" &&
          previous.merchant.length <= 256 &&
          typeof previous.category === "string" &&
          previous.category.length > 0 &&
          previous.category.length <= 80 &&
          kinds.includes(previous.kind as Kind) &&
          typeof previous.review === "boolean" &&
          typeof previous.reason === "string" &&
          previous.reason.length <= 256 &&
          (previous.classification === undefined ||
            (typeof previous.classification === "object" &&
              previous.classification !== null))
        );
      })()) &&
    (loan as unknown as LoanRecord).repayments.reduce(
      (sum, repayment) => sum + repayment.amount,
      0,
    ) <= (loan.amount as number)
  );
}
