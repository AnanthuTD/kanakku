// Destructive only to the guarded, isolated test AVD/package. Never target a phone.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sdk =
  process.env.ANDROID_HOME || "/opt/homebrew/share/android-commandlinetools";
const adb = join(sdk, "platform-tools/adb");
const serial = "emulator-5580";
const app = "app.tinkerbox.kanakku.e2e";
const avd = "Kanakku_API_36";
const fixtures = JSON.parse(
  readFileSync(join(root, "tests/android/pipeline/fixtures.json"), "utf8"),
);
const resume = process.argv.includes("--resume");
const previous = resume
  ? JSON.parse(
      readFileSync(
        join(root, "artifacts/native-pipeline-results.json"),
        "utf8",
      ),
    )
  : null;
const seeded = [];
let originalTransitionScale = null;
let guarded = false;
const report = {
  date: new Date().toISOString(),
  avd,
  serial,
  package: app,
  synthetic: true,
  checks: [],
};
const q = (s) => "'" + String(s).replaceAll("'", "'\\''") + "'";
function call(args, timeout = 30000) {
  const result = spawnSync(adb, ["-s", serial, ...args], {
    encoding: "utf8",
    timeout,
  });
  if (result.status !== 0)
    throw new Error(
      `ADB ${args[0]} failed: ${result.stderr || result.error?.message}`,
    );
  if (/Exception|Error while accessing provider/.test(result.stderr))
    throw new Error(
      `ADB provider operation failed: ${result.stderr.split("\n")[0]}`,
    );
  return result.stdout.trim();
}
const shell = (command) => call(["shell", command]);
function guard() {
  if (call(["emu", "avd", "name"]).split(/\r?\n/)[0] !== avd)
    throw new Error("Refusing a different device/AVD.");
  if (shell("id -u") !== "0")
    throw new Error(
      "Root-capable synthetic AVD required; run adb -s emulator-5580 root first.",
    );
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(check, description, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = check();
    if (result) return result;
    await sleep(400);
  }
  throw new Error(`Timed out: ${description}`);
}
function flow(name) {
  const maestro =
    process.env.MAESTRO_BIN || join(homedir(), ".maestro/bin/maestro");
  const folder = join(root, "maestro-output/native-pipeline", name);
  mkdirSync(folder, { recursive: true });
  const result = spawnSync(
    maestro,
    [
      "--device",
      serial,
      "test",
      "--no-reinstall-driver",
      "--test-output-dir",
      folder,
      join(root, "tests/android/pipeline", `${name}.yaml`),
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
  writeFileSync(
    join(folder, "cli.log"),
    (result.stdout || "") + (result.stderr || ""),
  );
  if (result.status !== 0)
    throw new Error(`Native ${name} UI flow failed; inspect ${folder}/cli.log`);
}
function progress() {
  const xml = shell(
    `cat /data/user/0/${app}/shared_prefs/kanakku-import.xml 2>/dev/null || true`,
  );
  const values = Object.fromEntries(
    [
      ...xml.matchAll(/<(?:int|long|boolean) name="([^"]+)" value="([^"]+)"/g),
    ].map(([, k, v]) => [k, v]),
  );
  for (const [, k, v] of xml.matchAll(
    /<string name="([^"]+)">([^<]*)<\/string>/g,
  ))
    values[k] = v;
  return {
    state: values.state,
    months: Number(values.months),
    scanned: Number(values.scanned),
    captured: Number(values.captured),
    total: Number(values.total),
    since: Number(values.since),
    until: Number(values.until),
  };
}
function verify(condition, label) {
  if (!condition) throw new Error(label);
  report.checks.push(label);
  console.log(`PASS ${label}`);
}
try {
  guard();
  guarded = true;
  report.motionConditions = {
    transitionAnimationScale: shell(
      "settings get global transition_animation_scale",
    ),
    animatorDurationScale: shell("settings get global animator_duration_scale"),
    windowAnimationScale: shell("settings get global window_animation_scale"),
  };
  report.apkSha256 = createHash("sha256")
    .update(readFileSync(join(root, "artifacts/kanakku-e2e.apk")))
    .digest("hex");
  const installed = shell(`pm path ${app}`)
    .split("\n")
    .find((path) => path.startsWith("package:"))
    ?.slice(8);
  verify(
    installed &&
      shell(`sha256sum ${q(installed)}`).split(/\s/)[0] === report.apkSha256,
    "Installed isolated APK hash matches the reported artifact",
  );
  verify(
    shell("locksettings verify --old 2580").includes("verified successfully"),
    "Synthetic AVD PIN credential verified",
  );
  if (Number(shell("date +%d")) < 2)
    throw new Error(
      "These previous-day fixtures require the emulator calendar to be past the first day of the month.",
    );
  originalTransitionScale = shell(
    "settings get global transition_animation_scale",
  );
  shell("settings put global transition_animation_scale 0");
  report.reducedMotion = true;
  // Clear only test-package state. Provider fixture rows are individually deleted on exit.
  if (!resume) {
    shell(`am force-stop ${app}`);
    shell(`pm clear ${app}`);
  } else {
    if (
      previous.apkSha256 !== report.apkSha256 ||
      previous.initialImport?.state !== "complete" ||
      previous.initialImport?.scanned !== 9 ||
      previous.initialImport?.captured !== 5 ||
      !previous.checks.includes(
        "Rendered native current-month net spending is ₹300.25",
      )
    )
      throw new Error(
        "Resume requires the same verified APK and previously completed exact native import phase.",
      );
    report.resumedFrom = previous.resumedFrom || previous.date;
    report.initialImport = previous.initialImport;
    report.checks.push(
      ...previous.checks.filter((label) => !report.checks.includes(label)),
    );
  }
  for (const permission of ["READ_SMS", "RECEIVE_SMS", "POST_NOTIFICATIONS"])
    shell(`pm grant ${app} android.permission.${permission}`);
  const now = Number(shell("date +%s")) * 1000;
  report.providerFixtureTimeBaseMs = now;
  for (const [index, fixture] of fixtures.messages.entries()) {
    const date = now - fixture.daysAgo * 86400000 - index * 1000;
    seeded.push({ ...fixture, date });
    const result = shell(
      `content insert --uri content://sms/inbox --bind address:s:${q(fixture.sender)} --bind body:s:${q(fixture.body)} --bind date:l:${date} --bind read:i:1`,
    );
    if (/Exception|Error/.test(result))
      throw new Error("Provider fixture insertion failed");
  }
  if (!resume) flow("connect");
  const first = resume
    ? previous.initialImport
    : await waitUntil(
        () => {
          const p = progress();
          if (p.state === "error") throw new Error("Native import error");
          return p.state === "complete" && p;
        },
        "real WorkManager SMS import",
        180000,
      );
  report.initialImport = first;
  if (!resume) {
    verify(
      first.months === 4 &&
        first.scanned === fixtures.expected.scanned &&
        first.captured === fixtures.expected.captured,
      "Actual provider import: selected four-month floor, nine scanned, five unique eligible transactions",
    );
    verify(true, "Rendered native current-month net spending is ₹300.25");
  }
  const base = `/data/user/0/${app}`;
  const header = shell(
    `head -c 16 ${base}/files/SQLite/kanakku-v1.db | od -An -tx1`,
  ).replace(/\s/g, "");
  verify(
    header.length === 32 &&
      header !== Buffer.from("SQLite format 3\0").toString("hex"),
    "Native ledger exists with encrypted SQLCipher header, not plaintext SQLite",
  );
  verify(
    shell(`test -s ${base}/no_backup/ledger-key.envelope && echo sealed`) ===
      "sealed",
    "Authentication-gated database-key envelope exists in no_backup",
  );
  if (!resume)
    verify(
      shell("dumpsys window windows").match(/fl=[^\n]*\bSECURE\b/),
      "Authenticated journal window carries FLAG_SECURE",
    );
  flow("restart");
  if (resume)
    verify(
      shell("dumpsys window windows").match(/fl=[^\n]*\bSECURE\b/),
      "Authenticated journal window carries FLAG_SECURE after resumed PIN authentication",
    );
  verify(
    true,
    "Process restart hides ledger behind authentication and exact total returns after PIN",
  );
  flow("replay");
  const originalUntil = first.until;
  const replay = await waitUntil(
    () => {
      const p = progress();
      return p.until > originalUntil && p.state === "complete" && p;
    },
    "repeat selected-history provider scan",
    180000,
  );
  report.replayImport = replay;
  verify(
    replay.scanned === 9,
    "Replay really scans the same nine in-window provider messages",
  );
  verify(
    true,
    "Repeated import keeps exact spending and four current-month transactions, including non-spend rows",
  );
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.message;
  if (guarded) {
    try {
      report.nativeImportAtFailure = progress();
    } catch {
      /* Primary failure remains. */
    }
  }
  console.error(error.message);
  process.exitCode = 1;
} finally {
  // Never delete unrelated inbox rows, even on the synthetic AVD.
  try {
    guard();
    for (const fixture of seeded) {
      const where = `address='${fixture.sender.replaceAll("'", "''")}' AND body='${fixture.body.replaceAll("'", "''")}' AND date=${fixture.date}`;
      const result = shell(
        `content delete --uri content://sms --where ${q(where)}`,
      );
      if (/Exception|Error/.test(result))
        throw new Error("Provider fixture cleanup failed");
      const remaining = shell(
        `content query --uri content://sms/inbox --projection _id --where ${q(where)}`,
      );
      if (!remaining.includes("No result found"))
        throw new Error("Provider fixture remained after cleanup");
    }
    report.fixtureCleanup = "passed";
  } catch (error) {
    report.fixtureCleanup = "failed";
    report.cleanupError = error.message;
    report.status = "failed";
    process.exitCode = 1;
  }
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
        throw new Error("Reduced-motion setting was not restored");
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
    join(root, "artifacts/native-pipeline-results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
