import { requireOptionalNativeModule } from "expo-modules-core";
import { PermissionsAndroid, Platform } from "react-native";
import type {
  MerchantLookupPreferences,
  MerchantQueryKind,
} from "../domain/merchantLookup";
export interface NativeStatus {
  sms: boolean;
  overlay: boolean;
  capture: boolean;
  offlineVoice: boolean;
  overlayEnabled: boolean;
  sounds: boolean;
  /** True only for the isolated app.tinkerbox.kanakku.e2e package. */
  testBuild?: boolean;
  diagnostics?: boolean;
  /** False on processors without ARMv8.2 fp16/dot-product support. */
  voiceSupported?: boolean;
  debugVoiceClips?: boolean;
}
export interface ReviewPreferences {
  notifications: boolean;
  quietEnabled: boolean;
  quietStart: number;
  quietEnd: number;
  reminder: boolean;
  reminderTime: number;
}
export const defaultReviewPreferences: ReviewPreferences = {
  notifications: true,
  quietEnabled: false,
  quietStart: 1320,
  quietEnd: 480,
  reminder: false,
  reminderTime: 1140,
};
export interface ImportProgress {
  state:
    "idle" | "queued" | "running" | "waiting" | "paused" | "error" | "complete";
  months: number;
  since: number;
  until: number;
  scanned: number;
  captured: number;
  total: number;
  phase: "recent" | "older";
  pending: number;
  error: string;
  backfill: boolean;
  coverageSince: number;
  coverageUntil: number;
}
export const emptyImport: ImportProgress = {
  state: "idle",
  months: 1,
  since: 0,
  until: 0,
  scanned: 0,
  captured: 0,
  total: -1,
  phase: "recent",
  pending: 0,
  error: "",
  backfill: false,
  coverageSince: -1,
  coverageUntil: 0,
};
interface KanakkuNative {
  /** On-device OCR from an ephemeral app-cache photo; never uploaded. */
  recognizeReceipt(uri: string): Promise<{ text: string }>;
  status(): NativeStatus;
  unlock(): Promise<string>;
  suggestCategory(
    text: string,
  ): Promise<{ category: string; similarity: number; margin: number }>;
  saveRules(rules: { merchant: string; category: string }[]): Promise<void>;
  merchantLookupSettings(): Promise<MerchantLookupPreferences>;
  configureMerchantLookup(
    enabled: boolean,
    automatic: boolean,
    key: string,
  ): Promise<MerchantLookupPreferences>;
  lookupMerchant(
    merchant: string,
    manuallyApproved: boolean,
    kind: MerchantQueryKind,
  ): Promise<string>;
  cancelMerchantLookup(): Promise<void>;
  removeMerchantLookup(): Promise<MerchantLookupPreferences>;
  reviewSettings(): Promise<ReviewPreferences>;
  saveReviewSettings(
    notifications: boolean,
    quiet: boolean,
    start: number,
    end: number,
    reminder: boolean,
    time: number,
  ): Promise<ReviewPreferences>;
  setReviewCount(count: number): Promise<void>;
  securityStatus(): Promise<{
    deviceSecure: boolean;
    vaultReady: boolean;
    backing: string;
  }>;
  resetVault(confirmation: string): Promise<void>;
  /** Records into native memory and resolves with the number of samples kept. */
  recordAudio(): Promise<number>;
  /** Transcribes and clears the kept clip with the bundled whisper.cpp engine. */
  transcribeVoice(
    model: string,
    language: string,
    translate: boolean,
    prompt: string | null,
    threads: number,
  ): Promise<{ text: string; language: string; aborted: boolean }>;
  stopTranscription(): Promise<void>;
  finishAudio(): Promise<void>;
  cancelAudio(): Promise<void>;
  pending(): Promise<string[]>;
  acknowledge(ids: string[]): Promise<void>;
  /** Sealed floating-companion answers (needs the unlocked ledger key). */
  takeCompanionDraft(
    id: string,
  ): Promise<{ note: string; category?: string } | null>;
  pendingAnswers(): Promise<string[]>;
  /** Beta diagnostics (local log; scrubbed natively). Detail is a JSON object string. */
  logDiagnostic(
    level: string,
    source: string,
    event: string,
    detail: string,
  ): Promise<void>;
  setDiagnostics(enabled: boolean): Promise<boolean>;
  clearDiagnostics(): Promise<void>;
  acknowledgeAnswers(ids: string[]): Promise<void>;
  setCapture(enabled: boolean): Promise<void>;
  importHistory(months: number): Promise<ImportProgress>;
  importStatus(): Promise<ImportProgress>;
  reconcileHistory(): Promise<ImportProgress>;
  pauseImport(): Promise<ImportProgress>;
  resumeImport(): Promise<ImportProgress>;
  overlaySettings(): Promise<void>;
  previewFloatingPrompt(): Promise<"scheduled" | "permission">;
  setDebugVoiceClips(enabled: boolean): Promise<boolean>;
  /** Test build only: waive FLAG_SECURE so a verification screen recording can see the screen. */
  setRecordingMode(enabled: boolean): Promise<boolean>;
  /** Test build with clip diagnostics on: stores the app's text beside the newest clip. */
  saveDebugTranscript(text: string): Promise<boolean>;
  /** Verified private copy of the bundled Whisper model (made once per model). */
  voiceModelPath(asset: string, sha256: string): Promise<string>;
  setPreferences(
    overlay: boolean,
    dark: boolean,
    sounds: boolean,
  ): Promise<void>;
  tapSound(): Promise<void>;
  listen(): Promise<string>;
  cancelListening(): Promise<void>;
  addListener(name: string, listener: () => void): { remove(): void };
}
export const native =
  Platform.OS === "android"
    ? requireOptionalNativeModule<KanakkuNative>("KanakkuNative")
    : null;
export async function requestSms() {
  if (!native)
    throw new Error(
      "SMS capture needs the Kanakku Android development build. This preview uses sample data.",
    );
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.READ_SMS,
    PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
  ]);
  if (
    Object.values(result).some(
      (value) => value !== PermissionsAndroid.RESULTS.GRANTED,
    )
  )
    throw new Error(
      "SMS permission was not granted. You can keep exploring the sample data.",
    );
}
export async function requestNotifications() {
  if (!native)
    throw new Error("Notifications are available in the Android build.");
  if (Number(Platform.Version) < 33) return true;
  return (
    (await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    )) === PermissionsAndroid.RESULTS.GRANTED
  );
}
