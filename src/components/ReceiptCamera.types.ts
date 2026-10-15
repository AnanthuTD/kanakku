import type { ReceiptDraft } from "../domain/receipt";
export interface ReceiptCameraProps {
  visible: boolean;
  onClose: () => void;
  onRead: (draft: ReceiptDraft) => void;
}
