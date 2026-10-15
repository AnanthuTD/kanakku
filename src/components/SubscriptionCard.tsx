import React from "react";
import { View, Pressable } from "react-native";
import { ArrowUpRight, Repeat2 } from "lucide-react-native";
import { useApp } from "../state/AppContext";
import { money } from "../domain/model";
import { RecurringDecision, RecurringPayment } from "../domain/subscriptions";
import { Text, styles as ui } from "./ui";

export const recurringDate = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export function SubscriptionCard({
  payment,
  decision,
  onPress,
}: {
  payment: RecurringPayment;
  decision?: RecurringDecision;
  onPress: () => void;
}) {
  const { colors } = useApp();
  const label =
    payment.type === "subscription"
      ? "Subscription pattern"
      : payment.type === "bill"
        ? "Recurring bill"
        : "Recurring spending";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Review ${payment.merchant} ${payment.cadence} pattern`}
      onPress={onPress}
      style={({ pressed }) => [
        {
          ...ui.card,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.line,
          opacity: pressed ? 0.8 : 1,
          gap: 16,
        },
      ]}
    >
      <View style={[ui.between, { gap: 12 }]}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 15,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.accentSoft,
          }}
        >
          <Repeat2 size={22} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text bold style={{ fontSize: 16 }}>
            {payment.merchant}
          </Text>
          <Text muted style={{ fontSize: 12 }}>
            {payment.bank} · {payment.account}
          </Text>
        </View>
        <ArrowUpRight size={19} color={colors.accent} />
      </View>
      <View style={ui.between}>
        <Text serif style={{ fontSize: 27, lineHeight: 35 }}>
          {money(payment.usualAmount)}
        </Text>
        <Text muted>{payment.cadence}</Text>
      </View>
      <View style={{ gap: 5 }}>
        <Text style={{ fontSize: 12, color: colors.accent }} bold>
          {decision === "confirmed"
            ? "Confirmed by you"
            : decision === "ignored"
              ? "Ignored by you"
              : `${payment.confidence === "likely" ? "Likely" : "Possible"} · ${label.toLowerCase()}`}
        </Text>
        <Text muted style={{ fontSize: 12 }}>
          {payment.status === "expected"
            ? `Next estimate · ${recurringDate(payment.estimatedNextAt)}`
            : "No recent matching charge"}
        </Text>
        <Text muted style={{ fontSize: 11 }}>
          {payment.transactionIds.length} recorded charges · Tap to see the
          evidence
        </Text>
      </View>
    </Pressable>
  );
}
