import React, { useState } from "react";
import {
  ActivityIndicator,
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
  const [sheet, setSheet] = useState<"backup" | "restore" | "confirm" | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [restore, setRestore] = useState<JournalBackup | null>(null);

  const begin = (action: "backup" | "restore") => {
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
          Your transactions, notes, bill details, categories, and merchant rules
          are encrypted on this device before upload. Google stores only the
          encrypted file. Use a password you can keep safe; Kanakku cannot
          recover it.
        </Text>
        <Text muted style={{ fontSize: 11, lineHeight: 18 }}>
          Restoring replaces this device’s saved journal after a preview and
          device unlock. SMS and Gmail permissions/accounts are not included;
          SMS can be imported again and Gmail can be reconnected.
        </Text>
        {message ? (
          <Text style={{ color: colors.accent, fontSize: 12 }}>{message}</Text>
        ) : null}
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
          onPress={() => begin("backup")}
        >
          Back up to Google Drive
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
