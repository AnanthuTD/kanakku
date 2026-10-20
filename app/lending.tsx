import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  HandCoins,
  Plus,
} from "lucide-react-native";
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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [note, setNote] = useState("");
  const [remind, setRemind] = useState(true);
  const [repayments, setRepayments] = useState<Record<string, string>>({});
  const [dateError, setDateError] = useState("");
  const totalOwed = useMemo(
    () => loans.reduce((sum, loan) => sum + loanOutstanding(loan), 0),
    [loans],
  );

  useEffect(() => {
    if (linkedTransaction) {
      setAmount((linkedTransaction.amount / 100).toFixed(2));
      setPerson(
        linkedTransaction.merchant || linkedTransaction.originalMerchant || "",
      );
    }
  }, [linkedTransaction?.id]);

  const field = {
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    color: colors.text,
    backgroundColor: colors.card,
    fontFamily: "DMSans",
  } as const;

  const openDatePicker = () => {
    if (dueDate) {
      const [year, month, day] = dueDate.split("-").map(Number);
      setCalendarMonth(new Date(year, month - 1, day));
    } else {
      setCalendarMonth(new Date());
    }
    setCalendarOpen(true);
  };
  const pickedDate = dueDate
    ? (() => {
        const [year, month, day] = dueDate.split("-").map(Number);
        return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      })()
    : "Choose a return date";
  const daysInMonth = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() + 1,
    0,
  ).getDate();
  const calendarCells = [
    ...Array.from(
      {
        length: new Date(
          calendarMonth.getFullYear(),
          calendarMonth.getMonth(),
          1,
        ).getDay(),
      },
      () => null,
    ),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

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
      <View
        style={[
          ui.between,
          {
            minHeight: 66,
            paddingHorizontal: 20,
            paddingBottom: 12,
            alignItems: "center",
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={{ width: 48, height: 48, justifyContent: "center" }}
        >
          <ChevronLeft color={colors.text} size={25} />
        </Pressable>
        <Text serif style={{ fontSize: 24, lineHeight: 38, paddingBottom: 3 }}>
          Money lent
        </Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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

        <View style={{ marginTop: 30 }}>
          <SectionTitle
            title={
              linkedTransaction
                ? "Record this payment as lent"
                : "Add money lent"
            }
          />
        </View>
        {linkedTransaction && (
          <Text
            muted
            style={{ fontSize: 12, lineHeight: 19, marginBottom: 12 }}
          >
            {linkedTransaction.merchant} · {money(linkedTransaction.amount)}{" "}
            will be marked as money lent, so it no longer counts as spending.
          </Text>
        )}
        <View style={{ gap: 12, marginBottom: 18 }}>
          <View style={{ gap: 4 }}>
            <Text muted style={{ fontSize: 11 }}>
              Who borrowed it?
            </Text>
            <TextInput
              accessibilityLabel="Person who owes you"
              value={person}
              onChangeText={setPerson}
              placeholder="Name or payee"
              placeholderTextColor={colors.muted}
              style={field}
            />
          </View>
          <View style={{ gap: 4 }}>
            <Text muted style={{ fontSize: 11 }}>
              Amount lent
            </Text>
            <TextInput
              accessibilityLabel="Amount lent"
              value={amount}
              onChangeText={setAmount}
              editable={!linkedTransaction}
              keyboardType="decimal-pad"
              placeholder="₹ amount"
              placeholderTextColor={colors.muted}
              style={[field, linkedTransaction && { opacity: 0.65 }]}
            />
          </View>
          <View style={{ gap: 4 }}>
            <Text muted style={{ fontSize: 11 }}>
              Expected return date · optional
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Choose expected return date${dueDate ? `, ${pickedDate}` : ""}`}
              onPress={openDatePicker}
              style={[
                field,
                {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                },
              ]}
            >
              <Text
                style={{
                  color: dueDate ? colors.text : colors.muted,
                  fontFamily: "DMSans",
                  fontSize: 14,
                }}
              >
                {pickedDate}
              </Text>
              <CalendarDays color={colors.muted} size={18} />
            </Pressable>
            {dueDate ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear expected return date"
                onPress={() => {
                  setDueDate("");
                  setDateError("");
                  setRemind(false);
                }}
                style={{
                  minHeight: 40,
                  justifyContent: "center",
                  alignSelf: "flex-start",
                }}
              >
                <Text muted style={{ fontSize: 11 }}>
                  Clear date
                </Text>
              </Pressable>
            ) : null}
          </View>
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
          <View style={{ gap: 4 }}>
            <Text muted style={{ fontSize: 11 }}>
              Note · optional
            </Text>
            <TextInput
              accessibilityLabel="Loan note"
              value={note}
              onChangeText={setNote}
              placeholder="Add a detail"
              placeholderTextColor={colors.muted}
              style={field}
            />
          </View>
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
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      loan.transactionId
                        ? `Remove ${loan.person} from money lent`
                        : `Delete lending record for ${loan.person}`
                    }
                    disabled={loan.repayments.length > 0}
                    onPress={() =>
                      Alert.alert(
                        loan.transactionId
                          ? "Remove from money lent?"
                          : "Delete this lending record?",
                        loan.repayments.length
                          ? "Repayments are already recorded, so this record must stay to preserve the return history."
                          : loan.transactionId
                            ? "The payment will return to its previous classification and count in spending if it was originally an expense."
                            : "This record and its reminder will be removed.",
                        loan.repayments.length
                          ? [{ text: "OK" }]
                          : [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: loan.transactionId ? "Remove" : "Delete",
                                style: "destructive",
                                onPress: () => void app.removeLoan(loan.id),
                              },
                            ],
                      )
                    }
                    style={{
                      minHeight: 44,
                      justifyContent: "center",
                      marginTop: 6,
                      opacity: loan.repayments.length ? 0.5 : 1,
                    }}
                  >
                    <Text
                      muted
                      style={{
                        color: loan.repayments.length
                          ? colors.muted
                          : colors.danger,
                        fontSize: 12,
                      }}
                    >
                      {loan.repayments.length
                        ? "Locked after repayments are recorded"
                        : loan.transactionId
                          ? "Remove from money lent"
                          : "Delete lending record"}
                    </Text>
                  </Pressable>
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
      <Modal
        visible={calendarOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: 22,
            backgroundColor: "rgba(0,0,0,0.48)",
          }}
        >
          <View
            accessibilityViewIsModal
            style={{
              padding: 20,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.card,
            }}
          >
            <View style={[ui.between, { marginBottom: 16 }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                onPress={() =>
                  setCalendarMonth(
                    (current) =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() - 1,
                        1,
                      ),
                  )
                }
                style={{
                  width: 44,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ChevronLeft color={colors.text} size={21} />
              </Pressable>
              <Text bold style={{ fontSize: 17 }}>
                {calendarMonth.toLocaleDateString("en-IN", {
                  month: "long",
                  year: "numeric",
                })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                onPress={() =>
                  setCalendarMonth(
                    (current) =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() + 1,
                        1,
                      ),
                  )
                }
                style={{
                  width: 44,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ChevronRight color={colors.text} size={21} />
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 6 }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                <View
                  key={`${day}-${index}`}
                  style={{ flex: 1, alignItems: "center", paddingVertical: 8 }}
                >
                  <Text muted style={{ fontSize: 11 }}>
                    {day}
                  </Text>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {calendarCells.map((day, index) => {
                const value = day
                  ? `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                  : "";
                const selected = !!day && value === dueDate;
                return (
                  <View
                    key={value || `empty-${index}`}
                    style={{
                      width: "14.2857%",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    {day ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={new Date(
                          calendarMonth.getFullYear(),
                          calendarMonth.getMonth(),
                          day,
                        ).toLocaleDateString("en-IN", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                        accessibilityState={{ selected }}
                        onPress={() => {
                          setDueDate(value);
                          setDateError("");
                          setCalendarOpen(false);
                        }}
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 21,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: selected
                            ? colors.accent
                            : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            color: selected ? colors.bg : colors.text,
                            fontSize: 13,
                            fontFamily: selected ? "DMSansBold" : "DMSans",
                          }}
                        >
                          {day}
                        </Text>
                      </Pressable>
                    ) : (
                      <View style={{ width: 42, height: 42 }} />
                    )}
                  </View>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCalendarOpen(false)}
              style={{
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 10,
              }}
            >
              <Text bold style={{ color: colors.accent, fontSize: 13 }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
