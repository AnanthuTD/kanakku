import React from "react";
import { Modal, Pressable, View } from "react-native";
import { Check, X } from "lucide-react-native";
import { useApp } from "../state/AppContext";
import { Text } from "./ui";

export function GeminiActionPrompt() {
  const { assistantAction, resolveAssistantAction, colors, busy, error } = useApp();
  if (!assistantAction?.confirmRequired) return null;
  const action = assistantAction;
  const isCreate = action.type === "create";
  const details = action.details;
  const patch = action.patch;
  const title = isCreate ? "Add this expense?" : "Update this payment?";
  const summary = isCreate
    ? [
        details ? `₹${details.amountRupees.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "Amount not available",
        details?.merchant || "Manual expense",
        details?.date,
        details?.category,
        details?.note ? `Note: ${details.note}` : "",
      ].filter(Boolean).join(" · ")
    : [
        action.merchant || "Payment",
        action.amount != null ? `₹${action.amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "",
        action.date,
        patch?.merchant ? `Name → ${patch.merchant}` : "",
        patch?.category ? `Category → ${patch.category}` : "",
        patch?.note !== undefined ? "Add or change note" : "",
        patch?.markRecurring ? "Mark recurring" : patch?.markRecurring === false ? "Ignore recurring pattern" : "",
      ].filter(Boolean).join(" · ");

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => resolveAssistantAction(false)}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#0008" }}>
        <View accessibilityViewIsModal style={{ backgroundColor: colors.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: 36, gap: 16, borderColor: colors.line, borderWidth: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text bold style={{ fontSize: 20, color: colors.text }}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel Gemini change" onPress={() => resolveAssistantAction(false)} hitSlop={12}>
              <X size={22} color={colors.muted} />
            </Pressable>
          </View>
          <Text muted style={{ lineHeight: 22 }}>
            Gemini requested this change. Check the details before Kanakku saves it.
          </Text>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16 }}>
            <Text style={{ color: colors.text, lineHeight: 22 }}>{summary}</Text>
          </View>
          {!!error && <Text style={{ color: colors.danger, lineHeight: 19 }}>{error}</Text>}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable accessibilityRole="button" onPress={() => resolveAssistantAction(false)} disabled={busy} style={{ flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }}>
              <Text bold style={{ color: colors.text }}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Approve and save Gemini change" onPress={() => resolveAssistantAction(true)} disabled={busy} style={{ flex: 1.3, minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, backgroundColor: colors.accent }}>
              <Check size={18} color={colors.accentText} />
              <Text bold style={{ color: colors.accentText }}>{busy ? "Saving…" : "Approve & save"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
