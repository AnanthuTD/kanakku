import React, { useRef } from "react";
import {
  Modal,
  View,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../state/AppContext";
import { Text, styles as ui } from "./ui";
export function Sheet({
  visible,
  onClose,
  title,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  testID?: string;
}) {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const closeButton = useRef<React.ElementRef<typeof View>>(null);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      accessibilityLabel={title}
      onShow={() => {
        if (Platform.OS === "web")
          requestAnimationFrame(() =>
            (closeButton.current as unknown as HTMLElement | null)?.focus(),
          );
      }}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        // Padding lifts the whole sheet above Android's keyboard without
        // assigning an explicit height that collapses intrinsic-size dialogs.
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "#00000066",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close dialog"
          tabIndex={-1}
          onPress={onClose}
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
        />
        <View
          testID={testID}
          accessibilityViewIsModal
          style={{
            width: "100%",
            maxWidth: 540,
            maxHeight: "88%",
            alignSelf: "center",
            backgroundColor: colors.bg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          <View
            style={[ui.between, { paddingHorizontal: 24, paddingVertical: 8 }]}
          >
            <Text serif style={{ fontSize: 26, lineHeight: 34, flex: 1 }}>
              {title}
            </Text>
            <Pressable
              ref={closeButton}
              accessibilityRole="button"
              accessibilityLabel={`Close ${title}`}
              onPress={onClose}
              style={{ padding: 13 }}
            >
              <X size={20} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView
            style={{ maxHeight: "88%", flexShrink: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            contentContainerStyle={{ padding: 24, paddingTop: 10, gap: 18 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
