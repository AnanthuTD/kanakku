import type { ReceiptDraft } from "../domain/receipt";

export function cancelReceipt() {}
export const isReceiptActive = () => false;
export async function readReceipt(_uri: string): Promise<ReceiptDraft> {
  throw new Error(
    "Bill photos need the Kanakku Android build. Type the details here.",
  );
}
