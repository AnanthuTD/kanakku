import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState, View } from "react-native";
import { useApp } from "../state/AppContext";
import {
  appUpdates,
  appUpdateInfo,
  useAppUpdatePending,
} from "../services/appUpdates";
import { Text, Button, SectionTitle } from "./ui";
import { Sheet } from "./Sheet";

/** Mount in Settings. Root supplies the current recording/editing/write guard. */
/** Baked into each JS bundle so a delivered update is visibly different from the APK. */
const UPDATE_LABEL = "bundle 2026-10-15a";
export function AppUpdatesSettings({
  restartBlocked = false,
  canRestart,
}: {
  restartBlocked?: boolean;
  canRestart?: () => boolean;
}) {
  const { colors } = useApp();
  const state = useSyncExternalStore(
    appUpdates.subscribe,
    appUpdates.getSnapshot,
    appUpdates.getSnapshot,
  );
  const pending = useAppUpdatePending();
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [restartWarning, setRestartWarning] = useState(false);
  const guard = useRef({ restartBlocked, canRestart });
  guard.current = { restartBlocked, canRestart };
  const safeToRestart = () =>
    AppState.currentState === "active" &&
    !guard.current.restartBlocked &&
    (guard.current.canRestart?.() ?? true);
  useEffect(() => {
    appUpdates.observePending(pending);
  }, [pending]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") setConfirmRestart(false);
    });
    return () => subscription.remove();
  }, []);
  const restartReady = state.phase === "ready" || state.retry === "restart";
  return (
    <View testID="app-updates" style={{ gap: 12 }}>
      <SectionTitle title="App updates" />
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 18,
          gap: 12,
          borderWidth: 1,
          borderColor: colors.line,
        }}
      >
        <Text bold>Keep Kanakku up to date</Text>
        <Text muted>
          Get compatible improvements without reinstalling. Updates never
          restart the app while you are using it.
        </Text>
        <Text accessibilityLiveRegion="polite" testID="app-update-status">
          {state.phase === "unavailable"
            ? state.unavailableReason
            : state.phase === "checking"
              ? "Checking for an update…"
              : state.phase === "current"
                ? "You have the latest compatible update. Kanakku checks again when you reopen the app. Some changes need a new APK."
                : state.phase === "available"
                  ? "An update is available. Downloading automatically…"
                  : state.phase === "downloading"
                    ? "Downloading the update in the background…"
                    : state.phase === "ready"
                      ? "Update downloaded. Restart when your changes are saved, or it will apply on the next full app start."
                      : state.phase === "restarting"
                        ? "Restarting Kanakku…"
                        : state.phase === "error"
                          ? "Update not completed."
                          : "Kanakku checks for updates automatically when you open the app."}
        </Text>
        {!!state.error && <Text accessibilityRole="alert">{state.error}</Text>}
        {restartWarning && (
          <Text accessibilityRole="alert">
            Finish your current action and save your changes before restarting.
          </Text>
        )}
        {!!appUpdateInfo.channel && (
          <Text muted style={{ fontSize: 11 }}>
            Channel: {appUpdateInfo.channel} ·{" "}
            {appUpdateInfo.embedded ? "APK version" : "Downloaded update"}
            {" · "}
            {UPDATE_LABEL}
          </Text>
        )}
        {state.phase !== "unavailable" &&
          (restartReady ? (
            <Button
              disabled={restartBlocked}
              onPress={() => {
                const safe = safeToRestart();
                setRestartWarning(!safe);
                if (safe) setConfirmRestart(true);
              }}
            >
              Restart to update
            </Button>
          ) : state.phase === "available" ||
            state.phase === "downloading" ? null : (
            <Button
              disabled={["checking", "downloading", "restarting"].includes(
                state.phase,
              )}
              onPress={() => void appUpdates.checkAndDownload()}
            >
              {state.retry ? "Retry update" : "Check now"}
            </Button>
          ))}
        {restartReady && restartBlocked && (
          <Text muted>Finish your current action before restarting.</Text>
        )}
      </View>
      <Sheet
        visible={confirmRestart}
        onClose={() => setConfirmRestart(false)}
        title="Restart to update?"
      >
        <Text>
          Save any edits first. Kanakku will close this session and reopen with
          the downloaded update. Your saved journal stays on this device.
        </Text>
        <View style={{ gap: 10, marginTop: 18 }}>
          <Button
            disabled={restartBlocked}
            onPress={() => {
              setConfirmRestart(false);
              void appUpdates.restart(safeToRestart);
            }}
          >
            Restart now
          </Button>
          <Button secondary onPress={() => setConfirmRestart(false)}>
            Later
          </Button>
        </View>
      </Sheet>
    </View>
  );
}
