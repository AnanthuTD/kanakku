import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Share, View } from "react-native";
import { MessageSquareWarning } from "lucide-react-native";
import { Button, Text, styles as ui } from "./ui";
import { useApp } from "../state/AppContext";
import { native, type UnreadAlerts as Unread } from "../native/bridge";

const ISSUE_URL = "https://github.com/AnanthuTD/kanakku/issues/new?template=parser_gap.md";

/**
 * Bank messages that looked like payments but no template could read. Only masked shapes are
 * kept on the phone; sharing them is always the user's choice, through Android's share sheet.
 */
export function UnreadAlertsCard() {
  const { colors, mode } = useApp();
  const [unread, setUnread] = useState<Unread | null>(null);
  const [open, setOpen] = useState(false);
  const refresh = useCallback(() => {
    if (!native || mode !== "live") return;
    native.unreadAlerts().then(setUnread, () => setUnread(null));
  }, [mode]);
  useEffect(refresh, [refresh]);
  if (!unread?.count) return null;
  const message = [
    "Kanakku couldn't read these bank alert formats. Every digit is replaced with 9 and every name, payee and other word outside common banking terms with _.",
    "",
    ...unread.samples,
    "",
    `Report it here so the bank can be supported: ${ISSUE_URL}`,
  ].join("\n");
  return (
    <View
      testID="unread-alerts"
      style={[ui.card, { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, marginBottom: 25 }]}
    >
      <View style={[ui.row, { gap: 12, marginBottom: 8 }]}>
        <MessageSquareWarning size={20} color={colors.orange} />
        <Text bold style={{ flex: 1 }}>
          {unread.count} bank {unread.count === 1 ? "message" : "messages"} couldn’t be read
        </Text>
      </View>
      <Text muted style={{ fontSize: 12, lineHeight: 19 }}>
        Your bank may use a format Kanakku doesn’t know yet, so these payments are missing from your totals. You can share masked samples to get it supported.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: colors.accent, fontSize: 12 }}>
          {open ? "Hide what would be shared" : "See what would be shared"}
        </Text>
      </Pressable>
      {open && (
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.accentSoft, gap: 8, marginBottom: 12 }}>
          {unread.samples.map((sample) => (
            <Text key={sample} selectable style={{ fontSize: 11, lineHeight: 17 }}>
              {sample}
            </Text>
          ))}
        </View>
      )}
      <Button onPress={() => void Share.share({ message })}>Share masked samples</Button>
      <Button
        secondary
        style={{ marginTop: 10 }}
        onPress={() => {
          if (native) native.clearUnreadAlerts().then(setUnread, refresh);
        }}
      >
        Clear this list
      </Button>
    </View>
  );
}
