import React, { useEffect, useState } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useApp } from "../state/AppContext";
import { palette } from "../brand/mark";
import { BrandMark } from "./BrandMark";

// Matches the tile drawn by the Android 12+ system splash (expo-splash-screen
// imageWidth 288dp; the tile fills half of splash-icon.png).
export const SPLASH_TILE = 144;
// Never hold the app behind the brand moment; unlock prompts and slow storage
// fall back to the app's own loading state after this.
const MAX_HOLD_MS = 2500;

/**
 * Takes over from the native splash on an identical frame, waits for the
 * journal to load, then plays one short brand moment and reveals the app.
 */
export function LaunchSplash() {
  const { loaded } = useApp();
  // The native splash follows the system scheme, so the hand-off does too.
  const dark = useColorScheme() === "dark";
  const scheme = dark ? palette.dark : palette.light;
  const reduce = useReducedMotion();
  const [done, setDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leaf = useSharedValue(0);
  const word = useSharedValue(0);
  const veil = useSharedValue(1);
  const lift = useSharedValue(1);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), MAX_HOLD_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if ((!loaded && !timedOut) || leaving) return;
    setLeaving(true);
    const finish = () => setDone(true);
    if (reduce) {
      leaf.value = 0;
      veil.value = withTiming(0, { duration: 180 }, (ok) => {
        if (ok) runOnJS(finish)();
      });
      return;
    }
    // The leaf nods once like a pen stroke while the wordmark rises beneath
    // it, then the frame dissolves into the app.
    leaf.value = withSequence(
      withTiming(-9, { duration: 200, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 8, stiffness: 160 }),
    );
    word.value = withTiming(1, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
    });
    lift.value = withDelay(620, withTiming(0.94, { duration: 280 }));
    veil.value = withDelay(
      620,
      withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) }, (ok) => {
        if (ok) runOnJS(finish)();
      }),
    );
  }, [loaded, timedOut, reduce]);

  const frame = useAnimatedStyle(() => ({ opacity: veil.value }));
  const mark = useAnimatedStyle(() => ({
    transform: [{ scale: lift.value }, { rotate: `${leaf.value}deg` }],
  }));
  const wordmark = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateY: (1 - word.value) * 10 }],
  }));

  if (done) return null;
  return (
    <Animated.View
      pointerEvents={leaving ? "none" : "auto"}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="launch-splash"
      style={[
        StyleSheet.absoluteFill,
        s.frame,
        { backgroundColor: scheme.ground },
        frame,
      ]}
      onLayout={() => SplashScreen.hideAsync().catch(() => {})}
    >
      <Animated.View style={mark}>
        <BrandMark size={SPLASH_TILE} tile={scheme.tile} leaf={scheme.leaf} />
      </Animated.View>
      {/* Absolute so the mark stays exactly where the native splash drew it. */}
      <View style={s.wordSlot} pointerEvents="none">
        <Animated.Text
          style={[s.word, { color: dark ? "#ECF0E5" : "#203C31" }, wordmark]}
        >
          kanakku
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center", zIndex: 100 },
  wordSlot: {
    position: "absolute",
    top: "50%",
    marginTop: SPLASH_TILE / 2 + 22,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  word: {
    fontFamily: "Fraunces",
    fontSize: 34,
    lineHeight: 42,
    letterSpacing: -1,
  },
});
