import { spendOf, Transaction } from "./model";
import { detectRecurringPayments, RecurringDecision } from "./subscriptions";

/** Ephemeral projection for Android AppFunctions. Notes are searchable only on-device; never returned. */
export function makeAssistantSnapshot(
  transactions: Transaction[],
  recurringDecisions: Record<string, RecurringDecision> = {},
): string {
  const rows = transactions
      .filter((transaction) => transaction.source !== "sample")
      .map((transaction) => ({
        id: transaction.id,
        date: transaction.at,
        transactionTime: transaction.transactionAt ?? "",
        merchant: transaction.merchant,
        amount: (transaction.inrAmount ?? transaction.amount) / 100,
        spendAmount: spendOf(transaction) / 100,
        currency: transaction.currency ?? "INR",
        category: transaction.category,
        kind: transaction.kind,
        source: transaction.source,
        bank: transaction.bank,
        account: transaction.account,
        note: transaction.note,
        excluded: transaction.excluded,
      }));
  const recurringPayments = detectRecurringPayments(transactions)
    .filter((payment) => recurringDecisions[payment.key] !== "ignored")
    .map(({ key, transactionIds: _transactionIds, evidence, ...payment }) => ({
      merchant: payment.merchant,
      type: payment.type,
      cadence: payment.cadence,
      confidence: payment.confidence,
      status: payment.status,
      lastPaidAt: payment.lastPaidAt,
      estimatedNextAt: payment.estimatedNextAt,
      usualAmount: payment.usualAmount / 100,
      minAmount: payment.minAmount / 100,
      maxAmount: payment.maxAmount / 100,
      decision: recurringDecisions[key] ?? "suggested",
      evidence,
    }));
  return JSON.stringify({ transactions: rows, recurringPayments });
}
