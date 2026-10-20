import React, { useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { router } from "expo-router";
import catalog from "../native/modelCatalog.json";
import { native, type ModelDownloadStatus } from "../native/bridge";
import { useApp } from "../state/AppContext";
import { Button, Text } from "./ui";
import { Sheet } from "./Sheet";

type ModelId = ModelDownloadStatus["id"];
const activeStates = new Set(["queued", "downloading", "verifying", "waiting"]);
const mib = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MiB`;

export function OptionalModelPrompt({
  modelId,
  onClose,
  onContinue,
}: {
  modelId: ModelId | null;
  onClose: () => void;
  onContinue?: () => void;
}) {
  const { colors } = useApp();
  const [status, setStatus] = useState<ModelDownloadStatus>();
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const model = catalog.find((item) => item.id === modelId);

  useEffect(() => {
    const bridge = native;
    if (!modelId || !bridge) return;
    let mounted = true;
    let reading = false;
    const refresh = async () => {
      if (reading || AppState.currentState !== "active") return;
      reading = true;
      try {
        const statuses = await bridge.modelDownloads();
        const current = statuses.find((item) => item.id === modelId);
        if (mounted && current) setStatus(current);
      } catch {
        if (mounted)
          setError(
            "Model status could not be checked. Open Settings to retry.",
          );
      } finally {
        reading = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 1000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      mounted = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [modelId]);

  if (!modelId || !model) return null;
  const ready = status?.state === "ready";
  const active = !!status && activeStates.has(status.state);
  const progress = Math.min(
    100,
    Math.floor(((status?.downloaded ?? 0) / model.bytes) * 100),
  );

  const download = async () => {
    if (!native || starting || active || ready) return;
    setStarting(true);
    setError("");
    try {
      const statuses = await native.downloadModel(modelId);
      const current = statuses.find((item) => item.id === modelId);
      if (current) setStatus(current);
    } catch {
      setError(
        "The download could not start. Check your connection and try again.",
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <Sheet
      visible={!!modelId}
      onClose={onClose}
      title={ready ? `${model.label} is ready` : `Get ${model.label}`}
      testID="optional-model-prompt"
    >
      <Text>
        {ready
          ? "It is installed and ready to use offline."
          : `${model.description} Download it now, or open its settings to manage it.`}
      </Text>
      {!ready ? (
        <Text muted style={{ fontSize: 12 }}>
          About {mib(model.bytes)}. The download contacts Hugging Face and its
          delivery hosts, which receive normal network information such as your
          IP address. Your SMS, notes, and audio are not sent.
        </Text>
      ) : null}
      <Text
        testID="optional-model-prompt-status"
        accessibilityLiveRegion="polite"
      >
        {ready
          ? "Ready for offline use"
          : status?.state === "downloading"
            ? `${progress}% · ${mib(status.downloaded)} of ${mib(model.bytes)}`
            : status?.state === "verifying"
              ? "Verifying the download…"
              : active
                ? "Download queued. It will continue when your connection is available."
                : status?.state === "error"
                  ? "The previous download was interrupted. You can retry."
                  : "Not installed yet"}
      </Text>
      {active ? (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={`${model.label} download`}
          accessibilityValue={{ min: 0, max: 100, now: progress }}
          style={{ height: 5, backgroundColor: colors.line, borderRadius: 4 }}
        >
          <View
            style={{
              height: 5,
              width: `${progress}%`,
              backgroundColor: colors.accent,
              borderRadius: 4,
            }}
          />
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      {ready ? (
        <Button
          onPress={() => {
            onClose();
            onContinue?.();
          }}
        >
          {onContinue ? "Continue" : "Done"}
        </Button>
      ) : (
        <Button
          disabled={!native || starting || active}
          onPress={() => void download()}
        >
          {starting
            ? "Starting download…"
            : active
              ? "Download in progress"
              : `Download ${mib(model.bytes)} now`}
        </Button>
      )}
      <Button
        secondary
        onPress={() => {
          onClose();
          router.push("/settings?section=models");
        }}
      >
        Open model settings
      </Button>
      <Button secondary onPress={onClose}>
        Not now
      </Button>
    </Sheet>
  );
}
