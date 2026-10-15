import React, { useMemo, useState } from "react";
import { View, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Repeat2, ShieldCheck } from "lucide-react-native";
import { useApp } from "../src/state/AppContext";
import { Text, Button, styles as ui } from "../src/components/ui";
import { Sheet } from "../src/components/Sheet";
import { Option } from "../src/components/LedgerFilters";
import {
  SubscriptionCard,
  recurringDate,
} from "../src/components/SubscriptionCard";
import {
  detectRecurringPayments,
  RecurringDecision,
} from "../src/domain/subscriptions";
import { money } from "../src/domain/model";
import { dateKey } from "../src/domain/ledger";

export default function Subscriptions() {
  const app = useApp();
  const { colors } = app;
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"review" | "confirmed" | "ignored">("review");
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const patterns = useMemo(
    () => detectRecurringPayments(app.transactions),
    [app.transactions],
  );
  const decisions = app.recurringDecisions;
  const visible = patterns.filter((p) =>
    tab === "review" ? !decisions[p.key] : decisions[p.key] === tab,
  );
  const payment = patterns.find((p) => p.key === selected);
  const evidenceRows = payment
    ? app.transactions
        .filter((t) => payment.transactionIds.includes(t.id))
        .sort((a, b) => b.at.localeCompare(a.at))
    : [];
  const setDecision = async (decision: RecurringDecision | null) => {
    if (!payment || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await app.setRecurringDecision(payment.key, decision);
      setSelected(null);
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? e.message
          : "Could not save this choice. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <View
      testID="subscriptions-screen"
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <View
        style={{ flex: 1, width: "100%", maxWidth: 540, alignSelf: "center" }}
      >
        <View
          style={[
            ui.row,
            {
              paddingTop: Math.max(insets.top, 20),
              paddingHorizontal: 16,
              paddingBottom: 12,
              gap: 8,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to overview"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/")
            }
            style={{ padding: 12 }}
          >
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text serif style={{ fontSize: 26, lineHeight: 34, flex: 1 }}>
            What keeps coming back.
          </Text>
        </View>
        {app.locked ? (
          <View style={{ padding: 24, gap: 20 }}>
            <Text muted>Unlock your journal to review recurring payments.</Text>
            <Button onPress={() => void app.unlock()} disabled={app.busy}>
              Unlock journal
            </Button>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{
              padding: 24,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 20) + 24,
              gap: 20,
            }}
          >
            <View style={{ gap: 10 }}>
              <Text style={[ui.eyebrow, { color: colors.accent }]}>
                SUBSCRIPTIONS & RECURRING PAYMENTS
              </Text>
              <Text muted>
                Patterns from your recorded purchases. Review the evidence to
                decide whether a service or bill repeats.
              </Text>
              <View style={[ui.row, { gap: 7 }]}>
                <ShieldCheck size={15} color={colors.accent} />
                <Text muted style={{ fontSize: 12, flex: 1 }}>
                  Detected on this device. Confirming only saves your label.
                </Text>
              </View>
              {app.mode === "demo" && app.sampleData ? (
                <Text muted style={{ fontSize: 12 }}>
                  You’re exploring sample data.
                </Text>
              ) : null}
              {app.mode === "live" &&
              app.importProgress.state !== "complete" ? (
                <Text muted style={{ fontSize: 12 }}>
                  Based on history loaded so far. More patterns may appear as
                  import completes.
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Option
                label={`To review (${patterns.filter((p) => !decisions[p.key]).length})`}
                selected={tab === "review"}
                onPress={() => setTab("review")}
              />
              <Option
                label="Confirmed"
                selected={tab === "confirmed"}
                onPress={() => setTab("confirmed")}
              />
              <Option
                label="Ignored"
                selected={tab === "ignored"}
                onPress={() => setTab("ignored")}
              />
            </View>
            {visible.map((p) => (
              <SubscriptionCard
                key={p.key}
                payment={p}
                decision={decisions[p.key]}
                onPress={() => {
                  setSaveError("");
                  setSelected(p.key);
                }}
              />
            ))}
            {!visible.length ? (
              <View
                style={[
                  ui.card,
                  {
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.line,
                    alignItems: "center",
                    gap: 14,
                    paddingVertical: 34,
                  },
                ]}
              >
                <Repeat2 size={32} color={colors.accent} />
                <Text
                  serif
                  style={{ fontSize: 23, lineHeight: 31, textAlign: "center" }}
                >
                  {tab === "review"
                    ? "No patterns to review yet."
                    : tab === "confirmed"
                      ? "Nothing confirmed yet."
                      : "Nothing ignored."}
                </Text>
                <Text muted style={{ textAlign: "center", fontSize: 12 }}>
                  {tab === "review"
                    ? "Monthly and yearly patterns need at least three charges; weekly patterns need four. A single Netflix payment is not enough evidence."
                    : "Your choices appear here while the matching pattern exists in captured history."}
                </Text>
              </View>
            ) : null}
            <Text muted style={{ fontSize: 12 }}>
              An estimated date is a pattern prediction, not a bill’s due date.
              Missing alerts, refunds, or a cancelled service can change it.
              Kanakku cannot verify enrolment or cancel a service.
            </Text>
          </ScrollView>
        )}
      </View>
      <Sheet
        visible={!!payment && !app.locked}
        onClose={() => {
          if (!saving) setSelected(null);
        }}
        title={payment?.merchant || "Recurring payment"}
        testID="recurring-detail"
      >
        {payment ? (
          <>
            <Text serif style={{ fontSize: 32, lineHeight: 40 }}>
              {money(payment.usualAmount)} <Text muted>{payment.cadence}</Text>
            </Text>
            {payment.minAmount !== payment.maxAmount ? (
              <Text muted>
                Recorded range: {money(payment.minAmount)}–
                {money(payment.maxAmount)}
              </Text>
            ) : null}
            <Text muted>
              {payment.bank} · {payment.account}
            </Text>
            <View
              style={{
                padding: 18,
                borderRadius: 18,
                backgroundColor: colors.accentSoft,
                gap: 8,
              }}
            >
              <Text bold>
                {payment.status === "expected"
                  ? `Next estimated charge: ${recurringDate(payment.estimatedNextAt)}`
                  : "This pattern may have stopped."}
              </Text>
              <Text muted style={{ fontSize: 12 }}>
                {payment.status === "expected"
                  ? "Actual timing and amount can change. This is not a payment reminder or a verified due date."
                  : `Last recorded charge: ${recurringDate(payment.lastPaidAt)}. The next estimated cycle was ${recurringDate(payment.estimatedNextAt)}; an alert may be missing.`}
              </Text>
            </View>
            <Text bold>Why this appeared</Text>
            {payment.evidence.map((e) => (
              <Text key={e} muted style={{ fontSize: 12 }}>
                • {e}
              </Text>
            ))}
            <Text bold>Recorded charges</Text>
            {evidenceRows.map((t) => (
              <View
                key={t.id}
                style={[
                  ui.between,
                  {
                    gap: 12,
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderColor: colors.line,
                  },
                ]}
              >
                <Text muted style={{ fontSize: 12 }}>
                  {recurringDate(dateKey(t.at))}
                </Text>
                <Text bold>{money(t.amount)}</Text>
              </View>
            ))}
            {!!saveError ? (
              <Text accessibilityRole="alert" style={{ color: colors.danger }}>
                {saveError}
              </Text>
            ) : null}
            {saving ? <ActivityIndicator color={colors.accent} /> : null}
            {!decisions[payment.key] ? (
              <>
                <View testID="recurring-confirm">
                  <Button
                    onPress={() => void setDecision("confirmed")}
                    disabled={saving}
                  >
                    Confirm recurring pattern
                  </Button>
                </View>
                <View testID="recurring-ignore">
                  <Button
                    secondary
                    onPress={() => void setDecision("ignored")}
                    disabled={saving}
                  >
                    Ignore this pattern
                  </Button>
                </View>
              </>
            ) : (
              <View testID="recurring-restore">
                <Button
                  secondary
                  onPress={() => void setDecision(null)}
                  disabled={saving}
                >
                  Move back to review
                </Button>
              </View>
            )}
            <Text muted style={{ fontSize: 11 }}>
              This choice changes the label only. Your transactions and spending
              totals stay the same.
            </Text>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
