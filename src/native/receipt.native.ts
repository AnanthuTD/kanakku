import { AppState } from "react-native";
import { parseReceipt, type ReceiptDraft } from "../domain/receipt";
import { native } from "./bridge";
import { logDiagnostic } from "./diagnostics";

type Session = { cancelled: boolean; abort: (error: Error) => void };
let active: Session | undefined;
export const isReceiptActive = () => !!active;
const cancelled = () =>
  new Error("Bill reading cancelled. You can type the details instead.");

/** Cancels delivery immediately. The bounded on-device task still releases its pixels safely. */
export function cancelReceipt() {
  if (!active) return;
  active.cancelled = true;
  active.abort(cancelled());
}

/** Reads an ephemeral app-cache photo. No image or OCR text is uploaded or persisted here. */
export async function readReceipt(uri: string): Promise<ReceiptDraft> {
  if (!native)
    throw new Error(
      "Bill photos need the Kanakku Android build. Type the details here.",
    );
  if (active)
    throw new Error(
      "The previous bill is still being read. Please try again in a moment.",
    );
  if (AppState.currentState !== "active") throw cancelled();
  let abort!: Session["abort"];
  const aborted = new Promise<never>((_, reject) => {
    abort = reject;
  });
  aborted.catch(() => {});
  const session: Session = { cancelled: false, abort };
  active = session;
  const background = AppState.addEventListener("change", (state) => {
    if (state !== "active") cancelReceipt();
  });
  const work = (async () => {
    try {
      const started = Date.now();
      const result = await native.recognizeReceipt(uri);
      if (session.cancelled || AppState.currentState !== "active")
        throw cancelled();
      if (!result.text.trim()) {
        logDiagnostic("warn", "receipt", "ocr-empty", {
          ms: Date.now() - started,
        });
        throw new Error(
          "No clear bill text found. Try a brighter, sharper photo or type the details.",
        );
      }
      const draft = parseReceipt(result.text);
      // Counts and outcomes only: never the bill's text, merchant or amounts.
      logDiagnostic("info", "receipt", "parsed", {
        ms: Date.now() - started,
        chars: result.text.length,
        lines: result.text.split(/\r?\n/).length,
        items: draft.items.length,
        hasTotal: draft.totalPaise !== undefined,
        hasMerchant: !!draft.merchant,
        hasDate: !!draft.date,
        reconciliation: draft.reconciliation,
        confidence: draft.confidence,
        warnings: draft.warnings.length,
      });
      return draft;
    } catch (error) {
      if (session.cancelled) throw cancelled();
      logDiagnostic("warn", "receipt", "failed", {
        code: error instanceof Error ? error.name : typeof error,
        knownMessage:
          error instanceof Error &&
          error.message.startsWith("No clear bill text"),
      });
      if (
        error instanceof Error &&
        error.message.startsWith("No clear bill text")
      )
        throw error;
      // Native/URI errors may contain image paths. Expose a fixed message and never log them.
      throw new Error(
        "This bill could not be read. Try another photo or type the details.",
      );
    } finally {
      background.remove();
      if (active === session) active = undefined;
    }
  })();
  work.catch(() => {});
  return Promise.race([work, aborted]);
}
