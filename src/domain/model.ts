import type { ReceiptDraft } from "./receipt";
export const CATEGORIES = [
  "Food & dining",
  "Groceries",
  "Transport",
  "Shopping",
  "Bills & utilities",
  "Entertainment",
  "Health",
  "Home",
  "Uncategorized",
] as const;
export type Category = (typeof CATEGORIES)[number];
export type Kind =
  "purchase" | "income" | "refund" | "transfer" | "card_payment" | "cash";
export type ThemeMode = "system" | "light" | "dark";
export interface Transaction {
  id: string;
  amount: number; // integer paise, always positive
  merchant: string;
  account: string;
  bank: string;
  at: string;
  category: Category;
  kind: Kind;
  review: boolean;
  excluded: boolean;
  note: string;
  /** Confirmed structured bill details only. Never raw OCR text or a photo URI. */
  receipt?: ReceiptDraft;
  source: "sample" | "sms";
  reason: string;
  reference?: string;
  /** Bank-stated transaction time, distinct from SMS receipt time in at. */
  transactionAt?: string;
  classification?: {
    method: "rule" | "merchant" | "model" | "user" | "unknown";
    version: string;
    score?: number;
    margin?: number;
  };
  originalMerchant?: string;
  /** Set when this alert was recognised as a second message for that transaction. */
  duplicateOf?: string;
  /** Parser-proven supplementary bank balance alert; never inferred from value/time alone. */
  supplementaryAlert?: boolean;
}
export interface MerchantRule {
  merchant: string;
  /** Remembered type for this payee, e.g. a bank account the user only sends transfers to. */
  kind?: Kind;
  category: Category;
  alias?: string;
}
export interface Classification {
  category: Category;
  confidence: number;
  reason: string;
}
export function merchantKey(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}
const CATEGORY_PHRASES: [RegExp, Category][] = [
  [
    /\b(swiggy|zomato|restaurant|cafe|chai|coffee|dining|lunch|dinner|breakfast|take[ -]?aways?)\b/i,
    "Food & dining",
  ],
  [
    /\b(blinkit|zepto|bigbasket|grocer(?:y|ies)|vegetables|milk)\b/i,
    "Groceries",
  ],
  [/\b(uber|ola|rapido|auto|taxi|metro|bus|petrol|fuel|irctc)\b/i, "Transport"],
  [
    /\b(amazon|flipkart|myntra|shopping|clothes|phone case|headphones?|shoes?)\b/i,
    "Shopping",
  ],
  [
    /\b(electricity|broadband|airtel|jio|recharge|water bill|bescom)\b/i,
    "Bills & utilities",
  ],
  [/\b(netflix|spotify|cinema|movie|bookmyshow|hotstar)\b/i, "Entertainment"],
  [/\b(pharmacy|hospital|medicine|doctor|apollo|blood tests?)\b/i, "Health"],
  [/\b(rent|maid|cleaner|househelp|plumber)\b/i, "Home"],
];
function recognizedCategories(text: string): Category[] {
  const normalized = merchantKey(text);
  return [
    ...new Set(
      CATEGORY_PHRASES.filter(([pattern]) => pattern.test(normalized)).map(
        ([, category]) => category,
      ),
    ),
  ];
}
/** True only for multiple recognized purposes; unknown text can still use a model. */
export function isMixedCategoryText(text: string): boolean {
  return recognizedCategories(text).length > 1;
}
export function classify(
  text: string,
  rules: MerchantRule[] = [],
): Classification {
  const key = merchantKey(text);
  const rule = rules.find((r) => merchantKey(r.merchant) === key);
  if (rule && rule.category !== "Uncategorized")
    return {
      category: rule.category,
      confidence: 1,
      reason: "Your merchant rule",
    };
  const categories = recognizedCategories(text);
  if (categories.length !== 1)
    return {
      category: "Uncategorized",
      confidence: 0,
      reason: "Needs your context",
    };
  return {
    category: categories[0],
    confidence: 0.9,
    reason: "Local merchant / phrase match",
  };
}
/** Bank-to-bank UPI alerts name only the other account ("A/c ••1234"): a shop, a person or the user's own account. */
export const isAccountPayee = (t: Transaction) =>
  /^A\/c ••\d{2,4}$/.test((t.originalMerchant || t.merchant).trim());
/** Held out of spending until the user confirms what it was. */
export const awaitingContext = (t: Transaction) =>
  t.kind === "purchase" && t.review && !t.excluded && isAccountPayee(t);
export const heldSpend = (transactions: Transaction[]) =>
  transactions.reduce((sum, t) => sum + (awaitingContext(t) ? t.amount : 0), 0);
export function spendOf(t: Transaction): number {
  if (t.excluded || awaitingContext(t)) return 0;
  if (t.kind === "refund") return -t.amount;
  return t.kind === "purchase" ? t.amount : 0;
}
export const netSpend = (transactions: Transaction[]) =>
  transactions.reduce((sum, t) => sum + spendOf(t), 0);
export function monthKey(date: string | Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function inMonth(transactions: Transaction[], month: string) {
  return transactions.filter((t) => monthKey(t.at) === month);
}
export function categoryTotals(transactions: Transaction[]) {
  return CATEGORIES.map((category) => ({
    category,
    amount: netSpend(transactions.filter((t) => t.category === category)),
  }))
    .filter((c) => c.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
}
export function money(paise: number, decimals = false) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: decimals ? 2 : 0,
  }).format(paise / 100);
}
export function decimalToPaise(value: string): number | null {
  const trimmed = value.trim();
  // Accept plain, Indian (1,23,456) and international (123,456) grouping.
  // Stripping commas first would silently turn malformed "1,2" into twelve.
  if (
    !/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(
      trimmed,
    )
  )
    return null;
  const clean = trimmed.replace(/,/g, "");
  const [whole, fraction = ""] = clean.split(".");
  const exact = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return exact > BigInt(0) && exact <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(exact)
    : null;
}
export function mergeTransactions(
  old: Transaction[],
  incoming: Transaction[],
): Transaction[] {
  const map = new Map(old.map((t) => [t.id, t]));
  for (const t of incoming) {
    const existing = map.get(t.id);
    if (!existing) map.set(t.id, t);
    else if (
      existing.source === "sms" && t.source === "sms" &&
      existing.bank === t.bank && existing.account === t.account &&
      existing.amount === t.amount && !existing.transactionAt &&
      t.transactionAt && Number.isFinite(Date.parse(t.transactionAt))
    ) {
      // Re-import can enrich immutable parser metadata, never replace user decisions.
      map.set(t.id, { ...existing, transactionAt: t.transactionAt });
    }
  }
  return [...map.values()].sort((a, b) => b.at.localeCompare(a.at));
}
