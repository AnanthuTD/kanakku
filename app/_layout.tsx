import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useFonts } from "expo-font";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { Fraunces_400Regular } from "@expo-google-fonts/fraunces";
import { View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { AppProvider, useApp } from "../src/state/AppContext";
import { LaunchSplash } from "../src/components/LaunchSplash";
import { appUpdates } from "../src/services/appUpdates";

// The native splash stays up until LaunchSplash draws an identical frame.
SplashScreen.preventAutoHideAsync().catch(() => {});
function Navigation() {
  const { colors } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "fade",
        }}
      />
      <LaunchSplash />
    </View>
  );
}
export default function Layout() {
  const [fonts, error] = useFonts({
    DMSans: DMSans_400Regular,
    DMSansMedium: DMSans_500Medium,
    DMSansBold: DMSans_700Bold,
    Fraunces: Fraunces_400Regular,
  });
  useEffect(() => {
    // Fetch compatible OTA updates in the background after launch. Applying
    // one remains a deliberate restart so active edits are never interrupted.
    void appUpdates.checkAndDownload();
  }, []);
  // Fonts load behind the native splash.
  if (!fonts && !error) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <BottomSheetModalProvider>
            <Navigation />
          </BottomSheetModalProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
