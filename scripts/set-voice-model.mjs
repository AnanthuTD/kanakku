import { execFileSync } from "node:child_process";
// Selects the bundled offline Whisper model from the pinned catalog in
// scripts/voice-models.json. Downloads once into ~/.cache/kanakku, verifies the
// exact size and SHA-256, replaces the bundled asset and updates provenance.
//   npm run voice:model -- --list
//   npm run voice:model -- small-q5_1
// Then rebuild the APKs; the app reads src/native/voiceModel.json.
import { createHash } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(root, "scripts/voice-models.json"), "utf8"),
);
const assets = join(
  root,
  "modules/kanakku-native/android/src/main/assets/kanakku",
);
const selectedPath = join(root, "src/native/voiceModel.json");
const id = process.argv[2];

if (!id || id === "--list") {
  const current = existsSync(selectedPath)
    ? JSON.parse(readFileSync(selectedPath, "utf8")).id
    : undefined;
  for (const [key, model] of Object.entries(catalog.models))
    console.log(
      `${key === current ? "*" : " "} ${key.padEnd(12)} ${(model.bytes / 2 ** 20).toFixed(0).padStart(4)} MiB  ${model.note}`,
    );
  process.exit(id ? 0 : 1);
}
const model = catalog.models[id];
if (!model) throw new Error(`Unknown voice model ${id}; use --list`);

const sha256 = async (path) => {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
};
const verified = async (path) =>
  existsSync(path) &&
  statSync(path).size === model.bytes &&
  (await sha256(path)) === model.sha256;

const cache = join(homedir(), ".cache/kanakku/whisper");
mkdirSync(cache, { recursive: true });
const cached = join(cache, model.file);
if (!(await verified(cached))) {
  const url = `${catalog.source}/resolve/${catalog.revision}/${model.file}`;
  console.log(
    `Downloading ${model.file} (${(model.bytes / 2 ** 20).toFixed(0)} MiB)…`,
  );
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  const partial = `${cached}.partial`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  renameSync(partial, cached);
  if (!(await verified(cached))) {
    rmSync(cached, { force: true });
    throw new Error(
      "Downloaded model size or SHA-256 differs from the pinned catalog",
    );
  }
}

const asset = `whisper-${id}.bin`;
for (const name of readdirSync(assets))
  if (/^whisper-.*\.bin$/.test(name) && name !== asset)
    rmSync(join(assets, name));
copyFileSync(cached, join(assets, asset));
if (!(await verified(join(assets, asset))))
  throw new Error("Bundled copy does not match the pinned hash");

writeFileSync(
  selectedPath,
  JSON.stringify(
    {
      id,
      asset,
      sha256: model.sha256,
      bytes: model.bytes,
      label: model.label,
      languages: model.languages,
    },
    null,
    2,
  ) + "\n",
);
// Native code (floating companion) reads the same selection from the APK assets.
writeFileSync(
  join(assets, "voice-model.json"),
  JSON.stringify(
    { asset, sha256: model.sha256, languages: model.languages },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  join(assets, "WHISPER-MODEL.txt"),
  `Model: OpenAI ${model.label}
Converted/quantized model publisher: ggerganov/whisper.cpp
Source: ${catalog.source}
Revision: ${catalog.revision}
File: ${model.file} (bundled as ${asset})
Bytes: ${model.bytes}
SHA-256: ${model.sha256}
Original model: https://github.com/openai/whisper
License: MIT; see WHISPER-MIT.txt and WHISPER-CPP-MIT.txt.
Runtime: vendored whisper.cpp 0c7be69 via Kanakku JNI (ARMv8.2 CPU), offline bundled asset selected by scripts/set-voice-model.mjs.
Languages: ${model.languages.join(", ")}${model.languages.length > 1 ? "; auto-detection plus English translation" : "; English transcription only"}.
Audio stays in memory, limited to 15 seconds; no audio file or network fallback.
Recognized notes and categories remain editable. Evaluation note: ${model.note}
`,
);
console.log(
  `Selected ${id}. Rebuild the E2E and personal APKs, then run npm run verify:apk.`,
);

execFileSync(
  process.execPath,
  [join(root, "scripts/write-model-catalog.mjs")],
  { stdio: "inherit" },
);
