import { GmailSettings } from "../src/components/GmailSettings";
import { DriveBackupSettings } from "../src/components/DriveBackupSettings";
import { ModelDownloadsSettings } from "../src/components/ModelDownloadsSettings";
import Constants from "expo-constants";
import { AppUpdatesSettings } from "../src/components/AppUpdatesSettings";
import { isVoiceActive } from "../src/native/voice";
import { isReceiptActive } from "../src/native/receipt";
import { hasPendingInteractions } from "../src/state/interactions";
import { MerchantLookupSettings } from "../src/components/MerchantLookupSettings";
import { voiceLanguageLabel } from "../src/native/voiceModel";
import React, { useState, useEffect } from "react";
import {
  View,
  ScrollView,
  Pressable,
  BackHandler,
  AppState,
  Linking,
  Switch,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronLeft,
  ChevronRight,
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
  Plus,
} from "lucide-react-native";
import { useApp } from "../src/state/AppContext";
import {
  Text,
  Button,
  SectionTitle,
  CategoryIcon,
  CATEGORY_ICON_OPTIONS,
  styles as ui,
} from "../src/components/ui";
import { native } from "../src/native/bridge";
import { ThemeMode, Category } from "../src/domain/model";
import { Sheet } from "../src/components/Sheet";
import { Option } from "../src/components/LedgerFilters";
import { ReviewPreferences } from "../src/components/ReviewPreferences";
import { ImportPeriodPicker } from "../src/components/ImportPeriodPicker";
import { UnreadAlertsCard } from "../src/components/UnreadAlerts";
import { ImportBanner } from "../src/components/ImportProgress";
import { SettingsGroup } from "../src/components/SettingsGroup";
import { AUTO_LOCK_OPTIONS } from "../src/domain/autoLock";
import { makeAssistantSnapshot } from "../src/domain/appFunctions";
export default function Settings() {
  const app = useApp();
  const { colors, theme, mode, rules, busy, error, notice } = app;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ section?: string }>();
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
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("Tag");
  const [resetVisible, setResetVisible] = useState(false);
  const [resetText, setResetText] = useState("");
  const [security, setSecurity] = useState<{
    deviceSecure: boolean;
    vaultReady: boolean;
    backing: string;
  } | null>(null);
  const [journalDetailsOpen, setJournalDetailsOpen] = useState(false);
  const [bankDetailsOpen, setBankDetailsOpen] = useState(false);
  const [geminiAccess, setGeminiAccessState] = useState({
    supported: false,
    enabled: false,
  });
  const [geminiAccessBusy, setGeminiAccessBusy] = useState(false);
  const [confirmGeminiChanges, setConfirmGeminiChanges] = useState(true);
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
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      const refreshed = native?.status();
      setStatus(refreshed);
      setCapture(refreshed?.capture || false);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    let live = true;
    native?.geminiAccessStatus().then((value) => {
      if (live) setGeminiAccessState(value);
    }).catch(() => {});
    native?.assistantWriteSettings().then((value) => {
      if (live) setConfirmGeminiChanges(value.confirmChanges);
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  const changeGeminiConfirmation = async (enabled: boolean) => {
    try {
      if (!native) throw new Error("Use the Android app to change Gemini settings.");
      setConfirmGeminiChanges(await native.setAssistantWriteConfirmation(enabled));
    } catch (e) {
      app.setError(e instanceof Error ? e.message : "Could not update this setting.");
    }
  };
  const changeGeminiAccess = async (enabled: boolean) => {
    if (!native) return;
    setGeminiAccessBusy(true);
    let accessChanged = false;
    try {
      const value = await native.setGeminiAccess(enabled);
      accessChanged = true;
      setGeminiAccessState(value);
      if (enabled && app.mode === "live" && !app.locked) {
        const updated = await native.setAssistantSnapshot(
          makeAssistantSnapshot(app.transactions, app.recurringDecisions),
        );
        if (!updated)
          throw new Error("Kanakku could not prepare the unlocked journal for Gemini. Unlock Kanakku and try again.");
      } else await native.clearAssistantSnapshot();
    } catch (e) {
      if (enabled && accessChanged) {
        try {
          setGeminiAccessState(await native.setGeminiAccess(false));
        } catch {
          // Keep the original setup error visible if access rollback also fails.
        }
      }
      app.setError(
        e instanceof Error ? e.message : "Could not update Gemini access.",
      );
    } finally {
      setGeminiAccessBusy(false);
    }
  };
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
  const section = typeof params.section === "string" ? params.section : "";
  const selectedGroup =
    section === "backup" || section === "accounts" ? "accounts" :
    section === "models" ? "models" :
    section === "bank" ? "bank" :
    section === "appearance" ? "appearance" :
    section === "companion" ? "companion" :
    section === "tools" ? "tools" :
    section === "privacy" ? "privacy" : "";
  useEffect(() => {
    if (!selectedGroup) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        router.replace("/settings");
        return true;
      },
    );
    return () => subscription.remove();
  }, [selectedGroup]);
  const settingsItems = [
    { key: "bank", title: "Bank alerts & import", summary: mode === "live" ? "Connected · Review past alerts" : "Connect alerts and choose history", icon: Smartphone, group: "Everyday" },
    { key: "companion", title: "Reminders & helper", summary: "Set reminders and assistant preferences", icon: MessageSquare, group: "Everyday" },
    { key: "appearance", title: "Appearance", summary: `Choose light, dark or system · ${theme}`, icon: theme === "dark" ? Moon : theme === "light" ? Sun : Monitor, group: "Everyday" },
    { key: "accounts", title: "Email & backup", summary: "Connect email and manage journal backups", icon: ShieldCheck, group: "Accounts & data" },
    { key: "tools", title: "Categories & extra tools", summary: "Manage spending categories and merchants", icon: Plus, group: "Personalise" },
    { key: "models", title: "Voice & suggestions", summary: "Voice notes and spending suggestions", icon: Mic, group: "Advanced" },
    { key: "privacy", title: "Privacy & device", summary: "Lock, security and your data", icon: LockKeyhole, group: "Advanced" },
  ];
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
            accessibilityLabel={selectedGroup ? "Back to settings" : "Back to overview"}
            onPress={() =>
              selectedGroup
                ? router.replace("/settings")
                : // Return to the existing journal screen so Activity filters
                  // and scroll survive; replace("/") would stack a fresh copy.
                  router.dismissTo("/")
            }
            style={{ padding: 12 }}
          >
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text serif style={{ fontSize: 26, lineHeight: 34 }}>
            Settings
          </Text>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 60 }}
        >
          <View style={{ marginBottom: mode === "live" ? 16 : 0 }}>
            <ImportBanner />
          </View>
          {error ? (
            <View
              accessibilityRole="alert"
              style={{
                padding: 16,
                backgroundColor: colors.orangeSoft,
                borderRadius: 16,
                marginBottom: 20,
                gap: 10,
              }}
            >
              <Text style={{ color: colors.danger, fontSize: 12 }}>
                {error}
              </Text>
              {error.startsWith("Bank alert access wasn’t granted.") && (
                <Button
                  secondary
                  onPress={() => {
                    void Linking.openSettings().catch(() =>
                      app.setError(
                        "Could not open phone settings. Open Kanakku in your phone’s Settings and allow SMS access.",
                      ),
                    );
                  }}
                >
                  Open phone settings
                </Button>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss error"
                onPress={() => app.setError("")}
                style={{ minHeight: 40, justifyContent: "center" }}
              >
                <Text muted style={{ fontSize: 12 }}>Dismiss</Text>
              </Pressable>
            </View>
          ) : null}
          {notice ? (
            <Text style={{ color: colors.accent, marginBottom: 20 }}>
              {notice}
            </Text>
          ) : null}
          {!selectedGroup ? (
            <View testID="settings-menu">
              {Array.from(new Set(settingsItems.map((item) => item.group))).map((group) => (
                <View key={group} style={{ marginBottom: 22 }}>
                  <Text muted bold style={{ fontSize: 13, letterSpacing: 0.15, marginHorizontal: 12, marginBottom: 7 }}>
                    {group}
                  </Text>
                  {settingsItems.filter((item) => item.group === group).map((item, index, items) => {
                    const Icon = item.icon;
                    return (
                      <View key={item.key}>
                        <Pressable
                          testID={`settings-menu-${item.key}`}
                          accessibilityRole="button"
                          accessibilityLabel={`${item.title}. ${item.summary}`}
                          onPress={() => router.replace({ pathname: "/settings", params: { section: item.key } })}
                          style={({ pressed }) => ({
                            minHeight: 72,
                            marginHorizontal: -8,
                            paddingHorizontal: 12,
                            paddingVertical: 12,
                            borderRadius: 12,
                            backgroundColor: pressed ? colors.card : "transparent",
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 13,
                          })}
                        >
                          <Icon size={21} color={colors.accent} />
                          <View style={{ flex: 1, gap: 3 }}>
                            <Text bold style={{ fontSize: 15, lineHeight: 20 }}>{item.title}</Text>
                            <Text muted style={{ fontSize: 12.5, lineHeight: 18 }}>{item.summary}</Text>
                          </View>
                          <ChevronRight size={17} color={colors.muted} />
                        </Pressable>
                        {index < items.length - 1 ? (
                          <View style={{ height: 1, marginLeft: 46, backgroundColor: colors.line, opacity: 0.7 }} />
                        ) : null}
                        </View>
                    );
                  })}
                </View>
              ))}
            </View>
          ) : null}
          {selectedGroup === "accounts" && (
          <SettingsGroup
            testID="settings-accounts-group"
            title="Email & backup"
            detail="Add card alerts from Gmail or save an encrypted recovery copy."
          >
            <GmailSettings />
            <DriveBackupSettings />
          </SettingsGroup>
          )}
          {selectedGroup === "models" && (
          <SettingsGroup
            testID="settings-models-group"
            title="Voice & suggestions"
            detail="Add voice notes or smarter category suggestions when you need them."
          >
            <ModelDownloadsSettings />
          </SettingsGroup>
          )}
          {selectedGroup === "appearance" && (
          <SettingsGroup
            testID="settings-appearance-group"
            title="Appearance"
            detail="Choose a theme that feels comfortable."
          >
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
          </SettingsGroup>
          )}
          {selectedGroup === "bank" && (
          <SettingsGroup
            testID="settings-bank-group"
            title="Bank alerts & import"
            detail="Connect bank alerts, choose how much history to bring in, and see import progress."
            summary={mode === "live" ? "Connected on this device" : "Not connected yet"}
          >
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
            <Text muted style={{ fontSize: 12, lineHeight: 19 }}>
              Find supported bank alerts on this phone. No bank login is needed.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: bankDetailsOpen }}
              accessibilityLabel={bankDetailsOpen ? "Hide SMS privacy details" : "How SMS access works"}
              onPress={() => setBankDetailsOpen((open) => !open)}
              style={{ minHeight: 44, justifyContent: "center", marginTop: 4 }}
            >
              <Text style={{ color: colors.accent, fontSize: 12 }}>
                {bankDetailsOpen ? "Hide details" : "How SMS access works"}
              </Text>
            </Pressable>
            {bankDetailsOpen ? (
              <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.accentSoft, gap: 4 }}>
                <Text style={{ fontSize: 11, lineHeight: 18 }}>
                  Messages are filtered on your phone. OTPs and unrelated texts aren’t saved; your journal stays encrypted on this device.
                </Text>
              </View>
            ) : null}
            {mode === "demo" ? (
              <>
                <Button disabled={busy} onPress={() => setConfirmConnect(true)}>
                  Connect bank SMS
                </Button>
                {confirmConnect && (
                  <View style={{ marginTop: 16, gap: 12 }}>
                    <Text style={{ fontSize: 12, lineHeight: 20 }}>
                      Android lets Kanakku read your SMS inbox to find bank alerts. Messages are filtered on this phone; OTPs and unrelated texts aren’t saved. Choose how much history to check, or skip past messages.
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
                <Text muted style={{ fontSize: 10, lineHeight: 16, marginTop: 10 }}>
                  Re-imports won’t add duplicate alerts. Pause anytime to change the period.
                </Text>
              </>
            )}
          </View>
          <UnreadAlertsCard />
          </SettingsGroup>
          )}
          {selectedGroup === "companion" && (
          <SettingsGroup
            testID="settings-companion-group"
            title="Reminders & helper"
            detail="Choose when Kanakku reminds you and how the floating helper appears."
          >
          <ReviewPreferences />
          <SectionTitle title="Floating helper" />
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
          </SettingsGroup>
          )}
          {selectedGroup === "tools" && (
          <SettingsGroup
            testID="settings-tools-group"
            title="Categories & extra tools"
            detail="Personalize categories, improve merchant names, and manage optional tools."
          >
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
          <SectionTitle title="Voice notes and category suggestions" />
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
          <SectionTitle title="Your categories" />
          <Text
            muted
            style={{ fontSize: 12, lineHeight: 19, marginBottom: 12 }}
          >
            Friends &amp; family is ready to use. Add categories that make your
            spending easier to understand; they’re included in your encrypted
            Drive backup.
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 14,
            }}
          >
            {app.categories.map((category) => (
              <View
                key={category}
                style={{
                  minHeight: 40,
                  justifyContent: "center",
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: colors.card,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <CategoryIcon
                    category={category}
                    iconKey={app.categoryIcons[category]}
                    size={26}
                  />
                  <Text style={{ fontSize: 12 }}>{category}</Text>
                </View>
              </View>
            ))}
          </View>
          <Text muted style={{ fontSize: 12, marginTop: -16, marginBottom: 8 }}>
            Choose an icon
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 9,
              marginBottom: 18,
            }}
          >
            {CATEGORY_ICON_OPTIONS.map(({ key, label, Icon }) => {
              const selected = newCategoryIcon === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} category icon`}
                  accessibilityState={{ selected }}
                  aria-pressed={selected}
                  onPress={() => setNewCategoryIcon(key)}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: selected ? colors.accent : colors.line,
                    backgroundColor: selected ? colors.accentSoft : colors.card,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon
                    size={19}
                    color={selected ? colors.accent : colors.muted}
                    strokeWidth={1.8}
                  />
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 28 }}>
            <TextInput
              accessibilityLabel="New category name"
              value={newCategory}
              onChangeText={setNewCategory}
              maxLength={32}
              placeholder="e.g. Pets or Travel"
              placeholderTextColor={colors.muted}
              style={{
                flex: 1,
                minHeight: 50,
                paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 14,
                color: colors.text,
                backgroundColor: colors.card,
                fontFamily: "DMSans",
              }}
            />
            <Button
              disabled={busy || !newCategory.trim()}
              onPress={async () => {
                if (await app.addCategory(newCategory, newCategoryIcon))
                  setNewCategory("");
              }}
            >
              Add
            </Button>
          </View>
          <SectionTitle title="Things you’ve taught me" />
          <Text muted style={{ fontSize: 12, lineHeight: 19, marginBottom: 8 }}>
            Remove a rule if it matches the wrong payments. Automatic labels
            will return to review; payments you named yourself stay unchanged.
          </Text>
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
              Choose “Remember this payee” when categorizing a payment. Your
              rules will appear here.
            </Text>
          )}
          </SettingsGroup>
          )}
          {selectedGroup === "privacy" && (
          <SettingsGroup
            testID="settings-privacy-group"
            title="Privacy & device"
            detail="Review device protection, app updates and journal reset options."
          >
          <SectionTitle title="Your device journal" />
          <View style={{ gap: 9, marginBottom: 18 }}>
            <Text bold>Ask for unlock after</Text>
            <Text muted style={{ fontSize: 12, lineHeight: 19 }}>
              Switching apps starts this timer. Kanakku keeps your journal open
              for the selected time, then locks and clears it. Choose Immediately
              for the strongest protection.
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {AUTO_LOCK_OPTIONS.map((option) => {
                const selected = app.autoLockDelay === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => app.setAutoLockDelay(option.value)}
                    style={{
                      minHeight: 42,
                      justifyContent: "center",
                      paddingHorizontal: 14,
                      borderRadius: 22,
                      borderWidth: 1,
                      borderColor: selected ? colors.accent : colors.line,
                      backgroundColor: selected ? colors.accent + "18" : colors.card,
                    }}
                  >
                    <Text style={{ color: selected ? colors.accent : colors.text, fontSize: 12 }}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <SectionTitle title="Gemini access" />
          <View style={[ui.row, { alignItems: "flex-start", gap: 12, marginBottom: 8 }]}>
            <View style={{ flex: 1, gap: 5 }}>
              <Text bold>Let Gemini ask Kanakku</Text>
              <Text muted style={{ fontSize: 12, lineHeight: 19 }}>
                Share requested spending results with Gemini. When enabled, Gemini can search payments, request an update, or add a manual expense.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Allow Gemini to read Kanakku spending data"
              value={geminiAccess.enabled}
              disabled={!geminiAccess.supported || geminiAccessBusy}
              onValueChange={changeGeminiAccess}
              trackColor={{ true: colors.accent }}
            />
          </View>
          <Text muted style={{ fontSize: 11, lineHeight: 18, marginBottom: 18 }}>
            {geminiAccess.supported
              ? "Search checks note text on this phone, but does not return existing notes. Matching results include a payment ID so Gemini can request an edit. Kanakku stages edits and new expenses in your encrypted journal."
              : "This phone does not currently support App Functions. Gemini access needs Android 16 or a compatible Android App Functions provider."}
          </Text>
          <View style={[ui.row, { alignItems: "flex-start", gap: 12, marginBottom: 4 }]}
          >
            <View style={{ flex: 1, gap: 5 }}>
              <Text bold>Confirm Gemini changes in Kanakku</Text>
              <Text muted style={{ fontSize: 12, lineHeight: 19 }}>
                When on, approve each update or manual expense here before it is saved. When off, Kanakku saves supported changes automatically while the journal is open and unlocked. Deletes are not available to Gemini.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Confirm Gemini changes in Kanakku"
              value={confirmGeminiChanges}
              disabled={!geminiAccess.enabled || geminiAccessBusy}
              onValueChange={changeGeminiConfirmation}
              trackColor={{ true: colors.accent }}
            />
          </View>
          <Text muted style={{ fontSize: 11, lineHeight: 18, marginBottom: 18 }}>
            If Kanakku is closed or locked when Gemini asks for a change, it will not be saved. Open and unlock Kanakku to process it.
          </Text>
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
              <Text bold>
                {security?.deviceSecure && security.vaultReady
                  ? "Protected by your phone lock"
                  : "Set up device protection"}
              </Text>
            </View>
            <Text muted style={{ fontSize: 12, lineHeight: 20 }}>
              {security
                ? security.deviceSecure && security.vaultReady
                  ? "Your journal is encrypted and opens with your phone’s screen lock."
                  : "Add a screen lock to protect your journal on this phone."
                : "Open Kanakku on Android to check your device protection."}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: journalDetailsOpen }}
              onPress={() => setJournalDetailsOpen((open) => !open)}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={{ color: colors.accent, fontSize: 12 }}>
                {journalDetailsOpen ? "Hide details" : "How your journal is protected"}
              </Text>
            </Pressable>
            {journalDetailsOpen ? (
              <Text muted style={{ fontSize: 11, lineHeight: 19 }}>
                Notes and rules are stored in the encrypted journal. Before
                changing your phone lock, resetting the journal, or reinstalling
                a differently signed build, save a password-protected Drive
                backup. SMS can be imported again; notes and rules cannot.
              </Text>
            ) : null}
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
          </SettingsGroup>
          )}
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
          {app.categories
            .filter((c) => c !== "Uncategorized")
            .map((c) => (
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
        <Button
          secondary
          onPress={() => {
            setResetVisible(false);
            router.push("/settings?section=backup");
          }}
        >
          Back up my journal first
        </Button>
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
