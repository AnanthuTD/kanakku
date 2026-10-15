import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  permission: vi.fn(),
  model: vi.fn(),
  record: vi.fn(),
  cancel: vi.fn(),
  finish: vi.fn(),
  transcribe: vi.fn(),
  stop: vi.fn(),
  change: undefined as undefined | ((state: string) => void),
}));
vi.mock("react-native", () => ({
  PermissionsAndroid: {
    request: mock.permission,
    PERMISSIONS: { RECORD_AUDIO: "mic" },
    RESULTS: { GRANTED: "granted" },
  },
  AppState: {
    currentState: "active",
    addEventListener: (_: string, callback: (state: string) => void) => {
      mock.change = callback;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock("./bridge", () => ({
  native: {
    recordAudio: mock.record,
    status: () => ({ debugVoiceClips: false }),
    saveDebugTranscript: vi.fn(async () => true),
    voiceModelPath: mock.model,
    transcribeVoice: mock.transcribe,
    stopTranscription: mock.stop,
    cancelAudio: mock.cancel,
    finishAudio: mock.finish,
  },
}));
import {
  listen,
  cancelVoice,
  finishVoice,
  isWhisperFiller,
  voiceHint,
  formatNote,
} from "./voice.native";
import voiceModel from "./voiceModel.json";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const modelPath = `/private/models/${voiceModel.asset}`;
const spoken = (text: string, language = "en", aborted = false) => ({
  text,
  language,
  aborted,
});
beforeEach(() => {
  vi.clearAllMocks();
  mock.permission.mockResolvedValue("granted");
  mock.model.mockResolvedValue(modelPath);
  mock.cancel.mockResolvedValue(undefined);
  mock.finish.mockResolvedValue(undefined);
  mock.stop.mockResolvedValue(undefined);
  mock.record.mockResolvedValue(48000);
  mock.transcribe.mockResolvedValue(spoken(" Auto to office "));
});
it("transcribes an English answer with the verified local model", async () => {
  const phases: string[] = [];
  expect(await listen((phase) => phases.push(phase))).toBe("Auto to office.");
  expect(phases).toEqual(["preparing", "listening", "transcribing"]);
  expect(mock.model).toHaveBeenCalledWith(voiceModel.asset, voiceModel.sha256);
  // Audio never crosses into JS: transcription reads the clip kept natively.
  expect(mock.transcribe).toHaveBeenCalledWith(modelPath, "en", false, null, 4);
  expect(mock.cancel).toHaveBeenCalledOnce();
});
it("does not open the microphone when permission is denied", async () => {
  mock.permission.mockResolvedValue("denied");
  await expect(listen()).rejects.toThrow("Microphone access is off");
  expect(mock.model).not.toHaveBeenCalled();
  expect(mock.record).not.toHaveBeenCalled();
});
it("reports no detected speech as a recoverable recording result", async () => {
  mock.record.mockRejectedValueOnce(
    Object.assign(
      new Error("No clear speech detected. Try again or type a note."),
      { code: "VOICE_RECORDING_FAILED" },
    ),
  );
  await expect(listen()).rejects.toThrow("No clear speech detected.");
  expect(mock.transcribe).not.toHaveBeenCalled();
  expect(mock.cancel).toHaveBeenCalledOnce();
});
it("cancelling model preparation prevents recording", async () => {
  const ready = deferred<string>();
  mock.model.mockReturnValue(ready.promise);
  const result = listen();
  await vi.waitFor(() => expect(mock.model).toHaveBeenCalledOnce());
  cancelVoice();
  ready.resolve(modelPath);
  await expect(result).rejects.toThrow("cancelled");
  expect(mock.record).not.toHaveBeenCalled();
});
it("backgrounding aborts inference and discards a late transcript", async () => {
  const inference = deferred<ReturnType<typeof spoken>>();
  mock.transcribe.mockReturnValue(inference.promise);
  const result = listen();
  await vi.waitFor(() => expect(mock.transcribe).toHaveBeenCalledOnce());
  mock.change?.("background");
  inference.resolve(spoken("late private note"));
  await expect(result).rejects.toThrow("cancelled");
  expect(mock.stop).toHaveBeenCalledOnce();
});
it("finish keeps the clip for decoding; overlapping sessions are refused", async () => {
  const clip = deferred<number>();
  mock.record.mockReturnValue(clip.promise);
  const result = listen();
  await vi.waitFor(() => expect(mock.record).toHaveBeenCalledOnce());
  await expect(listen()).rejects.toThrow("session is finishing");
  finishVoice();
  expect(mock.finish).toHaveBeenCalledOnce();
  clip.resolve(32000);
  await expect(result).resolves.toBe("Auto to office.");
});
it("rejects stock filler captions and other languages", async () => {
  mock.transcribe.mockResolvedValueOnce(
    spoken(" Thank you for watching this video. "),
  );
  await expect(listen()).rejects.toThrow("Couldn't understand");
  mock.transcribe.mockResolvedValueOnce(spoken("hola", "es"));
  await expect(listen()).rejects.toThrow("Couldn't understand");
  for (const filler of [
    "you",
    " Thank you. ",
    "[BLANK_AUDIO]",
    "Please subscribe!",
  ])
    expect(isWhisperFiller(filler)).toBe(true);
  for (const note of [
    "Thank you gift for Amma",
    "auto to office",
    "you owe rent",
  ])
    expect(isWhisperFiller(note)).toBe(false);
});
it("cancel returns at once and a new tap waits for native inference to stop", async () => {
  const inference = deferred<ReturnType<typeof spoken>>();
  mock.transcribe.mockReturnValueOnce(inference.promise);
  const first = listen();
  await vi.waitFor(() => expect(mock.transcribe).toHaveBeenCalledOnce());
  cancelVoice();
  // The caller is released before native inference has stopped.
  await expect(first).rejects.toThrow("cancelled");
  expect(mock.stop).toHaveBeenCalledOnce();
  const second = listen();
  await Promise.resolve();
  expect(mock.model).toHaveBeenCalledOnce();
  // The aborted native run finishes; only then does the new session start.
  inference.resolve(spoken("", "en", true));
  expect(await second).toBe("Auto to office.");
  expect(mock.model).toHaveBeenCalledTimes(2);
  expect(mock.transcribe).toHaveBeenCalledTimes(2);
});
it("hints the payee name to Whisper but never identifier-like labels", async () => {
  expect(await listen(undefined, "Bombay Cafe")).toBe("Auto to office.");
  expect(mock.transcribe).toHaveBeenCalledWith(
    modelPath,
    "en",
    false,
    "Payment at Bombay Cafe.",
    4,
  );
  expect(voiceHint("shop.9876543210@upi")).toBeUndefined();
  expect(voiceHint("  ")).toBeUndefined();
  expect(voiceHint("Rahul S")).toBe("Payment at Rahul S.");
});
it("formats notes with a capital and a final stop only", () => {
  expect(formatNote(" two packets of milk  one butter ")).toBe(
    "Two packets of milk one butter.",
  );
  expect(formatNote("Hi, how are you?")).toBe("Hi, how are you?");
  expect(formatNote("")).toBe("");
});
