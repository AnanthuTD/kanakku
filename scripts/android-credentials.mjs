// Native credential lifecycle on the dedicated synthetic AVD only. No searches.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sdk =
  process.env.ANDROID_HOME || "/opt/homebrew/share/android-commandlinetools";
const serial = "emulator-5580";
const app = "com.kanakku.app.e2e";
const avd = "Kanakku_API_36";
const base = `/data/user/0/${app}`;
// These satisfy input syntax but are deliberately invalid provider credentials.
const placeholders = [
  "KANAKKU_TEST_INVALID_KEY_ALPHA_000",
  "KANAKKU_TEST_INVALID_KEY_BETA_0000",
];
const report = {
  date: new Date().toISOString(),
  avd,
  serial,
  package: app,
  synthetic: true,
  checks: [],
};
const q = (s) => "'" + String(s).replaceAll("'", "'\\''") + "'";
let guarded = false;
let originalTransitionScale = null;
function call(args, timeout = 30000) {
  const r = spawnSync(
    join(sdk, "platform-tools/adb"),
    ["-s", serial, ...args],
    { encoding: "utf8", timeout },
  );
  if (r.error || r.status !== 0)
    throw new Error(`ADB ${args[0]} failed: ${r.error?.message || r.stderr}`);
  return r.stdout.trim();
}
const shell = (command, timeout) => call(["shell", command], timeout);
function guard() {
  if (call(["emu", "avd", "name"]).split(/\r?\n/)[0] !== avd)
    throw new Error("Refusing a different device/AVD.");
  if (shell("id -u") !== "0")
    throw new Error(
      "Root-capable dedicated AVD required: adb -s emulator-5580 root.",
    );
}
function verify(condition, label) {
  if (!condition) throw new Error(label);
  report.checks.push(label);
  console.log(`PASS ${label}`);
}
function prefs() {
  const xml = shell(
    `cat ${base}/shared_prefs/kanakku-merchant-provider.xml 2>/dev/null || true`,
  );
  const result = Object.fromEntries(
    [
      ...xml.matchAll(/<(?:int|long|boolean) name="([^"]+)" value="([^"]+)"/g),
    ].map(([, k, v]) => [k, v]),
  );
  for (const [, k, v] of xml.matchAll(
    /<string name="([^"]+)">([^<]*)<\/string>/g,
  ))
    result[k] = v;
  return result;
}
function disabled(p, stage) {
  verify(
    (p.enabled === undefined || p.enabled === "false") &&
      (p.automatic === undefined || p.automatic === "false"),
    `${stage}: native lookup and automatic lookup remain disabled`,
  );
  verify(
    Number(p.dailyUsed || 0) === 0 &&
      Number(p.monthlyUsed || 0) === 0 &&
      !p.day &&
      !p.month &&
      !p.retryAt,
    `${stage}: no provider attempts or cooldown recorded`,
  );
}
function encrypted(p, stage, expectedPlaceholder) {
  verify(
    typeof p.ciphertext === "string" &&
      Buffer.from(p.ciphertext, "base64").length >= 32 &&
      Buffer.from(p.iv || "", "base64").length === 12,
    `${stage}: native AES-GCM ciphertext and 12-byte IV exist`,
  );
  verify(
    Buffer.from(p.ciphertext, "base64").length ===
      Buffer.byteLength(expectedPlaceholder, "utf8") + 16,
    `${stage}: ciphertext length equals the complete synthetic key plus 16-byte GCM tag`,
  );
  const scan = shell(
    `grep -r -a -l -F -e ${q(placeholders[0])} -e ${q(placeholders[1])} ${q(base)} 2>/dev/null; result=$?; if [ "$result" -gt 1 ]; then echo SCAN_FAILED; fi`,
    60000,
  );
  verify(
    scan === "",
    `${stage}: neither synthetic key appears in any on-disk test-app file`,
  );
  disabled(p, stage);
}
function permissionsDenied(stage) {
  const state = shell(`dumpsys package ${app}`);
  const permissions = [
    "READ_SMS",
    "RECEIVE_SMS",
    "RECORD_AUDIO",
    "POST_NOTIFICATIONS",
  ];
  verify(
    permissions.every((permission) =>
      state.includes(`android.permission.${permission}: granted=false`),
    ),
    `${stage}: SMS, microphone and notification runtime permissions remain denied`,
  );
}
function flow(name) {
  guard();
  const folder = join(root, "maestro-output/native-credentials", name);
  mkdirSync(folder, { recursive: true });
  const r = spawnSync(
    process.env.MAESTRO_BIN || join(homedir(), ".maestro/bin/maestro"),
    [
      "--device",
      serial,
      "test",
      "--no-reinstall-driver",
      "--test-output-dir",
      folder,
      join(root, "tests/android/credentials", `${name}.yaml`),
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 480000,
      env: {
        ...process.env,
        JAVA_HOME:
          process.env.JAVA_HOME ||
          "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
        MAESTRO_CLI_NO_ANALYTICS: "1",
      },
    },
  );
  writeFileSync(join(folder, "cli.log"), (r.stdout || "") + (r.stderr || ""));
  if (r.error || r.status !== 0)
    throw new Error(
      `Credential ${name} UI flow failed; inspect ${folder}/cli.log`,
    );
  permissionsDenied(name);
}
try {
  guard();
  const apk = join(root, "artifacts/kanakku-e2e.apk");
  const gate = spawnSync(
    process.execPath,
    [join(root, "scripts/verify-apk.mjs"), apk, "--e2e"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        ANDROID_HOME: sdk,
        JAVA_HOME:
          process.env.JAVA_HOME ||
          "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
      },
    },
  );
  if (gate.error || gate.status !== 0)
    throw new Error(`Isolated APK verification failed: ${gate.stderr}`);
  report.apkSha256 = createHash("sha256")
    .update(readFileSync(apk))
    .digest("hex");
  const installed = shell(`pm path ${app}`)
    .split("\n")
    .find((p) => p.startsWith("package:"))
    ?.slice(8);
  verify(
    installed &&
      shell(`sha256sum ${q(installed)}`).split(/\s/)[0] === report.apkSha256,
    "Installed isolated APK matches the verified artifact",
  );
  guarded = true;
  originalTransitionScale = shell(
    "settings get global transition_animation_scale",
  );
  report.motionConditions = {
    originalTransitionScale,
    transitionAnimationScale: "0",
    animatorDurationScale: shell("settings get global animator_duration_scale"),
    windowAnimationScale: shell("settings get global window_animation_scale"),
  };
  shell("settings put global transition_animation_scale 0");
  verify(
    shell("settings get global transition_animation_scale") === "0",
    "Credential storage journeys use Android reduced-motion condition",
  );
  flow("save-first");
  const first = prefs();
  encrypted(first, "First save", placeholders[0]);
  flow("restart");
  const restarted = prefs();
  verify(
    restarted.ciphertext === first.ciphertext && restarted.iv === first.iv,
    "Process restart preserves the encrypted credential without rewriting it",
  );
  encrypted(restarted, "Restart", placeholders[0]);
  flow("replace");
  const replaced = prefs();
  verify(
    replaced.ciphertext !== first.ciphertext && replaced.iv !== first.iv,
    "Replacement changes both ciphertext and GCM IV",
  );
  encrypted(replaced, "Replace", placeholders[1]);
  flow("remove");
  const removed = prefs();
  verify(
    !removed.ciphertext && !removed.iv,
    "Remove provider key deletes native ciphertext and IV",
  );
  disabled(removed, "Remove");
  flow("removed-restart");
  const final = prefs();
  verify(
    !final.ciphertext && !final.iv,
    "Removed credential stays absent after process restart",
  );
  disabled(final, "Removed restart");
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
  if (guarded) {
    try {
      guard();
      shell(`am force-stop ${app}`);
      shell(`pm clear ${app}`);
      report.failureCleanup = "isolated test app cleared";
    } catch (cleanupError) {
      report.failureCleanup = cleanupError.message;
    }
  }
} finally {
  if (originalTransitionScale !== null) {
    try {
      guard();
      shell(
        `settings put global transition_animation_scale ${q(originalTransitionScale)}`,
      );
      if (
        shell("settings get global transition_animation_scale") !==
        originalTransitionScale
      )
        throw new Error("Original transition scale was not restored");
      report.deviceSettingsRestored = "passed";
    } catch (error) {
      report.deviceSettingsRestored = "failed";
      report.restoreError = error.message;
      report.status = "failed";
      process.exitCode = 1;
    }
  }
  mkdirSync(join(root, "artifacts"), { recursive: true });
  writeFileSync(
    join(root, "artifacts/native-credential-results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
