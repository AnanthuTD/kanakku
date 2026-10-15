import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { File } from "expo-file-system";
import { Camera, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../state/AppContext";
import { cancelReceipt, readReceipt } from "../native/receipt";
import { captureReceipt } from "../native/receiptCapture";
import { Button, Text } from "./ui";
import type { ReceiptCameraProps } from "./ReceiptCamera.types";

export function ReceiptCamera({
  visible,
  onClose,
  onRead,
}: ReceiptCameraProps) {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const generation = useRef(0);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const callbacks = useRef({ onClose, onRead });
  callbacks.current = { onClose, onRead };
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<
    "camera" | "permission" | "taking" | "reading"
  >("camera");
  const [error, setError] = useState("");
  const taking = useRef(false);
  function close() {
    generation.current++;
    cancelReceipt();
    callbacks.current.onClose();
  }
  useEffect(() => {
    generation.current++;
    setReady(false);
    setPhase("camera");
    setError("");
    if (!visible) cancelReceipt();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" && visibleRef.current) close();
    });
    return () => {
      generation.current++;
      cancelReceipt();
      subscription.remove();
    };
  }, [visible]);
  const current = (token: number) =>
    visibleRef.current &&
    token === generation.current &&
    AppState.currentState === "active";
  async function allowCamera() {
    const token = generation.current;
    setPhase("permission");
    setError("");
    try {
      const result = await requestPermission();
      if (current(token) && !result.granted)
        setError(
          "Camera access is off. You can type your payment note instead.",
        );
    } catch {
      if (current(token))
        setError(
          "Camera access could not be requested. Type your payment note instead.",
        );
    } finally {
      if (current(token)) setPhase("camera");
    }
  }
  async function takePhoto() {
    if (
      !camera.current ||
      !ready ||
      taking.current ||
      AppState.currentState !== "active"
    )
      return;
    taking.current = true;
    const token = generation.current;
    setPhase("taking");
    setError("");
    try {
      const view = camera.current;
      const draft = await captureReceipt({
        capture: () =>
          view.takePictureAsync({
            quality: 0.85,
            exif: false,
            base64: false,
            shutterSound: false,
          }),
        recognize: readReceipt,
        isCurrent: () => current(token),
        onReading: () => setPhase("reading"),
        dispose: (uri) => {
          // Only this capture's app-cache file. A failed deletion prevents delivery of the draft.
          const file = new File(uri);
          if (file.exists) file.delete();
        },
      });
      if (!draft || !current(token)) return;
      callbacks.current.onRead(draft);
      callbacks.current.onClose();
    } catch (caught) {
      if (current(token))
        setError(
          caught instanceof Error &&
            /^(No clear bill text|This bill could not be read|The previous bill)/.test(
              caught.message,
            )
            ? caught.message
            : "The photo could not be read. Try again or type your payment note.",
        );
    } finally {
      taking.current = false;
      if (current(token)) setPhase("camera");
    }
  }
  const busy = phase !== "camera";
  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={close}
      accessibilityViewIsModal
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 16),
        }}
      >
        <View
          style={{
            padding: 20,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text serif style={{ fontSize: 26, lineHeight: 34 }}>
              Read a bill
            </Text>
            <Text muted>Keep the full bill sharp and well lit.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close bill camera"
            onPress={close}
            style={{
              minWidth: 48,
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X color={colors.text} size={24} />
          </Pressable>
        </View>
        {permission?.granted ? (
          <View
            style={{
              flex: 1,
              marginHorizontal: 16,
              overflow: "hidden",
              borderRadius: 24,
              backgroundColor: "#111",
            }}
          >
            {visible && (
              <CameraView
                ref={camera}
                style={{ flex: 1 }}
                facing="back"
                mode="picture"
                mute
                onCameraReady={() => setReady(true)}
                onMountError={() => {
                  setReady(false);
                  setError(
                    "The camera could not start. Close it and type the payment note, or try again.",
                  );
                }}
              />
            )}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 24,
                bottom: 24,
                left: 28,
                right: 28,
                borderWidth: 1,
                borderColor: "#ffffff88",
                borderRadius: 16,
              }}
            />
          </View>
        ) : (
          <View
            style={{
              flex: 1,
              padding: 28,
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}
          >
            <Camera color={colors.accent} size={48} strokeWidth={1.5} />
            <Text serif style={{ fontSize: 25 }}>
              A little context, from your bill
            </Text>
            <Text style={{ textAlign: "center" }} muted>
              Allow camera access to read printed English bill details on this
              phone. The photo is deleted after reading.
            </Text>
            <Button
              onPress={() => void allowCamera()}
              disabled={busy || permission?.canAskAgain === false}
            >
              Allow camera
            </Button>
            {permission?.canAskAgain === false && (
              <Text muted>
                Enable Camera in Android Settings to try again. Typing is always
                available.
              </Text>
            )}
          </View>
        )}
        <View style={{ padding: 20, gap: 12 }}>
          {!!error && (
            <Text accessibilityRole="alert" style={{ color: colors.orange }}>
              {error}
            </Text>
          )}
          {busy && (
            <View
              accessibilityLiveRegion="polite"
              style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
            >
              <ActivityIndicator color={colors.accent} />
              <Text>
                {phase === "reading"
                  ? "Reading the bill on your phone…"
                  : phase === "taking"
                    ? "Taking photo…"
                    : "Waiting for camera permission…"}
              </Text>
            </View>
          )}
          {permission?.granted && (
            <Button onPress={() => void takePhoto()} disabled={!ready || busy}>
              Take bill photo
            </Button>
          )}
          <Text muted style={{ fontSize: 12, textAlign: "center" }}>
            Nothing is saved until you review the details and save the payment.
          </Text>
        </View>
      </View>
    </Modal>
  );
}
