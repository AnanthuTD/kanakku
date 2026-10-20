export type RecurringDecision = "confirmed" | "ignored";
export interface LedgerMetadata {
  recurringDecisions: Record<string, RecurringDecision>;
  customCategories?: string[];
}
export function ledgerMetadata(value?: unknown): LedgerMetadata {
  const valueObject =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const input =
    "recurringDecisions" in valueObject ? valueObject.recurringDecisions : null;
  const customCategories = Array.isArray(valueObject.customCategories)
    ? valueObject.customCategories
        .filter(
          (item): item is string =>
            typeof item === "string" &&
            item.trim().length > 0 &&
            item.trim().length <= 32,
        )
        .map((item) => item.trim())
        .filter((item) => item.toLocaleLowerCase() !== "uncategorized")
    : [];
  const uniqueCategories = [
    ...new Map(
      customCategories.map((item) => [item.toLocaleLowerCase(), item]),
    ).values(),
  ].slice(0, 40);
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
    customCategories: uniqueCategories,
  };
}
