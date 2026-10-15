import React from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useApp } from "../src/state/AppContext";
import { Mascot } from "../src/components/Avatar";
import { Button, Text } from "../src/components/ui";

// Shown for links Kanakku does not recognise, such as an outdated notification.
export default function NotFound() {
  const { colors } = useApp();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        gap: 14,
      }}
    >
      <Mascot size={86} mood="thinking" />
      <Text serif style={{ fontSize: 28, lineHeight: 36, textAlign: "center" }}>
        This page isn't here.
      </Text>
      <Text muted style={{ textAlign: "center", maxWidth: 300 }}>
        The link may be from an older notification. Your journal is unchanged.
      </Text>
      <Button
        onPress={() => router.replace("/")}
        style={{ marginTop: 8, alignSelf: "stretch" }}
      >
        Go to overview
      </Button>
    </View>
  );
}
