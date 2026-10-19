import React from "react";
import { View, Pressable } from "react-native";
import { ChevronRight } from "lucide-react-native";
import {
  Transaction,
  money,
  transactionMoney,
  needsInrSettlement,
} from "../domain/model";
import { useApp } from "../state/AppContext";
import { Text, CategoryIcon } from "./ui";
export function TransactionRow({
  transaction: t,
  onPress,
  hideAmount = false,
}: {
  transaction: Transaction;
  onPress: () => void;
  hideAmount?: boolean;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      testID={`transaction-${t.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${t.merchant}, ${hideAmount ? "amount hidden" : transactionMoney(t)}, ${t.review ? "needs review" : t.category}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        paddingVertical: 15,
        opacity: pressed ? 0.6 : 1,
        borderBottomWidth: 1,
        borderColor: colors.line,
      })}
    >
      <CategoryIcon category={t.category} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text bold numberOfLines={1} style={{ fontSize: 14 }}>
          {t.merchant}
        </Text>
        <Text muted numberOfLines={1} style={{ fontSize: 11 }}>
          {t.bank} · {t.account}
          {t.excluded ? " · Excluded" : ""}
          {t.source === "email" ? " · Email" : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Text
          bold
          style={{
            fontSize: 15,
            color: t.kind === "refund" ? colors.accent : colors.text,
          }}
        >
          {hideAmount
            ? "••••"
            : `${t.kind === "refund" || t.kind === "income" ? "+" : ""}${transactionMoney(t)}`}
        </Text>
        {!!t.inrAmount && !hideAmount && (
          <Text muted style={{ fontSize: 10 }}>
            INR {money(t.inrAmount, true)}
          </Text>
        )}
        <Text
          style={{
            fontSize: 10,
            color: t.review ? colors.orange : colors.muted,
          }}
        >
          {t.emailMatchCandidates?.length
            ? "Possible alert match"
            : needsInrSettlement(t)
              ? "INR charge needed"
              : t.review
                ? "Needs context"
                : t.kind === "card_payment"
                  ? "Card repayment"
                  : t.kind === "transfer"
                    ? "Transfer"
                    : t.kind === "income"
                      ? "Income"
                      : t.timePrecision === "day"
                        ? "Date only"
                        : new Date(t.at).toLocaleTimeString("en-IN", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
        </Text>
      </View>
      <ChevronRight size={13} color={colors.muted} />
    </Pressable>
  );
}
