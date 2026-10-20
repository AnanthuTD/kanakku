import React from "react";
import { View } from "react-native";
import { Text } from "./ui";
import { useApp } from "../state/AppContext";

export function SettingsGroup({
  title,
  detail,
  summary,
  children,
  testID,
}: {
  title: string;
  detail: string;
  summary?: string;
  children: React.ReactNode;
  testID: string;
}) {
  const { colors } = useApp();
  return (
    <View
      style={{
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 18,
        backgroundColor: colors.card,
        overflow: "hidden",
      }}
      testID={testID}
    >
      <View style={{ paddingVertical: 13, paddingHorizontal: 16 }}>
        <View style={{ gap: 3 }}>
          <Text bold style={{ fontSize: 14 }}>{title}</Text>
          <Text muted style={{ fontSize: 11, lineHeight: 16 }}>{summary ?? detail}</Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
        {summary ? <Text muted style={{ fontSize: 11, lineHeight: 17 }}>{detail}</Text> : null}
        {children}
      </View>
    </View>
  );
}
