import { expect, it, vi } from "vitest";
const log = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./bridge", () => ({ native: { logDiagnostic: log } }));
import { installDiagnostics, logDiagnostic } from "./diagnostics";

it("sends detail as JSON and records uncaught errors before the default handler", () => {
  logDiagnostic("warn", "voice", "failed", {
    stage: "recording",
    code: "VOICE_RECORDING_FAILED",
  });
  expect(log).toHaveBeenCalledWith(
    "warn",
    "voice",
    "failed",
    JSON.stringify({ stage: "recording", code: "VOICE_RECORDING_FAILED" }),
  );
  const previous = vi.fn();
  let handler: ((e: unknown, fatal?: boolean) => void) | undefined;
  (globalThis as Record<string, unknown>).ErrorUtils = {
    getGlobalHandler: () => previous,
    setGlobalHandler: (h: typeof handler) => (handler = h),
  };
  installDiagnostics();
  handler?.(new Error("boom"), true);
  expect(log).toHaveBeenLastCalledWith(
    "fatal",
    "js",
    "uncaught",
    JSON.stringify({ name: "Error" }),
  );
  expect(previous).toHaveBeenCalledOnce();
});

it("discards names, messages, notes, stacks, identifiers and arbitrary fields", () => {
  log.mockClear();
  logDiagnostic("error", "ui", "shown", {
    message: "Paid Alice for private medicine",
    note: "Secret note",
    stack: "Sensitive text",
    key: "alphabetic-secret",
    account: 1234,
    mode: "live",
    review: 2,
  });
  expect(log).toHaveBeenLastCalledWith(
    "error",
    "ui",
    "shown",
    JSON.stringify({ mode: "live", review: 2 }),
  );
  logDiagnostic("error", "Alice", "private note", {});
  expect(log).toHaveBeenCalledOnce();
});
