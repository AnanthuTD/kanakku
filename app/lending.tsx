import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { ChevronLeft, HandCoins, Plus } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../src/state/AppContext";
import { loanOutstanding } from "../src/domain/lending";
import { decimalToPaise, money } from "../src/domain/model";
import { Button, SectionTitle, Text, styles as ui } from "../src/components/ui";
import { validDay } from "../src/domain/ledger";

export default function LendingScreen() {
  const app = useApp();
  const { colors, loans, transactions, busy } = app;
  const insets = useSafeAreaInsets();
  const { transactionId } = useLocalSearchParams<{ transactionId?: string }>();
  const linkedTransaction = transactionId
    ? transactions.find((transaction) => transaction.id === transactionId)
    : undefined;
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [remind, setRemind] = useState(true);
  const [repayments, setRepayments] = useState<Record<string, string>>({});
  const [dateError, setDateError] = useState("");
  const totalOwed = useMemo(
    () => loans.reduce((sum, loan) => sum + loanOutstanding(loan), 0),
    [loans],
  );

  useEffect(() => {
    if (linkedTransaction)
      setAmount((linkedTransaction.amount / 100).toFixed(2));
  }, [linkedTransaction?.id]);

  const field = {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    color: colors.text,
    backgroundColor: colors.card,
    fontFamily: "DMSans",
  } as const;

  const submitLoan = async () => {
    if (dueDate && !validDay(dueDate)) {
      setDateError("Use a valid date in YYYY-MM-DD format.");
      return;
    }
    setDateError("");
    const paise = decimalToPaise(amount);
    if (paise === null) {
      app.setError("Enter a valid amount, such as 500 or 500.50.");
      return;
    }
    const success = await app.addLoan({
      person,
      amount: paise,
      dueDate: dueDate || null,
      note,
      remind: !!dueDate && remind,
      ...(linkedTransaction ? { transactionId: linkedTransaction.id } : {}),
    });
    if (success) {
      setPerson("");
      setAmount("");
      setDueDate("");
      setNote("");
      if (transactionId) router.replace("/lending" as Href);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        paddingTop: Math.max(insets.top, 18),
      }}
    >
      <View style={[ui.between, { paddingHorizontal: 20, paddingBottom: 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={{ width: 48, height: 48, justifyContent: "center" }}
        >
          <ChevronLeft color={colors.text} size={25} />
        </Pressable>
        <Text serif style={{ fontSize: 24 }}>
          Money lent
        </Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 56 }}
      >
        <View
          style={[
            ui.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.line,
              borderWidth: 1,
              marginTop: 8,
            },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <HandCoins color={colors.accent} size={22} />
            <Text muted style={{ fontSize: 12 }}>
              Still to be returned
            </Text>
          </View>
          <Text serif style={{ fontSize: 38, lineHeight: 52, marginTop: 10 }}>
            {money(totalOwed)}
          </Text>
          <Text muted style={{ fontSize: 11, lineHeight: 18 }}>
            Tracked separately from expenses. Repayments reduce this balance and
            never count as income.
          </Text>
        </View>

        <SectionTitle
          title={
            linkedTransaction ? "Record this payment as lent" : "Add money lent"
          }
        />
        {linkedTransaction && (
          <Text
            muted
            style={{ fontSize: 12, lineHeight: 19, marginBottom: 12 }}
          >
            {linkedTransaction.merchant} · {money(linkedTransaction.amount)}{" "}
            will be marked as money lent, so it no longer counts as spending.
          </Text>
        )}
        <View style={{ gap: 10, marginBottom: 18 }}>
          <TextInput
            accessibilityLabel="Person who owes you"
            value={person}
            onChangeText={setPerson}
            placeholder="Who borrowed it?"
            placeholderTextColor={colors.muted}
            style={field}
          />
          <TextInput
            accessibilityLabel="Amount lent"
            value={amount}
            onChangeText={setAmount}
            editable={!linkedTransaction}
            keyboardType="decimal-pad"
            placeholder="Amount in ₹"
            placeholderTextColor={colors.muted}
            style={[field, linkedTransaction && { opacity: 0.65 }]}
          />
          <TextInput
            accessibilityLabel="Expected return date"
            value={dueDate}
            onChangeText={(value) => {
              setDueDate(value);
              setDateError("");
            }}
            placeholder="Expected return · YYYY-MM-DD (optional)"
            placeholderTextColor={colors.muted}
            style={field}
          />
          {dateError ? (
            <Text style={{ color: colors.danger, fontSize: 12 }}>
              {dateError}
            </Text>
          ) : null}
          {dueDate ? (
            <View style={[ui.between, { minHeight: 48, gap: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text bold style={{ fontSize: 12 }}>
                  Remind me on this date
                </Text>
                <Text muted style={{ fontSize: 10 }}>
                  Private notification around 10:00 AM.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Remind me on return date"
                value={remind}
                onValueChange={setRemind}
                trackColor={{ true: colors.accent, false: colors.line }}
              />
            </View>
          ) : null}
          <TextInput
            accessibilityLabel="Loan note"
            value={note}
            onChangeText={setNote}
            placeholder="Note · optional"
            placeholderTextColor={colors.muted}
            style={field}
          />
          <Button
            disabled={busy || !person.trim() || !amount.trim()}
            onPress={() => void submitLoan()}
          >
            {linkedTransaction ? "Save as money lent" : "Add to money lent"}
          </Button>
        </View>

        <SectionTitle title="Outstanding loans" />
        {loans.length ? (
          loans
            .slice()
            .sort((a, b) =>
              (a.dueDate || "9999").localeCompare(b.dueDate || "9999"),
            )
            .map((loan) => {
              const outstanding = loanOutstanding(loan);
              return (
                <View
                  key={loan.id}
                  style={[
                    ui.card,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.line,
                      borderWidth: 1,
                      marginBottom: 12,
                    },
                  ]}
                >
                  <View
                    style={[ui.between, { alignItems: "flex-start", gap: 12 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text bold style={{ fontSize: 15 }}>
                        {loan.person}
                      </Text>
                      <Text muted style={{ fontSize: 11, marginTop: 4 }}>
                        Lent {money(loan.amount)}
                        {loan.dueDate ? ` · due ${loan.dueDate}` : ""}
                      </Text>
                      {loan.note ? (
                        <Text muted style={{ fontSize: 11, marginTop: 5 }}>
                          {loan.note}
                        </Text>
                      ) : null}
                    </View>
                    <Text bold style={{ fontSize: 17 }}>
                      {money(outstanding)}
                    </Text>
                  </View>
                  <Text
                    muted
                    style={{ fontSize: 10, marginTop: 8, marginBottom: 10 }}
                  >
                    {outstanding === 0
                      ? "Returned in full"
                      : `${loan.repayments.length} repayment${loan.repayments.length === 1 ? "" : "s"} recorded`}
                    {loan.remind && outstanding > 0 ? " · reminder set" : ""}
                  </Text>
                  {outstanding > 0 ? (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TextInput
                        accessibilityLabel={`Repayment amount for ${loan.person}`}
                        value={repayments[loan.id] || ""}
                        onChangeText={(value) =>
                          setRepayments((current) => ({
                            ...current,
                            [loan.id]: value,
                          }))
                        }
                        keyboardType="decimal-pad"
                        placeholder="Returned amount"
                        placeholderTextColor={colors.muted}
                        style={[field, { flex: 1 }]}
                      />
                      <Button
                        disabled={busy || !repayments[loan.id]?.trim()}
                        onPress={async () => {
                          const paise = decimalToPaise(
                            repayments[loan.id] || "",
                          );
                          if (paise === null) {
                            app.setError("Enter a valid repayment amount.");
                            return;
                          }
                          if (await app.recordLoanRepayment(loan.id, paise))
                            setRepayments((current) => ({
                              ...current,
                              [loan.id]: "",
                            }));
                        }}
                      >
                        Record
                      </Button>
                    </View>
                  ) : null}
                </View>
              );
            })
        ) : (
          <View style={{ alignItems: "center", paddingVertical: 28 }}>
            <Plus color={colors.muted} size={22} />
            <Text
              muted
              style={{ fontSize: 12, textAlign: "center", marginTop: 10 }}
            >
              Nothing lent yet. Add a loan here or mark a bank payment as money
              lent.
            </Text>
          </View>
        )}
        {app.error ? (
          <Text style={{ color: colors.danger, marginTop: 10 }}>
            {app.error}
          </Text>
        ) : null}
        {app.notice ? (
          <Text style={{ color: colors.accent, marginTop: 10 }}>
            {app.notice}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
