import React, { useState } from "react";
import { TextInput, View } from "react-native";
import { Button, Text, styles as ui } from "./ui";
import { LockChoice } from "./LockChoice";
import { useApp } from "../state/AppContext";
import { native } from "../native/bridge";

const MIN = 12;

/** How the journal opens, and the optional on-phone recovery password. Android only. */
export function SecuritySettings() {
  const app = useApp();
  const { colors, lockMode, hasRecovery, busy } = app;
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  if (!native || app.mode !== "live") return null;
  const field = {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 46,
    color: colors.text,
    backgroundColor: colors.card,
  } as const;
  const problem =
    password.length > 0 && password.length < MIN
      ? `Use at least ${MIN} characters.`
      : confirm.length > 0 && confirm !== password
        ? "The two passwords don't match."
        : "";
  const save = async () => {
    if (await app.setRecoveryPassword(password)) {
      setEditing(false);
      setPassword("");
      setConfirm("");
    }
  };
  return (
    <View testID="security-settings" style={{ gap: 12, marginBottom: 22 }}>
      <Text bold>How Kanakku opens</Text>
      <LockChoice
        value={lockMode}
        disabled={busy || app.locked}
        onChange={(mode) => {
          if (mode !== lockMode) void app.setLockMode(mode);
        }}
      />
      <View
        style={[ui.card, { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, gap: 8 }]}
      >
        <Text bold>Recovery password</Text>
        <Text muted style={{ fontSize: 12, lineHeight: 19 }}>
          {hasRecovery
            ? "Set. If Android ever removes the key that opens your journal (for example after you remove your screen lock), this password opens it again with everything intact."
            : "Optional. If Android ever removes the key that opens your journal (for example after you remove your screen lock), this password opens it again. It stays on this phone and is never uploaded."}
        </Text>
        {editing ? (
          <>
            <TextInput
              accessibilityLabel="New recovery password"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={password}
              onChangeText={setPassword}
              style={field}
            />
            <TextInput
              accessibilityLabel="Repeat recovery password"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={confirm}
              onChangeText={setConfirm}
              style={field}
            />
            <Text muted style={{ fontSize: 11, lineHeight: 17 }}>
              {problem ||
                `At least ${MIN} characters. Kanakku can't show or reset it, so store it somewhere safe. You can use the same one as your Drive backup.`}
            </Text>
            <Button
              disabled={busy || password.length < MIN || confirm !== password}
              onPress={() => void save()}
            >
              {busy ? "Saving…" : "Save recovery password"}
            </Button>
            <Button secondary onPress={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button disabled={busy || app.locked} onPress={() => setEditing(true)}>
              {hasRecovery ? "Change recovery password" : "Set a recovery password"}
            </Button>
            {hasRecovery && (
              <Button secondary disabled={busy} onPress={() => void app.clearRecoveryPassword()}>
                Remove recovery password
              </Button>
            )}
          </>
        )}
      </View>
    </View>
  );
}
