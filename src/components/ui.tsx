import React from "react";
import {
  Text as RNText,
  TextProps,
  Pressable,
  View,
  StyleSheet,
  ViewStyle,
} from "react-native";
import {
  ArrowUpRight,
  ShoppingBag,
  Utensils,
  CarFront,
  Sprout,
  House,
  HeartPulse,
  Zap,
  Music2,
  HelpCircle,
} from "lucide-react-native";
import { useApp } from "../state/AppContext";
import { Category } from "../domain/model";
export function Text({
  style,
  serif,
  muted,
  bold,
  ...props
}: TextProps & { serif?: boolean; muted?: boolean; bold?: boolean }) {
  const { colors } = useApp();
  return (
    <RNText
      {...props}
      style={[
        {
          color: muted ? colors.muted : colors.text,
          fontFamily: serif ? "Fraunces" : bold ? "DMSansBold" : "DMSans",
          fontSize: 14,
          lineHeight: 21,
        },
        style,
      ]}
    />
  );
}
export function Button({
  children,
  onPress,
  secondary = false,
  disabled = false,
  style,
}: React.PropsWithChildren<{
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}>) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 50,
          borderRadius: 16,
          paddingHorizontal: 20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: secondary ? colors.accentSoft : colors.accent,
          opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
        },
        style,
      ]}
    >
      <Text bold style={{ color: secondary ? colors.text : colors.accentText }}>
        {children}
      </Text>
    </Pressable>
  );
}
const iconMap: Record<Category, typeof ShoppingBag> = {
  "Food & dining": Utensils,
  Groceries: Sprout,
  Transport: CarFront,
  Shopping: ShoppingBag,
  "Bills & utilities": Zap,
  Entertainment: Music2,
  Health: HeartPulse,
  Home: House,
  Uncategorized: HelpCircle,
};
export function categoryColor(
  category: Category,
  colors: ReturnType<typeof useApp>["colors"],
) {
  return category === "Food & dining" || category === "Home"
    ? { fg: colors.orange, bg: colors.orangeSoft }
    : category === "Shopping" || category === "Entertainment"
      ? { fg: colors.purple, bg: colors.purpleSoft }
      : category === "Transport" || category === "Health"
        ? { fg: colors.blue, bg: colors.blueSoft }
        : { fg: colors.accent, bg: colors.accentSoft };
}
export function CategoryIcon({
  category,
  size = 44,
}: {
  category: Category;
  size?: number;
}) {
  const { colors } = useApp();
  const Icon = iconMap[category];
  const c = categoryColor(category, colors);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: c.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={size * 0.44} color={c.fg} strokeWidth={1.7} />
    </View>
  );
}
export function SectionTitle({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  const { colors } = useApp();
  return (
    <View style={styles.section}>
      <Text serif style={{ fontSize: 23, lineHeight: 30 }}>
        {title}
      </Text>
      {action && (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={styles.action}
        >
          <Text style={{ fontSize: 12, color: colors.accent }} bold>
            {action}
          </Text>
          <ArrowUpRight size={14} color={colors.accent} />
        </Pressable>
      )}
    </View>
  );
}
export const styles = StyleSheet.create({
  section: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 17,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44 },
  row: { flexDirection: "row", alignItems: "center" },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  card: { borderRadius: 24, padding: 22 },
  screen: { paddingHorizontal: 24, paddingBottom: 160 },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.7,
    fontFamily: "DMSansBold",
    lineHeight: 16,
  },
});
