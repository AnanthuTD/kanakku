import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (existsSync("/opt/homebrew/share/android-commandlinetools")
    ? "/opt/homebrew/share/android-commandlinetools"
    : join(homedir(), "Library/Android/sdk"));
const jdk =
  process.env.JAVA_HOME ||
  "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home";
const env = {
  ...process.env,
  JAVA_HOME: jdk,
  ANDROID_HOME: sdk,
  MAESTRO_CLI_NO_ANALYTICS: "1",
};
const name = "Kanakku_API_36";
const serial = "emulator-5580";
const image = "system-images;android-36;google_apis;arm64-v8a";
const adb = join(sdk, "platform-tools/adb");
const emulator = join(sdk, "emulator/emulator");
const cli = join(sdk, "cmdline-tools/latest/bin");
const command = process.argv[2];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function run(binary, args, input) {
  return new Promise((done, reject) => {
    const child = spawn(binary, args, {
      cwd: root,
      env,
      stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
    });
    if (input !== undefined) child.stdin.end(input);
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? done() : reject(new Error(`${binary} exited with ${code}`)),
    );
  });
}
function query(args) {
  const result = spawnSync(adb, args, { env, encoding: "utf8", timeout: 8000 });
  return result.status === 0 ? result.stdout.trim() : "";
}
function instanceName() {
  return query(["-s", serial, "emu", "avd", "name"]).split(/\r?\n/)[0];
}
function assertInstance() {
  if (instanceName() !== name)
    throw new Error(
      `Refusing to operate on ${serial}: expected isolated AVD ${name}`,
    );
}

async function setup() {
  if (process.arch !== "arm64")
    throw new Error(
      "This AVD profile requires an arm64 host; choose a matching system image on Intel.",
    );
  const markers = [
    join(sdk, "emulator/package.xml"),
    join(sdk, "system-images/android-36/google_apis/arm64-v8a/package.xml"),
  ];
  if (!markers.every(existsSync))
    await run(join(cli, "sdkmanager"), ["emulator", image]);
  const avdHome =
    process.env.ANDROID_AVD_HOME || join(homedir(), ".android/avd");
  const config = join(avdHome, `${name}.avd/config.ini`);
  if (!existsSync(config)) {
    await run(
      join(cli, "avdmanager"),
      [
        "create",
        "avd",
        "--name",
        name,
        "--package",
        image,
        "--device",
        "pixel_6",
      ],
      "no\n",
    );
    if (!existsSync(config))
      throw new Error(
        "AVD configuration was created at an unexpected location.",
      );
    // Dedicated test profile: bounded resources, no personal accounts or data.
    const changes = {
      "hw.ramSize": "2048",
      "hw.cpu.ncore": "2",
      "disk.dataPartition.size": "4G",
      "hw.keyboard": "yes",
      showDeviceFrame: "no",
    };
    let contents = readFileSync(config, "utf8");
    for (const [key, value] of Object.entries(changes)) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const expression = new RegExp(`^${escaped}=.*$`, "m");
      contents = expression.test(contents)
        ? contents.replace(expression, `${key}=${value}`)
        : `${contents.trimEnd()}\n${key}=${value}\n`;
    }
    writeFileSync(config, contents);
  }
  console.log(`Reusable Android 16 test device ready: ${name}`);
}

async function start() {
  if (!existsSync(emulator))
    throw new Error("Run npm run emulator:setup first.");
  if (
    query(["devices"])
      .split(/\r?\n/)
      .some((line) => line.startsWith(serial + "\t"))
  ) {
    assertInstance();
  } else {
    mkdirSync(join(root, "artifacts"), { recursive: true });
    const log = openSync(join(root, "artifacts/emulator.log"), "a");
    const args = [
      "-avd",
      name,
      "-port",
      "5580",
      "-no-boot-anim",
      "-no-snapshot-save",
      "-gpu",
      "auto",
    ];
    if (!process.argv.includes("--show")) args.push("-no-window", "-no-audio");
    const child = spawn(emulator, args, {
      cwd: root,
      env,
      detached: true,
      stdio: ["ignore", log, log],
    });
    child.on("error", (error) => console.error(error.message));
    child.unref();
  }
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (
      query(["-s", serial, "shell", "getprop", "sys.boot_completed"]) === "1"
    ) {
      assertInstance();
      // Dedicated test AVD: keep charging sessions awake during long builds/tests.
      await run(adb, ["-s", serial, "shell", "svc", "power", "stayon", "true"]);
      // This keyboard-testing AVD must not redirect taps into Gboard's stylus tutorial.
      await run(adb, [
        "-s",
        serial,
        "shell",
        "settings",
        "put",
        "secure",
        "stylus_handwriting_enabled",
        "0",
      ]);
      if (
        query([
          "-s",
          serial,
          "shell",
          "settings",
          "get",
          "secure",
          "stylus_handwriting_enabled",
        ]) !== "0"
      )
        throw new Error(
          "Could not configure ordinary keyboard input on the test AVD.",
        );
      await run(adb, ["-s", serial, "shell", "input", "keyevent", "224"]);
      await run(adb, ["-s", serial, "shell", "input", "keyevent", "82"]);
      console.log(`Android test emulator booted: ${serial}`);
      return;
    }
    await sleep(1000);
  }
  throw new Error(
    "Emulator did not boot in three minutes; inspect artifacts/emulator.log.",
  );
}

