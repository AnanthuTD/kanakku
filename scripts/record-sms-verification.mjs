#!/usr/bin/env node
// Records the Google Play SMS-permission verification video on the dedicated emulator:
// Settings → Connect bank SMS → choose a window → grant permissions → device credential →
// synthetic bank alerts import → "History scan complete" → the overview total.
//
// Everything on screen is synthetic (tests/android/pipeline/fixtures.json); the harness guard
// refuses any device other than the Kanakku_API_36 AVD, so a real phone's SMS is never shown.
// Unlike the pipeline test, animations are left ON so the video looks like the real app.
// Android's screenrecord stops at 3 minutes, so recording runs in chained segments that are
// stitched with ffmpeg at the end.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const serial = "emulator-5580";
const app = "app.tinkerbox.kanakku.e2e";
const adb =
  process.env.ADB ||
  "/opt/homebrew/share/android-commandlinetools/platform-tools/adb";
const out = join(root, "artifacts/play-verification");
mkdirSync(out, { recursive: true });

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
  const name = spawnSync(adb, ["-s", serial, "emu", "avd", "name"], {
    encoding: "utf8",
  })
    .stdout.split("\n")[0]
    .trim();
  if (name !== "Kanakku_API_36")
    throw new Error(
      `Refusing device ${serial}: AVD is '${name}', not Kanakku_API_36`,
    );
  if (!shell("pm list packages").includes(`package:${app}`))
    throw new Error(
      `${app} is not installed on the emulator; install the current E2E APK first`,
    );
}

guard();
// A non-root shell's `content insert` into the SMS provider is silently dropped on API 36; the
// synthetic alerts only exist for the import if adbd runs as root (the Google APIs AVD allows it).
spawnSync(adb, ["-s", serial, "root"], { encoding: "utf8" });
spawnSync("sleep", ["2"]);
if (!shell("id").includes("uid=0(root)"))
  throw new Error(
    "adb root did not take effect; the synthetic SMS fixtures would not be stored",
  );
const fixtures = JSON.parse(
  readFileSync(join(root, "tests/android/pipeline/fixtures.json"), "utf8"),
);
const seeded = [];
const segments = [];
let recorder = null;
let segment = 0;
const previousScale = shell("settings get global transition_animation_scale");
const previousScreenOff = shell("settings get system screen_off_timeout");
const previousLockAfter = shell(
  "settings get secure lock_screen_lock_after_timeout",
);

function startSegment() {
  segment += 1;
  const path = `/sdcard/kanakku-verify-${segment}.mp4`;
  segments.push(path);
  // Bit rate kept moderate; Play's review link is a YouTube/Drive upload, not a 4K asset.
  recorder = spawn(
    adb,
    [
      "-s",
      serial,
      "shell",
      "screenrecord",
      "--bit-rate",
      "6000000",
      "--time-limit",
      "175",
      path,
    ],
    { stdio: "ignore" },
  );
}
function stopSegment() {
  if (!recorder) return;
  // Ctrl-C-equivalent: screenrecord finalizes the file on SIGINT to its shell.
  shell("pkill -INT screenrecord || true");
  recorder = null;
  spawnSync("sleep", ["2"]);
}

