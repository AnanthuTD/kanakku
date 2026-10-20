import {
  CATEGORIES,
  type Category,
  type MerchantRule,
  type Transaction,
} from "./model";
import { ledgerMetadata, type LedgerMetadata } from "../data/metadata";
import type { ReceiptDraft } from "./receipt";

export interface JournalBackup {
  format: "kanakku-journal";
  version: 1;
  createdAt: string;
  transactions: Transaction[];
  rules: MerchantRule[];
  metadata: LedgerMetadata;
}

const kinds = new Set([
  "purchase",
  "income",
  "refund",
  "transfer",
  "card_payment",
  "cash",
]);
const sources = new Set(["sample", "sms", "email"]);
const text = (value: unknown, max = 500) =>
  typeof value === "string" && value.length <= max;
const safeReceipt = (value: unknown): value is ReceiptDraft => {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Record<string, unknown>;
  if (
    receipt.version !== 1 ||
    receipt.currency !== "INR" ||
    !text(receipt.merchant, 120) ||
    !Array.isArray(receipt.items) ||
    receipt.items.length > 80 ||
    !Array.isArray(receipt.warnings) ||
    receipt.warnings.length > 100 ||
    !receipt.warnings.every((warning) => text(warning, 240)) ||
    !["matches", "mismatch", "incomplete"].includes(
      String(receipt.reconciliation),
    ) ||
    !["high", "medium", "low"].includes(String(receipt.confidence))
  )
    return false;
  if (
    receipt.date !== undefined &&
    (!text(receipt.date, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(String(receipt.date)))
  )
    return false;
  for (const key of [
    "totalPaise",
    "subtotalPaise",
    "taxPaise",
    "discountPaise",
    "serviceChargePaise",
    "roundingPaise",
  ]) {
    const amount = receipt[key];
    if (amount !== undefined && !Number.isSafeInteger(amount)) return false;
  }
  return receipt.items.every((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return (
      text(row.name, 120) &&
      (row.quantity === undefined ||
        (typeof row.quantity === "number" &&
          Number.isFinite(row.quantity) &&
          row.quantity > 0 &&
          row.quantity <= 10_000)) &&
      ["unitPricePaise", "amountPaise"].every((key) => {
        const amount = row[key];
        return (
          amount === undefined ||
          (Number.isSafeInteger(amount) && (amount as number) >= 0)
        );
      })
    );
  });
};

export function makeJournalBackup(
  transactions: Transaction[],
  rules: MerchantRule[],
  metadata: LedgerMetadata,
  now = new Date(),
): JournalBackup {
  return {
    format: "kanakku-journal",
    version: 1,
    createdAt: now.toISOString(),
    transactions,
    rules,
    metadata: ledgerMetadata(metadata),
  };
}

export function parseJournalBackup(value: unknown): JournalBackup {
  if (!value || typeof value !== "object")
    throw new Error("This file is not a Kanakku journal backup.");
  const input = value as Record<string, unknown>;
  if (
    input.format !== "kanakku-journal" ||
    input.version !== 1 ||
    !text(input.createdAt, 64)
  )
    throw new Error("This Kanakku backup format is not supported.");
  if (!Array.isArray(input.transactions) || input.transactions.length > 200_000)
    throw new Error("This backup has an invalid transaction list.");
  const transactionIds = new Set<string>();
  const transactions = input.transactions.map((row): Transaction => {
    if (!row || typeof row !== "object")
      throw new Error("This backup contains an invalid transaction.");
    const t = row as Record<string, unknown>;
    if (
      !text(t.id, 256) ||
      !t.id ||
      !Number.isSafeInteger(t.amount) ||
      (t.amount as number) <= 0 ||
      !text(t.merchant) ||
      !text(t.account) ||
      !text(t.bank) ||
      !text(t.at, 80) ||
      !CATEGORIES.includes(t.category as Category) ||
      !kinds.has(String(t.kind)) ||
      typeof t.review !== "boolean" ||
      typeof t.excluded !== "boolean" ||
      !text(t.note) ||
      !sources.has(String(t.source)) ||
      !text(t.reason) ||
      (t.currency !== undefined &&
        !["INR", "USD"].includes(String(t.currency))) ||
      (t.inrAmount !== undefined &&
        (!Number.isSafeInteger(t.inrAmount) || (t.inrAmount as number) <= 0)) ||
      (t.reference !== undefined && !text(t.reference, 256)) ||
      (t.transactionAt !== undefined && !text(t.transactionAt, 80)) ||
      (t.originalMerchant !== undefined && !text(t.originalMerchant, 256)) ||
      (t.timePrecision !== undefined &&
        !["day", "minute"].includes(String(t.timePrecision)))
    )
      throw new Error(
        "This backup contains a transaction that failed validation.",
      );
    const id = t.id as string;
    if (transactionIds.has(id))
      throw new Error("This backup contains duplicate transaction IDs.");
    transactionIds.add(id);
    if (t.receipt !== undefined && !safeReceipt(t.receipt))
      throw new Error(
        "This backup contains bill details that failed validation.",
      );
    return t as unknown as Transaction;
  });
  if (!Array.isArray(input.rules) || input.rules.length > 50_000)
    throw new Error("This backup has an invalid merchant-rule list.");
  const rules = input.rules.map((row): MerchantRule => {
    if (!row || typeof row !== "object")
      throw new Error("This backup contains an invalid merchant rule.");
    const r = row as Record<string, unknown>;
    if (
      !text(r.merchant, 256) ||
      !r.merchant ||
      !CATEGORIES.includes(r.category as Category) ||
      (r.bank !== undefined && !text(r.bank, 256)) ||
      (r.alias !== undefined && !text(r.alias, 256)) ||
      (r.kind !== undefined && !kinds.has(String(r.kind)))
    )
      throw new Error(
        "This backup contains a merchant rule that failed validation.",
      );
    return r as unknown as MerchantRule;
  });
  return {
    format: "kanakku-journal",
    version: 1,
    createdAt: input.createdAt as string,
    transactions,
    rules,
    metadata: ledgerMetadata(input.metadata),
  };
}
