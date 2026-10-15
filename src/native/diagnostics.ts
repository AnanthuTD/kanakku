import { native } from "./bridge";

type Detail = Record<string, string | number | boolean | null | undefined>;

const EVENTS = new Set([
  "voice/failed",
  "ledger/flush",
  "ui/shown",
  "js/uncaught",
]);
const ENUMS: Record<string, readonly string[]> = {
  stage: ["permission", "model", "recording", "transcription", "result"],
  mode: ["demo", "live"],
  name: ["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError"],
  code: [
    "Error",
    "TypeError",
    "VOICE_BUSY",
    "VOICE_CANCELLED",
    "VOICE_SILENT_INPUT",
    "VOICE_RECORDING_FAILED",
    "VOICE_BACKGROUND",
    "MIC_PERMISSION",
  ],
};
const COUNTERS = new Set([
  "incoming",
  "rows",
  "duplicatesLinked",
  "awaitingContext",
  "review",
]);
export function diagnosticDetail(detail: Detail): Detail {
  return Object.fromEntries(
    Object.entries(detail).filter(
      ([key, value]) =>
        (COUNTERS.has(key) &&
          typeof value === "number" &&
          Number.isFinite(value) &&
          value >= 0) ||
        (typeof value === "string" && ENUMS[key]?.includes(value)),
    ),
  );
}

/** Beta diagnostics: native writes a structured local log the developer can pull over ADB. */
export function logDiagnostic(
  level: "info" | "warn" | "error" | "fatal",
  source: string,
  event: string,
  detail: Detail = {},
) {
  if (!EVENTS.has(`${source}/${event}`)) return;
  try {
    native
      ?.logDiagnostic?.(
        level,
        source,
        event,
        JSON.stringify(diagnosticDetail(detail)),
      )
      ?.catch(() => {});
  } catch {
    // Diagnostics must never break the app.
  }
}

let installed = false;
/** Records uncaught JavaScript errors, then lets React Native handle them as before. */
export function installDiagnostics() {
  if (installed || !native) return;
  installed = true;
  const utils = (
    globalThis as unknown as {
      ErrorUtils?: {
        getGlobalHandler(): (error: unknown, fatal?: boolean) => void;
        setGlobalHandler(
          handler: (error: unknown, fatal?: boolean) => void,
        ): void;
      };
    }
  ).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, fatal) => {
    const e = error instanceof Error ? error : undefined;
    logDiagnostic(fatal ? "fatal" : "error", "js", "uncaught", {
      name: e?.name ?? "Error",
    });
    previous(error, fatal);
  });
}
