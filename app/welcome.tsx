import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { BellRing, HardDriveDownload, KeyRound, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react-native";
import { useApp } from "../src/state/AppContext";
import { Button, Text } from "../src/components/ui";
import { Mascot } from "../src/components/Avatar";
import { LockChoice } from "../src/components/LockChoice";
import { ImportPeriodPicker } from "../src/components/ImportPeriodPicker";
import { markLockChoiceMade } from "../src/components/LockChoiceCard";
import type { LockMode } from "../src/native/bridge";
import { markOnboarded } from "../src/data/onboarding";


type Step = "welcome" | "lock" | "alerts" | "done";
const STEPS: Step[] = ["welcome", "lock", "alerts", "done"];

/** First run on Android: what Kanakku does, how it opens, bank alerts and permissions, next steps. */
export default function Welcome() {
  const app = useApp();
  const { colors, dark, busy } = app;
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("welcome");
  const [lock, setLock] = useState<LockMode>("device");
  const [months, setMonths] = useState<number | null>(3);
  useEffect(() => {
    if (app.mode === "live" && step === "alerts") setStep("done");
  }, [app.mode, step]);
  const leave = async (to: "/" | "/settings?section=accounts" | "/settings?section=privacy") => {
    await markOnboarded();
    router.replace(to as never);
  };
  const index = STEPS.indexOf(step);
  const point = (Icon: typeof ShieldCheck, title: string, detail: string) => (
    <View key={title} style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
      <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft }}>
        <Icon size={19} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text bold style={{ fontSize: 15 }}>{title}</Text>
        <Text muted style={{ marginTop: 3, lineHeight: 20 }}>{detail}</Text>
      </View>
    </View>
  );
  return (
    <View testID="welcome" style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={dark ? "light" : "dark"} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: Math.max(insets.top, 16) + 8 }}>
        <View accessibilityLabel={`Step ${index + 1} of ${STEPS.length}`} style={{ flexDirection: "row", gap: 6 }}>
          {STEPS.map((s, i) => (
            <View key={s} style={{ width: i === index ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i <= index ? colors.accent : colors.line }} />
          ))}
        </View>
        {step !== "done" && (
          <Pressable accessibilityRole="button" onPress={() => void leave("/")} style={{ minHeight: 44, justifyContent: "center" }}>
            <Text style={{ color: colors.muted }}>Skip for now</Text>
          </Pressable>
        )}
      </View>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 32, gap: 18, flexGrow: 1 }}>
        {step === "welcome" && (
          <>
            <View style={{ alignItems: "center", marginTop: 8 }}>
              <Mascot size={110} />
            </View>
            <Text serif style={{ fontSize: 32, lineHeight: 40 }}>Your bank SMS, turned into a private spend journal.</Text>
            {point(MessageSquareText, "Reads bank alerts on this phone", "Payments are picked up from bank SMS as they arrive. No bank login, no account.")}
            {point(Sparkles, "Asks only when it's unsure", "Clear payments are filed for you. For the rest, say or type what they were for.")}
            {point(ShieldCheck, "Stays on your phone", "Your journal is encrypted here. No server, no ads, nothing uploaded unless you choose a backup.")}
            <View style={{ flex: 1 }} />
            <Button onPress={() => setStep("lock")}>Get started</Button>
          </>
        )}
        {step === "lock" && (
          <>
            <Text serif style={{ fontSize: 30, lineHeight: 38 }}>How should Kanakku open?</Text>
            <Text muted style={{ lineHeight: 20 }}>Your journal is encrypted either way. This only decides whether your phone lock is asked for each time.</Text>
            <LockChoice value={lock} onChange={setLock} />
            <Text muted style={{ fontSize: 12 }}>You can change this anytime in Settings › Privacy & device.</Text>
            <View style={{ flex: 1 }} />
            <Button onPress={() => { void markLockChoiceMade(); setStep("alerts"); }}>Continue</Button>
            <Button secondary onPress={() => setStep("welcome")}>Back</Button>
          </>
        )}
        {step === "alerts" && (
          <>
            <Text serif style={{ fontSize: 30, lineHeight: 38 }}>Bring in your bank alerts</Text>
            {point(MessageSquareText, "SMS access", "Android will ask to let Kanakku read SMS. Only bank alerts are kept; OTPs and personal messages are ignored and never saved.")}
            {point(BellRing, "Notifications", "For import progress and a private nudge when a payment needs your note. Optional.")}
            <Text bold style={{ marginTop: 6 }}>How far back should Kanakku look?</Text>
            <ImportPeriodPicker value={months} onChange={setMonths} allowSkip disabled={busy} />
            {app.error ? <Text style={{ color: colors.danger, lineHeight: 20 }}>{app.error}</Text> : null}
            <View style={{ flex: 1 }} />
            <Button disabled={busy} onPress={() => void app.connect(months, lock)}>
              {busy ? "Connecting…" : "Allow access and continue"}
            </Button>
            <Button secondary disabled={busy} onPress={() => setStep("lock")}>Back</Button>
          </>
        )}
        {step === "done" && (
          <>
            <View style={{ alignItems: "center", marginTop: 8 }}>
              <Mascot size={96} />
            </View>
            <Text serif style={{ fontSize: 30, lineHeight: 38 }}>You're set.</Text>
            <Text muted style={{ lineHeight: 20 }}>
              {months === null
                ? "New bank alerts will appear as they arrive. You can import past alerts anytime from Settings."
                : "Recent alerts come in first; older history keeps importing in the background."}
            </Text>
            {point(HardDriveDownload, "Used Kanakku before?", "Restore your encrypted Google Drive backup to bring back notes, categories and rules.")}
            <Button secondary onPress={() => void leave("/settings?section=accounts")}>Restore from Google Drive</Button>
            {app.lockMode === "device" && (
              <>
                {point(KeyRound, "Add a recovery password", "If you ever remove your screen lock, Android deletes the key that opens your journal. This password opens it again.")}
                <Button secondary onPress={() => void leave("/settings?section=privacy")}>Set a recovery password</Button>
              </>
            )}
            <View style={{ flex: 1 }} />
            <Button onPress={() => void leave("/")}>Go to my journal</Button>
          </>
        )}
      </ScrollView>
    </View>
  );
}
