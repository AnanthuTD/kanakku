import React from "react";
import { View, Pressable } from "react-native";
import { Check, History } from "lucide-react-native";
import { Text, styles as ui } from "./ui";
import { useApp } from "../state/AppContext";
import { IMPORT_PERIODS, importRange } from "../domain/import";

export function ImportPeriodPicker({
  value,
  onChange,
  allowSkip = false,
  disabled = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  allowSkip?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useApp();
  return (
    <View style={{ gap: 12 }}>
      <View style={[ui.row, { gap: 8 }]}>
        <History size={18} color={colors.accent} />
        <Text bold>How far back should we look?</Text>
      </View>
      <Text muted style={{ fontSize: 12, lineHeight: 19 }}>
        Choose the SMS history you want to bring in.
      </Text>
      <View role="radiogroup" accessibilityLabel="SMS history period" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[
          ...IMPORT_PERIODS,
          ...(allowSkip ? [{ months: null, label: "Skip for now" }] : []),
        ].map((period) => (
          <Pressable
            key={period.label}
            accessibilityRole="radio"
            aria-checked={value === period.months}
            accessibilityState={{ checked: value === period.months, disabled }}
            accessibilityLabel={period.label}
            disabled={disabled}
            onPress={() => onChange(period.months)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              minHeight: 44,
              paddingHorizontal: 13,
              borderWidth: 1,
              borderColor:
                value === period.months ? colors.accent : colors.line,
              borderRadius: 13,
              backgroundColor:
                value === period.months ? colors.accentSoft : colors.card,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {value === period.months && (
              <Check size={13} color={colors.accent} />
            )}
            <Text bold={value === period.months} style={{ fontSize: 12 }}>
              {period.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text muted style={{ fontSize: 11, lineHeight: 18 }}>
        {value === null
          ? "Only new alerts will be captured. Import history whenever you’re ready."
          : importRange(value)}
      </Text>
      {value !== null && (
        <Text muted style={{ fontSize: 11, lineHeight: 18 }}>
          The most recent 7 days appear first. Older history follows in the
          background, with progress here and in a notification.
        </Text>
      )}
    </View>
  );
}
