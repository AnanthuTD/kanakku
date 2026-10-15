#!/usr/bin/env node
// Downloads the two bundled ML models (excluded from git for size) and verifies their SHA-256
// against the pinned catalog before they are placed in the native module's assets.
// Used by the release workflow and by anyone building from a fresh clone.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const assets = join(
  root,
  "modules/kanakku-native/android/src/main/assets/kanakku",
);
const voice = JSON.parse(
  readFileSync(join(root, "src/native/voiceModel.json"), "utf8"),
);
const catalog = JSON.parse(
  readFileSync(join(root, "scripts/voice-models.json"), "utf8"),
);
const whisper = Object.values(catalog.models).find(
  (m) => m.sha256 === voice.sha256,
);
if (!whisper)
  throw new Error(
    "voiceModel.json does not match an entry in scripts/voice-models.json",
  );

const models = [
  {
    name: voice.asset,
    url: `${catalog.source}/resolve/${catalog.revision}/${whisper.file}`,
    sha256: voice.sha256,
  },
  {
    name: "minilm.onnx",
    url: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/1110a243fdf4706b3f48f1d95db1a4f5529b4d41/onnx/model_qint8_arm64.onnx",
    sha256: "4278337fd0ff3c68bfb6291042cad8ab363e1d9fbc43dcb499fe91c871902474",
  },
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
mkdirSync(assets, { recursive: true });
for (const model of models) {
  const target = join(assets, model.name);
  if (existsSync(target) && hash(readFileSync(target)) === model.sha256) {
    console.log(`ok       ${model.name} (already present, hash verified)`);
    continue;
  }
  process.stdout.write(`fetching ${model.name} … `);
  const response = await fetch(model.url);
  if (!response.ok) throw new Error(`${model.url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = hash(bytes);
  if (actual !== model.sha256)
    throw new Error(
      `${model.name}: SHA-256 ${actual} does not match pinned ${model.sha256}; refusing to use it`,
    );
  writeFileSync(target, bytes);
  console.log(`verified (${(bytes.length / 1048576).toFixed(1)} MiB)`);
}
