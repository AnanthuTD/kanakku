export type AssistantAction = {
  id: string;
  type: "update" | "create";
  confirmRequired: boolean;
  transactionId?: string;
  merchant?: string;
  amount?: number;
  date?: string;
  patch?: {
    merchant?: string;
    category?: string;
    note?: string;
    markRecurring?: boolean;
  };
  details?: {
    amountRupees: number;
    merchant: string;
    date: string;
    category: string;
    note: string;
    createSeparate?: boolean;
  };
};

/** The same conservative near-duplicate guard is applied again immediately before save. */
export function findAssistantExpenseMatches(
  transactions: { id: string; amount: number; inrAmount?: number; at: string; merchant: string; kind: string; excluded: boolean; duplicateOf?: string }[],
  expense: { amountRupees: number; merchant?: string; date: string },
) {
  const targetMerchant = expense.merchant?.trim().toLocaleLowerCase() ?? "";
  const targetDay = Date.parse(`${expense.date.slice(0, 10)}T12:00:00`);
  return transactions.filter((transaction) => {
    if (transaction.kind !== "purchase" || transaction.excluded || transaction.duplicateOf) return false;
    const amountRupees = (transaction.inrAmount ?? transaction.amount) / 100;
    const day = Date.parse(`${transaction.at.slice(0, 10)}T12:00:00`);
    if (Math.abs(amountRupees - expense.amountRupees) > 1 || Math.abs(day - targetDay) > 7 * 86_400_000) return false;
    if (!targetMerchant) return true;
    const merchant = transaction.merchant.trim().toLocaleLowerCase();
    return merchant.length > 0 && (merchant.includes(targetMerchant) || targetMerchant.includes(merchant));
  });
}
import type { Transaction } from "./model";
import type { RecurringDecision } from "./subscriptions";


/** Save a transaction edit and its recurring decision through one persistence call. */
export async function persistAssistantUpdate(args: {
  transactions: Transaction[];
  recurringDecisions: Record<string, RecurringDecision>;
  transactionId: string;
  recurringKey: string;
  patch: {
    merchant?: string;
    category?: string;
    note?: string;
    markRecurring?: boolean;
  };
  persist: (
    transactions: Transaction[],
    recurringDecisions: Record<string, RecurringDecision>,
  ) => Promise<void>;
}): Promise<{
  transactions: Transaction[];
  recurringDecisions: Record<string, RecurringDecision>;
  previous: Transaction[];
  previousRecurringDecisions: Record<string, RecurringDecision>;
}> {
  const current = args.transactions.find((row) => row.id === args.transactionId);
  if (!current) throw new Error("That payment is no longer in your journal. Search again.");

  const patch: Partial<Transaction> = {
    ...(args.patch.merchant ? { merchant: args.patch.merchant.trim().slice(0, 80) } : {}),
    ...(args.patch.category ? { category: args.patch.category } : {}),
    ...(args.patch.note !== undefined ? { note: args.patch.note.trim().slice(0, 240) } : {}),
  };
  const transactions = args.transactions.map((row) => row.id === current.id
    ? {
        ...row,
        ...patch,
        id: row.id,
        source: row.source,
        classification: { method: "user" as const, version: "review-v1" },
        originalMerchant: row.originalMerchant || row.merchant,
      }
    : row);
  const recurringDecisions = { ...args.recurringDecisions };
  if (args.patch.markRecurring !== undefined)
    recurringDecisions[args.recurringKey] = args.patch.markRecurring ? "confirmed" : "ignored";

  await args.persist(transactions, recurringDecisions);
  return {
    transactions,
    recurringDecisions,
    previous: args.transactions,
    previousRecurringDecisions: args.recurringDecisions,
  };
}
