import React, { useEffect, useRef, useState } from "react";
import { AppState, Pressable, ScrollView, Switch, View } from "react-native";
import { native, type GmailStatus } from "../native/bridge";
import { useApp } from "../state/AppContext";
import { Button, Text, SectionTitle } from "./ui";
import { Sheet } from "./Sheet";
import { Option } from "./LedgerFilters";

export function GmailSettings() {
  const app = useApp();
  const { colors } = app;
  const [status, setStatus] = useState<GmailStatus>();
  const [disclose, setDisclose] = useState(false);
  const [agree, setAgree] = useState(false);
  const [months, setMonths] = useState(1);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [disconnect, setDisconnect] = useState(false);
  const [inspection, setInspection] = useState<Record<string, unknown>[] | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    if (!native) return;
    let mounted = true,
      reading = false;
    const read = async () => {
      if (reading || AppState.currentState !== "active") return;
      reading = true;
      const token = generation.current;
      try {
        const value = await native!.gmailStatus();
        if (mounted && token === generation.current) setStatus(value);
      } catch {
        if (mounted && token === generation.current)
          setError(
            "Gmail status is unavailable. Reopen Settings to try again.",
          );
      } finally {
        reading = false;
      }
    };
    void read();
    const timer = setInterval(read, 1500);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void read();
    });
    return () => {
      mounted = false;
      generation.current++;
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  async function act(kind: "connect" | "sync" | "disconnect") {
    if (!native || busy) return;
    const token = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const value =
        kind === "connect"
          ? await app.connectEmail(months)
          : kind === "sync"
            ? await native.syncGmail()
            : await native.disconnectGmail();
      if (token !== generation.current) return;
      if (value) {
        setStatus(value);
        setDisclose(false);
        setAgree(false);
        setDisconnect(false);
        if (value.revoked === false)
          setError(
            "Disconnected on this phone. Google revocation could not finish; remove Kanakku access from your Google Account connections as well.",
          );
      }
    } catch {
      if (token === generation.current)
        setError(
          "Gmail could not complete that action. Check your Google connection and the app's Gmail setup, then try again.",
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  async function inspectAlerts() {
    if (!native || inspecting) return;
    setInspecting(true);
    setInspection(null);
    setError("");
    try {
      setInspection(await native.inspectGmailAlerts());
    } catch {
      setError("Could not inspect Gmail alerts. Check the connection and try again.");
    } finally {
      setInspecting(false);
    }
  }
  return (
    <View testID="gmail-settings" style={{ marginVertical: 24, gap: 12 }}>
      <SectionTitle title="Gmail transaction alerts" />
      <Text muted>
        Add supported SBI card alerts from Gmail. Google grants read-only access
        to your mailbox; Kanakku looks for eligible alerts on this phone.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: detailsOpen }}
        onPress={() => setDetailsOpen((open) => !open)}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: colors.accent, fontSize: 12 }}>
          {detailsOpen ? "Hide details" : "What gets imported?"}
        </Text>
      </Pressable>
      {detailsOpen ? (
        <Text muted>
          Supported SBI debit-card and SBI Card purchase alerts can be imported
          without SMS. When SMS is connected, matching alerts are checked to
          avoid duplicates. Other bank formats, OTPs and order emails are
          ignored. Background checks run when Android permits; foreign-currency
          charges wait for a final INR amount.
        </Text>
      ) : null}
      {!native && (
        <Text>
          Connect Gmail in the Android app. This browser preview cannot access
          your mailbox.
        </Text>
      )}
      {status && (
        <Text testID="gmail-status" accessibilityLiveRegion="polite">
          {!status.connected
            ? "Not connected"
            : `${status.accountLabel || "Google account"} · ${status.state === "queued" ? "Bank-email check queued" : status.state === "syncing" ? "Checking bank emails…" : status.state === "reconnect" ? "Reconnect required" : status.state === "error" ? "Sync interrupted" : "Connected"}`}
        </Text>
      )}
      {status?.connected && (
        <>
          <Text muted>
            {status.scanned} matching emails checked · {status.captured}{" "}
            supported alerts processed · {status.ignored} ignored. Rechecks can
            process an alert again; ledger replay is idempotent.
          </Text>
          <Text muted>
            Manual checks revisit the selected history window, so newly supported alerts can be recovered safely.
          </Text>
          <Text muted>
            {status.lastSync
              ? `Last completed check: ${new Date(status.lastSync).toLocaleString("en-IN")}`
              : "First check is queued or in progress. Your coverage is incomplete until it finishes."}
          </Text>
        </>
      )}
      {error && (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </Text>
      )}
      {!status?.connected || status.state === "reconnect" ? (
        <Button
          disabled={!native || busy || !status}
          onPress={() => {
            setAgree(false);
            setMonths(status?.months || 1);
            setDisclose(true);
          }}
        >
          {status?.connected ? "Reconnect Gmail" : "Connect Gmail"}
        </Button>
      ) : (
        <>
          <Button
            disabled={
              busy || status.state === "syncing" || status.state === "queued"
            }
            onPress={() => act("sync")}
          >
            Check bank emails now
          </Button>
          <Text muted>
            A one-time diagnostic can inspect matching alerts on this phone. It shows only parser results and never saves message contents.
          </Text>
          <Button secondary disabled={busy || inspecting} onPress={inspectAlerts}>
            {inspecting ? "Inspecting alerts…" : "Inspect recent alert parsing"}
          </Button>
          {inspection && (
            <ScrollView
              style={{ maxHeight: 360 }}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              accessibilityLabel="Email parser diagnostic results"
            >
              <Text selectable>
                {inspection.length === 0
                  ? "No matching alerts found in the selected time range."
                  : inspection.map((item, index) => {
                      const missing = Array.isArray(item.missingRowLabels)
                        ? ` · Missing rows: ${item.missingRowLabels.join(", ") || "none"}`
                        : "";
                      const parsed = item.outcome === "parsed"
                        ? ` · ${String(item.currency)} ${String(item.amount)} · ${String(item.merchant)} · ${String(item.transactionDate)}`
                        : "";
                      const received = item.receivedAt ? ` · received ${String(item.receivedAt).slice(0, 10)}` : "";
                      return `${index + 1}. ${String(item.alertType)} · ${String(item.senderDomain ?? "unknown sender")}${received} · ${String(item.outcome ?? "not inspected")}${parsed}${missing}`;
                    }).join("\n")}
              </Text>
            </ScrollView>
          )}
          <Button secondary disabled={busy} onPress={() => setDisconnect(true)}>
            Disconnect Gmail
          </Button>
        </>
      )}
      <Sheet
        visible={disclose}
        onClose={() => {
          if (!busy) {
            setDisclose(false);
            setAgree(false);
          }
        }}
        title="Connect Gmail?"
      >
        <View style={{ gap: 16 }}>
          <Text>
            Google's read-only Gmail permission grants access to your mailbox,
            including email content. It cannot be restricted by Google to bank
            messages only. Kanakku uses that permission to fetch supported SBI
            transaction alerts for your spending journal.
          </Text>
          <Text>
            Google sign-in and mailbox requests contact Google. Email parsing
            happens on this phone. Raw email bodies, attachments and tokens are
            not saved in the journal or sent to Kanakku servers, Brave or an AI
            provider. Only structured payment details are retained in encrypted
            storage.
          </Text>
          <Text>Choose how far back to check email alerts:</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[1, 3, 6, 12].map((value) => (
              <Option
                key={value}
                label={
                  value === 12
                    ? "1 year"
                    : `${value} ${value === 1 ? "month" : "months"}`
                }
                selected={months === value}
                onPress={() => setMonths(value)}
              />
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ flex: 1 }}>
              I understand the mailbox permission and want automatic bank-email
              checks.
            </Text>
            <Switch
              accessibilityLabel="Allow Gmail bank-email sync"
              value={agree}
              disabled={busy}
              onValueChange={setAgree}
            />
          </View>
          <Button
            disabled={!agree || busy || !native}
            onPress={() => act("connect")}
          >
            {busy ? "Connecting…" : "Continue to Google"}
          </Button>
          <Button
            secondary
            disabled={busy}
            onPress={() => {
              setDisclose(false);
              setAgree(false);
            }}
          >
            Not now
          </Button>
        </View>
      </Sheet>
      <Sheet
        visible={disconnect}
        onClose={() => !busy && setDisconnect(false)}
        title="Disconnect Gmail?"
      >
        <View style={{ gap: 16 }}>
          <Text>
            Stop mailbox checks and remove the saved account connection from
            this phone. Kanakku will also ask Google to revoke its access.
            Previously imported payments and your edits will stay in your
            journal.
          </Text>
          <Button disabled={busy} onPress={() => act("disconnect")}>
            Confirm disconnect Gmail
          </Button>
          <Button
            secondary
            disabled={busy}
            onPress={() => setDisconnect(false)}
          >
            Keep connected
          </Button>
        </View>
      </Sheet>
    </View>
  );
}
