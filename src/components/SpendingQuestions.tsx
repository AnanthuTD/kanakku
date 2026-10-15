import React, { useState } from "react";
import { View, TextInput } from "react-native";
import { useApp } from "../state/AppContext";
import {
  interpretQuestion,
  LedgerFilter,
  filterLedger,
} from "../domain/ledger";
import { money, netSpend } from "../domain/model";
import { Text, Button, SectionTitle } from "./ui";
import { Option } from "./LedgerFilters";
export function SpendingQuestions({
  onOpen,
}: {
  onOpen: (filter: LedgerFilter) => void;
}) {
  const { colors, transactions, mode, importProgress } = useApp();
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<ReturnType<
    typeof interpretQuestion
  > | null>(null);
  const ask = (question = text) => {
    setText(question);
    setAnswer(interpretQuestion(question));
  };
  const results = answer?.ok ? filterLedger(transactions, answer.filter) : [];
  const partial =
    mode === "live" &&
    (importProgress.state !== "complete" || importProgress.pending > 0);
  return (
    <View style={{ gap: 12, marginTop: 28 }}>
      <SectionTitle title="A question in mind?" />
      <Text muted style={{ fontSize: 12, lineHeight: 19 }}>
        Ask about a category, total spending, or an exact merchant and period.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {["Food this month", "Food last 2 months", "Total last month"].map(
          (q) => (
            <Option
              key={q}
              label={q}
              selected={text.toLowerCase() === q.toLowerCase()}
              onPress={() => ask(q)}
            />
          ),
        )}
      </View>
      <TextInput
        accessibilityLabel="Spending question"
        value={text}
        onChangeText={(value) => {
          setText(value);
          setAnswer(null);
        }}
        onSubmitEditing={() => ask()}
        placeholder="e.g. at Swiggy last month"
        placeholderTextColor={colors.muted}
        returnKeyType="go"
        style={{
          minHeight: 52,
          padding: 16,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.card,
          color: colors.text,
          fontFamily: "DMSans",
          fontSize: 13,
        }}
      />
      <Button disabled={!text.trim()} onPress={() => ask()}>
        Find the answer
      </Button>
      {answer &&
        (answer.ok ? (
          <View
            testID="question-result"
            style={{
              backgroundColor: colors.accentSoft,
              borderRadius: 20,
              padding: 18,
              gap: 10,
            }}
          >
            <Text muted style={{ fontSize: 11, lineHeight: 18 }}>
              {answer.interpretation}
            </Text>
            <Text serif style={{ fontSize: 32, lineHeight: 40 }}>
              {money(netSpend(results))}
            </Text>
            <Text muted style={{ fontSize: 11 }}>
              {results.length} matching transactions ·{" "}
              {mode === "demo"
                ? "sample data"
                : partial
                  ? "partial imported history"
                  : "captured SMS history"}
            </Text>
            <Text muted style={{ fontSize: 11, lineHeight: 18 }}>
              This covers transactions available in your journal. Missing or
              unsupported SMS are not included.
            </Text>
            <Button secondary onPress={() => onOpen(answer.filter)}>
              View contributing transactions
            </Button>
          </View>
        ) : (
          <Text
            accessibilityRole="alert"
            style={{ color: colors.orange, fontSize: 12, lineHeight: 20 }}
          >
            {answer.message}
          </Text>
        ))}
    </View>
  );
}
