import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  AppState,
  Platform,
  PermissionsAndroid,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams, type Href } from "expo-router";
import {
  House,
  ArrowUpRight,
  ArrowDownLeft,
  ChartNoAxesCombined,
  ListFilter,
  Settings2,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  ShieldCheck,
  Check,
  Wallet,
  ArrowRight,
  Sun,
  Moon,
  X,
  LockKeyhole,
} from "lucide-react-native";
import { FlashList, FlashListRef } from "@shopify/flash-list";
import { LedgerFilters } from "../src/components/LedgerFilters";
import { SpendingQuestions } from "../src/components/SpendingQuestions";
import { loanOutstanding } from "../src/domain/lending";
import {
  DateRange,
  LedgerFilter,
  filterLedger,
  monthRange,
  rangeLabel,
  merchantTotals,
  equivalentPeriods,
  KIND_OPTIONS,
} from "../src/domain/ledger";
import { useApp } from "../src/state/AppContext";
import {
  Text,
  Button,
  SectionTitle,
  CategoryIcon,
  categoryColor,
  styles as ui,
} from "../src/components/ui";
import { FloatingAvatar, Mascot } from "../src/components/Avatar";
import { BrandMark } from "../src/components/BrandMark";
import { TabBar } from "../src/components/TabBar";
import { SpendingChart, TrendChart } from "../src/components/Charts";
import { TransactionRow } from "../src/components/TransactionRow";
import { native } from "../src/native/bridge";
import { ReviewSheet, ReviewHandle } from "../src/components/ReviewSheet";
import { ImportBanner } from "../src/components/ImportProgress";
import {
  heldSpend,
  needsInrSettlement,
  Transaction,
  Category,
  Kind,
  monthKey,
  inMonth,
  netSpend,
  categoryTotals,
  money,
} from "../src/domain/model";

