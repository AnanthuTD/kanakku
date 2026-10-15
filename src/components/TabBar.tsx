import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LucideIcon } from "lucide-react-native";
import { useApp } from "../state/AppContext";
import { Text } from "./ui";

export const TAB_BAR_HEIGHT = 62;
const INSET = 6;

/**
 * Floating capsule navigation. A solid pill slides to the selected tab and
 * carries its label; other tabs show only their icon, keeping their name for
 * screen readers.
 */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly (readonly [T, LucideIcon])[];
  value: T;
  onChange: (tab: T) => void;
}) {
  const { colors, dark } = useApp();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const items = useRef<Array<React.ElementRef<typeof View> | null>>([]);
  const slot = width ? (width - INSET * 2) / tabs.length : 0;
  const index = Math.max(
    0,
    tabs.findIndex(([label]) => label === value),
  );
  const x = useSharedValue(0);
  useEffect(() => {
    const target = index * slot;
    x.value = reduce
      ? withTiming(target, { duration: 0 })
      : withSpring(target, { damping: 20, stiffness: 220, mass: 0.8 });
  }, [index, slot, reduce]);
  const pill = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  return (
    <View
      pointerEvents="box-none"
      style={[s.dock, { bottom: Math.max(insets.bottom, 12) }]}
    >
      <View
        accessibilityRole="tablist"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[
          s.bar,
          {
            backgroundColor: colors.nav,
            borderColor: colors.line,
            shadowColor: colors.shadow,
            shadowOpacity: dark ? 0.45 : 0.12,
          },
        ]}
      >
        {slot > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              s.pill,
              { width: slot, backgroundColor: colors.accent },
              pill,
            ]}
          />
        )}
        {tabs.map(([label, Icon], itemIndex) => {
          const active = label === value;
          return (
            <Pressable
              key={label}
              ref={(element) => {
                items.current[itemIndex] = element;
              }}
              {...(Platform.OS === "web"
                ? {
                    tabIndex: active ? (0 as const) : (-1 as const),
                    onKeyDown: (event: React.KeyboardEvent) => {
                      let next: number;
                      if (event.key === "ArrowRight")
                        next = (itemIndex + 1) % tabs.length;
                      else if (event.key === "ArrowLeft")
                        next = (itemIndex + tabs.length - 1) % tabs.length;
                      else if (event.key === "Home") next = 0;
                      else if (event.key === "End") next = tabs.length - 1;
                      else return;
                      event.preventDefault();
                      onChange(tabs[next][0]);
                      // RN Web's native element supports focus; never call DOM APIs on Android.
                      (
                        items.current[next] as unknown as HTMLElement | null
                      )?.focus();
                    },
                  }
                : {})}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              aria-selected={active}
              onPress={() => {
                if (!active) Haptics.selectionAsync().catch(() => {});
                onChange(label);
              }}
              style={({ pressed }) => [
                s.item,
                { opacity: pressed && !active ? 0.6 : 1 },
              ]}
            >
              <Icon
                size={20}
                color={active ? colors.accentText : colors.muted}
                strokeWidth={active ? 2.1 : 1.7}
              />
              {active && (
                <Animated.View
                  entering={reduce ? undefined : FadeIn.duration(220)}
                >
                  <Text
                    bold
                    numberOfLines={1}
                    style={{ fontSize: 13, color: colors.accentText }}
                  >
                    {label}
                  </Text>
                </Animated.View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  bar: {
    width: "100%",
    maxWidth: 420,
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    padding: INSET,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 12,
  },
  pill: {
    position: "absolute",
    left: INSET,
    top: INSET,
    bottom: INSET,
    borderRadius: (TAB_BAR_HEIGHT - INSET * 2) / 2,
  },
  item: {
    flex: 1,
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
});
