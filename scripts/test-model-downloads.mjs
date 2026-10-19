// Real optional-model download/inference lifecycle on the dedicated synthetic AVD only.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const sdk =
  process.env.ANDROID_HOME || "/opt/homebrew/share/android-commandlinetools";
const env = {
  ...process.env,
  JAVA_HOME:
    process.env.JAVA_HOME ||
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
};
const adb = join(sdk, "platform-tools/adb");
const serial = "emulator-5580";
function run(binary, args, timeout = 300_000) {
  const r = spawnSync(binary, args, {
    env,
    encoding: "utf8",
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0)
    throw Error(
      `${binary} failed: ${r.error?.message || r.stderr || r.stdout}`,
    );
  return r.stdout;
}
const device = (...args) => run(adb, ["-s", serial, ...args]);
if (device("emu", "avd", "name").split(/\r?\n/)[0] !== "Kanakku_API_36")
  throw Error("Expected dedicated Kanakku_API_36 AVD");
const apk =
  "modules/kanakku-native/android/build/outputs/apk/androidTest/debug/kanakku-native-debug-androidTest.apk";
if (!existsSync(apk))
  throw Error(
    "Build :kanakku-native:assembleDebugAndroidTest -PreactNativeArchitectures=arm64-v8a first",
  );
const pkg = "expo.modules.kanakku.test";
const badging = run(join(sdk, "build-tools/36.0.0/aapt2"), [
  "dump",
  "badging",
  apk,
]);
if (!badging.includes(`package: name='${pkg}'`))
  throw Error("Refusing mismatched instrumentation package");
console.log(device("install", "-r", "-t", apk).trim());
const report = {
  date: "2026-10-16",
  avd: "Kanakku_API_36",
  package: pkg,
  realPinnedDownloads: true,
  personalData: false,
  checks: [],
};
mkdirSync("artifacts", { recursive: true });
for (const method of [
  "downloadAndVerifyRealModels",
  "reuseAfterProcessRestartAndResumePartialDownload",
  "corruptionRemovalAndMissingFallback",
]) {
  if (method.startsWith("reuse")) {
    // An actual Android replacement install must retain the downloaded models.
    console.log(device("install", "-r", "-t", apk).trim());
  }
  device("shell", "am", "force-stop", pkg);
  console.log(`Running ${method}…`);
  const output = device(
    "shell",
    "am",
    "instrument",
    "-w",
    "-r",
    "-e",
    "class",
    `expo.modules.kanakku.ModelDownloadsInstrumentedTest#${method}`,
    `${pkg}/androidx.test.runner.AndroidJUnitRunner`,
  );
  writeFileSync(`artifacts/model-download-${method}.txt`, output);
  if (!/OK \(1 test\)/.test(output)) throw Error(output);
  report.checks.push({ method, status: "passed" });
  writeFileSync(
    "artifacts/model-download-native-results.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(`${method}: passed`);
}
console.log(
  "Real model downloads, verified inference, replacement/restart reuse, range recovery, cancellation, corruption and removal passed.",
);