type Tab = "Overview" | "Activity" | "Insights";
export default function Home() {
  const app = useApp();
  const {
    colors,
    dark,
    transactions,
    mode,
    sampleData,
    busy,
    loaded,
    locked,
    error,
    notice,
  } = app;
  const unlockAttempted = useRef(false);
  const unlockRef = useRef(app.unlock);
  unlockRef.current = app.unlock;
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const active = next === "active";
      if (!active) unlockAttempted.current = false;
      setAppActive(active);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!locked) {
      unlockAttempted.current = false;
      return;
    }
    if (!appActive) {
      unlockAttempted.current = false;
      return;
    }
    if (!loaded || busy || unlockAttempted.current) return;
    unlockAttempted.current = true;
    const timer = setTimeout(() => void unlockRef.current(), 250);
    return () => clearTimeout(timer);
  }, [appActive, busy, loaded, locked]);
  const insets = useSafeAreaInsets();
  const sheet = useRef<ReviewHandle>(null);
  const params = useLocalSearchParams<{
    review?: string;
    voice?: string;
    photo?: string;
  }>();
  const [tab, setTab] = useState<Tab>("Overview");
  const [month, setMonth] = useState(monthKey(new Date()));
  const [hideAmount, setHideAmount] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [awaitingContextOnly, setAwaitingContextOnly] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [activityRange, setActivityRange] = useState<DateRange | undefined>();
  const [merchant, setMerchant] = useState<string | null>(null);
  const [source, setSource] = useState<"sms" | "email" | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const activityList = useRef<FlashListRef<Transaction>>(null);
  const activityOffset = useRef(0);
  const activityScrollAttached = useRef(false);
  const restoreActivityTarget = useRef(0);
  const restoringActivity = useRef(false);
  const attachActivityList = useCallback(
    (list: FlashListRef<Transaction> | null) => {
      if (list) {
        restoreActivityTarget.current = activityOffset.current;
        restoringActivity.current = true;
      }
      activityList.current = list;
      activityScrollAttached.current = !!list;
    },
    [],
  );
  const [avatarDismissed, setAvatarDismissed] = useState(false);
  const monthly = useMemo(
    () => inMonth(transactions, month),
    [transactions, month],
  );
  const total = netSpend(monthly);
  // Payments to unnamed bank accounts: not spending until the user says what they were.
  const held = heldSpend(monthly);
  const breakdown = categoryTotals(monthly);
  const pending = transactions.filter((t) => t.review);
  const pendingRef = useRef(0);
  useEffect(() => {
    if (pending.length > pendingRef.current) setAvatarDismissed(false);
    pendingRef.current = pending.length;
  }, [pending.length]);
  useEffect(() => {
    if (params.review === "preview") {
      // Settings preview overlay: there is no payment behind it. A voice tap lands here
      // only when the microphone was missing, so ask for it now.
      const voice = params.voice === "1";
      const photo = params.photo === "1";
      router.setParams({
        review: undefined,
        voice: undefined,
        photo: undefined,
      });
      if (photo) {
        app.setNotice(
          "That was a preview. Open a payment to photograph its bill.",
        );
        return;
      }
      if (!voice || Platform.OS !== "android") {
        app.setNotice("That was a preview. No payment was recorded.");
        return;
      }
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)
        .then((result) =>
          app.setNotice(
            result === PermissionsAndroid.RESULTS.GRANTED
              ? "Microphone allowed. Try the preview again; tapping the avatar will listen."
              : "That was a preview. Without the microphone, the avatar opens Kanakku so you can type.",
          ),
        )
        .catch(() => {});
      return;
    }
    if (params.review && transactions.length && !locked) {
      const id = params.review === "next" ? pending[0]?.id : params.review;
      if (id && transactions.some((t) => t.id === id)) {
        const timer = setTimeout(() => {
          const photo = params.photo === "1";
          sheet.current?.open(id, {
            queue: true,
            voice: !photo && params.voice === "1",
            photo,
          });
          router.setParams({
            review: undefined,
            voice: undefined,
            photo: undefined,
          });
        }, 300);
        return () => clearTimeout(timer);
      }
      router.setParams({
        review: undefined,
        voice: undefined,
        photo: undefined,
      });
      app.setNotice(
        "This payment is no longer available. Open a payment to add its bill.",
      );
    }
  }, [params.review, params.voice, params.photo, transactions.length, locked]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => app.setNotice(""), 6000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  const activeFilter: LedgerFilter = {
    range: day
      ? { start: day, end: day, label: day }
      : activityRange ||
        (reviewOnly
          ? { start: null, end: null, label: "All review dates" }
          : monthRange(month)),
    category,
    account,
    kind,
    merchant,
    source,
    query,
    reviewOnly,
    awaitingContextOnly,
  };
  const filtered = useMemo(
    () => filterLedger(transactions, activeFilter),
    [
      transactions,
      month,
      day,
      activityRange,
      category,
      account,
      kind,
      merchant,
      source,
      query,
      reviewOnly,
      awaitingContextOnly,
    ],
  );
  const filteredPending = filtered.filter((t) => t.review);
  useEffect(() => {
    activityOffset.current = 0;
    restoreActivityTarget.current = 0;
    activityList.current?.scrollToOffset({ offset: 0, animated: false });
  }, [
    month,
    day,
    activityRange,
    category,
    account,
    kind,
    merchant,
    source,
    query,
    reviewOnly,
    awaitingContextOnly,
  ]);
  const topMerchants = merchantTotals(monthly);
  const comparable = equivalentPeriods(month);
  const comparisonCurrent = netSpend(
    filterLedger(transactions, { range: comparable.current }),
  );
  const comparisonPrevious = netSpend(
    filterLedger(transactions, { range: comparable.previous }),
  );
  const comparisonCovered =
    comparable.days > 0 &&
    (mode === "demo" ||
      (app.importProgress.pending === 0 &&
        app.importProgress.coverageSince >= 0 &&
        app.importProgress.coverageSince <=
          new Date(`${comparable.previous.start}T00:00:00`).getTime() &&
        app.importProgress.coverageUntil >=
          new Date(`${comparable.current.end}T23:59:59`).getTime()));
  const changeMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    setMonth(monthKey(new Date(y, m - 1 + delta, 1)));
    setDay(null);
    setActivityRange(undefined);
    activityOffset.current = 0;
  };
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString(
    "en-IN",
    { month: "long", year: "numeric" },
  );
  const goActivity = (cat: Category | null = null) => {
    setCategory(cat);
    setReviewOnly(false);
    setAwaitingContextOnly(false);
    setAccount(null);
    setDay(null);
    setQuery("");
    setKind(null);
    setMerchant(null);
    setSource(null);
    setActivityRange(undefined);
    activityOffset.current = 0;
    setTab("Activity");
  };
  const applyFilters = (filter: LedgerFilter) => {
    setActivityRange(filter.range);
    setCategory(filter.category || null);
    setAccount(filter.account || null);
    setKind(filter.kind || null);
    setMerchant(filter.merchant || null);
    setSource(filter.source || null);
    setReviewOnly(!!filter.reviewOnly);
    setAwaitingContextOnly(!!filter.awaitingContextOnly);
    setDay(null);
    setQuery(filter.query || "");
    activityOffset.current = 0;
    setTab("Activity");
    activityList.current?.scrollToOffset({ offset: 0, animated: false });
  };
  const rememberActivityScroll = () => {
    if (tab !== "Activity" || Platform.OS !== "web") return;
    // Preserve the actual position even if the final throttled scroll event has not arrived.
    const node = activityList.current?.getScrollableNode() as
      { scrollTop?: number } | undefined;
    if (typeof node?.scrollTop === "number" && Number.isFinite(node.scrollTop))
      activityOffset.current = node.scrollTop;
  };
  const changeTab = (next: Tab) => {
    rememberActivityScroll();
    // A departing ScrollView can report zero after layout is torn down.
    // Freeze the saved position before React starts removing the Activity list.
    if (next !== "Activity") activityScrollAttached.current = false;
    setTab(next);
  };
  const openReview = (voice = false, photo = false) => {
    if (pending[0])
      sheet.current?.open(pending[0].id, {
        queue: true,
        voice: voice && !photo,
        photo,
      });
  };
  const nav = (
    <TabBar
      tabs={
        [
          ["Overview", House],
          ["Activity", ArrowDownLeft],
          ["Insights", ChartNoAxesCombined],
        ] as const
      }
      value={tab}
      onChange={changeTab}
    />
  );
  const header = (
    <View style={[s.header, { paddingTop: Math.max(insets.top, 20) }]}>
      <View style={ui.row}>
        <View style={{ marginRight: 9 }}>
          <BrandMark size={27} tile={colors.accent} leaf={colors.accentText} />
        </View>
        <Text serif style={{ fontSize: 25, lineHeight: 32, letterSpacing: -1 }}>
          kanakku
        </Text>
      </View>
      <View style={[ui.row, { gap: 4 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            dark ? "Switch to light theme" : "Switch to dark theme"
          }
          onPress={() => app.setTheme(dark ? "light" : "dark")}
          style={s.iconButton}
        >
          {dark ? (
            <Sun size={20} color={colors.text} />
          ) : (
            <Moon size={19} color={colors.text} />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          onPress={() => {
            rememberActivityScroll();
            router.push("/settings");
          }}
          style={s.iconButton}
        >
          <Settings2 size={21} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
  const period = (
    <View style={[ui.between, { marginBottom: 15 }]}>
      <View style={ui.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => changeMonth(-1)}
          style={{ paddingVertical: 10, paddingRight: 10 }}
        >
          <ChevronLeft size={17} color={colors.muted} />
        </Pressable>
        <Text bold style={{ fontSize: 12 }}>
          {monthLabel}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => changeMonth(1)}
          style={{ padding: 10 }}
        >
          <ChevronRight size={17} color={colors.muted} />
        </Pressable>
      </View>
      <View
        style={[
          ui.row,
          {
            gap: 5,
            backgroundColor: colors.accentSoft,
            borderRadius: 20,
            paddingHorizontal: 9,
            paddingVertical: 5,
          },
        ]}
      >
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            backgroundColor: colors.accent,
          }}
        />
        <Text style={{ fontSize: 9, color: colors.accent }} bold>
          {mode === "live"
            ? "ON DEVICE"
            : sampleData
              ? "SAMPLE DATA"
              : "NOT CONNECTED"}
        </Text>
      </View>
    </View>
  );
  if (!loaded)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
        }}
      >
        <Mascot size={86} />
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  if (locked)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          padding: 32,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StatusBar style={dark ? "light" : "dark"} />
        <Mascot size={115} />
        <Text serif style={{ fontSize: 34, lineHeight: 44, marginTop: 20 }}>
          Just for your eyes.
        </Text>
        <Text
          muted
          style={{
            textAlign: "center",
            marginTop: 12,
            marginBottom: 28,
            maxWidth: 300,
          }}
        >
          Unlock your encrypted spending journal with your fingerprint or device
          PIN.
        </Text>
        {error ? (
          <Text
            style={{
              color: colors.danger,
              marginBottom: 18,
              textAlign: "center",
            }}
          >
            {error}
          </Text>
        ) : null}
        <Button disabled={busy} onPress={app.unlock} style={{ minWidth: 240 }}>
          {busy ? "Unlocking…" : "Unlock Kanakku"}
        </Button>
        <View style={{ marginTop: 18, width: "100%", maxWidth: 420 }}>
          <ImportBanner />
        </View>
        {(!native || native.status().testBuild === true) && (
          <Button
            secondary
            onPress={app.useDemo}
            style={{ marginTop: 12, minWidth: 240 }}
          >
            Explore sample data
          </Button>
        )}
        <Button
          secondary
          onPress={() => {
            rememberActivityScroll();
            router.push("/settings");
          }}
          style={{ marginTop: 12, minWidth: 240 }}
        >
          Device journal & recovery
        </Button>
      </View>
    );
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={dark ? "light" : "dark"} />
      <View style={[s.shell, { backgroundColor: colors.bg }]}>
        {header}
        <View style={{ marginHorizontal: 24 }}>
          <ImportBanner />
        </View>
        {error ? (
          <Pressable
            onPress={() => app.setError("")}
            style={{
              marginHorizontal: 24,
              padding: 12,
              backgroundColor: colors.orangeSoft,
              borderRadius: 14,
              flexDirection: "row",
              gap: 10,
            }}
          >
            <Text style={{ color: colors.danger, fontSize: 12, flex: 1 }}>
              {error}
            </Text>
            <X size={16} color={colors.danger} />
          </Pressable>
        ) : null}
        {tab === "Overview" && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={ui.screen}
          >
            <View style={{ marginTop: 16, marginBottom: 26 }}>
              <Text muted style={{ fontSize: 12, marginBottom: 4 }}>
                YOUR MONEY, A LITTLE CLEARER
              </Text>
              <Text
                serif
                style={{ fontSize: 35, lineHeight: 44, letterSpacing: -0.9 }}
              >
                Room to breathe.
              </Text>
            </View>
            {period}
            <View style={[s.hero, { backgroundColor: colors.accentSoft }]}>
              <View style={ui.between}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="View transactions in this spending total"
                  onPress={() => goActivity()}
                >
                  <Text style={{ fontSize: 12, color: colors.accent }}>
                    Net spending this month
                  </Text>
                  <Text
                    testID="overview-total"
                    serif
                    style={{
                      fontSize: 51,
                      lineHeight: 67,
                      letterSpacing: -2,
                      marginTop: 4,
                    }}
                  >
                    {hideAmount ? "₹ •••••" : money(total)}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    hideAmount ? "Show spending amount" : "Hide spending amount"
                  }
                  onPress={() => setHideAmount(!hideAmount)}
                  style={s.iconButton}
                >
                  {hideAmount ? (
                    <EyeOff size={18} color={colors.accent} />
                  ) : (
                    <Eye size={18} color={colors.accent} />
                  )}
                </Pressable>
              </View>
              <View style={[ui.row, { gap: 6, marginTop: 2 }]}>
                <ShieldCheck size={12} color={colors.accent} />
                <Text style={{ fontSize: 10, color: colors.accent }}>
                  {mode === "live"
                    ? "Captured from supported bank alerts"
                    : sampleData
                      ? "A preview with sample transactions"
                      : "Connect bank alerts to start your journal"}
                </Text>
              </View>
              {held > 0 && (
                <Pressable
                  testID="held-spend"
                  accessibilityRole="button"
                  accessibilityLabel="Payments to bank accounts awaiting your context"
                  onPress={() =>
                    applyFilters({
                      range: monthRange(month),
                      reviewOnly: true,
                      awaitingContextOnly: true,
                    })
                  }
                  style={{ marginTop: 6 }}
                >
                  <Text style={{ fontSize: 11, color: colors.orange }}>
                    {hideAmount ? "Some payments" : money(held)} to bank
                    accounts not counted yet · tell me what they were
                  </Text>
                </Pressable>
              )}
              {monthly.some(
                (t) =>
                  !t.excluded &&
                  (needsInrSettlement(t) || t.emailMatchCandidates?.length),
              ) && (
                <Text muted style={{ fontSize: 11, marginTop: 6 }}>
                  {
                    monthly.filter(
                      (t) =>
                        !t.excluded &&
                        (needsInrSettlement(t) ||
                          t.emailMatchCandidates?.length),
                    ).length
                  }{" "}
                  alerts need a bank-alert match decision or final INR charge.
                  They are not included in spending yet; resolve them in review.
                </Text>
              )}
              <SpendingChart
                transactions={transactions}
                hideAmount={hideAmount}
                until={
                  month === monthKey(new Date())
                    ? new Date()
                    : new Date(
                        Number(month.slice(0, 4)),
                        Number(month.slice(5)),
                        0,
                      )
                }
                onDay={(d) => {
                  goActivity();
                  setMonth(monthKey(new Date(d)));
                  setDay(d);
                }}
              />
              <View
                style={[
                  ui.between,
                  {
                    marginTop: 15,
                    paddingTop: 14,
                    borderTopWidth: 1,
                    borderColor: dark ? "#40523F" : "#D1DCC8",
                  },
                ]}
              >
                <Text style={{ fontSize: 10, color: colors.accent }}>
                  Last 7 days in this period
                </Text>
                <Text style={{ fontSize: 10, color: colors.accent }}>
                  A small habit. A clearer picture.
                </Text>
              </View>
            </View>
            {pending.length > 0 && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  applyFilters({
                    range: {
                      start: null,
                      end: null,
                      label: "All review dates",
                    },
                    reviewOnly: true,
                  });
                }}
                style={[
                  s.reviewBanner,
                  { borderColor: colors.line, backgroundColor: colors.card },
                ]}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    backgroundColor: colors.orangeSoft,
                    borderRadius: 13,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text bold style={{ color: colors.orange }}>
                    {pending.length}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text bold style={{ fontSize: 12 }}>
                    A few little mysteries
                  </Text>
                  <Text muted style={{ fontSize: 10 }}>
                    Add context to {pending.length} payments
                  </Text>
                </View>
                <ArrowRight size={17} color={colors.accent} />
              </Pressable>
            )}
            <View style={{ marginTop: 31 }}>
              <SectionTitle
                title="Where it went"
                action="Explore"
                onPress={() => changeTab("Insights")}
              />
              {breakdown.length ? (
                breakdown.slice(0, 4).map(({ category: cat, amount }) => (
                  <Pressable
                    key={cat}
                    accessibilityRole="button"
                    onPress={() => goActivity(cat)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 18,
                    }}
                  >
                    <CategoryIcon category={cat} size={39} />
                    <View style={{ flex: 1 }}>
                      <View style={ui.between}>
                        <Text style={{ fontSize: 12 }}>{cat}</Text>
                        <Text bold style={{ fontSize: 12 }}>
                          {hideAmount ? "••••" : money(amount)}
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 5,
                          backgroundColor: colors.line,
                          borderRadius: 3,
                          marginTop: 8,
                        }}
                      >
                        <View
                          style={{
                            height: 5,
                            borderRadius: 3,
                            width: `${Math.max(0, Math.min(100, (amount / Math.max(total, 1)) * 100))}%`,
                            backgroundColor: categoryColor(cat, colors).fg,
                          }}
                        />
                      </View>
                    </View>
                  </Pressable>
                ))
              ) : (
                <Empty
                  title="Nothing to show for this month"
                  detail="Categories appear here as eligible transactions are added."
                />
              )}
            </View>
            <View style={{ marginTop: 15 }}>
              <SectionTitle
                title="Recent activity"
                action="View all"
                onPress={() => goActivity()}
              />
              {monthly.slice(0, 4).map((t) => (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  hideAmount={hideAmount}
                  onPress={() => sheet.current?.open(t.id)}
                />
              ))}
            </View>
            <View style={[s.privacy, { borderColor: colors.line }]}>
              <ShieldCheck size={17} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text bold style={{ fontSize: 11 }}>
                  {mode === "live"
                    ? "Your finances stay with you."
                    : sampleData
                      ? "Take a look around. This is sample data."
                      : "Not connected yet."}
                </Text>
                <Text muted style={{ fontSize: 10, lineHeight: 17 }}>
                  {mode === "live"
                    ? "Encrypted on your device. No account needed."
                    : sampleData
                      ? "Connect your bank SMS in the Android app."
                      : "Connect your bank SMS to start your journal."}
                </Text>
              </View>
              {mode === "demo" && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Set up bank alerts"
                  onPress={() => {
                    rememberActivityScroll();
                    router.push("/settings?section=bank");
                  }}
                  style={{ minHeight: 48, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <Text bold style={{ fontSize: 11, color: colors.accent }}>Set up alerts</Text>
                  <ArrowUpRight color={colors.accent} size={19} />
                </Pressable>
              )}
            </View>
          </ScrollView>
        )}
        {tab === "Activity" && (
          <View style={{ flex: 1, paddingHorizontal: 20 }}>
            <Text
              serif
              style={{
                fontSize: 27,
                lineHeight: 34,
                marginTop: 5,
                marginBottom: 7,
              }}
            >
              The everyday details.
            </Text>
            {activityRange || reviewOnly || day ? (
              <View style={[ui.between, { marginBottom: 14, gap: 8 }]}>
                <Text bold style={{ fontSize: 12, flex: 1 }}>
                  {activeFilter.range?.label || rangeLabel(activeFilter.range!)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Choose transaction dates"
                  onPress={() => setFiltersVisible(true)}
                  style={{ padding: 13 }}
                >
                  <ChevronDown size={18} color={colors.accent} />
                </Pressable>
              </View>
            ) : (
              period
            )}
            <View
              style={[
                s.search,
                { backgroundColor: colors.card, borderColor: colors.line },
              ]}
            >
              <Search size={18} color={colors.muted} />
              <TextInput
                accessibilityLabel="Search transactions"
                placeholder="Search merchants, notes, accounts…"
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={setQuery}
                style={{
                  flex: 1,
                  color: colors.text,
                  fontFamily: "DMSans",
                  fontSize: 12,
                  minHeight: 44,
                }}
              />
              {query ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  style={{
                    minWidth: 48,
                    minHeight: 48,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onPress={() => setQuery("")}
                >
                  <X size={16} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open transaction filters"
              onPress={() => setFiltersVisible(true)}
              style={[
                ui.between,
                {
                  minHeight: 40,
                  marginTop: 6,
                  paddingHorizontal: 12,
                  borderRadius: 11,
                  backgroundColor: colors.accentSoft,
                },
              ]}
            >
              <Text bold style={{ fontSize: 11 }}>
                Dates, accounts & transaction types
              </Text>
              <ListFilter size={18} color={colors.accent} />
            </Pressable>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, marginVertical: 7 }}
              contentContainerStyle={{ gap: 8 }}
            >
              <Chip
                label="All spending"
                active={!reviewOnly && !category}
                onPress={() => {
                  setReviewOnly(false);
                  setAwaitingContextOnly(false);
                  setCategory(null);
                  setDay(null);
                  setAccount(null);
                  setKind(null);
                  setMerchant(null);
                  setSource(null);
                  setActivityRange(undefined);
                  activityOffset.current = 0;
                }}
              />
              <Chip
                label={`Needs context · ${pending.length}`}
                active={reviewOnly && !awaitingContextOnly}
                onPress={() => {
                  setReviewOnly(awaitingContextOnly || !reviewOnly);
                  setAwaitingContextOnly(false);
                }}
              />
              {awaitingContextOnly && (
                <Chip
                  label="Bank account payments"
                  active
                  onPress={() => setAwaitingContextOnly(false)}
                />
              )}
              {app.categories
                .filter((c) => c !== "Uncategorized")
                .map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    active={category === c}
                    onPress={() => setCategory(category === c ? null : c)}
                  />
                ))}
            </ScrollView>
            {(account || day || kind || merchant) && (
              <Pressable
                onPress={() => {
                  setAccount(null);
                  setDay(null);
                  setKind(null);
                  setMerchant(null);
                }}
                style={{ flexDirection: "row", gap: 8, paddingBottom: 12 }}
              >
                <Text muted style={{ fontSize: 12 }}>
                  {[
                    account,
                    day,
                    kind && KIND_OPTIONS.find((k) => k.value === kind)?.label,
                    merchant,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                <X size={15} color={colors.muted} />
              </Pressable>
            )}
            {reviewOnly && filteredPending.length > 0 && (
              <Button
                onPress={() =>
                  sheet.current?.open(filteredPending[0].id, {
                    queue: true,
                    queueIds: filteredPending.map((t) => t.id),
                  })
                }
                style={{ marginBottom: 10 }}
              >
                Review {filteredPending.length}{" "}
                {filteredPending.length === 1 ? "payment" : "payments"} one by
                one
              </Button>
            )}
            <View
              style={[
                ui.between,
                {
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderColor: colors.line,
                },
              ]}
            >
              <Text testID="activity-count" muted style={ui.eyebrow}>
                {filtered.length} TRANSACTIONS
              </Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text testID="activity-total" bold>
                  {money(netSpend(filtered))}
                </Text>
                {heldSpend(filtered) > 0 && (
                  <Text
                    testID="activity-held"
                    style={{ fontSize: 10, color: colors.orange }}
                  >
                    + {money(heldSpend(filtered))} awaiting context
                  </Text>
                )}
              </View>
            </View>
            {app.canUndo && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Undo last ledger change"
                onPress={app.undo}
                style={{
                  minHeight: 48,
                  justifyContent: "center",
                  alignItems: "flex-end",
                }}
              >
                <Text bold style={{ fontSize: 11, color: colors.accent }}>
                  Undo last change
                </Text>
              </Pressable>
            )}
            <FlashList
              // Dispose stale cell measurements when a filter changes the result count.
              key={filtered.length}
              testID="activity-list"
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              maintainVisibleContentPosition={{ disabled: true }}
              ref={attachActivityList}
              onScroll={(event) => {
                const offset = event.nativeEvent.contentOffset.y;
                if (!activityScrollAttached.current) return;
                if (
                  restoringActivity.current &&
                  restoreActivityTarget.current > 0 &&
                  offset === 0
                )
                  return;
                restoringActivity.current = false;
                activityOffset.current = offset;
              }}
              scrollEventThrottle={16}
              onLoad={() => {
                const offset = restoreActivityTarget.current;
                activityList.current?.scrollToOffset({
                  offset,
                  animated: false,
                });
                activityOffset.current = offset;
              }}
              data={filtered}
              keyExtractor={(t) => t.id}
              contentContainerStyle={{ paddingBottom: 150 }}
              renderItem={({ item, index }) => (
                <View>
                  {(index === 0 ||
                    new Date(item.at).toDateString() !==
                      new Date(filtered[index - 1].at).toDateString()) && (
                    <Text
                      muted
                      style={{
                        fontSize: 10,
                        letterSpacing: 1.2,
                        marginTop: 12,
                        marginBottom: 4,
                      }}
                    >
                      {new Date(item.at)
                        .toLocaleDateString("en-IN", {
                          weekday: "long",
                          day: "numeric",
                          month: "short",
                        })
                        .toUpperCase()}
                    </Text>
                  )}
                  <TransactionRow
                    transaction={item}
                    onPress={() => sheet.current?.open(item.id)}
                  />
                </View>
              )}
              ListEmptyComponent={
                <Empty
                  title="Nothing here just yet."
                  detail="Try another month or clear your filters."
                />
              }
            />
          </View>
        )}
        {tab === "Insights" && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={ui.screen}
          >
            <Text
              serif
              style={{
                fontSize: 35,
                lineHeight: 45,
                marginTop: 16,
                marginBottom: 8,
              }}
            >
              See the bigger picture.
            </Text>
            <Text muted style={{ fontSize: 12, marginBottom: 20 }}>
              Small details. Useful perspective.
            </Text>
            {period}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open money lent tracker"
              onPress={() => router.push("/lending" as Href)}
              style={[
                ui.card,
                {
                  backgroundColor: colors.accentSoft,
                  borderColor: colors.line,
                  borderWidth: 1,
                  marginBottom: 18,
                },
              ]}
            >
              <Text muted style={{ fontSize: 11 }}>
                Money lent · tracked separately
              </Text>
              <View style={[ui.between, { marginTop: 7 }]}>
                <Text serif style={{ fontSize: 27 }}>
                  {money(
                    app.loans.reduce(
                      (sum, loan) => sum + loanOutstanding(loan),
                      0,
                    ),
                  )}
                </Text>
                <Text bold style={{ color: colors.accent, fontSize: 12 }}>
                  View loans →
                </Text>
              </View>
            </Pressable>
            <View
              style={[
                ui.card,
                {
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.line,
                },
              ]}
            >
              <Text muted style={{ fontSize: 11 }}>
                Cumulative net spending
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View cumulative spending transactions"
                onPress={() => goActivity()}
              >
                <Text serif style={{ fontSize: 38, lineHeight: 52 }}>
                  {money(total)}
                </Text>
              </Pressable>
              <TrendChart transactions={monthly} month={month} />
              <Text muted style={{ fontSize: 10 }}>
                Purchases less refunds. Transfers and card repayments are
                excluded.
              </Text>
            </View>
            <View style={{ marginTop: 24, gap: 8 }}>
              <SectionTitle title="What keeps coming back" />
              <Text muted style={{ fontSize: 12 }}>
                Spot repeat charges in captured history and review their
                evidence.
              </Text>
              <Button secondary onPress={() => router.push("/subscriptions")}>
                Subscriptions & recurring payments
              </Button>
            </View>
            <View style={{ marginTop: 28 }}>
              <SectionTitle title="Your spending mix" />
              {breakdown.map(({ category: c, amount }) => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  onPress={() => goActivity(c)}
                  style={[
                    ui.between,
                    {
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderColor: colors.line,
                    },
                  ]}
                >
                  <View style={[ui.row, { gap: 12 }]}>
                    <CategoryIcon category={c} size={35} />
                    <Text style={{ fontSize: 12 }}>{c}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text bold>{money(amount)}</Text>
                    <Text muted style={{ fontSize: 10 }}>
                      {amount < 0
                        ? "Net refund"
                        : total > 0
                          ? `${Math.round((amount / total) * 100)}% of net spending`
                          : "Captured net spending"}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
            <View style={{ marginTop: 30 }}>
              <SectionTitle title="Your regular places" />
              {topMerchants.slice(0, 8).map((item) => (
                <Pressable
                  key={item.merchant}
                  accessibilityRole="button"
                  accessibilityLabel={`View spending at ${item.merchant}`}
                  onPress={() =>
                    applyFilters({
                      range: monthRange(month),
                      merchant: item.merchant,
                    })
                  }
                  style={[
                    ui.between,
                    {
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderColor: colors.line,
                      gap: 12,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text bold style={{ fontSize: 13 }}>
                      {item.merchant}
                    </Text>
                    <Text muted style={{ fontSize: 10 }}>
                      {item.count} transactions · net spending
                    </Text>
                  </View>
                  <Text bold>{money(item.amount)}</Text>
                  <ArrowUpRight size={16} color={colors.accent} />
                </Pressable>
              ))}
            </View>
            <View style={{ marginTop: 30 }}>
              <SectionTitle title="Across your accounts" />
              {[...new Set(monthly.map((t) => `${t.bank} ${t.account}`))].map(
                (a) => {
                  const data = monthly.filter(
                    (t) => `${t.bank} ${t.account}` === a,
                  );
                  return (
                    <Pressable
                      key={a}
                      accessibilityRole="button"
                      onPress={() => {
                        goActivity();
                        setAccount(a);
                      }}
                      style={{
                        padding: 18,
                        backgroundColor: colors.card,
                        borderRadius: 18,
                        marginBottom: 10,
                        borderWidth: 1,
                        borderColor: colors.line,
                      }}
                    >
                      <View style={ui.between}>
                        <View style={[ui.row, { gap: 10 }]}>
                          <Wallet size={18} color={colors.accent} />
                          <Text bold style={{ fontSize: 12 }}>
                            {data[0].bank}
                          </Text>
                        </View>
                        <Text bold>{money(netSpend(data))}</Text>
                      </View>
                      <Text muted style={{ fontSize: 10, marginTop: 8 }}>
                        •• {data[0].account} · {data.length} transactions ·
                        Captured spending
                      </Text>
                    </Pressable>
                  );
                },
              )}
            </View>
            <View
              style={{
                marginTop: 26,
                padding: 18,
                borderRadius: 20,
                backgroundColor: colors.accentSoft,
                gap: 9,
              }}
            >
              <Text bold>Like-for-like view</Text>
              <Text muted style={{ fontSize: 11, lineHeight: 18 }}>
                {comparable.days > 0
                  ? `Completed days 1–${comparable.days} in the selected month and previous month; today is excluded.`
                  : "Available after the first full day of this month."}
              </Text>
              {comparisonCovered ? (
                <>
                  <Text serif style={{ fontSize: 27, lineHeight: 36 }}>
                    {money(comparisonCurrent)}{" "}
                    <Text muted style={{ fontSize: 13 }}>
                      vs {money(comparisonPrevious)}
                    </Text>
                  </Text>
                  <Text muted style={{ fontSize: 11 }}>
                    {mode === "demo" && sampleData
                      ? "Sample comparison"
                      : "Captured SMS spending"}{" "}
                    · {money(comparisonCurrent - comparisonPrevious)} difference
                  </Text>
                  <Button
                    secondary
                    onPress={() => applyFilters({ range: comparable.current })}
                  >
                    View selected period
                  </Button>
                  <Button
                    secondary
                    onPress={() => applyFilters({ range: comparable.previous })}
                  >
                    View previous period
                  </Button>
                </>
              ) : (
                <Text muted style={{ fontSize: 12, lineHeight: 20 }}>
                  Import both full date ranges before comparing. Available
                  history is currently incomplete.
                </Text>
              )}
            </View>
            <SpendingQuestions onOpen={applyFilters} />
          </ScrollView>
        )}
        {Boolean(notice) && (
          <View
            style={[
              s.toast,
              {
                backgroundColor: colors.text,
                bottom: pending.length && !avatarDismissed ? 178 : 96,
              },
            ]}
          >
            <Text style={{ color: colors.bg, fontSize: 12, flex: 1 }}>
              {notice}
            </Text>
            {app.canUndo && (
              <Pressable
                accessibilityRole="button"
                onPress={app.undo}
                style={{ padding: 8 }}
              >
                <Text bold style={{ color: colors.bg, fontSize: 12 }}>
                  Undo
                </Text>
              </Pressable>
            )}
          </View>
        )}
        {pending.length > 0 && !avatarDismissed && (
          <FloatingAvatar
            count={pending.length}
            onPress={() => openReview(true)}
            onPhoto={() => openReview(false, true)}
            onDismiss={() => setAvatarDismissed(true)}
          />
        )}
        {nav}
        <ReviewSheet ref={sheet} />
        <LedgerFilters
          visible={filtersVisible}
          onClose={() => setFiltersVisible(false)}
          value={activeFilter}
          month={month}
          onApply={applyFilters}
        />
      </View>
    </View>
  );
}
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.line,
        backgroundColor: active ? colors.accent : colors.card,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          color: active ? colors.accentText : colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <View
      style={{
        alignItems: "center",
        paddingVertical: 38,
        paddingHorizontal: 20,
      }}
    >
      <Mascot size={70} />
      <Text serif style={{ fontSize: 22, lineHeight: 30, marginTop: 12 }}>
        {title}
      </Text>
      <Text muted style={{ fontSize: 12, textAlign: "center", marginTop: 8 }}>
        {detail}
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  shell: { flex: 1, width: "100%", maxWidth: 540, alignSelf: "center" },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconButton: {
    padding: 12,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: { borderRadius: 25, padding: 23 },
  reviewBanner: {
    marginTop: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: 19,
  },
  privacy: {
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  search: {
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  question: {
    padding: 20,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  toast: {
    position: "absolute",
    left: 20,
    right: 20,
    borderRadius: 16,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 20,
  },
});
