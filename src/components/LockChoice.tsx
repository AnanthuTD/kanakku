import React from "react";
import { Pressable, View } from "react-native";
import { FingerprintPattern, LockOpen } from "lucide-react-native";
import { Text } from "./ui";
import { useApp } from "../state/AppContext";
import type { LockMode } from "../native/bridge";

const OPTIONS: { mode: LockMode; title: string; detail: string }[] = [
  {
    mode: "device",
    title: "Use my phone lock",
    detail:
      "Fingerprint, face, PIN or pattern, the same as your phone. Recommended.",
  },
  {
    mode: "open",
    title: "Open without asking",
    detail:
      "Faster to open. Still encrypted on this phone, but anyone using your unlocked phone can see it.",
  },
];

/** The two ways the journal can open. Shown before connecting and in Settings. */
export function LockChoice({
  value,
  onChange,
  disabled,
}: {
  value: LockMode;
  onChange: (mode: LockMode) => void;
  disabled?: boolean;
}) {
  const { colors } = useApp();
  return (
    <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
      {OPTIONS.map((option) => {
        const selected = value === option.mode;
        const Icon = option.mode === "device" ? FingerprintPattern : LockOpen;
        return (
          <Pressable
            key={option.mode}
            testID={`lock-choice-${option.mode}`}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={`${option.title}. ${option.detail}`}
            disabled={disabled}
            onPress={() => onChange(option.mode)}
            style={{
              flexDirection: "row",
              gap: 12,
              padding: 14,
              borderRadius: 16,
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? colors.accent : colors.line,
              backgroundColor: selected ? colors.accentSoft : colors.card,
            }}
          >
            <Icon size={20} color={selected ? colors.accent : colors.muted} />
            <View style={{ flex: 1 }}>
              <Text bold style={{ fontSize: 13 }}>
                {option.title}
              </Text>
              <Text muted style={{ fontSize: 11, lineHeight: 17, marginTop: 3 }}>
                {option.detail}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