async function test() {
  const flowIndex = process.argv.indexOf("--flow");
  const flow = flowIndex < 0 ? null : process.argv[flowIndex + 1];
  if (
    flowIndex >= 0 &&
    ![
      "history-setup",
      "mixed-note-review",
      "review-persistence",
      "theme-persistence",
    ].includes(flow)
  )
    throw new Error(
      "--flow must name one of the four isolated Maestro smoke flows.",
    );
  await start();
  const apk = join(root, "artifacts/kanakku-e2e.apk");
  if (!existsSync(apk))
    throw new Error("Build the isolated E2E APK first; see CLAUDE.md.");
  await run(process.execPath, [
    join(root, "scripts/verify-apk.mjs"),
    apk,
    "--e2e",
  ]);
  assertInstance();
  await run(adb, ["-s", serial, "install", "-r", apk]);
  const maestro =
    process.env.MAESTRO_BIN || join(homedir(), ".maestro/bin/maestro");
  if (!existsSync(maestro))
    throw new Error("Install Maestro CLI first; see CLAUDE.md.");
  const folder = join(
    root,
    "maestro-output",
    `emulator-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  mkdirSync(folder, { recursive: true });
  const reducedMotion = process.argv.includes("--reduced-motion");
  const originalTransitionScale = query([
    "-s",
    serial,
    "shell",
    "settings",
    "get",
    "global",
    "transition_animation_scale",
  ]);
  if (
    reducedMotion &&
    !/^(?:\d+(?:\.\d+)?|null)$/.test(originalTransitionScale)
  )
    throw new Error(
      "Cannot safely preserve the emulator's transition setting.",
    );
  const conditions = {
    flow: flow || "all",
    reducedMotion,
    originalTransitionScale,
    transitionScale: reducedMotion ? "0" : originalTransitionScale,
    settingsRestored: reducedMotion ? "pending" : "unchanged",
  };
  const conditionsPath = join(folder, "conditions.json");
  writeFileSync(conditionsPath, JSON.stringify(conditions, null, 2) + "\n");
  try {
    if (reducedMotion) {
      assertInstance();
      await run(adb, [
        "-s",
        serial,
        "shell",
        "settings",
        "put",
        "global",
        "transition_animation_scale",
        "0",
      ]);
      if (
        query([
          "-s",
          serial,
          "shell",
          "settings",
          "get",
          "global",
          "transition_animation_scale",
        ]) !== "0"
      )
        throw new Error("Reduced-motion test setting was not applied.");
    }
    await run(maestro, [
      "--device",
      serial,
      "test",
      // Reuse installed helpers; reinstalling asks for approval on Xiaomi phones.
      "--no-reinstall-driver",
      "--format",
      "JUNIT",
      "--output",
      join(folder, "results.xml"),
      "--test-output-dir",
      folder,
      join(root, "tests/android/maestro", ...(flow ? [`${flow}.yaml`] : [])),
    ]);
  } finally {
    if (reducedMotion) {
      assertInstance();
      await run(adb, [
        "-s",
        serial,
        "shell",
        "settings",
        originalTransitionScale === "null" ? "delete" : "put",
        "global",
        "transition_animation_scale",
        ...(originalTransitionScale === "null"
          ? []
          : [originalTransitionScale]),
      ]);
      if (
        query([
          "-s",
          serial,
          "shell",
          "settings",
          "get",
          "global",
          "transition_animation_scale",
        ]) !== originalTransitionScale
      )
        throw new Error(
          "Original emulator transition setting was not restored.",
        );
      conditions.settingsRestored = "passed";
      writeFileSync(conditionsPath, JSON.stringify(conditions, null, 2) + "\n");
    }
  }
  console.log(`Android test report: ${join(folder, "results.xml")}`);
}

try {
  if (command === "setup") await setup();
  else if (command === "start") await start();
  else if (command === "stop") {
    assertInstance();
    await run(adb, ["-s", serial, "emu", "kill"]);
  } else if (command === "test") await test();
  else
    throw new Error(
      "Usage: node scripts/android-emulator.mjs setup|start|stop|test [--show] [--reduced-motion] [--flow NAME]",
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
