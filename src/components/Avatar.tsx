import React, { useEffect, useRef, useState } from "react";
import { View, Pressable, useWindowDimensions, StyleSheet } from "react-native";
import Svg, { Ellipse, Path, Rect, Circle } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  withDelay,
  useAnimatedProps,
  interpolate,
  FadeInDown,
  FadeIn,
  FadeOutUp,
  FadeOut,
  cancelAnimation,
  runOnJS,
  Easing,
  useReducedMotion,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  avatarBounds,
  avatarDragPosition,
  clampAvatar,
  restoreAvatarPosition,
  savedAvatarPosition,
} from "../domain/avatar";
import { Camera, Mic, X } from "lucide-react-native";
import { tapFeedback } from "./feedback";
import { useApp } from "../state/AppContext";
import { Text } from "./ui";
const AnimatedRect = Animated.createAnimatedComponent(Rect);
export function Mascot({
  size = 70,
  mood = "idle",
}: {
  size?: number;
  mood?: "idle" | "listening" | "happy" | "thinking";
}) {
  const { dark } = useApp();
  const motion = useSharedValue(0);
  const blink = useSharedValue(1);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!reduce) {
      motion.value = withRepeat(
        withSequence(
          withTiming(mood === "happy" ? -8 : mood === "listening" ? -2 : -4, {
            duration:
              mood === "listening" ? 350 : mood === "happy" ? 500 : 1700,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(0, {
            duration:
              mood === "listening" ? 350 : mood === "happy" ? 500 : 1700,
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        mood === "happy" ? 2 : -1,
        true,
      );
      blink.value = withRepeat(
        withDelay(
          4000,
          withSequence(
            withTiming(0.12, { duration: 90 }),
            withTiming(1, { duration: 140 }),
          ),
        ),
        -1,
        false,
      );
    } else {
      motion.value = 0;
      blink.value = 1;
    }
    return () => {
      cancelAnimation(motion);
      cancelAnimation(blink);
    };
  }, [reduce, mood]);
  const eyes = useAnimatedProps(() => ({
    height: Math.max(1.5, (mood === "listening" ? 13 : 10) * blink.value),
    y: 53 - ((mood === "listening" ? 13 : 10) * blink.value) / 2,
  }));
  const animated = useAnimatedStyle(() => ({
    transform: [
      { translateY: motion.value },
      { rotate: `${mood === "thinking" ? motion.value : 0}deg` },
    ],
  }));
  return (
    <Animated.View
      accessible
      accessibilityLabel={`Kanakku companion, ${mood}`}
      style={[{ width: size, height: size }, animated]}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Ellipse
          cx="50"
          cy="91"
          rx="28"
          ry="5"
          fill={dark ? "#0C1510" : "#CBD4BF"}
          opacity=".5"
        />
        <Path d="M48 24 C46 9 64 3 72 7 C71 21 56 27 48 24" fill="#A6BB75" />
        <Path
          d="M49 25 L60 13"
          stroke="#64814A"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <Path
          d="M16 56 Q8 63 13 73"
          stroke="#42634B"
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d={mood === "happy" ? "M84 56 Q98 43 91 34" : "M84 57 Q94 63 90 73"}
          stroke="#42634B"
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
        <Rect x="18" y="24" width="64" height="62" rx="25" fill="#3F6149" />
        <Path
          d="M24 42 Q28 28 48 29"
          stroke="#5C7A53"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <Ellipse cx="34" cy="66" rx="7" ry="4" fill="#BFA480" opacity=".65" />
        <Ellipse cx="66" cy="66" rx="7" ry="4" fill="#BFA480" opacity=".65" />
        {mood === "happy" ? (
          <>
            <Path
              d="M32 53 Q36 48 40 53 M60 53 Q64 48 68 53"
              stroke="#F5EED7"
              strokeWidth="3.5"
              fill="none"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <AnimatedRect
              x="33"
              y="48"
              width="6"
              height={mood === "listening" ? 13 : 10}
              animatedProps={eyes}
              rx="3"
              fill="#F5EED7"
            />
            <AnimatedRect
              x="61"
              y="48"
              width="6"
              height={mood === "listening" ? 13 : 10}
              animatedProps={eyes}
              rx="3"
              fill="#F5EED7"
            />
          </>
        )}
        {mood === "listening" ? (
          <Circle cx="50" cy="69" r="4" fill="#F5EED7" />
        ) : (
          <Path
            d="M44 67 Q50 74 56 67"
            stroke="#F5EED7"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
        )}
        <Path
          d="M32 83 L30 88 M68 83 L70 88"
          stroke="#31533E"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}
export function FloatingAvatar({
  count,
  onPress,
  onPhoto,
  onDismiss,
}: {
  count: number;
  onPress: () => void;
  onPhoto: () => void;
  onDismiss: () => void;
}) {
  const { colors } = useApp();
  const { width, height } = useWindowDimensions();
  const shellWidth = Math.min(width, 540);
  // Expanded size leaves room for a short prompt and three accessible actions.
  const cardWidth = Math.min(360, shellWidth - 32);
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const compactWidth = 68;
  const compactHeight = 68;
  const expandedHeight = 96;
  const layoutWidth = expanded ? cardWidth : compactWidth;
  const layoutHeight = expanded ? expandedHeight : compactHeight;
  const bounds = avatarBounds(
    width,
    height,
    layoutWidth,
    layoutHeight,
    insets.top,
  );
  const { minX } = bounds;
  const suppressTapUntil = useRef(0);
  const interacting = useRef(false);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const pointerStartX = useSharedValue(0);
  const pointerStartY = useSharedValue(0);
  const reduced = useReducedMotion();
  const panActive = useSharedValue(false);
  const expansion = useSharedValue(0);
  useEffect(() => {
    expansion.value = reduced
      ? expanded
        ? 1
        : 0
      : withSpring(expanded ? 1 : 0, { damping: 20, stiffness: 230 });
  }, [expanded, reduced]);
  useEffect(() => {
    const bounded = clampAvatar(x.value, y.value, bounds);
    x.value = bounded.x;
    y.value = bounded.y;
    let live = true;
    AsyncStorage.getItem("kanakku-avatar-position")
      .then((raw) => {
        if (!raw || !live) return;
        if (interacting.current) return;
        const position = restoreAvatarPosition(raw, bounds);
        x.value = position.x;
        y.value = position.y;
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [shellWidth, height, layoutWidth, layoutHeight, insets.top]);
  const remember = (left: boolean, vertical: number) => {
    AsyncStorage.setItem(
      "kanakku-avatar-position",
      JSON.stringify(savedAvatarPosition(left, vertical, bounds)),
    ).catch(() => {});
  };
  const suppressTap = () => {
    interacting.current = true;
    suppressTapUntil.current = performance.now() + 300;
  };
  const resetPosition = () => {
    suppressTap();
    x.value = 0;
    y.value = 0;
    remember(false, 0);
    tapFeedback();
  };
  const press = () => {
    if (performance.now() < suppressTapUntil.current) return;
    tapFeedback();
    onPress();
  };
  const pan = Gesture.Pan()
    .minDistance(8)
    .onBegin((event) => {
      cancelAnimation(x);
      startX.value = x.value;
      startY.value = y.value;
      pointerStartX.value = event.absoluteX;
      pointerStartY.value = event.absoluteY;
    })
    .onStart(() => {
      panActive.value = true;
      runOnJS(suppressTap)();
    })
    .onUpdate((e) => {
      const position = avatarDragPosition(
        startX.value,
        startY.value,
        pointerStartX.value,
        pointerStartY.value,
        e.absoluteX,
        e.absoluteY,
        bounds,
      );
      x.value = position.x;
      y.value = position.y;
    })
    .onEnd((event) => {
      // Web translations reset on activation; pointer coordinates preserve
      // movement from touch-down. The end event also avoids snapping from a
      // stale animation-frame update when moves arrive together.
      const position = avatarDragPosition(
        startX.value,
        startY.value,
        pointerStartX.value,
        pointerStartY.value,
        event.absoluteX,
        event.absoluteY,
        bounds,
      );
      const left = position.x < minX / 2;
      y.value = position.y;
      x.value = reduced
        ? left
          ? minX
          : 0
        : withSpring(left ? minX : 0, { damping: 18 });
      runOnJS(remember)(left, position.y);
    })
    .onFinalize(() => {
      if (panActive.value) runOnJS(suppressTap)();
      panActive.value = false;
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));
  const expansionStyle = useAnimatedStyle(() => ({
    width: interpolate(expansion.value, [0, 1], [compactWidth, cardWidth]),
    height: interpolate(
      expansion.value,
      [0, 1],
      [compactHeight, expandedHeight],
    ),
    borderRadius: interpolate(expansion.value, [0, 1], [34, 23]),
    padding: interpolate(expansion.value, [0, 1], [5, 9]),
  }));
  const toggleExpanded = () => {
    if (performance.now() < suppressTapUntil.current) return;
    tapFeedback();
    setExpanded((value) => !value);
  };
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        testID="floating-avatar"
        style={[
          s.floating,
          {
            backgroundColor: colors.card,
            borderColor: colors.line,
            shadowColor: colors.shadow,
          },
          expansionStyle,
          style,
        ]}
      >
        {!expanded ? (
          <Animated.View
            entering={FadeIn.duration(130)}
            exiting={FadeOut.duration(100)}
            style={{ alignItems: "center", justifyContent: "center" }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Review ${count} unclear payments`}
              accessibilityHint="Tap to expand. Drag to move. Long press to reset its position."
              accessibilityActions={[
                { name: "activate" },
                { name: "resetPosition", label: "Reset companion position" },
              ]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === "resetPosition")
                  resetPosition();
                else if (event.nativeEvent.actionName === "activate")
                  toggleExpanded();
              }}
              onPress={toggleExpanded}
              onLongPress={resetPosition}
              style={{
                width: 56,
                height: 56,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Mascot size={53} mood="thinking" />
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View
            entering={FadeInDown.duration(180)}
            exiting={FadeOutUp.duration(120)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              flex: 1,
              gap: 7,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Collapse companion prompt"
              onPress={toggleExpanded}
              style={{
                width: 49,
                height: 58,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Mascot size={48} mood="thinking" />
            </Pressable>
            <View style={{ flex: 1, minWidth: 70 }}>
              <Text bold style={{ fontSize: 12 }}>
                A little context?
              </Text>
              <Text muted style={{ fontSize: 11, lineHeight: 15 }}>
                {count} {count === 1 ? "payment needs" : "payments need"} your
                help
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Answer by voice"
              onPress={press}
              style={s.actionTarget}
            >
              <View
                style={[s.actionIcon, { backgroundColor: colors.accentSoft }]}
              >
                <Mic size={17} color={colors.accent} />
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take bill photo"
              accessibilityHint="Open the payment and photograph a bill to add its details."
              onPress={() => {
                if (performance.now() < suppressTapUntil.current) return;
                tapFeedback();
                onPhoto();
              }}
              style={s.actionTarget}
            >
              <View
                style={[s.actionIcon, { backgroundColor: colors.accentSoft }]}
              >
                <Camera size={17} color={colors.accent} />
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss avatar"
              onPress={() => {
                if (performance.now() >= suppressTapUntil.current) onDismiss();
              }}
              style={s.dismissTarget}
            >
              <X size={14} color={colors.muted} />
            </Pressable>
          </Animated.View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}
const s = StyleSheet.create({
  floating: {
    position: "absolute",
    bottom: 94,
    right: 18,
    borderWidth: 1,
    overflow: "hidden",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    zIndex: 10,
  },
  actionTarget: {
    width: 48,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissTarget: {
    width: 28,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
});
