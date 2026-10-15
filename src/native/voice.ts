import { VoicePhase } from "./voice.types";
export async function listen(
  _onPhase?: (phase: VoicePhase) => void,
  _merchant?: string,
): Promise<string> {
  throw new Error(
    "Voice notes are available in the Android build. Type a note here.",
  );
}
export function cancelVoice() {}
export function finishVoice() {}

export const isVoiceActive = () => false;
