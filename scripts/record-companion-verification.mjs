#!/usr/bin/env node
// Records the Google Play foreground-service verification video on the dedicated emulator:
// Settings → Connect bank SMS → turn on the floating companion → leave the app → a synthetic bank
// alert arrives → the companion appears over the launcher (FOREGROUND_SERVICE_SPECIAL_USE) → tap it
// to answer by voice (FOREGROUND_SERVICE_MICROPHONE) → the answer is handed back to the app.
//
// Everything on screen is synthetic (tests/android/pipeline/fixtures.json plus one live alert sent
// through the emulator console); the AVD guard refuses any device other than Kanakku_API_36.
// Shares its recording, wake/unlock and cleanup approach with record-sms-verification.mjs.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

// The live alert: an unfamiliar payee keeps the classifier uncertain, so the companion asks.
const LIVE_SENDER = "VM-HDFCBK";
const LIVE_BODY =
  "Rs.350.00 spent on HDFC Bank Card xx4821 at SR ENTERPRISES. Ref 123456789099";

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
const sleep = (s) => spawnSync("sleep", [String(s)]);
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
function uiTree() {
  shell("uiautomator dump /sdcard/kanakku-ui.xml >/dev/null 2>&1 || true");
  return shell("cat /sdcard/kanakku-ui.xml 2>/dev/null || true");
}
// Waits until a node whose content-description contains `text` exists, then returns its centre.
function waitForNode(text, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tree = uiTree();
    const index = tree.indexOf(text);
    if (index >= 0) {
      const node = tree.slice(tree.lastIndexOf("<node", index), tree.indexOf("/>", index));
      const bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
      if (bounds) {
        const [, x1, y1, x2, y2] = bounds.map(Number);
        return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
      }
    }
    sleep(1);
  }
  throw new Error(`Timed out waiting for "${text}" on screen`);
}

guard();
spawnSync(adb, ["-s", serial, "root"], { encoding: "utf8" });
sleep(2);
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
  const path = `/sdcard/kanakku-companion-${segment}.mp4`;
  segments.push(path);
  recorder = spawn(
    adb,
    ["-s", serial, "shell", "screenrecord", "--bit-rate", "6000000", "--time-limit", "175", path],
    { stdio: "ignore" },
  );
}
function stopSegment() {
  if (!recorder) return;
  shell("pkill -INT screenrecord || true");
  recorder = null;
  sleep(2);
}

try {
  shell("input keyevent KEYCODE_WAKEUP");
  sleep(1);
  if (
    shell("dumpsys window").includes("mCurrentFocus=Window{") &&
    !shell("dumpsys window").includes(app)
  ) {
    shell("input swipe 540 1800 540 600 200");
    sleep(1);
    shell("input text 2580");
    shell("input keyevent KEYCODE_ENTER");
    sleep(2);
  }
  shell("svc power stayon true");
  shell("settings put system screen_off_timeout 1800000");
  shell("settings put secure lock_screen_lock_after_timeout 1800000");
  shell(`pm clear ${app}`);
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
  for (const permission of ["READ_SMS", "RECEIVE_SMS", "POST_NOTIFICATIONS", "RECORD_AUDIO"])
    shell(`pm grant ${app} android.permission.${permission}`);
  // "Display over other apps" is a special-access setting; pre-allow it so the Settings switch
  // turns on directly instead of bouncing through the system page.
  shell(`appops set ${app} SYSTEM_ALERT_WINDOW allow`);
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
  const keepAlive = setInterval(() => {
    stopSegment();
    startSegment();
  }, 170_000);
  const maestro =
    process.env.MAESTRO_BIN || join(homedir(), ".maestro/bin/maestro");
  const folder = join(out, "maestro-companion");
  mkdirSync(folder, { recursive: true });
  const result = spawnSync(
    maestro,
    ["--device", serial, "test", "--no-reinstall-driver", "--test-output-dir", folder,
      join(root, "tests/android/pipeline/companion.yaml")],
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
  writeFileSync(join(folder, "cli.log"), (result.stdout || "") + (result.stderr || ""));
  if (result.status !== 0) {
    clearInterval(keepAlive);
    throw new Error(`companion flow failed; see ${folder}/cli.log`);
  }

  // Now on the launcher with the companion enabled: deliver a real SMS broadcast.
  sleep(3);
  call(["emu", "sms", "send", LIVE_SENDER, LIVE_BODY]);
  const companion = waitForNode("Tap the companion to answer by voice", 60_000);
  sleep(4); // let the reviewer read the question bubble
  shell(`input tap ${companion.x} ${companion.y}`);
  waitForNode("Listening.", 15_000); // microphone foreground type is active here
  sleep(5);
  // Explicit finish, as a user would after speaking.
  shell(`input tap ${companion.x} ${companion.y}`);
  // Transcription of silence ends in either a ready answer or a hand-off into the app.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const tree = uiTree();
    if (tree.includes("Answer ready") || tree.includes("Room to breathe.") || tree.includes("Payment note")) break;
    sleep(1);
  }
  sleep(8);
  clearInterval(keepAlive);
  stopSegment();
  shell("rm -f /sdcard/kanakku-ui.xml");

  const local = [];
  for (const [index, path] of segments.entries()) {
    const file = join(out, `companion-segment-${index + 1}.mp4`);
    call(["pull", path, file], 120000);
    shell(`rm -f ${path}`);
    local.push(file);
  }
  const list = join(out, "companion-segments.txt");
  writeFileSync(list, local.map((f) => `file '${f}'`).join("\n") + "\n");
  const final = join(out, "kanakku-companion-verification.mp4");
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
  shell(`am force-stop ${app}`);
  shell("svc power stayon false");
  shell(`settings put system screen_off_timeout ${previousScreenOff || 60000}`);
  shell(`settings put secure lock_screen_lock_after_timeout ${previousLockAfter || 5000}`);
  shell(`settings put global transition_animation_scale ${previousScale || 1}`);
  // Delete only the synthetic rows this run created: the seeded history and the live alert.
  const wheres = seeded.map(
    (f) => `address='${f.sender.replaceAll("'", "''")}' AND body='${f.body.replaceAll("'", "''")}' AND date=${f.date}`,
  );
  wheres.push(`body='${LIVE_BODY}'`);
  for (const where of wheres) {
    shell(`content delete --uri content://sms --where ${q(where)}`);
    const remaining = shell(
      `content query --uri content://sms/inbox --projection _id --where ${q(where)}`,
    );
    if (!remaining.includes("No result found"))
      throw new Error("Provider fixture remained after cleanup");
  }
}
