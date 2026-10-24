export const AUTO_LOCK_OPTIONS = [
  { value: 0, label: "Immediately" },
  { value: 60_000, label: "1 minute" },
  { value: 5 * 60_000, label: "5 minutes" },
  { value: 15 * 60_000, label: "15 minutes" },
  { value: 60 * 60_000, label: "1 hour" },
] as const;

export const DEFAULT_AUTO_LOCK_DELAY = 60 * 60_000;

export function shouldLockAfterBackground(
  delayMs: number,
  backgroundedAt: number,
  now: number,
): boolean {
  return delayMs <= 0 || now - backgroundedAt >= delayMs;
}
