import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const voiceModel = JSON.parse(
  readFileSync(
    new URL("../src/native/voiceModel.json", import.meta.url),
    "utf8",
  ),
);

// Read-only delivery gate; does not install, sign or modify the APK.
const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
if ([...flags].some((flag) => !["--e2e", "--production"].includes(flag)))
  throw new Error("Unknown verification option");
const inputs = args.filter((arg) => !arg.startsWith("--"));
if (inputs.length !== 1)
  throw new Error(
    "Usage: node scripts/verify-apk.mjs APK [--e2e] [--production]",
  );
const apk = resolve(inputs[0]);
if (!statSync(apk).isFile()) throw new Error("APK path must be a file");
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw new Error("Set ANDROID_HOME to the Android SDK");
const buildTools = join(sdk, "build-tools");
const versions = readdirSync(buildTools)
  .filter((version) => /^\d+\.\d+\.\d+$/.test(version))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
if (!versions.length) throw new Error("Android SDK build tools are missing");
const bt = join(buildTools, versions.at(-1));
function run(command, argv, binary = false) {
  const result = spawnSync(command, argv, {
    encoding: binary ? null : "utf8",
    maxBuffer: 800 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} failed: ${result.error?.message || String(result.stderr).slice(0, 1000)}`,
    );
  return result.stdout;
}
function check(condition, message) {
  if (!condition) throw new Error(message);
}
const packageName = flags.has("--e2e")
  ? "app.tinkerbox.kanakku.e2e"
  : "app.tinkerbox.kanakku";
const badging = run(join(bt, "aapt2"), ["dump", "badging", apk]);
check(
  badging.includes(`package: name='${packageName}'`),
  `Expected ${packageName}; refusing a mismatched delivery profile`,
);
check(
  /^(?:minSdkVersion|sdkVersion):'31'/m.test(badging),
  "Unexpected minimum Android version",
);
check(
  badging.includes("native-code: 'arm64-v8a'"),
  "Expected arm64 native ABI",
);
const certificate = run(join(bt, "apksigner"), [
  "verify",
  "--verbose",
  "--print-certs",
  apk,
]);
const developmentSigning = /CN=Android Debug|CN=AndroidDebug/i.test(
  certificate,
);
if (flags.has("--production"))
  check(
    !developmentSigning,
    "Production gate rejects Android development signing; configure a private production key first",
  );
const manifest = run(join(bt, "aapt2"), [
  "dump",
  "xmltree",
  apk,
  "--file",
  "AndroidManifest.xml",
]);
check(
  /allowBackup[^\n]*=(?:false|(?:\(type 0x12\))?0x0)\b/.test(manifest),
  "Expected disabled Android backups",
);
check(
  !/debuggable[^\n]*=(?:true|(?:\(type 0x12\))?0xffffffff)\b/.test(manifest),
  "APK must not be debuggable",
);
const entries = run("unzip", ["-Z1", apk]).trim().split("\n");
const libs = entries.filter((name) => /^lib\/.*\.so$/.test(name));
check(
  libs.length > 0 && libs.every((name) => name.startsWith("lib/arm64-v8a/")),
  "Unexpected or missing native ABI",
);
const expectedModels = {
  "minilm.onnx":
    "4278337fd0ff3c68bfb6291042cad8ab363e1d9fbc43dcb499fe91c871902474",
  // Whisper model chosen with npm run voice:model.
  [voiceModel.asset]: voiceModel.sha256,
};
// Large weights must never leak back into the base APK. Only pinned download metadata ships.
for (const name of Object.keys(expectedModels))
  check(
    !entries.includes(`assets/kanakku/${name}`),
    `Optional model ${name} was bundled in the base APK`,
  );
check(
  !entries.some((name) => /^assets\/kanakku\/.*\.(?:onnx|bin)$/.test(name)),
  "Unexpected bundled model weights",
);
const catalog = JSON.parse(
  run("unzip", ["-p", apk, "assets/kanakku/model-downloads.json"]),
);
const sourceCatalog = JSON.parse(
  readFileSync(
    new URL("../src/native/modelCatalog.json", import.meta.url),
    "utf8",
  ),
);
check(
  JSON.stringify(catalog) === JSON.stringify(sourceCatalog),
  "APK download catalog differs from source",
);
check(catalog.length === 2, "Unexpected optional models");
for (const model of catalog) {
  check(
    expectedModels[model.asset] === model.sha256,
    "Optional model provenance differs",
  );
  check(
    model.url.startsWith("https://huggingface.co/") &&
      /\/resolve\/[a-f0-9]{40}\//.test(model.url),
    "Model source must pin an immutable revision",
  );
  check(
    Number.isSafeInteger(model.bytes) && model.bytes > 0,
    "Missing pinned model size",
  );
}
for (const name of [
  // Vendored whisper.cpp (modules/kanakku-native/android/src/main/cpp).
  "libkanakku_whisper.so",
])
  check(entries.includes(`lib/arm64-v8a/${name}`), `Missing ${name}`);
console.log(
  JSON.stringify(
    {
      apk,
      package: packageName,
      minimumApi: 31,
      abi: "arm64-v8a",
      signing: developmentSigning
        ? "development"
        : "non-development (owner must verify certificate identity)",
      models: "optional weights absent; pinned download catalog verified",
      backup: "disabled",
      debuggable: false,
      productionSigningGate: flags.has("--production")
        ? "passed (not full release acceptance)"
        : "not requested",
    },
    null,
    2,
  ),
);
