import type { DriveBackupProgress } from "../native/bridge";

export function driveBackupProgressPercent(
  progress: DriveBackupProgress | null,
  operation: "backup" | "restore",
): number {
  if (!progress || progress.operation !== operation) return 3;
  if (progress.phase === "authorizing") return 3;
  if (progress.phase === "encrypting") return 8;
  if (progress.phase === "uploading") {
    const ratio =
      progress.total > 0 ? progress.transferred / progress.total : 0;
    return Math.round(10 + Math.max(0, Math.min(1, ratio)) * 85);
  }
  if (progress.phase === "downloading") {
    const ratio =
      progress.total > 0 ? progress.transferred / progress.total : 0;
    return Math.round(5 + Math.max(0, Math.min(1, ratio)) * 80);
  }
  if (progress.phase === "decrypting") return 88;
  return 93;
}
