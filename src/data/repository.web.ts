import { LedgerMetadata } from "./metadata";
import { Transaction, MerchantRule } from "../domain/model";
export async function openLive(_key: string): Promise<void> {
  throw new Error(
    "Real financial data is supported only in the encrypted Android build.",
  );
}
export async function readLive(): Promise<{
  transactions: Transaction[];
  rules: MerchantRule[];
  metadata: LedgerMetadata;
}> {
  throw new Error("Android build required");
}
export async function saveLive(
  _transactions: Transaction[],
  _rules: MerchantRule[],
  _metadata?: LedgerMetadata,
): Promise<void> {
  throw new Error("Android build required");
}
export async function replaceLive(
  _transactions: Transaction[],
  _rules: MerchantRule[],
  _metadata?: LedgerMetadata,
): Promise<void> {
  throw new Error("Android build required");
}
export async function closeLive(): Promise<void> {}
export async function deleteLive(): Promise<void> {
  throw new Error("Android build required");
}
