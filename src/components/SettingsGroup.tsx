import React from "react";
import { Pressable, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { Text } from "./ui";
import { useApp } from "../state/AppContext";

export function SettingsGroup({
  title,
  detail,
  summary,
  expanded,
  onPress,
  children,
  testID,
}: {
  title: string;
  detail: string;
  summary?: string;
  expanded: boolean;
  onPress: () => void;
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}${summary ? `, ${summary}` : ""}`}
        accessibilityHint={expanded ? "Collapse settings" : "Open settings"}
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: 68,
          paddingVertical: 13,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          opacity: pressed ? 0.84 : 1,
        })}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Text bold style={{ fontSize: 14 }}>{title}</Text>
          <Text muted style={{ fontSize: 11, lineHeight: 16 }}>{summary ?? detail}</Text>
        </View>
        <ChevronDown
          size={19}
          color={colors.muted}
          style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}
        />
      </Pressable>
      {expanded ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
          {summary ? <Text muted style={{ fontSize: 11, lineHeight: 17 }}>{detail}</Text> : null}
          {children}
        </View>
      ) : null}
    </View>
  );
}
