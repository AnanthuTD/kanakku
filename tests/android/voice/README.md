# Real emulator microphone / Whisper checks

This uses the Android emulator's genuine microphone injection RPC. Audio reaches the app's normal Android `AudioRecord` path; there is no app test endpoint or transcript mock. Only frozen public WAV fixtures from `tests/voice/manifest.json` are allowed. Read [fixture provenance and scoring](../../voice/README.md) first. Do not use private recordings, another AVD, the personal package, or a real host microphone.

The dedicated `Kanakku_API_36` AVD must be running at `emulator-5580`, with authenticated local gRPC enabled. On this host the emulator discovery descriptor is under `~/Library/Caches/TemporaryItems/avd/running/`. The helper reads only the matching live AVD's descriptor, uses its bearer token in memory, and never prints it. Host microphone access must already be disabled; the helper refuses an enabled host mic instead of changing that setting. The emulator currently advertises port 8580; discovery determines the current port.

One-time Python dependencies (not app dependencies):

```sh
python3 -m venv .venv-android-tests
.venv-android-tests/bin/python -m pip install grpcio grpcio-tools
```

Read-only authenticated connection / microphone-state check:

```sh
.venv-android-tests/bin/python scripts/inject-emulator-audio.py --check-only
```

Build/install the current isolated `app.tinkerbox.kanakku.e2e` APK first. Coordinate exclusive device ownership with other Android tests. Open a sample payment's review, tap its microphone action, allow the Android microphone permission if requested, and wait until the app shows Listening. Then, while that app remains foreground:

```sh
.venv-android-tests/bin/python scripts/inject-emulator-audio.py \
  tests/voice/audio/en-natural-drinks.wav
```

Use the same path for Malayalam (`ml-natural-drinks.wav`), the other frozen sentence pairs, and noise/silence controls. The SDK protobuf bindings are generated from the installed `emulator/lib/emulator_controller.proto` into `artifacts/grpc`; regeneration is keyed by the proto's SHA-256. Injection is mono 16 kHz PCM16 in chunks of at most 100 ms, using `MODE_UNSPECIFIED` so the emulator blocks until Android asks for microphone frames. The RPC has a 45-second deadline; fixtures cannot exceed the app's 15-second recording limit. It never enables host audio, launches the app, starts recording, alters settings, clears data, or saves audio on Android.

An injection-completed JSON line proves only successful submission to the emulator RPC. **It does not prove that Kanakku recorded every frame or that Whisper recognized it.** Capture the actual editable note from the app UI after its Understanding phase, check for dropped onset/tail, preserve the full recognized text and timing as public-fixture evidence, and score it with `scripts/evaluate-whisper-audio.mjs`. Keep English recognition, Malayalam translation, and silence/noise failures visible. Preserve editable-note/category fallback and never save a category automatically.

The app's silence completion and startup timing can affect a long fixture. A slow UI hierarchy query can use up its six-second no-speech window before injection even begins. Prefer a fast AudioFlinger active-input check immediately after the microphone action; inject after Android has opened its recording stream. Do not pre-register injection before the recording stream exists. If the helper hits `DEADLINE_EXCEEDED`, first check whether the app stopped recording; do not call it model failure or switch to a transcript mock. The helper reports RPC-start timing and submitted-frame counts on errors; gRPC client submission alone does not prove Android consumption. It verifies that the host microphone gate remains disabled after successful teardown.

AOSP's forwarding driver temporarily opens its internal audio gate while supplying injected PCM, then restores the previous state. This is part of the emulator's injection implementation; do not manually enable real microphone access. `MODE_UNSPECIFIED` waits for guest consumption. Switching to experimental real-time mode could finish while overwriting unheard samples and is not equivalent proof. See [forwarding driver](https://android.googlesource.com/platform/external/qemu/+/f0c183f1cc7456ecd6f3607f2f47893768ae4334/audio/audio_forwarder.c) and [virtio recording-stream registration](https://android.googlesource.com/platform/external/qemu/+/f0c183f1cc7456ecd6f3607f2f47893768ae4334/hw/audio/virtio-snd.c) for the source basis; this source commit is diagnostic reference, not a claim of exact installed binary provenance.

Real phone microphone quality, dialects, Indian English, code switching, battery use and hardware latency still need physical acceptance even if the public emulator fixtures pass.

Primary implementation reference: [AOSP microphone injection sample](https://android.googlesource.com/platform/external/qemu/+/08aefd1f57c653d17e9ef972df9d82c978f7695c/android/android-grpc/python/samples/audio/inject_audio.py). The installed SDK proto documents the blocking delivery mode, buffer and host microphone-state RPC.
