import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  BellRing,
  Check,
  CloudUpload,
  HardDriveDownload,
  KeyRound,
  Mail,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react-native";
import { useApp } from "../src/state/AppContext";
import { Button, Text } from "../src/components/ui";
import { Mascot } from "../src/components/Avatar";
import { LockChoice } from "../src/components/LockChoice";
import { ImportPeriodPicker } from "../src/components/ImportPeriodPicker";
import { DriveBackupSettings } from "../src/components/DriveBackupSettings";
import { markLockChoiceMade } from "../src/components/LockChoiceCard";
import { native, type LockMode } from "../src/native/bridge";
import { markOnboarded } from "../src/data/onboarding";
import { periodSinceBackup } from "../src/domain/import";

type Step = "welcome" | "lock" | "backup" | "sources" | "done";
const STEPS: Step[] = ["welcome", "lock", "backup", "sources", "done"];
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * First run on Android: what Kanakku does → how it opens → restore an old journal (before any
 * import, because a restore replaces the journal) → where alerts come from → next steps.
 */
export default function Welcome() {
  const app = useApp();
  const { colors, dark, busy } = app;
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("welcome");
  const [lock, setLock] = useState<LockMode>("device");
  const [restoring, setRestoring] = useState(false);
  const [restoredFrom, setRestoredFrom] = useState<string | null>(null);
  const [sms, setSms] = useState(true);
  const [gmail, setGmail] = useState(false);
  const [months, setMonths] = useState<number | null>(3);
  const [connected, setConnected] = useState<string[]>([]);
  useEffect(() => {
    if (restoredFrom) setMonths(periodSinceBackup(restoredFrom));
  }, [restoredFrom]);
  const leave = async (to: "/" | "/settings?section=accounts" | "/settings?section=privacy") => {
    await markOnboarded();
    router.replace(to as never);
  };
  const startRestore = async () => {
    await app.createJournal(lock);
    setRestoring(true);
  };
  const connectSources = async () => {
    const done: string[] = [];
    if (sms) {
      await app.connect(months, lock);
      if (native?.status().capture) done.push("sms");
    }
    if (gmail) {
      const status = await app.connectEmail(months ?? 1, lock);
      if (status?.connected) done.push("gmail");
    }
    setConnected(done);
    if (done.length) setStep("done");
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
  const source = (
    key: "sms" | "gmail",
    on: boolean,
    toggle: () => void,
    Icon: typeof ShieldCheck,
    title: string,
    detail: string,
  ) => (
    <Pressable
      key={key}
      testID={`source-${key}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: busy }}
      accessibilityLabel={`${title}. ${detail}`}
      disabled={busy}
      onPress={toggle}
      style={{
        flexDirection: "row",
        gap: 12,
        padding: 14,
        borderRadius: 16,
        borderWidth: on ? 2 : 1,
        borderColor: on ? colors.accent : colors.line,
        backgroundColor: on ? colors.accentSoft : colors.card,
      }}
    >
      <Icon size={20} color={on ? colors.accent : colors.muted} />
      <View style={{ flex: 1 }}>
        <Text bold style={{ fontSize: 13 }}>{title}</Text>
        <Text muted style={{ fontSize: 11, lineHeight: 17, marginTop: 3 }}>{detail}</Text>
      </View>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? colors.accent : colors.line, backgroundColor: on ? colors.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
        {on ? <Check size={14} color={colors.accentText} /> : null}
      </View>
    </Pressable>
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
            <Text style={{ color: colors.muted }}>Skip setup</Text>
          </Pressable>
        )}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 32, gap: 18, flexGrow: 1 }}>
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
            <Button onPress={() => { void markLockChoiceMade(); setStep("backup"); }}>Continue</Button>
            <Button secondary onPress={() => setStep("welcome")}>Back</Button>
          </>
        )}
        {step === "backup" && (
          <>
            <Text serif style={{ fontSize: 30, lineHeight: 38 }}>Used Kanakku before?</Text>
            {!restoring ? (
              <>
                <Text muted style={{ lineHeight: 20 }}>
                  Restore your encrypted Google Drive backup first, so your notes, categories and rules come back. Bank alerts are imported after it, without duplicates.
                </Text>
                {app.error ? <Text style={{ color: colors.danger, lineHeight: 20 }}>{app.error}</Text> : null}
                <View style={{ flex: 1 }} />
                <Button disabled={busy} onPress={() => void startRestore()}>
                  {busy ? "Opening your journal…" : "Yes, restore from Google Drive"}
                </Button>
                <Button secondary disabled={busy} onPress={() => setStep("sources")}>No, start fresh</Button>
                <Button secondary disabled={busy} onPress={() => setStep("lock")}>Back</Button>
              </>
            ) : restoredFrom ? (
              <>
                {point(HardDriveDownload, "Backup restored", `Your journal is back as of ${shortDate(restoredFrom)}. Next, bring in bank alerts from after that date.`)}
                <View style={{ flex: 1 }} />
                <Button onPress={() => setStep("sources")}>Continue</Button>
              </>
            ) : (
              <>
                <DriveBackupSettings restoreOnly onRestored={(backup) => setRestoredFrom(backup.createdAt)} />
                <View style={{ flex: 1 }} />
                <Button secondary disabled={busy} onPress={() => setStep("sources")}>Skip restore and continue</Button>
              </>
            )}
          </>
        )}
        {step === "sources" && (
          <>
            <Text serif style={{ fontSize: 30, lineHeight: 38 }}>Where do your bank alerts come from?</Text>
            {source("sms", sms, () => setSms((on) => !on), MessageSquareText, "Bank SMS (recommended)", "Only bank alerts are kept. OTPs and personal messages are ignored and never saved.")}
            {source("gmail", gmail, () => setGmail((on) => !on), Mail, "Also check Gmail (beta)", "For banks that send some alerts only by email, like SBI. Google is still reviewing Kanakku's Gmail access; if Google blocks the sign-in, SMS keeps working.")}
            {restoredFrom ? (
              <Text muted style={{ fontSize: 12, lineHeight: 18 }}>
                Your backup is from {shortDate(restoredFrom)}. This period covers everything since; payments already in it are skipped.
              </Text>
            ) : null}
            <ImportPeriodPicker value={months} onChange={setMonths} allowSkip disabled={busy} />
            {point(BellRing, "Android will ask next", `${sms ? "SMS access, " : ""}notifications for import progress${lock === "device" ? ", and your phone lock" : ""}${gmail ? ", then Google for Gmail" : ""}.`)}
            {app.error ? <Text style={{ color: colors.danger, lineHeight: 20 }}>{app.error}</Text> : null}
            <View style={{ flex: 1 }} />
            <Button disabled={busy || (!sms && !gmail)} onPress={() => void connectSources()}>
              {busy ? "Connecting…" : "Allow access and continue"}
            </Button>
            <Button secondary disabled={busy} onPress={() => setStep("backup")}>Back</Button>
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
                ? "New alerts will appear as they arrive. You can import past alerts anytime from Settings."
                : `Recent alerts come in first; older history keeps importing in the background${connected.includes("gmail") ? ", from SMS and Gmail" : ""}.`}
            </Text>
            {!restoredFrom && (
              <>
                {point(CloudUpload, "Keep a backup", "Turn on automatic, encrypted Google Drive backup so a new phone can pick up where you left off.")}
                <Button secondary onPress={() => void leave("/settings?section=accounts")}>Set up Drive backup</Button>
              </>
            )}
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
