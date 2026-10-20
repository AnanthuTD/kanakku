import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Cloud } from "lucide-react-native";
import {
  makeJournalBackup,
  parseJournalBackup,
  type JournalBackup,
} from "../domain/backup";
import { native } from "../native/bridge";
import { useApp } from "../state/AppContext";
import { Button, SectionTitle, Text, styles as ui } from "./ui";
import { Sheet } from "./Sheet";

const MIN_PASSWORD = 12;

export function DriveBackupSettings({
  onLayout,
}: {
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const app = useApp();
  const { colors } = app;
  const available = !!native && app.mode === "live" && !app.locked;
  const importing = ["queued", "running", "waiting"].includes(
    app.importProgress.state,
  );
  const [sheet, setSheet] = useState<"backup" | "restore" | "auto" | "confirm" | null>(
    null,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [restore, setRestore] = useState<JournalBackup | null>(null);
  const [autoSchedule, setAutoSchedule] = useState<{
    enabled: boolean;
    intervalDays: number;
    lastBackupAt: number;
    snapshotAt: number;
    state: string;
    error: string;
  }>({
    enabled: false,
    intervalDays: 7,
    lastBackupAt: 0,
    snapshotAt: 0,
    state: "off",
    error: "",
  });

  const refreshAutoSchedule = () =>
    native?.autoBackupStatus().then(setAutoSchedule).catch(() => {});
  useEffect(() => {
    refreshAutoSchedule();
  }, [app.mode, app.locked]);
  useEffect(() => {
    if (!autoSchedule?.enabled) return;
    const timer = setInterval(() => {
      native?.autoBackupStatus().then(setAutoSchedule).catch(() => {});
    }, 15_000);
    return () => clearInterval(timer);
  }, [autoSchedule?.enabled]);

  const begin = (action: "backup" | "restore" | "auto") => {
    setFailure("");
    setPassword("");
    setPasswordConfirm("");
    setSheet(action);
  };
  const doBackup = async () => {
    if (password.length < MIN_PASSWORD) {
      setFailure(
        `Use at least ${MIN_PASSWORD} characters for the backup password.`,
      );
      return;
    }
    if (password !== passwordConfirm) {
      setFailure("The passwords do not match.");
      return;
    }
    if (!native) return;
    setBusy(true);
    setFailure("");
    try {
      const snapshot = makeJournalBackup(app.transactions, app.rules, {
        recurringDecisions: app.recurringDecisions,
        customCategories: app.customCategories,
        loans: app.loans,
      });
      const result = await native.backupToDrive(
        JSON.stringify(snapshot),
        password,
      );
      const date = result.modifiedTime
        ? new Date(result.modifiedTime).toLocaleString()
        : "now";
      setMessage(`Encrypted backup saved to Google Drive · ${date}`);
      setSheet(null);
      setPassword("");
      setPasswordConfirm("");
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "Could not back up your journal.",
      );
    } finally {
      setBusy(false);
    }
  };
  const enableAutoBackup = async () => {
    if (password.length < MIN_PASSWORD) {
      setFailure(`Use at least ${MIN_PASSWORD} characters for the backup password.`);
      return;
    }
    if (password !== passwordConfirm) {
      setFailure("The passwords do not match.");
      return;
    }
    if (!native) return;
    setBusy(true);
    setFailure("");
    try {
      const snapshot = makeJournalBackup(app.transactions, app.rules, {
        recurringDecisions: app.recurringDecisions,
        customCategories: app.customCategories,
        loans: app.loans,
      });
      const result = await native.configureAutoBackup(
        JSON.stringify(snapshot), password, autoSchedule?.intervalDays ?? 7,
      );
      const date = result.modifiedTime
        ? new Date(result.modifiedTime).toLocaleString()
        : "now";
      setMessage(`Automatic backup is on · first encrypted copy saved ${date}`);
      setAutoSchedule(await native.autoBackupStatus());
      setSheet(null);
      setPassword("");
      setPasswordConfirm("");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not enable automatic backup.");
    } finally {
      setBusy(false);
    }
  };
  const changeAutoInterval = async (days: number) => {
    if (!native || busy) return;
    setBusy(true);
    try {
      setAutoSchedule(await native.setAutoBackupInterval(days));
      setMessage(`Automatic backup frequency changed to ${days === 1 ? "daily" : days === 7 ? "weekly" : "monthly"}.`);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not change the backup schedule.");
    } finally {
      setBusy(false);
    }
  };
  const turnOffAutoBackup = async () => {
    if (!native || busy) return;
    setBusy(true);
    try {
      setAutoSchedule(await native.disableAutoBackup());
      setMessage("Automatic backups are off. Your saved Drive copy is still there.");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not turn off automatic backups.");
    } finally {
      setBusy(false);
    }
  };
  const runAutomaticBackupNow = async () => {
    if (!native || busy) return;
    setBusy(true);
    setFailure("");
    try {
      const snapshot = makeJournalBackup(app.transactions, app.rules, {
        recurringDecisions: app.recurringDecisions,
        customCategories: app.customCategories,
        loans: app.loans,
      });
      const status = await native.runAutoBackupNow(JSON.stringify(snapshot));
      setAutoSchedule(status);
      setMessage("Backup queued. It will upload when your phone is online and ready.");
      // Refresh while WorkManager attempts the queued upload.
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const latest = await native.autoBackupStatus();
        setAutoSchedule(latest);
        if (["connected", "error", "reconnect"].includes(latest.state)) break;
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not queue a backup.");
    } finally {
      setBusy(false);
    }
  };
  const getRestore = async () => {
    if (password.length < MIN_PASSWORD) {
      setFailure(
        `Enter the backup password (at least ${MIN_PASSWORD} characters).`,
      );
      return;
    }
    if (!native) return;
    setBusy(true);
    setFailure("");
    try {
      const raw = await native.restoreFromDrive(password);
      const backup = parseJournalBackup(JSON.parse(raw));
      setRestore(backup);
      setConfirmation("");
      setSheet("confirm");
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "Could not read a backup from Google Drive.",
      );
    } finally {
      setBusy(false);
    }
  };
  const doRestore = async () => {
    if (!restore || confirmation !== "RESTORE") return;
    setBusy(true);
    setFailure("");
    try {
      const ok = await app.restoreBackup(restore);
      if (!ok) {
        setFailure("Restore did not complete. Your current journal was kept.");
        return;
      }
      setMessage(
        `Restored ${restore.transactions.length.toLocaleString()} transactions from the encrypted Drive backup.`,
      );
      setSheet(null);
      setRestore(null);
      setPassword("");
      setConfirmation("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      onLayout={onLayout}
      style={{ marginVertical: 24, gap: 12 }}
      testID="drive-backup"
    >
      <SectionTitle title="Encrypted Drive backup" />
      <View
        style={[
          ui.card,
          {
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.line,
            gap: 12,
          },
        ]}
      >
        <View style={[ui.row, { gap: 8 }]}>
          <Cloud size={19} color={colors.accent} />
          <Text bold>Keep a recovery copy in Google Drive</Text>
        </View>
        <Text muted style={{ fontSize: 12, lineHeight: 19 }}>
          Your journal is encrypted on this phone before it is saved to Drive.
          Keep your password safe; you’ll need it to restore on another phone.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: detailsOpen }}
          onPress={() => setDetailsOpen((open) => !open)}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ color: colors.accent, fontSize: 12 }}>
            {detailsOpen ? "Hide details" : "What gets saved?"}
          </Text>
        </Pressable>
        {detailsOpen ? (
          <View style={{ gap: 8 }}>
            <Text muted style={{ fontSize: 11, lineHeight: 18 }}>
              Transactions, notes, bill details, categories, and merchant rules
              are included. Google stores only the encrypted file. Manual backup
              never saves your password; automatic backup keeps it encrypted on
              this phone so it can run on a schedule.
            </Text>
            <Text muted style={{ fontSize: 11, lineHeight: 18 }}>
              Restore previews the journal before replacing saved data. SMS and
              Gmail permissions aren’t included; SMS can be imported again and
              Gmail can be reconnected.
            </Text>
          </View>
        ) : null}
        {message ? (
          <Text style={{ color: colors.accent, fontSize: 12 }}>{message}</Text>
        ) : null}
        {autoSchedule?.enabled ? (
          <View style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 12, gap: 8 }}>
            <Text bold>Automatic backup is on</Text>
            <Text muted style={{ fontSize: 12, lineHeight: 18 }}>
              {autoSchedule.lastBackupAt
                ? `Last saved ${new Date(autoSchedule.lastBackupAt).toLocaleString()}`
                : "Your first automatic backup is being prepared."}
              {autoSchedule.state === "uploading"
                ? " A backup is uploading now."
                : autoSchedule.state === "waiting"
                  ? " The next copy will upload when your phone is online and ready."
                : autoSchedule.state === "reconnect" || autoSchedule.state === "error"
                ? ` ${autoSchedule.error || "Open Kanakku to reconnect Google Drive."}`
                : ""}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {([1, 7, 30] as const).map((days) => (
                <Pressable
                  key={days}
                  accessibilityRole="radio"
                  accessibilityLabel={days === 1 ? "Daily backup" : days === 7 ? "Weekly backup" : "Monthly backup"}
                  accessibilityState={{ checked: autoSchedule.intervalDays === days, disabled: busy }}
                  disabled={busy}
                  onPress={() => void changeAutoInterval(days)}
                  style={{ flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: autoSchedule.intervalDays === days ? colors.accent : colors.line, borderRadius: 12, backgroundColor: autoSchedule.intervalDays === days ? colors.accentSoft : colors.card }}
                >
                  <Text bold={autoSchedule.intervalDays === days} style={{ fontSize: 12 }}>
                    {days === 1 ? "Daily" : days === 7 ? "Weekly" : "Monthly"}
                  </Text>
                </Pressable>
              ))}
            </View>
            {autoSchedule.state === "reconnect" ? (
              <Button secondary disabled={!available || busy} onPress={() => begin("auto")}>
                Reconnect Google Drive
              </Button>
            ) : null}
            <Button secondary disabled={busy} onPress={() => void turnOffAutoBackup()}>
              Turn off automatic backup
            </Button>
          </View>
        ) : (
          <View style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 12, gap: 8 }}>
            <Text bold>Back up automatically</Text>
            <Text muted style={{ fontSize: 12, lineHeight: 18 }}>
              Choose daily, weekly, or monthly. Kanakku will use a password protected by Android Keystore on this phone, so it won’t ask each time.
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {([1, 7, 30] as const).map((days) => (
                <Pressable key={days} accessibilityRole="radio" accessibilityLabel={days === 1 ? "Daily backup" : days === 7 ? "Weekly backup" : "Monthly backup"} accessibilityState={{ checked: autoSchedule?.intervalDays === days }} onPress={() => setAutoSchedule((current) => ({ enabled: false, intervalDays: days, lastBackupAt: current?.lastBackupAt ?? 0, snapshotAt: 0, state: "off", error: "" }))} style={{ flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: autoSchedule?.intervalDays === days ? colors.accent : colors.line, borderRadius: 12, backgroundColor: autoSchedule?.intervalDays === days ? colors.accentSoft : colors.card }}>
                  <Text bold={autoSchedule?.intervalDays === days} style={{ fontSize: 12 }}>{days === 1 ? "Daily" : days === 7 ? "Weekly" : "Monthly"}</Text>
                </Pressable>
              ))}
            </View>
            <Button secondary disabled={!available || app.busy || busy} onPress={() => begin("auto")}>
              Set up automatic backup
            </Button>
          </View>
        )}
        {!available ? (
          <Text muted style={{ fontSize: 12 }}>
            Unlock your personal journal to back up or restore it.
          </Text>
        ) : null}
        {importing ? (
          <Text style={{ color: colors.orange, fontSize: 12 }}>
            Pause SMS history import before restoring.
          </Text>
        ) : null}
        <Button
          disabled={!available || app.busy || busy}
          onPress={() => autoSchedule?.enabled ? void runAutomaticBackupNow() : begin("backup")}
        >
          {autoSchedule?.enabled ? "Back up now" : "Back up to Google Drive"}
        </Button>
        <Button
          secondary
          disabled={!available || app.busy || busy || importing}
          onPress={() => begin("restore")}
        >
          Restore from Google Drive
        </Button>
      </View>

      <Sheet
        visible={sheet === "auto"}
        onClose={() => !busy && setSheet(null)}
        title="Set up automatic backup"
        testID="drive-auto-backup-password"
      >
        <Text>
          Kanakku will save an encrypted copy {autoSchedule?.intervalDays === 1 ? "every day" : autoSchedule?.intervalDays === 30 ? "every month" : "every week"}. To run without asking you each time, the backup password is stored encrypted on this phone using Android Keystore. It is never uploaded. You’ll still need this password to restore on a different phone.
        </Text>
        <Text muted style={{ fontSize: 12, lineHeight: 18 }}>
          Google account access is used to save the encrypted file and remember which account to use for scheduled backups. The account address stays on this phone.
        </Text>
        <TextInput accessibilityLabel="Backup password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy} style={{ padding: 15, borderWidth: 1, borderColor: colors.line, borderRadius: 13, color: colors.text, backgroundColor: colors.card }} />
        <TextInput accessibilityLabel="Confirm backup password" value={passwordConfirm} onChangeText={setPasswordConfirm} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy} style={{ padding: 15, borderWidth: 1, borderColor: colors.line, borderRadius: 13, color: colors.text, backgroundColor: colors.card }} />
        {busy ? <ActivityIndicator color={colors.accent} /> : null}
        {failure ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{failure}</Text> : null}
        <Button disabled={busy} onPress={() => void enableAutoBackup()}>
          Save encrypted copy and turn on
        </Button>
        <Button secondary disabled={busy} onPress={() => setSheet(null)}>Cancel</Button>
      </Sheet>

      <Sheet
        visible={sheet === "backup"}
        onClose={() => !busy && setSheet(null)}
        title="Encrypt your backup"
        testID="drive-backup-password"
      >
        <Text>
          Choose a password with at least {MIN_PASSWORD} characters. It encrypts
          the backup before upload and is never saved by Kanakku.
        </Text>
        <TextInput
          accessibilityLabel="Backup password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          style={{
            padding: 15,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 13,
            color: colors.text,
            backgroundColor: colors.card,
          }}
        />
        <TextInput
          accessibilityLabel="Confirm backup password"
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          style={{
            padding: 15,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 13,
            color: colors.text,
            backgroundColor: colors.card,
          }}
        />
        <Text muted style={{ fontSize: 12 }}>
          Google is asked to let Kanakku create and update this app’s backup
          file. Kanakku cannot browse your other Drive files. Each backup
          replaces the previous copy, so keep the password you used; restore
          downloads the latest copy.
        </Text>
        {busy ? <ActivityIndicator color={colors.accent} /> : null}
        {failure ? (
          <Text accessibilityRole="alert" style={{ color: colors.danger }}>
            {failure}
          </Text>
        ) : null}
        <Button disabled={busy} onPress={() => void doBackup()}>
          Encrypt and upload
        </Button>
        <Button secondary disabled={busy} onPress={() => setSheet(null)}>
          Cancel
        </Button>
      </Sheet>

      <Sheet
        visible={sheet === "restore"}
        onClose={() => !busy && setSheet(null)}
        title="Unlock your Drive backup"
        testID="drive-restore-password"
      >
        <Text>
          Choose the Google account that holds your Kanakku backup, then enter
          its password. This downloads and checks the encrypted backup without
          changing your current journal.
        </Text>
        <TextInput
          accessibilityLabel="Backup password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          style={{
            padding: 15,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 13,
            color: colors.text,
            backgroundColor: colors.card,
          }}
        />
        {busy ? <ActivityIndicator color={colors.accent} /> : null}
        {failure ? (
          <Text accessibilityRole="alert" style={{ color: colors.danger }}>
            {failure}
          </Text>
        ) : null}
        <Button disabled={busy} onPress={() => void getRestore()}>
          Find and preview backup
        </Button>
        <Button secondary disabled={busy} onPress={() => setSheet(null)}>
          Cancel
        </Button>
      </Sheet>

      <Sheet
        visible={sheet === "confirm" && !!restore}
        onClose={() => !busy && setSheet(null)}
        title="Replace this journal?"
        testID="drive-restore-confirm"
      >
        <Text bold>
          {restore?.transactions.length.toLocaleString()} saved transactions ·{" "}
          {restore?.rules.length.toLocaleString()} merchant rules
        </Text>
        <Text muted>
          Backup date:{" "}
          {restore ? new Date(restore.createdAt).toLocaleString() : ""}
        </Text>
        <Text style={{ color: colors.orange, fontSize: 13, lineHeight: 21 }}>
          This replaces the transactions, notes, bill details, rules and
          preferences currently on this device. Your current journal is not
          merged. SMS history import must be paused first. Kanakku will ask you
          to authenticate before applying the restore.
        </Text>
        <Text>Type RESTORE to confirm.</Text>
        <TextInput
          accessibilityLabel="Type RESTORE to confirm"
          value={confirmation}
          onChangeText={setConfirmation}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!busy}
          style={{
            padding: 15,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 13,
            color: colors.text,
            backgroundColor: colors.card,
          }}
        />
        {failure ? (
          <Text accessibilityRole="alert" style={{ color: colors.danger }}>
            {failure}
          </Text>
        ) : null}
        {busy ? <ActivityIndicator color={colors.accent} /> : null}
        <Button
          disabled={busy || confirmation !== "RESTORE" || importing}
          onPress={() => void doRestore()}
        >
          Unlock and replace journal
        </Button>
        <Button
          secondary
          disabled={busy}
          onPress={() => {
            setSheet(null);
            setRestore(null);
          }}
        >
          Keep this journal
        </Button>
      </Sheet>
    </View>
  );
}
