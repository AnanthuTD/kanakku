// Small, pinned metadata shipped in the APK; model weights are optional downloads.
import { readFileSync, writeFileSync } from "node:fs";
const voice = JSON.parse(
  readFileSync(new URL("../src/native/voiceModel.json", import.meta.url)),
);
const catalog = JSON.parse(
  readFileSync(new URL("./voice-models.json", import.meta.url)),
);
const selected = Object.values(catalog.models).find(
  (m) => m.sha256 === voice.sha256,
);
if (!selected || selected.bytes !== voice.bytes)
  throw Error("Voice selection differs from pinned catalog");
const models = [
  {
    id: "voice",
    label: "English voice",
    description: "Transcribe short voice notes on this phone.",
    asset: voice.asset,
    bytes: voice.bytes,
    sha256: voice.sha256,
    url: `${catalog.source}/resolve/${catalog.revision}/${selected.file}`,
  },
  {
    id: "categories",
    label: "Smart category suggestions",
    description:
      "Suggest categories for unclear merchants and notes on this phone.",
    asset: "minilm.onnx",
    bytes: 23026053,
    sha256: "4278337fd0ff3c68bfb6291042cad8ab363e1d9fbc43dcb499fe91c871902474",
    url: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/1110a243fdf4706b3f48f1d95db1a4f5529b4d41/onnx/model_qint8_arm64.onnx",
  },
];
for (const p of [
  "../src/native/modelCatalog.json",
  "../modules/kanakku-native/android/src/main/assets/kanakku/model-downloads.json",
])
  writeFileSync(
    new URL(p, import.meta.url),
    JSON.stringify(models, null, 2) + "\n",
  );
console.log("Pinned optional-model catalog written (no downloads).");