try {
  // The AVD sleeps when idle; a black, locked screen makes every step fail. Wake and unlock
  // with the synthetic test PIN the pipeline harness documents (never a real credential).
  shell("input keyevent KEYCODE_WAKEUP");
  spawnSync("sleep", ["1"]);
  if (
    shell("dumpsys window").includes("mCurrentFocus=Window{") &&
    !shell("dumpsys window").includes(app)
  ) {
    shell("input swipe 540 1800 540 600 200");
    spawnSync("sleep", ["1"]);
    shell("input text 2580");
    shell("input keyevent KEYCODE_ENTER");
    spawnSync("sleep", ["2"]);
  }
  shell("svc power stayon true");
  // The AVD locks after its screen-off timeout even with stayon; the import can take minutes
  // and a locked device cannot finish it. Hold the screen on and the lock off for this run.
  shell("settings put system screen_off_timeout 1800000");
  shell("settings put secure lock_screen_lock_after_timeout 1800000");
  // Fresh app state so the connect journey is the first thing the reviewer sees.
  shell(`pm clear ${app}`);
  // Recording mode (test package only) waives FLAG_SECURE so the recording can see the unlocked
  // journal. Written straight into the app's settings file as root, before first launch.
  shell(`mkdir -p /data/data/${app}/shared_prefs`);
  shell(
    `printf '%s' ${q('<?xml version="1.0" encoding="utf-8" standalone="yes" ?>\n<map>\n    <boolean name="recordingMode" value="true" />\n</map>\n')} > /data/data/${app}/shared_prefs/kanakku-settings.xml`,
  );
  shell(
    `chown $(stat -c %u /data/data/${app}):$(stat -c %g /data/data/${app}) /data/data/${app}/shared_prefs /data/data/${app}/shared_prefs/kanakku-settings.xml`,
  );
  shell(`chmod 660 /data/data/${app}/shared_prefs/kanakku-settings.xml`);
  shell("settings put global transition_animation_scale 1");
  shell("settings put global window_animation_scale 1");
  shell("settings put global animator_duration_scale 1");
  for (const permission of ["READ_SMS", "RECEIVE_SMS", "POST_NOTIFICATIONS"])
    shell(`pm grant ${app} android.permission.${permission}`);
  const now = Number(shell("date +%s")) * 1000;
  for (const [index, fixture] of fixtures.messages.entries()) {
    const date = now - fixture.daysAgo * 86400000 - index * 1000;
    seeded.push({ ...fixture, date });
    const result = shell(
      `content insert --uri content://sms/inbox --bind address:s:${q(fixture.sender)} --bind body:s:${q(fixture.body)} --bind date:l:${date} --bind read:i:1`,
    );
    if (/Exception|Error/.test(result))
      throw new Error("Provider fixture insertion failed");
  }

  startSegment();
  // Keep the recording alive across the 3-minute cap while Maestro drives the flow.
  const keepAlive = setInterval(() => {
    stopSegment();
    startSegment();
  }, 170_000);
  const maestro =
    process.env.MAESTRO_BIN || join(homedir(), ".maestro/bin/maestro");
  const folder = join(out, "maestro");
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
      join(root, "tests/android/pipeline/connect.yaml"),
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 600000,
      env: {
        ...process.env,
        JAVA_HOME:
          process.env.JAVA_HOME ||
          "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
        MAESTRO_CLI_NO_ANALYTICS: "1",
      },
    },
  );
  clearInterval(keepAlive);
  writeFileSync(
    join(folder, "cli.log"),
    (result.stdout || "") + (result.stderr || ""),
  );
  // Linger on the final overview so the reviewer sees the imported total.
  spawnSync("sleep", ["4"]);
  stopSegment();
  if (result.status !== 0)
    throw new Error(`connect flow failed; see ${folder}/cli.log`);

  const local = [];
  for (const [index, path] of segments.entries()) {
    const file = join(out, `segment-${index + 1}.mp4`);
    call(["pull", path, file], 120000);
    shell(`rm -f ${path}`);
    local.push(file);
  }
  const list = join(out, "segments.txt");
  writeFileSync(list, local.map((f) => `file '${f}'`).join("\n") + "\n");
  const final = join(out, "kanakku-sms-verification.mp4");
  const stitched = spawnSync(
    "ffmpeg",
    ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", final],
    { encoding: "utf8" },
  );
  if (stitched.status !== 0)
    throw new Error(`ffmpeg concat failed: ${stitched.stderr.slice(-600)}`);
  console.log(`Verification video: ${final}`);
} finally {
  stopSegment();
  shell("svc power stayon false");
  shell(`settings put system screen_off_timeout ${previousScreenOff || 60000}`);
  shell(
    `settings put secure lock_screen_lock_after_timeout ${previousLockAfter || 5000}`,
  );
  shell(`settings put global transition_animation_scale ${previousScale || 1}`);
  // Delete only the exact synthetic rows this run inserted; never other inbox rows.
  for (const fixture of seeded) {
    const where = `address='${fixture.sender.replaceAll("'", "''")}' AND body='${fixture.body.replaceAll("'", "''")}' AND date=${fixture.date}`;
    shell(`content delete --uri content://sms --where ${q(where)}`);
    const remaining = shell(
      `content query --uri content://sms/inbox --projection _id --where ${q(where)}`,
    );
    if (!remaining.includes("No result found"))
      throw new Error("Provider fixture remained after cleanup");
  }
}
