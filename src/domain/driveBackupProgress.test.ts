import { describe, expect, it } from "vitest";
import { driveBackupProgressPercent } from "./driveBackupProgress";

describe("Drive backup progress", () => {
  it("maps upload bytes to a monotonic stage range", () => {
    expect(
      driveBackupProgressPercent(
        { operation: "backup", phase: "encrypting", transferred: 0, total: 0 },
        "backup",
      ),
    ).toBe(8);
    expect(
      driveBackupProgressPercent(
        {
          operation: "backup",
          phase: "uploading",
          transferred: 500,
          total: 1000,
        },
        "backup",
      ),
    ).toBe(53);
  });

  it("clamps transfer progress and separates restore from backup", () => {
    expect(
      driveBackupProgressPercent(
        {
          operation: "restore",
          phase: "downloading",
          transferred: 1500,
          total: 1000,
        },
        "restore",
      ),
    ).toBe(85);
    expect(
      driveBackupProgressPercent(
        { operation: "restore", phase: "decrypting", transferred: 0, total: 0 },
        "backup",
      ),
    ).toBe(3);
  });
});
