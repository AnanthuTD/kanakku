import { validLoan } from "../domain/lending";
import { validCardDue, type CardDue } from "../domain/cardDues";

export type RecurringDecision = "confirmed" | "ignored";
export interface LedgerMetadata {
  recurringDecisions: Record<string, RecurringDecision>;
  customCategories?: string[];
  categoryIcons?: Record<string, string>;
  loans?: import("../domain/lending").LoanRecord[];
  /** Latest statement per credit card, read from bank SMS. */
  cardDues?: CardDue[];
}
const CATEGORY_ICON_KEYS = new Set([
  "Tag",
  "ShoppingBag",
  "Coffee",
  "Plane",
  "Heart",
  "BookOpen",
  "Gift",
  "Briefcase",
  "Dumbbell",
  "PawPrint",
]);
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
  const loans = Array.isArray(valueObject.loans)
    ? valueObject.loans.filter((loan) => validLoan(loan)).slice(0, 10_000)
    : [];
  const cardDues = Array.isArray(valueObject.cardDues)
    ? valueObject.cardDues.filter((due) => validCardDue(due)).slice(0, 100)
    : [];
  const categoryIcons = Object.fromEntries(
    valueObject.categoryIcons && typeof valueObject.categoryIcons === "object"
      ? Object.entries(valueObject.categoryIcons).filter(
          ([category, icon]) =>
            uniqueCategories.includes(category) &&
            typeof icon === "string" &&
            CATEGORY_ICON_KEYS.has(icon),
        )
      : [],
  ) as Record<string, string>;
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
    ...(Object.keys(categoryIcons).length ? { categoryIcons } : {}),
    loans,
    ...(cardDues.length ? { cardDues } : {}),
  };
}
