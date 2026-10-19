#!/usr/bin/env node
// Records the Google Play foreground-service verification video on the dedicated emulator:
// Settings → Connect bank SMS → turn on the floating companion → leave the app → a synthetic bank
// alert arrives → the companion appears over the launcher (FOREGROUND_SERVICE_SPECIAL_USE) → tap it
// to answer by voice (FOREGROUND_SERVICE_MICROPHONE) → the answer is handed back to the app.
//
// Everything on screen is synthetic (tests/android/pipeline/fixtures.json plus one live alert sent
// through the emulator console); the AVD guard refuses any device other than Kanakku_API_36.
// Shares its recording, wake/unlock and cleanup approach with record-sms-verification.mjs.
import {
  findCompanionOverlay,
  findCompanionAction,
} from "./companion-overlay.mjs";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const serial = "emulator-5580";
const app = "app.tinkerbox.kanakku.e2e";
const connected = process.argv.includes("--connected");
const adb =
  process.env.ADB ||
  "/opt/homebrew/share/android-commandlinetools/platform-tools/adb";
const out = join(root, "artifacts/play-verification");
mkdirSync(out, { recursive: true });

// The live alert: an unfamiliar payee keeps the classifier uncertain, so the companion asks.
const LIVE_SENDER = "VM-HDFCBK";
const LIVE_BODY = `Rs.350.00 spent on HDFC Bank Card xx4821 at SR ENTERPRISES. Ref ${Date.now()}`;

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
const sleep = (s) => new Promise((resolve) => setTimeout(resolve, s * 1000));
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
async function waitForNode(text, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tree = uiTree();
    const index = tree.indexOf(text);
    if (index >= 0) {
      const node = tree.slice(
        tree.lastIndexOf("<node", index),
        tree.indexOf("/>", index),
      );
      const bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
      if (bounds) {
        const [, x1, y1, x2, y2] = bounds.map(Number);
        return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
      }
    }
    await sleep(1);
  }
  throw new Error(`Timed out waiting for "${text}" on screen`);
}

