import type { ReceiptDraft } from "../domain/receipt";

/** Camera lifecycle orchestration, with image disposal even when capture/recognition becomes stale. */
export async function captureReceipt({
  capture,
  recognize,
  isCurrent,
  onReading,
  dispose,
}: {
  capture: () => Promise<{ uri: string }>;
  recognize: (uri: string) => Promise<ReceiptDraft>;
  isCurrent: () => boolean;
  onReading: () => void;
  dispose: (uri: string) => void | Promise<void>;
}): Promise<ReceiptDraft | undefined> {
  let uri: string | undefined;
  try {
    uri = (await capture()).uri;
    if (!isCurrent()) return;
    onReading();
    const draft = await recognize(uri);
    return isCurrent() ? draft : undefined;
  } finally {
    if (uri) await dispose(uri);
  }
}
