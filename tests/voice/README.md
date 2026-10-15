# Actual-audio Whisper fixtures

This frozen corpus tests real decoding and English-note translation using eight WAV files. It does not mock recognition and contains no user recordings, payment messages, personal account information, or API credentials.

Six clips are human speech from Google's openly licensed **FLEURS test split**: three English and three Malayalam recordings of matched source sentences. They cover hot chocolate/juice, a bus route, and a motorcycle taxi fare. These are read sentences about travel and drinks, not spontaneous payment notes. The two controls are programmatically generated four-second silence and low-amplitude seeded white noise, not recorded environmental noise.

## Attribution and permitted reuse

Natural recordings/transcripts: **Alexis Conneau et al., Google (2022), FLEURS: Few-shot Learning Evaluation of Universal Representations of Speech**, [dataset](https://huggingface.co/datasets/google/fleurs), [paper](https://arxiv.org/abs/2205.12446), **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**. Google confirms the license in [its dataset discussion](https://huggingface.co/datasets/google/fleurs/discussions/2). Keep this attribution with redistributed recordings. Original transcript punctuation/case are retained in the manifest. Recordings were converted from float32 WAV to signed PCM16 with ffmpeg; duration/sample rate were preserved. No content edits, crops, time stretching, or denoising were applied.

Pinned source revision: `70bb2e84b976b7e960aa89f1c648e09c59f894dd`. The manifest records original filename, sentence ID, pinned source archive/transcript URLs, original audio SHA-256, normalized final audio SHA-256, and dataset speaker-gender label. A label does not establish speaker identity or accent.

The generated silence/noise controls are dedicated to **CC0 1.0**. Their generation is in `fetch_fixtures.py`. No Apple system voice recordings are included: this computer has Indian-English macOS voices, but no Malayalam system voice, and using a public human-speech corpus avoids generated-voice reuse restrictions and conflating TTS quality with recognition quality.

## Fixture contract

`manifest.json` contains `fixtures[]` with:

- `id`, `language` (`en`, `ml`, or `none`), `file`, and `kind`.
- `expectedSourceText`: dataset-provided English or Malayalam transcript.
- `expectedEnglishText`: aligned English source sentence, checked for the same core meaning as the Malayalam text. It is a reference, not the only acceptable translation.
- `requiredEnglishConcepts`: predefined lexical meaning proxies, frozen before recognition was run.
- `sampleRate: 16000`, `channels: 1`, `sampleWidth: 2`, `durationSeconds`, and `sha256`.

All WAVs are mono 16 kHz PCM signed 16-bit. Clips last 6.42–13.44 seconds; controls last four seconds. These files exercise model decoding. Injecting files into a test hook does not prove microphone permissions, actual recording, endpointing, real-time latency, or dismiss/background cancellation.

## Scoring actual outputs

First verify fixtures and scorer behavior:

```sh
node scripts/evaluate-whisper-audio.mjs --verify
node --test tests/voice/scorer-checks.mjs
```

Supply **actual** output from the bundled Android Whisper runtime, with one result per fixture:

```json
{
  "results": [
    {
      "id": "ml-natural-bus",
      "task": "translate",
      "text": "ACTUAL MODEL OUTPUT GOES HERE",
      "modelSha256": "record the actual model hash",
      "elapsedMs": 0
    }
  ]
}
```

The example is schema documentation, not a successful recognition result. Use `transcribe` for English and `translate` for Malayalam to exercise the current English-note product behavior. Controls may run under either language selection, but each output in one report must have a unique fixture ID. Run separate reports if comparing settings. Attach any runtime exception as an `error` string; an exception cannot count as successful rejection of silence.

```sh
node scripts/evaluate-whisper-audio.mjs artifacts/ACTUAL-OUTPUT.json artifacts/ACTUAL-SCORE.json
```

The scorer exits nonzero when cases are missing, unknown/duplicated, errored, or fail the frozen criteria:

- **English:** all predefined meaning proxies must survive and punctuation/case-normalized word error rate (WER) must be at most 0.35. WER preserves number errors and word insertions. It does not silently equate 500 with 600.
- **Malayalam → English:** all predefined meaning proxies must survive. English-reference WER is reported only as a diagnostic because valid translations have different wording. Malayalam `transcribe` results are diagnostic and cannot pass the English-note gate.
- **Silence/noise:** no invented words and no runtime exception.

The conservative lexical checks include bus number/destination/stop, drinks and price/taste, and taxi fare/currency/distance. They do not establish semantic correctness: an output could include every keyword while reversing meaning. Read every transcript alongside the references, inspect missed concepts/numbers/negation, and record human review before interpreting automatic passes. Acceptance criteria must not be loosened after observing failures merely to produce a passing report.

## Interpretation

A successful run proves recognition/translation on these exact audio inputs with the recorded APK, runtime, model hash, and settings. It is a small regression corpus, **not a Malayalam accuracy estimate**. The Malayalam selection contains three female-labelled read recordings, not dialect diversity, code-switching, personal accents, noisy devices, or spontaneous payment descriptions. English is the `en_us` FLEURS subset; it does not prove Indian-English coverage.

If Malayalam translation is poor, preserve the failure report and compare larger multilingual models or actual consented recordings before dropping the preferred language. Tiny quantized Whisper may be the limiting factor; failing this bundled model does not mean Malayalam recognition is generally unsupported. Keep typing/editing available and do not automatically save an unreviewed voice interpretation.

## Recreate licensed input files

The existing committed fixtures require no network. Recreating them downloads pinned public archives and extracts only the selected files without extracting arbitrary archive paths. It needs Python 3 and ffmpeg, no extra Python packages, service account, or secret:

```sh
python3 tests/voice/fetch_fixtures.py
node scripts/evaluate-whisper-audio.mjs --verify
```

Archives are streamed, not kept. Depending on archive ordering, fetching these six clips may still transfer hundreds of megabytes. Manifest hashes catch later fixture changes.
