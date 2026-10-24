import React, { useEffect, useState } from "react";
import { View, Pressable, TextInput } from "react-native";
import { useApp } from "../state/AppContext";
import { Kind, Category } from "../domain/model";
import {
  DateRange,
  LedgerFilter,
  KIND_OPTIONS,
  monthRange,
  validDay,
  rangeLabel,
} from "../domain/ledger";
import { Text, Button } from "./ui";
import { Sheet } from "./Sheet";
export function Option({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      aria-pressed={selected}
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.line,
        backgroundColor: selected ? colors.accentSoft : colors.card,
        paddingHorizontal: 14,
        minHeight: 48,
        justifyContent: "center",
        borderRadius: 13,
      }}
    >
      <Text bold={selected} style={{ fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}
export function LedgerFilters({
  visible,
  onClose,
  value,
  month,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  value: LedgerFilter;
  month: string;
  onApply: (filter: LedgerFilter) => void;
}) {
  const { colors, transactions, categories } = useApp();
  const [draft, setDraft] = useState(value);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (visible) {
      setDraft(value);
      setFrom(value.range?.start || "");
      setTo(value.range?.end || "");
      setError("");
    }
  }, [visible]);
  const changeRange = (range: DateRange) => {
    setDraft({ ...draft, range });
    setFrom(range.start || "");
    setTo(range.end || "");
    setError("");
  };
  const apply = () => {
    if (
      (from && !validDay(from)) ||
      (to && !validDay(to)) ||
      (from && to && from > to)
    ) {
      setError(
        "Enter valid dates as YYYY-MM-DD, with the start before the end.",
      );
      return;
    }
    const range: DateRange = {
      start: from || null,
      end: to || null,
      label: "Selected dates",
    };
    range.label = rangeLabel(range);
    onApply({ ...draft, range, merchant: null });
    onClose();
  };
  const input = {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    padding: 14,
    minHeight: 48,
    color: colors.text,
    fontFamily: "DMSans",
    fontSize: 13,
  } as const;
  return (
    <Sheet
      testID="filters-sheet"
      visible={visible}
      onClose={onClose}
      title="Find your transactions"
    >
      <Text bold>Period</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Option
          label="Selected month"
          selected={
            from === monthRange(month).start && to === monthRange(month).end
          }
          onPress={() => changeRange(monthRange(month))}
        />
        <Option
          label="All history"
          selected={!from && !to}
          onPress={() =>
            changeRange({
              start: null,
              end: null,
              label: "All captured history",
            })
          }
        />
      </View>
      <View style={{ gap: 8 }}>
        <Text muted style={{ fontSize: 11 }}>
          Custom dates · YYYY-MM-DD · leave blank for any date
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextInput
            accessibilityLabel="Start date"
            value={from}
            onChangeText={setFrom}
            placeholder="Start date"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={[input, { flex: 1 }]}
          />
          <TextInput
            accessibilityLabel="End date"
            value={to}
            onChangeText={setTo}
            placeholder="End date"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={[input, { flex: 1 }]}
          />
        </View>
      </View>
      <Text bold>Account</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Option
          label="All accounts"
          selected={!draft.account}
          onPress={() => setDraft({ ...draft, account: null })}
        />
        {[...new Set(transactions.map((t) => `${t.bank} ${t.account}`))]
          .sort()
          .map((a) => (
            <Option
              key={a}
              label={a}
              selected={draft.account === a}
              onPress={() => setDraft({ ...draft, account: a })}
            />
          ))}
      </View>
      <Text bold>Transaction type</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Option
          label="All types"
          selected={!draft.kind}
          onPress={() => setDraft({ ...draft, kind: null })}
        />
        {KIND_OPTIONS.map((k) => (
          <Option
            key={k.value}
            label={k.label}
            selected={draft.kind === k.value}
            onPress={() => setDraft({ ...draft, kind: k.value })}
          />
        ))}
      </View>
      <Text bold>Source</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Option
          label="All sources"
          selected={!draft.source}
          onPress={() => setDraft({ ...draft, source: null })}
        />
        <Option
          label="SMS"
          selected={draft.source === "sms"}
          onPress={() => setDraft({ ...draft, source: "sms" })}
        />
        <Option
          label="Email"
          selected={draft.source === "email"}
          onPress={() => setDraft({ ...draft, source: "email" })}
        />
        <Option
          label="Manual"
          selected={draft.source === "manual"}
          onPress={() => setDraft({ ...draft, source: "manual" })}
        />
      </View>
      <Text bold>Category</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Option
          label="All categories"
          selected={!draft.category}
          onPress={() => setDraft({ ...draft, category: null })}
        />
        {categories.map((c) => (
          <Option
            key={c}
            label={c}
            selected={draft.category === c}
            onPress={() => setDraft({ ...draft, category: c })}
          />
        ))}
      </View>
      <Option
        label="Only payments needing context"
        selected={!!draft.reviewOnly}
        onPress={() =>
          setDraft({
            ...draft,
            reviewOnly: !draft.reviewOnly,
            awaitingContextOnly: false,
          })
        }
      />
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.danger, fontSize: 12 }}
        >
          {error}
        </Text>
      )}
      <Button onPress={apply}>Show transactions</Button>
      <Button
        secondary
        onPress={() => {
          const range = monthRange(month);
          setDraft({ range });
          setFrom(range.start!);
          setTo(range.end!);
          setError("");
        }}
      >
        Reset filters
      </Button>
    </Sheet>
  );
}
