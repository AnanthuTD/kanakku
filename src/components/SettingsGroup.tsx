import React from "react";
import { View } from "react-native";
import { Text } from "./ui";

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
  return (
    <View
      style={{
        marginBottom: 22,
        gap: 16,
      }}
      testID={testID}
    >
      <View style={{ gap: 4 }}>
        <Text serif style={{ fontSize: 21, lineHeight: 28 }}>{title}</Text>
        {summary ? (
          <Text muted style={{ fontSize: 12, lineHeight: 18 }}>{summary}</Text>
        ) : null}
        {detail ? (
          <Text muted style={{ fontSize: 12, lineHeight: 18 }}>{detail}</Text>
        ) : null}
      </View>
      <View style={{ gap: 16 }}>
        {children}
      </View>
    </View>
  );
}
