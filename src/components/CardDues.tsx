import React from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";
import { CalendarClock, Check, ChevronRight } from "lucide-react-native";
import { Text } from "./ui";
import { useApp } from "../state/AppContext";
import { money } from "../domain/model";
import { indiaToday, visibleCardDues, type CardDueStatus } from "../domain/cardDues";

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

function when(status: CardDueStatus) {
  if (status.state === "settled") return "Paid";
  if (status.daysLeft < 0) return `was due ${shortDate(status.due.dueDate)}`;
  if (status.daysLeft === 0) return "due today";
  if (status.daysLeft === 1) return "due tomorrow";
  return `due in ${status.daysLeft} days`;
}

/** Card bills read from statement alerts. Facts and dates only: no nudges about spending. */
export function CardDues({ hideAmount }: { hideAmount: boolean }) {
  const { colors, cardDues, transactions, settleCardDue } = useApp();
  const shown = visibleCardDues(cardDues, transactions, indiaToday(new Date()));
  if (!shown.length) return null;
  const amount = (paise: number) => (hideAmount ? "₹ •••" : money(paise));
  const confirmSettled = (status: CardDueStatus) => {
    const title = `Mark ${status.due.bank} ••${status.due.account} as paid?`;
    const message =
      "Use this when you paid from an account Kanakku can't see. Repayments it does see are matched automatically.";
    if (Platform.OS === "web") {
      if (globalThis.confirm(`${title}\n\n${message}`)) void settleCardDue(status.due.id);
    } else
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel" },
        { text: "Mark paid", onPress: () => void settleCardDue(status.due.id) },
      ]);
  };
  return (
    <View testID="card-dues" style={{ marginTop: 10, gap: 10 }}>
      {shown.map((status) => {
        const settled = status.state === "settled";
        const urgent = !settled && status.daysLeft <= 3;
        const tint = settled ? colors.accent : urgent ? colors.orange : colors.blue;
        const soft = settled ? colors.accentSoft : urgent ? colors.orangeSoft : colors.blueSoft;
        const card = `${status.due.bank} card ••${status.due.account}`;
        const headline = settled
          ? `${card} paid`
          : `${amount(status.remaining)} ${when(status)}`;
        const detail = settled
          ? status.paid
            ? `${amount(status.paid)} repayment seen`
            : "Marked paid"
          : [
              card,
              status.paid ? `${amount(status.paid)} paid so far` : null,
              status.due.minimumDue ? `min ${amount(status.due.minimumDue)}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
        return (
          <Pressable
            key={status.due.id}
            testID={`card-due-${status.due.account}`}
            accessibilityRole="button"
            accessibilityLabel={`${status.due.bank} card ending ${status.due.account}: ${settled ? "paid" : `${amount(status.remaining)} ${when(status)}`}. ${detail}. Statement ${shortDate(status.due.at.slice(0, 10))}`}
            accessibilityHint={settled ? undefined : "Mark this bill as paid"}
            disabled={settled}
            onPress={() => confirmSettled(status)}
            style={[s.row, { borderColor: colors.line, backgroundColor: colors.card }]}
          >
            <View style={[s.icon, { backgroundColor: soft }]}>
              {settled ? <Check size={18} color={tint} /> : <CalendarClock size={18} color={tint} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text bold numberOfLines={1} style={{ fontSize: 12 }}>
                {headline}
              </Text>
              <Text muted numberOfLines={2} style={{ fontSize: 10, marginTop: 2 }}>
                {detail}
              </Text>
            </View>
            {!settled && <ChevronRight size={16} color={colors.muted} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    minHeight: 64,
    padding: 11,
    borderWidth: 1,
    borderRadius: 17,
    flexDirection: "row",
    gap: 11,
    alignItems: "center",
  },
  icon: { width: 34, height: 34, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});
