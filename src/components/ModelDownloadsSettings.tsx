import React, { useEffect, useRef, useState } from "react";
import { AppState, View, type LayoutChangeEvent } from "react-native";
import { native, type ModelDownloadStatus } from "../native/bridge";
import catalog from "../native/modelCatalog.json";
import { useApp } from "../state/AppContext";
import { hasPendingInteractions } from "../state/interactions";
import { isVoiceActive } from "../native/voice";
import { Text, Button, SectionTitle } from "./ui";

const activeStates = ["queued", "downloading", "verifying", "waiting"];
const mib = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MiB`;
export function ModelDownloadsSettings({
  onLayout,
}: {
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { colors } = useApp();
  const [models, setModels] = useState<ModelDownloadStatus[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    if (!native) return;
    let mounted = true;
    let reading = false;
    const refresh = async () => {
      if (reading || AppState.currentState !== "active") return;
      reading = true;
      const token = generation.current;
      try {
        const status = await native!.modelDownloads();
        if (mounted && token === generation.current) setModels(status);
      } catch {
        if (mounted && token === generation.current)
          setError(
            "Model status could not be loaded. Reopen Settings to try again.",
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
      generation.current++;
      clearInterval(timer);
      listener.remove();
    };
  }, []);
  async function action(id: string, kind: "download" | "cancel" | "remove") {
    if (!native || pending) return;
    if (kind === "remove" && (isVoiceActive() || hasPendingInteractions())) {
      setError("Finish your payment or voice note before removing a model.");
      return;
    }
    const token = ++generation.current;
    setPending(id);
    setError("");
    try {
      const result = await (kind === "download"
        ? native.downloadModel(id)
        : kind === "cancel"
          ? native.cancelModelDownload(id)
          : native.removeModel(id));
      if (token === generation.current) {
        setModels(result);
        setRemoving(null);
      }
    } catch {
      if (token === generation.current)
        setError(
          "That model action could not finish. Check your connection and try again.",
        );
    } finally {
      if (token === generation.current) setPending(null);
    }
  }
  return (
    <View
      testID="optional-models"
      onLayout={onLayout}
      style={{ marginVertical: 24, gap: 12 }}
    >
      <SectionTitle title="Optional models" />
      <Text muted style={{ fontSize: 12 }}>
        Download only the features you want. SMS import, merchant rules and
        manual review work without these models. Once downloaded, they work
        offline and stay available across compatible app updates.
      </Text>
      <Text muted style={{ fontSize: 12 }}>
        Downloads contact Hugging Face and its delivery hosts. They receive
        normal network information, including your IP address; your SMS, notes
        and audio are not sent.
      </Text>
      {!native && (
        <Text>
          Manage model downloads in the Android app. This browser preview does
          not download or run models.
        </Text>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      {catalog.map((model) => {
        const status = models.find((s) => s.id === model.id);
        const state = status?.state;
        const active = !!state && activeStates.includes(state);
        const ready = state === "ready";
        const progress = Math.min(
          100,
          Math.floor(((status?.downloaded ?? 0) / model.bytes) * 100),
        );
        const label = ready
          ? "Ready for offline use"
          : state === "error"
            ? "Download interrupted. Retry when ready."
            : state === "verifying"
              ? "Checking download integrity…"
              : state === "downloading"
                ? `${progress}% · ${mib(status?.downloaded ?? 0)} of ${mib(model.bytes)}`
                : active
                  ? "Waiting for network or Android to continue…"
                  : native && !status
                    ? "Checking availability…"
                    : "Not downloaded";
        return (
          <View
            key={model.id}
            style={{
              padding: 16,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.card,
              gap: 10,
            }}
          >
            <Text bold>
              {model.label} · {mib(model.bytes)}
            </Text>
            <Text muted style={{ fontSize: 12 }}>
              {model.description}
            </Text>
            <Text
              accessibilityLiveRegion="polite"
              testID={`model-${model.id}-status`}
            >
              {label}
            </Text>
            {active && (
              <View
                accessibilityRole="progressbar"
                accessibilityLabel={`${model.label} download`}
                accessibilityValue={{ min: 0, max: 100, now: progress }}
                style={{
                  height: 5,
                  backgroundColor: colors.line,
                  borderRadius: 4,
                }}
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
            )}
            {removing === model.id ? (
              <>
                <Text>
                  Remove this model from your phone? Your journal and saved
                  notes will stay. You can download it again later.
                </Text>
                <Button
                  disabled={!!pending}
                  onPress={() => action(model.id, "remove")}
                >
                  Confirm remove {model.label}
                </Button>
                <Button
                  secondary
                  disabled={!!pending}
                  onPress={() => setRemoving(null)}
                >
                  Keep model
                </Button>
              </>
            ) : ready ? (
              <Button
                secondary
                disabled={!!pending}
                onPress={() => setRemoving(model.id)}
              >
                Remove {model.label}
              </Button>
            ) : active ? (
              <Button
                secondary
                disabled={!!pending}
                onPress={() => action(model.id, "cancel")}
              >
                Cancel {model.label} download
              </Button>
            ) : (
              <Button
                disabled={!native || !!pending || !status}
                onPress={() => action(model.id, "download")}
              >
                {state === "error" ? "Retry" : "Download"} {model.label}
              </Button>
            )}
          </View>
        );
      })}
    </View>
  );
}