guard();
spawnSync(adb, ["-s", serial, "root"], { encoding: "utf8" });
await sleep(2);
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
const previousSettings = [
  ["global", "transition_animation_scale"],
  ["global", "window_animation_scale"],
  ["global", "animator_duration_scale"],
  ["system", "font_scale"],
  ["global", "stay_on_while_plugged_in"],
  ["system", "screen_off_timeout"],
  ["secure", "lock_screen_lock_after_timeout"],
].map(([namespace, key]) => ({
  namespace,
  key,
  value: shell(`settings get ${namespace} ${key}`),
}));
const evidence = {
  startedAt: new Date().toISOString(),
  avd: "Kanakku_API_36",
  package: app,
  fixture: "en-natural-drinks",
  stages: [],
  status: "running",
  settingsRestored: false,
  syntheticSmsRemoved: false,
};
const saveEvidence = () =>
  writeFileSync(
    join(out, "companion-verification.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
const stage = (name, detail = {}) => {
  evidence.stages.push({ name, at: new Date().toISOString(), ...detail });
  saveEvidence();
  console.log(name);
};
let keepAlive;
let rotating = Promise.resolve();

function startSegment() {
  segment += 1;
  const path = `/sdcard/kanakku-companion-${segment}.mp4`;
  segments.push(path);
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
async function stopSegment() {
  if (!recorder) return;
  shell("pkill -INT screenrecord || true");
  recorder = null;
  await sleep(2);
}

try {
  shell("input keyevent KEYCODE_WAKEUP");
  await sleep(1);
  if (
    shell("dumpsys window").includes("mCurrentFocus=Window{") &&
    !shell("dumpsys window").includes(app)
  ) {
    shell("input swipe 540 1800 540 600 200");
    await sleep(1);
    shell("input text 2580");
    shell("input keyevent KEYCODE_ENTER");
    await sleep(2);
  }
  shell("svc power stayon true");
  shell("settings put system screen_off_timeout 1800000");
  shell("settings put secure lock_screen_lock_after_timeout 1800000");
  if (
    shell(
      `if grep -q 'name="ciphertext"' /data/data/${app}/shared_prefs/kanakku-merchant-provider.xml 2>/dev/null; then echo configured; fi`,
    ) === "configured"
  )
    throw new Error(
      "This test package contains a provider credential; refusing to clear it.",
    );
  if (!connected) {
    shell(`pm clear ${app}`);
  } else {
    shell(`am force-stop ${app}`);
    if (
      shell(
        `test -s /data/data/${app}/no_backup/ledger-key.envelope && echo connected`,
      ) !== "connected"
    )
      throw new Error(
        "--connected needs the existing synthetic encrypted journal; run the full flow first.",
      );
    shell(
      `sed -i 's/<boolean name="overlay" value="true"/<boolean name="overlay" value="false"/' /data/data/${app}/shared_prefs/kanakku-settings.xml`,
    );
  }
  shell("settings put system font_scale 1");
  shell("settings put global transition_animation_scale 0");
  shell("settings put global window_animation_scale 0");
  shell("settings put global animator_duration_scale 0");
  for (const permission of [
    "READ_SMS",
    "RECEIVE_SMS",
    "POST_NOTIFICATIONS",
    "RECORD_AUDIO",
  ])
    shell(`pm grant ${app} android.permission.${permission}`);
  // "Display over other apps" is a special-access setting; pre-allow it so the Settings switch
  // turns on directly instead of bouncing through the system page.
  shell(`appops set ${app} SYSTEM_ALERT_WINDOW allow`);
  const now = Number(shell("date +%s")) * 1000;
  for (const [index, fixture] of (connected
    ? []
    : fixtures.messages
  ).entries()) {
    const date = now - fixture.daysAgo * 86400000 - index * 1000;
    seeded.push({ ...fixture, date });
    const result = shell(
      `content insert --uri content://sms/inbox --bind address:s:${q(fixture.sender)} --bind body:s:${q(fixture.body)} --bind date:l:${date} --bind read:i:1`,
    );
    if (/Exception|Error/.test(result))
      throw new Error("Provider fixture insertion failed");
  }

  startSegment();
  keepAlive = setInterval(() => {
    rotating = rotating.then(async () => {
      await stopSegment();
      startSegment();
    });
  }, 150_000);
  const maestro =
    process.env.MAESTRO_BIN || join(homedir(), ".maestro/bin/maestro");
  const folder = join(out, "maestro-companion");
  mkdirSync(folder, { recursive: true });
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      maestro,
      [
        "--device",
        serial,
        "test",
        "--no-reinstall-driver",
        "--test-output-dir",
        folder,
        join(
          root,
          connected
            ? "tests/android/pipeline/companion-connected.yaml"
            : "tests/android/pipeline/companion.yaml",
        ),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          JAVA_HOME:
            process.env.JAVA_HOME ||
            "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
          MAESTRO_CLI_NO_ANALYTICS: "1",
        },
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const timeout = setTimeout(() => child.kill("SIGTERM"), 600000);
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      writeFileSync(join(folder, "cli.log"), output);
      resolve(code);
    });
  });
  if (result !== 0)
    throw new Error(`companion flow failed; see ${folder}/cli.log`);
  for (const setting of [
    "transition_animation_scale",
    "window_animation_scale",
    "animator_duration_scale",
  ])
    shell(`settings put global ${setting} 1`);
  shell("am force-stop dev.mobile.maestro.test");
  shell("am force-stop dev.mobile.maestro");
  stage("sms-connected-and-companion-enabled");

  // Now on the launcher with the companion enabled: deliver a real SMS broadcast.
  await sleep(3);
  call(["emu", "sms", "send", LIVE_SENDER, LIVE_BODY]);
  const size = [...shell("wm size").matchAll(/(\d+)x(\d+)/g)].at(-1);
  if (!size) throw new Error("Could not measure the emulator display");
  const displaySize = { width: Number(size[1]), height: Number(size[2]) };
  const overlayDeadline = Date.now() + 60000;
  let companion;
  while (Date.now() < overlayDeadline) {
    companion = findCompanionOverlay(shell("dumpsys window windows"), {
      displaySize,
    });
    if (companion) break;
    await sleep(1);
  }
  if (!companion)
    throw new Error("No unique visible Kanakku avatar window appeared");
  stage("companion-visible-over-launcher", { frame: companion.frame });
  writeFileSync(
    join(out, "companion-windows.txt"),
    shell("dumpsys window windows"),
  );
  await sleep(4);
  const overlayService = shell(`dumpsys activity services ${app}`);
  if (
    !/isForeground=true/.test(overlayService) ||
    ![
      ...overlayService.matchAll(
        /(?:types|foregroundServiceType)\s*=\s*(0x[0-9a-fA-F]+|\d+)/g,
      ),
    ].some((match) => (Number(match[1]) & 0x40000000) !== 0)
  )
    throw new Error(
      "Visible companion did not have the special-use foreground service",
    );
  writeFileSync(join(out, "companion-special-use-service.txt"), overlayService);
  stage("special-use-foreground-service-active");

  // Start and authenticate the RPC client before the user starts speaking. AudioRecord's
  // silence detector is intentionally short, so loading Python/gRPC after the mic tap races it.
  let injectionOutput = "";
  let armedResolve;
  let armedReject;
  let exitResolve;
  let exitReject;
  const injectionArmed = new Promise((resolve, reject) => {
    armedResolve = resolve;
    armedReject = reject;
  });
  const injectionFinished = new Promise((resolve, reject) => {
    exitResolve = resolve;
    exitReject = reject;
  });
  const injectionChild = spawn(
    join(root, ".venv-android-tests/bin/python"),
    [
      join(root, "scripts/inject-emulator-audio.py"),
      "--companion",
      "--wait-for-companion",
      join(root, "tests/voice/audio/en-natural-drinks.wav"),
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  let armed = false;
  injectionChild.stdout.on("data", (chunk) => {
    injectionOutput += chunk;
    if (!armed && injectionOutput.includes('"status": "microphone-injection-armed"')) {
      armed = true;
      armedResolve();
    }
  });
  injectionChild.stderr.on("data", (chunk) => {
    injectionOutput += chunk;
  });
  injectionChild.once("error", (error) => {
    if (!armed) armedReject(error);
    exitReject(error);
  });
  injectionChild.once("close", (code) => {
    if (!armed)
      armedReject(new Error("Audio injector exited before it was ready"));
    exitResolve(code);
  });
  const armTimeout = setTimeout(() => {
    injectionChild.kill("SIGTERM");
    armedReject(new Error("Audio injector did not arm within 30 seconds"));
  }, 30000);
  try {
    await injectionArmed;
  } finally {
    clearTimeout(armTimeout);
  }
  stage("microphone-injection-armed");
  shell(`input tap ${companion.x} ${companion.y}`);
  const micDeadline = Date.now() + 10000;
  let microphoneService = "";
  while (Date.now() < micDeadline) {
    microphoneService = shell(`dumpsys activity services ${app}`);
    const types = [
      ...microphoneService.matchAll(
        /(?:foregroundServiceType|fgsType|mForegroundServiceType|types)\s*[=:]\s*(0x[0-9a-fA-F]+|\d+)/g,
      ),
    ];
    if (
      /isForeground=true/.test(microphoneService) &&
      types.some((match) => (Number(match[1]) & 128) !== 0)
    )
      break;
    microphoneService = "";
    await sleep(0.15);
  }
  if (!microphoneService)
    throw new Error(
      "Avatar tap did not activate its microphone foreground service",
    );
  writeFileSync(
    join(out, "companion-microphone-service.txt"),
    microphoneService,
  );
  writeFileSync(
    join(out, "companion-recording-audio-service.txt"),
    shell("dumpsys media.audio_flinger"),
  );
  stage("microphone-foreground-service-active");
  const injectionCode = await injectionFinished;
  writeFileSync(
    join(out, "companion-audio-injection.jsonl"),
    injectionOutput,
  );
  if (injectionCode !== 0)
    throw new Error(
      "Public synthetic audio injection failed; see retained injection report",
    );
  stage("public-english-audio-delivered");
  // The bounded recorder normally ends on trailing silence. If still recording, finish explicitly.
  const service = shell(`dumpsys activity services ${app}`);
  if (
    [
      ...service.matchAll(
        /(?:foregroundServiceType|fgsType|mForegroundServiceType|types)\s*[=:]\s*(0x[0-9a-fA-F]+|\d+)/g,
      ),
    ].some((match) => (Number(match[1]) & 128) !== 0)
  )
    shell(`input tap ${companion.x} ${companion.y}`);
  // A native result and its unsaved note must actually arrive; silence/timeouts are failures.
  const answerDeadline = Date.now() + 60000;
  let understood;
  while (Date.now() < answerDeadline) {
    const diagnostics = shell(
      `cat /sdcard/Android/data/${app}/files/diagnostics/kanakku-diagnostics.jsonl 2>/dev/null || true`,
    );
    const entries = diagnostics.split("\n").flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
    const latest = entries.findLast(
      (entry) => entry.source === "companion" && entry.event === "transcribed",
    );
    if (latest) {
      if (!latest.detail?.understood)
        throw new Error(
          "Companion could not transcribe the public English sample",
        );
      understood = latest;
      break;
    }
    await sleep(0.5);
  }
  if (!understood)
    throw new Error("Timed out waiting for actual native speech recognition");
  stage("native-answer-understood", { words: understood.detail.words });
  await sleep(2);
  const edit = findCompanionAction(
    shell("dumpsys window windows"),
    "Edit",
    "answer",
    { displaySize },
  );
  if (!edit)
    throw new Error(
      "Could not identify the current native answer's Edit action safely",
    );
  await sleep(3);
  shell(`input tap ${edit.x} ${edit.y}`);
  const reviewDeadline = Date.now() + 45000;
  let noteLength = 0;
  let requestedUnlock = false;
  let enteredPin = false;
  while (Date.now() < reviewDeadline) {
    const tree = uiTree();
    if (
      !enteredPin &&
      /resource-id="[^"]*(?:pinEntry|lockPassword|passwordEntry)"/.test(tree)
    ) {
      shell("input text 2580");
      shell("input keyevent KEYCODE_ENTER");
      enteredPin = true;
    } else if (
      !requestedUnlock &&
      tree.includes('content-desc="Unlock Kanakku"')
    ) {
      const unlock = await waitForNode("Unlock Kanakku", 5000);
      shell(`input tap ${unlock.x} ${unlock.y}`);
      requestedUnlock = true;
    }
    const noteNode = tree.match(
      /<node\b[^>]*content-desc="Payment note"[^>]*>/,
    )?.[0];
    const text = noteNode?.match(/\btext="([^"]*)"/)?.[1];
    if (text && !/^(Or type|Type|Payment note)/.test(text)) {
      noteLength = text.length;
      break;
    }
    await sleep(0.3);
  }
  if (!noteLength)
    throw new Error(
      "Native answer was not delivered to an editable in-app payment note",
    );
  const endedService = shell(`dumpsys activity services ${app}`);
  if (
    [
      ...endedService.matchAll(
        /(?:types|foregroundServiceType)\s*=\s*(0x[0-9a-fA-F]+|\d+)/g,
      ),
    ].some((match) => (Number(match[1]) & 128) !== 0)
  )
    throw new Error("Microphone foreground type remained active after handoff");
  stage("unsaved-answer-in-payment-editor", {
    noteLength,
    microphoneServiceStopped: true,
  });
  await sleep(5);
  clearInterval(keepAlive);
  await rotating;
  await stopSegment();
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
  evidence.status = "recorded-awaiting-visual-review";
} catch (error) {
  evidence.status = "failed";
  evidence.error = error.message;
  saveEvidence();
  throw error;
} finally {
  clearInterval(keepAlive);
  await rotating;
  await stopSegment();
  shell(`am force-stop ${app}`);
  for (const { namespace, key, value } of previousSettings) {
    if (value === "null" || !value)
      shell(`settings delete ${namespace} ${key}`);
    else shell(`settings put ${namespace} ${key} ${q(value)}`);
  }
  evidence.settingsRestored = previousSettings.every(
    ({ namespace, key, value }) =>
      shell(`settings get ${namespace} ${key}`) === value,
  );
  // Delete only the synthetic rows this run created: the seeded history and the live alert.
  const wheres = seeded.map(
    (f) =>
      `address='${f.sender.replaceAll("'", "''")}' AND body='${f.body.replaceAll("'", "''")}' AND date=${f.date}`,
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
  evidence.syntheticSmsRemoved = true;
  saveEvidence();
  if (!evidence.settingsRestored)
    throw new Error("Emulator settings did not restore exactly");
}
