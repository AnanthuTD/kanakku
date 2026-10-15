export type RecurringDecision = "confirmed" | "ignored";
export interface LedgerMetadata {
  recurringDecisions: Record<string, RecurringDecision>;
}
export function ledgerMetadata(value?: unknown): LedgerMetadata {
  const input =
    value && typeof value === "object" && "recurringDecisions" in value
      ? (value as { recurringDecisions: unknown }).recurringDecisions
      : null;
  return {
    recurringDecisions: Object.fromEntries(
      input && typeof input === "object"
        ? Object.entries(input).filter(
            ([key, decision]) =>
              key.length > 0 &&
              key.length <= 256 &&
              (decision === "confirmed" || decision === "ignored"),
          )
        : [],
    ),
  };
}
