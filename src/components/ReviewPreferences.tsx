import React, { useEffect, useState } from "react";
import { View, Switch, TextInput } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  native,
  ReviewPreferences as Preferences,
  defaultReviewPreferences,
  requestNotifications,
} from "../native/bridge";
import { Text, Button, styles as ui, SectionTitle } from "./ui";
import { useApp } from "../state/AppContext";
const format = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const parse = (text: string) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(text)
    ? Number(text.slice(0, 2)) * 60 + Number(text.slice(3))
    : null;
export function ReviewPreferences() {
  const { colors, setError, setNotice } = useApp();
  const [prefs, setPrefs] = useState<Preferences>(defaultReviewPreferences);
  const [start, setStart] = useState("22:00");
  const [end, setEnd] = useState("08:00");
  const [time, setTime] = useState("19:00");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let live = true;
    (native
      ? native.reviewSettings()
      : AsyncStorage.getItem("kanakku-review-preferences").then((raw) =>
          raw ? JSON.parse(raw) : defaultReviewPreferences,
        )
    )
      .then((value) => {
        if (live) {
          setPrefs(value);
          setStart(format(value.quietStart));
          setEnd(format(value.quietEnd));
          setTime(format(value.reminderTime));
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const save = async () => {
    const s = parse(start),
      e = parse(end),
      t = parse(time);
    if (
      s === null ||
      e === null ||
      t === null ||
      (prefs.quietEnabled && s === e)
    ) {
      setError(
        "Use 24-hour times such as 22:00 and 08:00. Quiet-hour start and end must differ.",
      );
      return;
    }
    setSaving(true);
    try {
      const next = { ...prefs, quietStart: s, quietEnd: e, reminderTime: t };
      if (native) {
        await native.saveReviewSettings(
          next.notifications,
          next.quietEnabled,
          s,
          e,
          next.reminder,
          t,
        );
      } else
        await AsyncStorage.setItem(
          "kanakku-review-preferences",
          JSON.stringify(next),
        );
      setPrefs(next);
      setNotice(
        native
          ? "Review preferences saved. Reminders follow Android scheduling."
          : "Preview preferences saved. Notifications need the Android app.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save review preferences.",
      );
    } finally {
      setSaving(false);
    }
  };
  const field = {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    fontFamily: "DMSans",
    minHeight: 48,
    padding: 14,
    fontSize: 14,
  } as const;
  return (
    <View style={{ marginBottom: 28, gap: 14 }}>
      <SectionTitle title="Ask at the right time" />
      <View style={[ui.between, { gap: 14 }]}>
        <View style={{ flex: 1 }}>
          <Text bold>Review notifications</Text>
          <Text muted style={{ fontSize: 11 }}>
            Private prompts for new unclear payments.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Review notifications"
          value={prefs.notifications}
          onValueChange={(notifications) =>
            setPrefs({ ...prefs, notifications })
          }
          trackColor={{ true: colors.accent, false: colors.line }}
        />
      </View>
      <View style={[ui.between, { gap: 14 }]}>
        <View style={{ flex: 1 }}>
          <Text bold>Quiet hours</Text>
          <Text muted style={{ fontSize: 11 }}>
            Hold notifications and floating prompts.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Quiet hours"
          value={prefs.quietEnabled}
          onValueChange={(quietEnabled) => setPrefs({ ...prefs, quietEnabled })}
          trackColor={{ true: colors.accent, false: colors.line }}
        />
      </View>
      {prefs.quietEnabled && (
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text muted style={{ fontSize: 11 }}>
              From
            </Text>
            <TextInput
              accessibilityLabel="Quiet hours start"
              value={start}
              onChangeText={setStart}
              placeholder="22:00"
              keyboardType="numbers-and-punctuation"
              style={field}
            />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text muted style={{ fontSize: 11 }}>
              Until
            </Text>
            <TextInput
              accessibilityLabel="Quiet hours end"
              value={end}
              onChangeText={setEnd}
              placeholder="08:00"
              keyboardType="numbers-and-punctuation"
              style={field}
            />
          </View>
        </View>
      )}
      <View style={[ui.between, { gap: 14 }]}>
        <View style={{ flex: 1 }}>
          <Text bold>Daily review reminder</Text>
          <Text muted style={{ fontSize: 11 }}>
            Only when payments still need context.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Daily review reminder"
          value={prefs.reminder}
          onValueChange={(reminder) => setPrefs({ ...prefs, reminder })}
          trackColor={{ true: colors.accent, false: colors.line }}
        />
      </View>
      {prefs.reminder && (
        <>
          <TextInput
            accessibilityLabel="Daily reminder time"
            value={time}
            onChangeText={setTime}
            keyboardType="numbers-and-punctuation"
            style={field}
          />
          <Text muted style={{ fontSize: 11, lineHeight: 18 }}>
            Local time. Android may delay reminders; reminders during quiet
            hours are skipped.
          </Text>
        </>
      )}
      <Button disabled={saving} onPress={save}>
        {saving ? "Saving…" : "Save review preferences"}
      </Button>
      <Button
        secondary
        onPress={async () => {
          try {
            const granted = await requestNotifications();
            setNotice(
              granted
                ? "Android notification access is enabled."
                : "Notification access is off. Your review queue remains available.",
            );
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Could not request notifications.",
            );
          }
        }}
      >
        Allow Android notifications
      </Button>
      <Text muted style={{ fontSize: 11, lineHeight: 18 }}>
        Import progress uses a separate notification. The in-app review queue is
        always available.
      </Text>
    </View>
  );
}
