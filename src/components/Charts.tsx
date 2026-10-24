import React from "react";
import { View, Pressable } from "react-native";
import Svg, {
  Path,
  Line,
  Circle,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { Transaction, spendOf } from "../domain/model";
import { dateKey } from "../domain/ledger";
import { useApp } from "../state/AppContext";
import { Text } from "./ui";
export function SpendingChart({
  transactions,
  onDay,
  until = new Date(),
  hideAmount = false,
  compact = false,
}: {
  transactions: Transaction[];
  onDay?: (date: string) => void;
  until?: Date;
  hideAmount?: boolean;
  compact?: boolean;
}) {
  const { colors } = useApp();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(until);
    d.setDate(d.getDate() - 6 + i);
    const key = dateKey(d);
    return {
      date: d,
      key,
      amount: transactions
        .filter((t) => dateKey(t.at) === key)
        .reduce((s, t) => s + Math.max(0, spendOf(t)), 0),
    };
  });
  const max = Math.max(...days.map((d) => d.amount), 1);
  return (
    <View
      accessibilityLabel="Daily purchases over the last seven days"
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        height: compact ? 76 : 124,
        gap: compact ? 8 : 13,
        marginTop: compact ? 13 : 22,
      }}
    >
      {days.map((d, i) => (
        <Pressable
          key={d.key}
          accessibilityRole="button"
          accessibilityLabel={`${d.date.toDateString()}${hideAmount ? ", amount hidden" : `, ${d.amount / 100} rupees`}`}
          onPress={() => onDay?.(d.key)}
          style={{
            flex: 1,
            height: compact ? 76 : 124,
            justifyContent: "flex-end",
            alignItems: "center",
            gap: compact ? 5 : 10,
          }}
        >
          <View
            style={{
              height: Math.max(5, (d.amount / max) * (compact ? 46 : 87)),
              width: "100%",
              maxWidth: compact ? 27 : 34,
              backgroundColor: i === 6 ? colors.accent : colors.accent,
              borderRadius: 6,
              opacity: i === 6 ? 1 : 0.16 + i * 0.075,
            }}
          />
          <Text
            style={{
              fontSize: compact ? 9 : 10,
              color: i === 6 ? colors.text : colors.muted,
            }}
            bold={i === 6}
          >
            {d.date
              .toLocaleDateString("en-IN", { weekday: "short" })
              .slice(0, 1)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function TrendChart({
  transactions,
  month,
}: {
  transactions: Transaction[];
  month: string;
}) {
  const { colors } = useApp();
  const [year, m] = month.split("-").map(Number);
  const now = new Date();
  const dayCount =
    year === now.getFullYear() && m === now.getMonth() + 1
      ? now.getDate()
      : new Date(year, m, 0).getDate();
  const daily = Array.from({ length: dayCount }, (_, i) =>
    transactions
      .filter((t) => new Date(t.at).getDate() === i + 1)
      .reduce((sum, t) => sum + spendOf(t), 0),
  );
  let sum = 0;
  const cumulative = daily.map((x) => (sum += x));
  const max = Math.max(...cumulative, 1);
  const min = Math.min(...cumulative, 0);
  const y = (value: number) => 110 - ((value - min) / (max - min)) * 90;
  const points = cumulative
    .map((value, i) => `${(i * 300) / Math.max(1, dayCount - 1)},${y(value)}`)
    .join(" L");
  return (
    <View style={{ height: 155, marginVertical: 18 }}>
      <Svg width="100%" height="140" viewBox="0 0 300 130">
        <Defs>
          <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.accent} stopOpacity=".2" />
            <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {[30, 65, 100].map((y) => (
          <Line
            key={y}
            x1="0"
            y1={y}
            x2="300"
            y2={y}
            stroke={colors.line}
            strokeDasharray="3 5"
          />
        ))}
        <Path d={`M${points} L300,125 L0,125 Z`} fill="url(#fill)" />
        <Path
          d={`M${points}`}
          fill="none"
          stroke={colors.accent}
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <Circle
          cx="300"
          cy={y(cumulative[dayCount - 1])}
          r="4"
          fill={colors.accent}
        />
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text muted style={{ fontSize: 10 }}>
          1st
        </Text>
        <Text muted style={{ fontSize: 10 }}>
          {Math.ceil(dayCount / 2)}th
        </Text>
        <Text muted style={{ fontSize: 10 }}>
          {dayCount === now.getDate() &&
          year === now.getFullYear() &&
          m === now.getMonth() + 1
            ? "Today"
            : "End of month"}
        </Text>
      </View>
    </View>
  );
}
