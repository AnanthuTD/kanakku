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
  /** How the journal opens: "device" asks for the phone lock, "open" uses a no-prompt hardware key. */
  lockMode?: LockMode;
  /** A recovery password has been set on this phone. */
  hasRecovery?: boolean;
  /** The screen-lock key was deleted by Android while a journal still exists. */
  keyRetired?: boolean;
}
export type LockMode = "device" | "open";
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
export type UnreadAlerts = { count: number; samples: string[] };
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
export interface GmailStatus {
  connected: boolean;
  accountLabel: string;
  state:
    "disconnected" | "connected" | "queued" | "syncing" | "reconnect" | "error";
  months: number;
  scanned: number;
  captured: number;
  ignored: number;
  lastSync: number;
  revoked?: boolean;
}
export interface ModelDownloadStatus {
  id: "voice" | "categories";
  state:
    | "missing"
    | "queued"
    | "downloading"
    | "verifying"
    | "waiting"
    | "ready"
    | "error";
  downloaded: number;
  total: number;
}
export interface DriveBackupProgress {
  operation: "backup" | "restore";
  phase:
    | "authorizing"
    | "encrypting"
    | "uploading"
    | "downloading"
    | "decrypting"
    | "applying";
  transferred: number;
  total: number;
}
interface KanakkuNative {
  geminiAccessStatus(): Promise<{ supported: boolean; enabled: boolean }>;
  setGeminiAccess(enabled: boolean): Promise<{ supported: boolean; enabled: boolean }>;
  setAssistantSnapshot(snapshot: string): Promise<boolean>;
  clearAssistantSnapshot(): Promise<boolean>;
  lockAssistantSession(): Promise<boolean>;
  assistantWriteSettings(): Promise<{ confirmChanges: boolean }>;
  setAssistantWriteConfirmation(enabled: boolean): Promise<boolean>;
  pendingAssistantAction(): Promise<string | null>;
  completeAssistantAction(id: string): Promise<boolean>;
  /** Uploads a passphrase-encrypted journal archive to this user's Drive. */
  backupToDrive(
    payload: string,
    password: string,
  ): Promise<{ fileName: string; modifiedTime: string }>;
  configureAutoBackup(
    payload: string,
    password: string,
    intervalDays: number,
  ): Promise<{
    fileName: string;
    modifiedTime: string;
    enabled: boolean;
    intervalDays: number;
  }>;
  autoBackupStatus(): Promise<{
    enabled: boolean;
    intervalDays: number;
    lastBackupAt: number;
    snapshotAt: number;
    state:
      "off" | "waiting" | "uploading" | "connected" | "reconnect" | "error";
    error: string;
  }>;
  saveAutoBackupSnapshot(payload: string): Promise<boolean>;
  runAutoBackupNow(payload: string): Promise<{
    enabled: boolean;
    intervalDays: number;
    lastBackupAt: number;
    snapshotAt: number;
    state:
      "off" | "waiting" | "uploading" | "connected" | "reconnect" | "error";
    error: string;
  }>;
  setAutoBackupInterval(intervalDays: number): Promise<{
    enabled: boolean;
    intervalDays: number;
    lastBackupAt: number;
    snapshotAt: number;
    state:
      "off" | "waiting" | "uploading" | "connected" | "reconnect" | "error";
    error: string;
  }>;
  disableAutoBackup(): Promise<{
    enabled: boolean;
    intervalDays: number;
    lastBackupAt: number;
    snapshotAt: number;
    state:
      "off" | "waiting" | "uploading" | "connected" | "reconnect" | "error";
    error: string;
  }>;
  /** Downloads and decrypts the latest Kanakku Drive backup. */
  restoreFromDrive(password: string): Promise<string>;
  gmailStatus(): Promise<GmailStatus>;
  connectGmail(months: number): Promise<GmailStatus>;
  syncGmail(): Promise<GmailStatus>;
  /** Ephemeral summaries only; never returns IDs or message bodies. */
  inspectGmailAlerts(): Promise<Record<string, unknown>[]>;
  disconnectGmail(): Promise<GmailStatus>;
  modelDownloads(): Promise<ModelDownloadStatus[]>;
  downloadModel(id: string): Promise<ModelDownloadStatus[]>;
  cancelModelDownload(id: string): Promise<ModelDownloadStatus[]>;
  removeModel(id: string): Promise<ModelDownloadStatus[]>;
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
  scheduleLendingReminder(id: string, dueAt: number): Promise<boolean>;
  cancelLendingReminder(id: string): Promise<boolean>;
  /** Private reminders three days before a card bill is due (on by default). */
  cardDueReminders(): Promise<boolean>;
  setCardDueReminders(enabled: boolean): Promise<boolean>;
  cancelCardDueReminder(id: string): Promise<boolean>;
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
  /** Only before the first connection. */
  chooseLockMode(mode: LockMode): Promise<LockMode>;
  /** Asks for the phone lock, then re-seals the journal key for the chosen mode. */
  setLockMode(mode: LockMode): Promise<LockMode>;
  setRecoveryPassword(password: string): Promise<boolean>;
  clearRecoveryPassword(): Promise<boolean>;
  /** Opens a journal whose screen-lock key Android deleted; resolves the journal key. */
  recoverJournal(password: string): Promise<string>;
  /** Bank alerts that looked like payments but could not be read; samples are masked shapes only. */
  unreadAlerts(): Promise<UnreadAlerts>;
  /** Sealed card statement alerts (JSON) waiting to move into the encrypted journal. */
  pendingStatements(): Promise<string[]>;
  acknowledgeStatements(ids: string[]): Promise<void>;
  clearUnreadAlerts(): Promise<UnreadAlerts>;
  reconcileHistory(): Promise<ImportProgress>;
  pauseImport(): Promise<ImportProgress>;
  resumeImport(): Promise<ImportProgress>;
  overlaySettings(): Promise<void>;
  previewFloatingPrompt(): Promise<"scheduled" | "permission">;
  setDebugVoiceClips(enabled: boolean): Promise<boolean>;
  /** Test build with clip diagnostics on: stores the app's text beside the newest clip. */
  saveDebugTranscript(text: string): Promise<boolean>;
  /** Verified optional Whisper model; missing models require an explicit Settings download. */
  voiceModelPath(asset: string, sha256: string): Promise<string>;
  setPreferences(
    overlay: boolean,
    dark: boolean,
    sounds: boolean,
  ): Promise<void>;
  tapSound(): Promise<void>;
  listen(): Promise<string>;
  cancelListening(): Promise<void>;
  addListener(
    name: string,
    listener: (event?: any) => void,
  ): { remove(): void };
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
      "Bank alert access wasn’t granted. Allow SMS in phone settings to connect alerts, or keep exploring sample data.",
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
