import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { FingerprintPattern } from "lucide-react-native";
import { Button, Text, styles as ui } from "./ui";
import { useApp } from "../state/AppContext";
import { native } from "../native/bridge";

const KEY = "kanakku-lock-choice-v1";
type Choice = { opens: number; decided: boolean };
let countedThisLaunch = false;

async function read(): Promise<Choice> {
  try {
    const value = JSON.parse((await AsyncStorage.getItem(KEY)) ?? "null");
    if (value && typeof value.opens === "number") return { opens: value.opens, decided: !!value.decided };
  } catch {}
  return { opens: 0, decided: false };
}
/** The user has chosen how Kanakku opens (at connect or from this card). */
export async function markLockChoiceMade() {
  const current = await read();
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...current, decided: true })).catch(() => undefined);
}

/**
 * Existing users never chose how the journal opens. On the second unlocked launch (not the first,
 * which is busy with the update), ask once; the answer can be changed later in Settings.
 */
export function LockChoiceCard() {
  const app = useApp();
  const { colors } = app;
  const [show, setShow] = useState(false);
  const eligible = !!native && app.mode === "live" && !app.locked && app.lockMode === "device";
  useEffect(() => {
    if (!eligible) return;
    let live = true;
    void (async () => {
      const current = await read();
      const next = countedThisLaunch ? current : { ...current, opens: current.opens + 1 };
      countedThisLaunch = true;
      await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
      if (live) setShow(!next.decided && next.opens >= 2);
    })();
    return () => {
      live = false;
    };
  }, [eligible]);
  if (!eligible || !show) return null;
  const decide = async () => {
    await markLockChoiceMade();
    setShow(false);
  };
  return (
    <View
      testID="lock-choice-card"
      style={[ui.card, { marginTop: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, gap: 10 }]}
    >
      <View style={[ui.row, { gap: 10 }]}>
        <FingerprintPattern size={20} color={colors.accent} />
        <Text bold style={{ flex: 1, fontSize: 13 }}>
          Keep asking for your phone lock?
        </Text>
      </View>
      <Text muted style={{ fontSize: 12, lineHeight: 19 }}>
        Kanakku asks for your fingerprint, PIN or pattern each time it opens. You can turn that off;
        your journal stays encrypted on this phone either way.
      </Text>
      <Button disabled={app.busy} onPress={() => void decide()}>
        Keep asking
      </Button>
      <Button
        secondary
        disabled={app.busy}
        onPress={async () => {
          if (await app.setLockMode("open")) await decide();
        }}
      >
        Open without asking
      </Button>
      {!app.hasRecovery && (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/settings?section=privacy")}
          style={{ minHeight: 40, justifyContent: "center" }}
        >
          <Text style={{ color: colors.accent, fontSize: 12 }}>
            Also add a recovery password, in case your screen lock ever changes
          </Text>
        </Pressable>
      )}
    </View>
  );
}
