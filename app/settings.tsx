import { GmailSettings } from "../src/components/GmailSettings";
import { ModelDownloadsSettings } from "../src/components/ModelDownloadsSettings";
import Constants from "expo-constants";
import { AppUpdatesSettings } from "../src/components/AppUpdatesSettings";
import { isVoiceActive } from "../src/native/voice";
import { isReceiptActive } from "../src/native/receipt";
import { hasPendingInteractions } from "../src/state/interactions";
import { MerchantLookupSettings } from "../src/components/MerchantLookupSettings";
import { voiceLanguageLabel } from "../src/native/voiceModel";
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Switch,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronLeft,
  ShieldCheck,
  Smartphone,
  Mic,
  Sun,
  Moon,
  Monitor,
  ArrowUpRight,
  Trash2,
  LockKeyhole,
  MessageSquare,
  Leaf,
} from "lucide-react-native";
import { useApp } from "../src/state/AppContext";
import { Text, Button, SectionTitle, styles as ui } from "../src/components/ui";
import { Mascot } from "../src/components/Avatar";
import { native } from "../src/native/bridge";
import { ThemeMode, Category, CATEGORIES } from "../src/domain/model";
import { Sheet } from "../src/components/Sheet";
import { Option } from "../src/components/LedgerFilters";
import { ReviewPreferences } from "../src/components/ReviewPreferences";
import { ImportPeriodPicker } from "../src/components/ImportPeriodPicker";
import { ImportBanner } from "../src/components/ImportProgress";
export default function Settings() {
  const app = useApp();
  const { colors, theme, mode, rules, busy, error, notice } = app;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ section?: string }>();
  const settingsScroll = useRef<ScrollView>(null);
  const modelSectionY = useRef(0);
  const [confirmConnect, setConfirmConnect] = useState(false);
  const testBuild = native?.status().testBuild === true;
  const [voiceClips, setVoiceClips] = useState(
    native?.status().debugVoiceClips === true,
  );
  const [diagnostics, setDiagnostics] = useState(
    native?.status().diagnostics !== false,
  );
  const [historyMonths, setHistoryMonths] = useState<number | null>(1);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [editingRuleBank, setEditingRuleBank] = useState<string | undefined>();
  const [ruleCategory, setRuleCategory] = useState<Category>("Food & dining");
  const [ruleAlias, setRuleAlias] = useState("");
  const [resetVisible, setResetVisible] = useState(false);
  const [resetText, setResetText] = useState("");
  const [security, setSecurity] = useState<{
    deviceSecure: boolean;
    vaultReady: boolean;
    backing: string;
  } | null>(null);
  const importing = ["queued", "running", "waiting"].includes(
    app.importProgress.state,
  );
  const [status, setStatus] = useState(native?.status());
  const [capture, setCapture] = useState(status?.capture || false);
  useEffect(() => {
    setStatus(native?.status());
    setCapture(native?.status().capture || false);
    native
      ?.securityStatus()
      .then(setSecurity)
      .catch(() => {});
  }, [mode, busy]);
  const changeCapture = async (value: boolean) => {
    try {
      if (!native)
        throw new Error("Install the Android build to capture bank alerts.");
      await native.setCapture(value);
      setCapture(value);
    } catch (e) {
      app.setError(
        e instanceof Error ? e.message : "Could not change SMS capture.",
      );
    }
  };
  const scrollToModelSettings = () => {
    if (params.section !== "models") return;
    requestAnimationFrame(() =>
      settingsScroll.current?.scrollTo({
        y: modelSectionY.current,
        animated: true,
      }),
    );
  };
  return (
    <View
      testID="settings-screen"
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
              paddingBottom: 16,
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
          <Text serif style={{ fontSize: 26, lineHeight: 34 }}>
            Make it yours.
          </Text>
        </View>
        <ScrollView
          ref={settingsScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 60 }}
        >
          <View style={{ marginBottom: mode === "live" ? 16 : 0 }}>
            <ImportBanner />
          </View>
          <View style={{ alignItems: "center", marginBottom: 28 }}>
            <Mascot size={95} />
            <Text serif style={{ fontSize: 23, lineHeight: 32, marginTop: 8 }}>
              A quieter way to keep track.
            </Text>
            <Text muted style={{ fontSize: 12, marginTop: 6 }}>
              Private by design. Personal by nature.
            </Text>
          </View>
          {error ? (
            <Pressable
              onPress={() => app.setError("")}
              style={{
                padding: 16,
                backgroundColor: colors.orangeSoft,
                borderRadius: 16,
                marginBottom: 20,
              }}
            >
              <Text style={{ color: colors.danger, fontSize: 12 }}>
                {error}
              </Text>
            </Pressable>
          ) : null}
          {notice ? (
            <Text style={{ color: colors.accent, marginBottom: 20 }}>
              {notice}
            </Text>
          ) : null}
          <GmailSettings />
          <ModelDownloadsSettings
            onLayout={(event) => {
              modelSectionY.current = event.nativeEvent.layout.y;
              scrollToModelSettings();
            }}
          />
          <SectionTitle title="The look & feel" />
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 30 }}>
            {(
              [
                ["system", "System", Monitor],
                ["light", "Light", Sun],
                ["dark", "Dark", Moon],
              ] as const
            ).map(([value, label, Icon]) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: theme === value }}
                onPress={() => app.setTheme(value)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 20,
                  gap: 10,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: theme === value ? colors.accent : colors.line,
                  backgroundColor:
                    theme === value ? colors.accentSoft : colors.card,
                }}
              >
                <Icon size={23} color={colors.accent} />
                <Text bold style={{ fontSize: 12 }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <SectionTitle title="Your bank alerts" />
          <View
            style={[
              ui.card,
              {
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.card,
                marginBottom: 25,
              },
            ]}
          >
            <View style={[ui.row, { gap: 12, marginBottom: 10 }]}>
              <Smartphone size={20} color={colors.accent} />
              <Text bold>
                {mode === "live"
                  ? "Connected on this device"
                  : "Explore now. Connect when ready."}
              </Text>
            </View>
            <Text muted style={{ fontSize: 12, lineHeight: 20 }}>
              Kanakku reads supported bank SMS to build your spending journal.
              It discards OTPs and unrelated messages without saving them.
            </Text>
            <View
              style={{
                padding: 14,
                borderRadius: 13,
                backgroundColor: colors.accentSoft,
                marginVertical: 16,
              }}
            >
              <Text style={{ fontSize: 11, lineHeight: 19 }}>
                No bank login. No SMS sent to a server. Your ledger is encrypted
                and opens with your device authentication.
              </Text>
            </View>
            {mode === "demo" ? (
              <>
                <Button disabled={busy} onPress={() => setConfirmConnect(true)}>
                  Connect bank SMS
                </Button>
                {confirmConnect && (
                  <View style={{ marginTop: 16, gap: 12 }}>
                    <Text style={{ fontSize: 12, lineHeight: 20 }}>
                      Android grants access to all SMS. Kanakku filters messages
                      locally before storing transaction details. This enables
                      real-time capture. Choose how much past history to import
                      below.
                    </Text>
                    <ImportPeriodPicker
                      value={historyMonths}
                      onChange={setHistoryMonths}
                      allowSkip
                      disabled={busy}
                    />
                    <Button
                      disabled={busy}
                      onPress={() => app.connect(historyMonths)}
                    >
                      {busy
                        ? "Connecting…"
                        : "Continue with Android permissions"}
                    </Button>
                    <Button secondary onPress={() => setConfirmConnect(false)}>
                      Not now
                    </Button>
                  </View>
                )}
              </>
            ) : (
              <>
                <View style={[ui.between, { marginBottom: 16 }]}>
                  <Text>Capture new transaction alerts</Text>
                  <Switch
                    accessibilityLabel="Capture new bank SMS"
                    value={capture}
                    onValueChange={changeCapture}
                    trackColor={{ true: colors.accent, false: colors.line }}
                  />
                </View>
                <View style={{ marginBottom: 16 }}>
                  <ImportPeriodPicker
                    value={historyMonths ?? 1}
                    onChange={setHistoryMonths}
                    disabled={busy || importing}
                  />
                </View>
                <Button
                  disabled={busy || importing || app.locked}
                  onPress={() => app.importHistory(historyMonths ?? 1)}
                >
                  {importing
                    ? "Importing in the background"
                    : "Import selected history"}
                </Button>
                {app.locked && (
                  <Button
                    secondary
                    onPress={app.unlock}
                    style={{ marginTop: 12 }}
                  >
                    Unlock to import history
                  </Button>
                )}
                <Text muted style={{ fontSize: 10, marginTop: 10 }}>
                  Only eligible transaction details are retained. Repeated
                  imports do not add duplicate alerts. Pause above to choose a
                  different period.
                </Text>
              </>
            )}
          </View>
          <ReviewPreferences />
          <SectionTitle title="Your little companion" />
          <View
            style={[
              ui.card,
              {
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.card,
                marginBottom: 25,
              },
            ]}
          >
            <View style={[ui.between, { gap: 15 }]}>
              <View style={{ flex: 1 }}>
                <Text bold style={{ fontSize: 13 }}>
                  Float over other apps
                </Text>
                <Text
                  muted
                  style={{ fontSize: 11, marginTop: 4, lineHeight: 18 }}
                >
                  Let the avatar ask about unclear payments while your phone is
                  unlocked.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Enable floating avatar"
                value={app.overlay}
                onValueChange={app.setOverlay}
                trackColor={{ true: colors.accent, false: colors.line }}
              />
            </View>
            <Text muted style={{ fontSize: 11, lineHeight: 18, marginTop: 17 }}>
              Drag to move it. Tap to answer. Dismiss to snooze for 30 minutes.
              A locked phone gets a private notification instead.
            </Text>
            <Button
              secondary
              onPress={app.previewOverlay}
              style={{ marginTop: 14 }}
            >
              Try the floating prompt
            </Button>
          </View>
          <View style={[ui.between, { marginBottom: 28 }]}>
            <View style={{ flex: 1 }}>
              <Text bold style={{ fontSize: 13 }}>
                Companion sounds
              </Text>
              <Text muted style={{ fontSize: 11 }}>
                Soft taps; silent mode is always respected.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Companion sounds"
              value={app.sounds}
              onValueChange={app.setSounds}
              trackColor={{ true: colors.accent, false: colors.line }}
            />
          </View>
          <SectionTitle title="What repeats" />
          <Button
            secondary
            onPress={() => router.push("/subscriptions")}
            style={{ marginBottom: 24 }}
          >
            Subscriptions & recurring payments
          </Button>
          <MerchantLookupSettings
            onPreferencesChanged={app.refreshMerchantLookup}
          />
          <View style={{ marginVertical: 24 }}>
            <AppUpdatesSettings
              restartBlocked={busy || app.locked}
              canRestart={() =>
                !isVoiceActive() &&
                !isReceiptActive() &&
                !hasPendingInteractions()
              }
            />
          </View>
          <SectionTitle title="Voice & categorization" />
          <View
            style={[
              ui.card,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.line,
                marginBottom: 25,
              },
            ]}
          >
            <View style={[ui.row, { gap: 10, marginBottom: 8 }]}>
              <Mic size={18} color={colors.accent} />
              <Text bold style={{ fontSize: 13 }}>
                Offline voice
              </Text>
            </View>
            <Text muted style={{ fontSize: 12, lineHeight: 20 }}>
              {voiceLanguageLabel}, processed on your phone after downloading
              the optional Whisper model. Your words become an editable note for
              category suggestions. The microphone starts after your tap; typing
              and category buttons are always available.
            </Text>
            {testBuild ? (
              <View style={[ui.between, { gap: 15, marginTop: 14 }]}>
                <View style={{ flex: 1 }}>
                  <Text bold style={{ fontSize: 13 }}>
                    Test build: keep last 3 voice clips
                  </Text>
                  <Text
                    muted
                    style={{ fontSize: 11, marginTop: 4, lineHeight: 18 }}
                  >
                    For diagnosing recognition only. Turning this off deletes
                    the saved clips. Never available in the personal app.
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Keep last 3 voice clips"
                  value={voiceClips}
                  onValueChange={(value) =>
                    native
                      ?.setDebugVoiceClips(value)
                      .then(setVoiceClips)
                      .catch(() => {})
                  }
                  trackColor={{ true: colors.accent, false: colors.line }}
                />
              </View>
            ) : null}
            {native ? (
              <View style={[ui.between, { gap: 15, marginTop: 14 }]}>
                <View style={{ flex: 1 }}>
                  <Text bold style={{ fontSize: 13 }}>
                    Beta diagnostics
                  </Text>
                  <Text
                    muted
                    style={{ fontSize: 11, marginTop: 4, lineHeight: 18 }}
                  >
                    Keeps a local log of errors and processing steps so problems
                    can be fixed. It never contains message text, notes, payee
                    names, account numbers or audio, and stays on this phone.
                    Turning it off deletes the log.
                  </Text>
                  {diagnostics ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        native
                          ?.clearDiagnostics()
                          .then(() => app.setNotice("Diagnostics cleared."))
                          .catch(() => {})
                      }
                      style={{ marginTop: 8 }}
                    >
                      <Text style={{ fontSize: 12, color: colors.accent }}>
                        Clear log
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <Switch
                  accessibilityLabel="Beta diagnostics"
                  value={diagnostics}
                  onValueChange={(value) =>
                    native
                      ?.setDiagnostics(value)
                      .then(setDiagnostics)
                      .catch(() => {})
                  }
                  trackColor={{ true: colors.accent, false: colors.line }}
                />
              </View>
            ) : null}
            <View
              style={{
                height: 1,
                backgroundColor: colors.line,
                marginVertical: 16,
              }}
            />
            <Text bold style={{ fontSize: 13, marginBottom: 5 }}>
              On-device understanding
            </Text>
            <Text muted style={{ fontSize: 12, lineHeight: 20 }}>
              A small semantic model suggests categories locally, alongside
              known merchants and your saved rules. Uncertain payments stay in
              review. English notes and translated spoken notes are supported;
              every suggestion is editable.
            </Text>
          </View>
          <SectionTitle title="Things you’ve taught me" />
          {rules.length ? (
            rules.map((r) => (
              <View
                key={`${r.bank || ""}:${r.merchant}`}
                style={[
                  ui.between,
                  {
                    paddingVertical: 15,
                    borderBottomWidth: 1,
                    borderColor: colors.line,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit rule for ${r.merchant}`}
                  onPress={() => {
                    setEditingRule(r.merchant);
                    setEditingRuleBank(r.bank);
                    setRuleCategory(r.category);
                    setRuleAlias(r.alias || r.merchant);
                  }}
                  style={{ flex: 1, minHeight: 48, justifyContent: "center" }}
                >
                  <Text bold>{r.alias || r.merchant}</Text>
                  <Text muted style={{ fontSize: 12 }}>
                    {r.bank ? `${r.bank} · ` : ""}
                    {r.category} · tap to edit
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove rule for ${r.merchant}`}
                  onPress={() => app.removeRule(r.merchant, r.bank)}
                  style={{ padding: 12 }}
                >
                  <Trash2 size={18} color={colors.muted} />
                </Pressable>
              </View>
            ))
          ) : (
            <Text
              muted
              style={{ fontSize: 12, lineHeight: 20, marginBottom: 20 }}
            >
              Choose “Remember this merchant” when categorizing a payment. Your
              rules will appear here.
            </Text>
          )}
          <SectionTitle title="Your device journal" />
          <View
            style={[
              ui.card,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.line,
                gap: 12,
              },
            ]}
          >
            <View style={[ui.row, { gap: 8 }]}>
              <LockKeyhole size={19} color={colors.accent} />
              <Text bold>Encrypted on this device</Text>
            </View>
            <Text muted style={{ fontSize: 12, lineHeight: 20 }}>
              {security
                ? `Device lock: ${security.deviceSecure ? "configured" : "not configured"}. Key storage: ${security.backing}.`
                : "Secure storage and device-key status are available in the Android app."}
            </Text>
            <Text muted style={{ fontSize: 11, lineHeight: 19 }}>
              Changing device security can make the old key unavailable. There
              is no cloud recovery. Reset the journal and re-import SMS still on
              this phone to start again; personal notes and rules cannot be
              recovered.
            </Text>
            <Button
              secondary
              disabled={!native || busy}
              onPress={() => {
                setResetVisible(true);
                setResetText("");
              }}
            >
              Reset device journal
            </Button>
          </View>
          {mode === "live" && (!native || native.status().testBuild) && (
            <Button secondary style={{ marginTop: 20 }} onPress={app.useDemo}>
              Return to sample data
            </Button>
          )}
          <View
            style={{
              borderTopWidth: 1,
              borderColor: colors.line,
              marginTop: 30,
              paddingTop: 24,
              alignItems: "center",
              gap: 7,
            }}
          >
            <View style={[ui.row, { gap: 6 }]}>
              <Leaf size={13} color={colors.accent} />
              <Text serif style={{ fontSize: 18 }}>
                kanakku
              </Text>
            </View>
            <Text muted style={{ fontSize: 10 }}>
              {testBuild ? "Test build" : "Personal beta"} ·{" "}
              {Constants.expoConfig?.version ?? "0.0.0"}
            </Text>
            <Text muted style={{ fontSize: 10, textAlign: "center" }}>
              SMS coverage varies by bank. Captured spending is not your bank
              balance.
            </Text>
          </View>
        </ScrollView>
      </View>
      <Sheet
        testID="rule-sheet"
        visible={!!editingRule}
        onClose={() => setEditingRule(null)}
        title="A rule for next time"
      >
        <Text bold>{editingRule}</Text>
        <Text muted style={{ fontSize: 12, lineHeight: 20 }}>
          Choose the category for future payments with this merchant. Past
          transactions keep their existing categories.
        </Text>
        <TextInput
          accessibilityLabel="Merchant display name"
          value={ruleAlias}
          onChangeText={setRuleAlias}
          maxLength={80}
          style={{
            padding: 16,
            minHeight: 50,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 13,
            color: colors.text,
            backgroundColor: colors.card,
            fontFamily: "DMSans",
          }}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CATEGORIES.filter((c) => c !== "Uncategorized").map((c) => (
            <Option
              key={c}
              label={c}
              selected={ruleCategory === c}
              onPress={() => setRuleCategory(c)}
            />
          ))}
        </View>
        <Button
          disabled={busy}
          onPress={async () => {
            if (editingRule)
              await app.editRule(
                editingRule,
                ruleCategory,
                ruleAlias,
                editingRuleBank,
              );
            setEditingRule(null);
          }}
        >
          Save merchant rule
        </Button>
      </Sheet>
      <Sheet
        visible={resetVisible}
        onClose={() => setResetVisible(false)}
        title="Start a fresh journal?"
      >
        <Text style={{ fontSize: 13, lineHeight: 21 }}>
          This permanently removes Kanakku's ledger, notes, merchant rules,
          encrypted pending alerts and import progress from this device. It
          stops capture and reminders. Your phone's SMS will remain, so you can
          connect and import them again.
        </Text>
        <Text bold>Type RESET to confirm.</Text>
        <TextInput
          accessibilityLabel="Confirm journal reset"
          value={resetText}
          onChangeText={setResetText}
          autoCapitalize="characters"
          autoCorrect={false}
          style={{
            padding: 16,
            minHeight: 50,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 13,
            color: colors.text,
            backgroundColor: colors.card,
            fontFamily: "DMSans",
          }}
        />
        <Button
          disabled={busy || resetText !== "RESET"}
          onPress={async () => {
            if (await app.resetVault(resetText)) setResetVisible(false);
          }}
        >
          Remove device journal
        </Button>
        <Button secondary onPress={() => setResetVisible(false)}>
          Keep my journal
        </Button>
      </Sheet>
    </View>
  );
}
