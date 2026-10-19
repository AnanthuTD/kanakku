import React from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import { Check, Pause, Play } from "lucide-react-native";
import { Text, styles as ui } from "./ui";
import { useApp } from "../state/AppContext";
import { IMPORT_PERIODS } from "../domain/import";

export function ImportBanner() {
  const app = useApp();
  const { colors, importProgress: p, locked, busy } = app;
  if (
    app.mode !== "live" ||
    p.state === "idle" ||
    // Reconciliation is a quiet background catch-up check, not the user's
    // selected history restore. Keep it out of the persistent restore banner.
    (p.backfill && !["paused", "error"].includes(p.state)) ||
    (p.state === "complete" && p.pending === 0)
  )
    return null;
  const active = ["queued", "running", "waiting"].includes(p.state);
  const finished = p.state === "complete";
  const percent = finished
    ? 100
    : p.total > 0
      ? Math.min(99, Math.floor((p.scanned / p.total) * 100))
      : 0;
  const period =
    IMPORT_PERIODS.find(
      (period) => period.months === p.months,
    )?.label.toLowerCase() || "selected history";
  const title =
    p.backfill && active
      ? "Checking for missed bank alerts"
      : p.backfill && finished
        ? "Missed-alert check complete"
        : p.state === "queued" || p.state === "waiting"
          ? "Waiting to continue import"
          : p.state === "paused"
            ? "History import paused"
            : p.state === "error"
              ? "History import needs attention"
              : finished
                ? "History scan complete"
                : p.phase === "recent"
                  ? "Bringing in your recent days"
                  : "Filling in older history";
  return (
    <View
      style={{
        backgroundColor: colors.accentSoft,
        borderRadius: 16,
        padding: 14,
        gap: 8,
      }}
    >
      <View style={[ui.between, { gap: 12 }]}>
        <View style={[ui.row, { flex: 1, gap: 8 }]}>
          {finished ? (
            <Check size={17} color={colors.accent} />
          ) : active ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Pause size={17} color={colors.accent} />
          )}
          <Text bold style={{ flex: 1, fontSize: 12 }}>
            {title}
          </Text>
        </View>
        {active || p.state === "paused" || p.state === "error" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              active ? "Pause history import" : "Resume history import"
            }
            disabled={busy}
            onPress={active ? app.pauseImport : app.resumeImport}
            style={{
              padding: 9,
              backgroundColor: colors.card,
              borderRadius: 10,
              opacity: busy ? 0.5 : 1,
            }}
          >
            {active ? (
              <Pause size={16} color={colors.text} />
            ) : (
              <Play size={16} color={colors.text} />
            )}
          </Pressable>
        ) : null}
      </View>
      {p.total >= 0 && (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="SMS history checked"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          style={{ height: 4, backgroundColor: colors.line, borderRadius: 4 }}
        >
          <View
            style={{
              height: 4,
              width: `${percent}%`,
              borderRadius: 4,
              backgroundColor: colors.accent,
            }}
          />
        </View>
      )}
      <Text muted style={{ fontSize: 10, lineHeight: 16 }}>
        {period} ·{" "}
        {p.total < 0
          ? "Preparing…"
          : `${percent}% · ${p.scanned.toLocaleString("en-IN")} messages checked · ${p.captured.toLocaleString("en-IN")} alerts found`}
      </Text>
      <Text style={{ fontSize: 10, lineHeight: 16 }}>
        {p.error ||
          (finished
            ? p.pending > 0
              ? locked
                ? "Unlock to load the remaining encrypted alerts into your journal."
                : "Loading the remaining encrypted alerts into your journal…"
              : "Your selected history is ready. Unclear payments are in review."
            : p.state === "paused"
              ? "Progress is saved. Resume anytime; totals are partial."
              : p.state === "waiting" || p.state === "queued"
                ? "Android will resume when it can. Your progress is saved; totals are partial."
                : "Keep exploring. Totals are partial while history fills in.")}
      </Text>
    </View>
  );
}
