import { AppState, PermissionsAndroid } from "react-native";
import { native } from "./bridge";
import { logDiagnostic } from "./diagnostics";
import { VoicePhase } from "./voice.types";
import { voiceLanguages, voiceLanguageLabel } from "./voiceModel";
import voiceModel from "./voiceModel.json";

// Whisper fills silence and noise with stock captions. Never offer these as notes.
const FILLER =
  /^(you|thank you|thanks|bye|okay|\.+|\[[^\]]*\]|\([^)]*\)|(thank you|thanks) for watching.*|.*subscribe to (our|my|the) channel.*|please subscribe.*)$/i;
export function isWhisperFiller(text: string) {
  return FILLER.test(text.trim().replace(/[.!\s]+$/, ""));
}

type Session = {
  cancelled: boolean;
  /** Rejects the caller immediately when the user cancels. */
  abort: (error: Error) => void;
  aborted: Promise<never>;
  /** Settles after native recording and inference have stopped. */
  done: Promise<void>;
};
let active: Session | undefined;
export const isVoiceActive = () => !!active;
// A cancelled session may still be stopping inference and freeing the model.
const CLEANUP_WAIT_MS = 15000;
const cancelled = () =>
  new Error("Voice cancelled. You can type a note instead.");
function check(session: Session) {
  if (session.cancelled || AppState.currentState !== "active")
    throw cancelled();
}
export function cancelVoice() {
  if (!active) return;
  active.cancelled = true;
  active.abort(cancelled());
  native?.cancelAudio().catch(() => {});
  native?.stopTranscription().catch(() => {});
}
export function finishVoice() {
  native?.finishAudio().catch(() => {});
}

/** No cloud service or audio file. Audio stays in native memory; the model is freed after each answer. */
/** Test build only, opt-in: keep the app's text beside the saved clip for comparison. */
function diagnose(text: string) {
  if (native?.status().debugVoiceClips)
    native.saveDebugTranscript(text).catch(() => {});
}

/** Greedy decoding often drops capitals and the final stop; add only those. */
export function formatNote(text: string) {
  const note = text.trim().replace(/\s+/g, " ");
  if (!note) return note;
  const capital = note[0].toUpperCase() + note.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

/** A short on-device vocabulary hint; only letters, digits and spaces from the merchant name. */
export function voiceHint(merchant?: string) {
  const name = (merchant ?? "")
    .replace(/[^\p{L}\p{N} &'.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  // VPAs, card numbers and other identifier-like labels are not useful hints.
  return name && !/\d{4,}/.test(name) ? `Payment at ${name}.` : undefined;
}

export async function listen(
  onPhase?: (phase: VoicePhase) => void,
  merchant?: string,
): Promise<string> {
  if (!native)
    throw new Error(
      "Voice requires the Kanakku Android build. Type a note instead.",
    );
  if (native.status().voiceSupported === false)
    throw new Error(
      "Offline voice needs a newer phone processor. Type your answer instead.",
    );
  const previous = active;
  if (previous && !previous.cancelled)
    throw new Error(
      "A voice session is finishing. Please try again in a moment.",
    );
  if (previous) {
    // The user cancelled; wait for its cleanup instead of refusing the new tap.
    onPhase?.("preparing");
    await Promise.race([
      previous.done,
      new Promise((resolve) => setTimeout(resolve, CLEANUP_WAIT_MS)),
    ]);
    if (active === previous)
      throw new Error(
        "The previous voice note is still stopping. Please try again in a moment.",
      );
    if (active)
      throw new Error(
        "A voice session is finishing. Please try again in a moment.",
      );
  }
  let abort!: (error: Error) => void;
  const aborted = new Promise<never>((_, reject) => {
    abort = reject;
  });
  aborted.catch(() => {});
  let finished!: () => void;
  const done = new Promise<void>((resolve) => {
    finished = resolve;
  });
  const session: Session = { cancelled: false, abort, aborted, done };
  active = session;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inference: Promise<unknown> | undefined;
  let stage = "permission";
  const background = AppState.addEventListener("change", (state) => {
    if (state !== "active") cancelVoice();
  });
  const work = (async () => {
    try {
      const permission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      check(session);
      if (permission !== PermissionsAndroid.RESULTS.GRANTED)
        throw new Error(
          "Microphone access is off. Type your answer or choose a category.",
        );
      onPhase?.("preparing");
      stage = "model";
      // Selected with npm run voice:model; see scripts/voice-models.json.
      const modelPath = await native.voiceModelPath(
        voiceModel.asset,
        voiceModel.sha256,
      );
      check(session);
      onPhase?.("listening");
      stage = "recording";
      // The clip stays in native memory; only its sample count returns here.
      await native.recordAudio();
      check(session);
      onPhase?.("transcribing");
      stage = "transcription";
      const task = native.transcribeVoice(
        modelPath,
        // English-only models must not translate; multilingual ones translate to English.
        voiceLanguages.length === 1 ? voiceLanguages[0] : "auto",
        voiceLanguages.some((language) => language !== "en"),
        // Biases spelling of the payee (e.g. "Bombay Cafe"); stays on the phone.
        voiceHint(merchant) ?? null,
        4,
      );
      inference = task;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          native?.stopTranscription().catch(() => {});
          reject(
            new Error(
              "Voice took too long. Try a shorter phrase or type a note.",
            ),
          );
        }, 60000);
      });
      const result = await Promise.race([task, timeout]);
      check(session);
      stage = "result";
      const text = result.text.trim();
      if (
        result.aborted ||
        !text ||
        isWhisperFiller(text) ||
        !voiceLanguages.includes(result.language)
      )
        throw new Error(
          `Couldn't understand that ${voiceLanguageLabel} phrase. Try again or type a note.`,
        );
      const note = formatNote(text);
      diagnose(note);
      return note;
    } catch (error) {
      if (session.cancelled) throw cancelled();
      diagnose(
        `[${stage} failed] ${error instanceof Error ? error.message : String(error)}`,
      );
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "VOICE_RECORDING_FAILED" &&
        error.message.startsWith("No clear speech detected.")
      )
        throw new Error("No clear speech detected. Try again or type a note.");
      // Stage and error code only: never audio, transcript or error text.
      const code =
        (error instanceof Error && "code" in error && String(error.code)) ||
        (error instanceof Error ? error.name : typeof error);
      console.warn(`[voice] ${stage} failed (${code})`);
      logDiagnostic("warn", "voice", "failed", { stage, code });
      // These explicit errors contain no microphone data or model output.
      if (
        error instanceof Error &&
        /^(Microphone access|Voice took|Couldn't understand)/.test(
          error.message,
        )
      )
        throw error;
      throw new Error(
        "Offline voice couldn't finish. Try again or type your answer.",
      );
    } finally {
      if (timer) clearTimeout(timer);
      background.remove();
      await native.cancelAudio().catch(() => {});
      // Never start another transcription while this one is still unwinding.
      await inference?.catch(() => {});
      if (active === session) active = undefined;
      finished();
    }
  })();
  work.catch(() => {});
  // Cancelling returns control at once; cleanup above continues in the background.
  return Promise.race([work, aborted]);
}
