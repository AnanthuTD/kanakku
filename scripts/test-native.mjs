import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const folder = mkdtempSync(join(tmpdir(), "kanakku-native-checks-"));
const jar = join(folder, "checks.jar");
const brewJdk =
  "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home";
const jdk =
  process.env.JAVA_HOME ||
  (process.platform === "darwin" && existsSync(brewJdk) ? brewJdk : undefined);
const env = { ...process.env, ...(jdk ? { JAVA_HOME: jdk } : {}) };
const source =
  "modules/kanakku-native/android/src/main/java/expo/modules/kanakku/";
try {
  execFileSync(
    "kotlinc",
    [
      ...[
        "SmsParser.kt",
        "WordPiece.kt",
        "ImportWindow.kt",
        "ReviewPolicy.kt",
        "MerchantQuery.kt",
        "VoiceText.kt",
        "DiagnosticPrivacy.kt",
        "CompanionDrafts.kt",
        "ModelFiles.kt",
        "BankEmailParser.kt",
        "RecoveryKey.kt",
      ].map((file) => source + file),
      "tests/ParserChecks.kt",
      "tests/ModelDownloadChecks.kt",
      "tests/BankEmailChecks.kt",
      "-include-runtime",
      "-d",
      jar,
    ],
    { env, stdio: "inherit" },
  );
  execFileSync(
    jdk
      ? join(jdk, "bin", process.platform === "win32" ? "java.exe" : "java")
      : "java",
    ["-jar", jar],
    { env, stdio: "inherit" },
  );
} catch (error) {
  process.stderr.write(
    "Native regression checks require JDK 17 and kotlinc on PATH (Kotlin 2.2.20+).\n",
  );
  process.exitCode = 1;
} finally {
  rmSync(folder, { recursive: true, force: true });
}
