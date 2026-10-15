import React from "react";
import { Modal, View } from "react-native";
import { Button, Text } from "./ui";
import type { ReceiptCameraProps } from "./ReceiptCamera.types";
import { useApp } from "../state/AppContext";

export function ReceiptCamera({ visible, onClose }: ReceiptCameraProps) {
  const { colors } = useApp();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "#0008",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <View
          style={{
            backgroundColor: colors.card,
            padding: 24,
            borderRadius: 24,
            gap: 16,
          }}
        >
          <Text serif style={{ fontSize: 24 }}>
            Bill photos
          </Text>
          <Text>
            Take a bill photo in the Kanakku Android build. This browser preview
            cannot read a real photo; you can still type your payment note.
          </Text>
          <Button onPress={onClose}>Close camera</Button>
        </View>
      </View>
    </Modal>
  );
}
