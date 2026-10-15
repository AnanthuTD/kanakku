import { normalizeReceipt } from "../domain/receipt";
import { applyAnswers, parseAnswers } from "../domain/answers";
import { markDuplicateAlerts } from "../domain/duplicateAlerts";
import {
  applyPayeeRules,
  awaitingContext,
  isAccountPayee,
  hasSafeRule,
} from "../domain/payees";
import { installDiagnostics, logDiagnostic } from "../native/diagnostics";
import {
  automaticMerchantQuery,
  MerchantQueryKind,
  validateVpaQuery,
  MerchantLookupResult,
  validatePublicBusinessQuery,
} from "../domain/merchantLookup";
import { merchantLookup } from "../services/merchantLookup";
import {
  LedgerMetadata,
  RecurringDecision,
  ledgerMetadata,
} from "../data/metadata";
import { cancelVoice } from "../native/voice";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { AppState, useColorScheme, PermissionsAndroid } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Category,
  MerchantRule,
  ThemeMode,
  Transaction,
  classify,
  merchantKey,
  mergeTransactions,
} from "../domain/model";
import { sampleTransactions } from "../data/sample";
import { closeLive, openLive, readLive, saveLive } from "../data/repository";
import {
  native,
  requestSms,
  ImportProgress,
  emptyImport,
} from "../native/bridge";
const palettes = {
  light: {
    bg: "#F7F5EE",
    card: "#FFFDF7",
    text: "#203C31",
    muted: "#777F72",
    line: "#E5E7DA",
    accent: "#345D45",
    accentSoft: "#E7ECDD",
    accentText: "#FFFFFF",
    orange: "#B57343",
    orangeSoft: "#F9EAD8",
    purple: "#897BA1",
    purpleSoft: "#EEE8F3",
    blue: "#587E8E",
    blueSoft: "#E2EDF0",
    danger: "#AD5145",
    nav: "#FFFDF7",
    shadow: "#253D29",
  },
  dark: {
    bg: "#141C18",
    card: "#1D2821",
    text: "#ECF0E5",
    muted: "#A2AD9C",
    line: "#344038",
    accent: "#B5D3A0",
    accentSoft: "#2B3D2F",
    accentText: "#1D3020",
    orange: "#E9B381",
    orangeSoft: "#443629",
    purple: "#C0ACD9",
    purpleSoft: "#373041",
    blue: "#9BBECA",
    blueSoft: "#273C43",
    danger: "#F2A49A",
    nav: "#1B251E",
    shadow: "#000000",
  },
};
export type Colors = typeof palettes.light;
interface ContextValue {
  transactions: Transaction[];
  merchantLookupHints: Record<string, MerchantLookupResult>;
  merchantLookupErrors: Record<string, string>;
  merchantLookupPending: string[];
  searchMerchant: (
    id: string,
    query: string,
    approved?: boolean,
    kind?: MerchantQueryKind,
  ) => Promise<boolean>;
  cancelMerchantSearch: () => Promise<void>;
  refreshMerchantLookup: () => Promise<void>;
  rules: MerchantRule[];
  recurringDecisions: Record<string, RecurringDecision>;
  setRecurringDecision: (
    key: string,
    decision: RecurringDecision | null,
  ) => Promise<void>;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  dark: boolean;
  colors: Colors;
  mode: "demo" | "live";
  /** True only while the sample journal is shown (web preview and the test build). */
  sampleData: boolean;
  locked: boolean;
  busy: boolean;
  loaded: boolean;
  error: string;
  setError: (s: string) => void;
  connect: (months?: number | null) => Promise<void>;
  unlock: () => Promise<void>;
  importHistory: (months: number) => Promise<void>;
  importProgress: ImportProgress;
  pauseImport: () => Promise<void>;
  resumeImport: () => Promise<void>;
  useDemo: () => Promise<void>;
  resetVault: (confirmation: string) => Promise<boolean>;
  update: (
    id: string,
    patch: Partial<Transaction>,
    remember?: boolean,
  ) => Promise<boolean>;
  undo: () => Promise<void>;
  canUndo: boolean;
  removeRule: (merchant: string) => Promise<void>;
  editRule: (
    merchant: string,
    category: Category,
    alias?: string,
  ) => Promise<void>;
  sounds: boolean;
  setSounds: (value: boolean) => void;
  overlay: boolean;
  setOverlay: (value: boolean) => Promise<void>;
  previewOverlay: () => Promise<void>;
  notice: string;
  setNotice: (s: string) => void;
}
const AppContext = createContext<ContextValue | null>(null);
const THEME = "kanakku-theme";
const DEMO = "kanakku-demo-v1";
// The personal Android build starts with an empty journal; only the browser preview
// and the isolated test build show sample transactions.
const realBuild = !!native && native.status().testBuild !== true;
installDiagnostics();
const MODE = "kanakku-mode";
export function AppProvider({ children }: React.PropsWithChildren) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rules, setRules] = useState<MerchantRule[]>([]);
  const [merchantLookupHints, setMerchantLookupHints] = useState<
    Record<string, MerchantLookupResult>
  >({});
  const [merchantLookupErrors, setMerchantLookupErrors] = useState<
    Record<string, string>
  >({});
  const [merchantLookupPending, setMerchantLookupPending] = useState<string[]>(
    [],
  );
  const [lookupRevision, setLookupRevision] = useState(0);
  const automaticAttempts = useRef(new Set<string>());
  const automaticRunning = useRef(false);
  const lookupEpoch = useRef(0);
  const lookupRequests = useRef(new Map<string, symbol>());
  const [recurringDecisions, setRecurringDecisions] = useState<
    Record<string, RecurringDecision>
  >({});
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const system = useColorScheme();
  const dark = theme === "dark" || (theme === "system" && system === "dark");
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [sampleData, setSampleData] = useState(!realBuild);
  const [locked, setLocked] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Beta diagnostics: every error shown to the user is also recorded locally.
  useEffect(() => {
    if (error) logDiagnostic("error", "ui", "shown", { message: error, mode });
  }, [error, mode]);
  const [sounds, setSounds] = useState(true);
  const [overlay, setOverlayState] = useState(false);
  const [importProgress, setImportProgress] =
    useState<ImportProgress>(emptyImport);
  const [previous, setPrevious] = useState<{
    transactions: Transaction[];
    rules: MerchantRule[];
  } | null>(null);
  const state = useRef({
    transactions,
    rules,
    recurringDecisions,
    mode,
    locked,
  });
  state.current = { transactions, rules, recurringDecisions, mode, locked };
  const generation = useRef(0);
  const task = useRef(false);
  const refreshPending = useRef(false);
  const requestRefresh = useRef<() => void>(() => {});
  useEffect(() => {
    let live = true;
    (async () => {
      const [savedTheme, savedDemo, savedMode] = await Promise.all([
        AsyncStorage.getItem(THEME),
        AsyncStorage.getItem(DEMO),
        AsyncStorage.getItem(MODE),
      ]);
      if (!live) return;
      if (savedTheme && ["light", "dark", "system"].includes(savedTheme))
        setThemeState(savedTheme as ThemeMode);
      if (savedMode === "live" && native) {
        setMode("live");
        setLocked(true);
      } else {
        const data = savedDemo && !realBuild ? JSON.parse(savedDemo) : null;
        setTransactions(
          data?.transactions || (realBuild ? [] : sampleTransactions()),
        );
        setRules(data?.rules || []);
        setRecurringDecisions(
          ledgerMetadata(data?.metadata).recurringDecisions,
        );
      }
      setSounds(native?.status().sounds ?? true);
      setOverlayState(native?.status().overlayEnabled || false);
      setLoaded(true);
    })().catch(() => {
      if (live) {
        setTransactions(realBuild ? [] : sampleTransactions());
        setSampleData(!realBuild);
        setLoaded(true);
        setError(
          realBuild
            ? "Saved settings could not be loaded. Reopen Kanakku to retry."
            : "Saved preview could not be loaded. Showing fresh sample data.",
        );
      }
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    native
      ?.setPreferences(overlay, dark, sounds)
      .catch(() => setError("Could not update avatar preferences."));
  }, [overlay, dark, sounds, loaded]);
  const setTheme = (value: ThemeMode) => {
    setThemeState(value);
    AsyncStorage.setItem(THEME, value).catch(() =>
      setError("Could not save theme preference."),
    );
  };
  const perform = async (action: () => Promise<void>) => {
    if (task.current) return;
    task.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      task.current = false;
      setBusy(false);
      if (refreshPending.current)
        setTimeout(() => requestRefresh.current(), 150);
    }
  };
  const flush = async (data: {
    transactions: Transaction[];
    rules: MerchantRule[];
    metadata: LedgerMetadata;
  }) => {
    if (!native) return data;
    let transactions = data.transactions;
    const values = await native.pending();
    if (values.length) {
      const incoming: Transaction[] = values
        .map((value) => JSON.parse(value))
        .map((t) => {
          const original = t.originalMerchant || t.merchant;
          const rule = data.rules
            .filter(hasSafeRule)
            .find((r) => merchantKey(r.merchant) === merchantKey(original));
          const c = classify(original, data.rules.filter(hasSafeRule));
          return {
            ...t,
            originalMerchant: original,
            merchant: rule?.alias || t.merchant,
            category: c.confidence >= 0.8 ? c.category : t.category,
            review: t.kind === "purchase" && c.confidence < 0.8 && t.review,
            reason: c.confidence >= 0.8 ? c.reason : t.reason,
            classification:
              c.confidence >= 0.8
                ? {
                    method:
                      c.reason === "Your merchant rule"
                        ? ("rule" as const)
                        : ("merchant" as const),
                    version: "local-rules-v1",
                  }
                : t.classification,
          };
        });
      transactions = markDuplicateAlerts(
        mergeTransactions(transactions, applyPayeeRules(incoming, data.rules)),
      );
      await saveLive(transactions, data.rules, data.metadata);
      await native.acknowledge(incoming.map((t) => t.id));
    }
    // Voice answers given to the floating companion while Kanakku was closed.
    const answers = parseAnswers(await native.pendingAnswers());
    if (answers.length) {
      const applied = applyAnswers(transactions, answers);
      if (applied.done.length) {
        transactions = applied.transactions;
        await saveLive(transactions, data.rules, data.metadata);
        await native.acknowledgeAnswers(applied.done);
      }
    }
    // Also links second alerts already in the ledger (e.g. imported by an older build).
    const linked = markDuplicateAlerts(transactions);
    if (values.length || linked !== transactions)
      logDiagnostic("info", "ledger", "flush", {
        incoming: values.length,
        rows: linked.length,
        duplicatesLinked: linked.filter((t) => t.duplicateOf).length,
        awaitingContext: linked.filter(awaitingContext).length,
        review: linked.filter((t) => t.review).length,
      });
    if (linked !== transactions) {
      transactions = linked;
      await saveLive(transactions, data.rules, data.metadata);
    }
    if (transactions === data.transactions) return data;
    return { ...data, transactions };
  };
  const unlock = () =>
    perform(async () => {
      if (!native)
        throw new Error("Install the Android build to connect bank SMS.");
      const key = await native.unlock();
      const token = ++generation.current;
      await openLive(key);
      const data = await flush(await readLive());
      await native?.saveRules(
        data.rules
          .filter(hasSafeRule)
          .map(({ merchant, category }) => ({ merchant, category })),
      );
      if (token !== generation.current) return;
      setTransactions(data.transactions);
      setRules(data.rules);
      setRecurringDecisions(ledgerMetadata(data.metadata).recurringDecisions);
      setLocked(false);
      setMode("live");
      await AsyncStorage.setItem(MODE, "live");
    });
  const connect = (months: number | null = null) =>
    perform(async () => {
      if (!native)
        throw new Error(
          "This is the web preview. Bank SMS, encrypted storage, overlays, and offline voice require the Android build.",
        );
      await requestSms();
      const key = await native.unlock();
      const token = ++generation.current;
      await openLive(key);
      const data = await flush(await readLive());
      await native?.saveRules(
        data.rules
          .filter(hasSafeRule)
          .map(({ merchant, category }) => ({ merchant, category })),
      );
      await native.setCapture(true);
      if (token !== generation.current) return;
      setTransactions(data.transactions);
      setRules(data.rules);
      setRecurringDecisions(ledgerMetadata(data.metadata).recurringDecisions);
      setMode("live");
      setLocked(false);
      setPrevious(null);
      await AsyncStorage.setItem(MODE, "live");
      if (months !== null)
        setImportProgress(await native.importHistory(months));
      setNotice(
        months === null
          ? "Bank SMS connected. You can import history later."
          : "Connected. Recent history will appear first.",
      );
    });
  const importHistory = (months: number) =>
    perform(async () => {
      if (!native || state.current.mode !== "live" || state.current.locked)
        throw new Error("Connect and unlock your vault first.");
      setImportProgress(await native.importHistory(months));
      setNotice("Loading recent history first. You can keep using Kanakku.");
    });
  const pauseImport = () =>
    perform(async () => {
      if (native) setImportProgress(await native.pauseImport());
    });
  const resumeImport = () =>
    perform(async () => {
      if (native) setImportProgress(await native.resumeImport());
    });
  const persist = async (
    next: Transaction[],
    nextRules: MerchantRule[],
    decisions = state.current.recurringDecisions,
  ) => {
    if (state.current.mode === "live") {
      if (state.current.locked) throw new Error("Unlock Kanakku first");
      await saveLive(next, nextRules, { recurringDecisions: decisions });
      await native?.saveRules(
        nextRules
          .filter(hasSafeRule)
          .map(({ merchant, category }) => ({ merchant, category })),
      );
    } else
      await AsyncStorage.setItem(
        DEMO,
        JSON.stringify({
          transactions: next,
          rules: nextRules,
          metadata: { recurringDecisions: decisions },
        }),
      );
  };
  const update = async (
    id: string,
    patch: Partial<Transaction>,
    remember = false,
  ) => {
    let saved = false;
    await perform(async () => {
      const s = state.current;
      const token = generation.current;
      const current = s.transactions.find((t) => t.id === id);
      if (!current) return;
      if (
        patch.merchant !== undefined &&
        (!patch.merchant.trim() || patch.merchant.trim().length > 80)
      )
        throw new Error("Enter a merchant name between 1 and 80 characters.");
      if (patch.merchant) patch = { ...patch, merchant: patch.merchant.trim() };
      if (Object.prototype.hasOwnProperty.call(patch, "receipt")) {
        const receipt = normalizeReceipt(patch.receipt);
        if (patch.receipt != null && !receipt)
          throw new Error("Check the bill details before saving.");
        patch = { ...patch, receipt };
      }
      const next = s.transactions.map((t) =>
        t.id === id
          ? {
              ...t,
              ...patch,
              id: t.id,
              source: t.source,
              classification: { method: "user" as const, version: "review-v1" },
              originalMerchant: t.originalMerchant || t.merchant,
            }
          : t,
      );
      const rememberKind =
        patch.kind && patch.kind !== "purchase" ? patch.kind : undefined;
      const nextRules =
        remember &&
        !isAccountPayee(current) &&
        ((patch.category && patch.category !== "Uncategorized") || rememberKind)
          ? [
              ...s.rules.filter(
                (r) =>
                  merchantKey(r.merchant) !==
                  merchantKey(current.originalMerchant || current.merchant),
              ),
              {
                merchant: current.originalMerchant || current.merchant,
                category: patch.category || "Uncategorized",
                alias: patch.merchant || current.merchant,
                ...(rememberKind ? { kind: rememberKind } : {}),
              },
            ]
          : s.rules;
      // A remembered payee also settles that payee's other unconfirmed payments.
      const settled =
        nextRules === s.rules ? next : applyPayeeRules(next, nextRules);
      await persist(settled, nextRules);
      if (token !== generation.current) return;
      setPrevious({ transactions: s.transactions, rules: s.rules });
      setTransactions(settled);
      setRules(nextRules);
      setNotice(
        remember && isAccountPayee(current)
          ? "Saved this payment only. Account endings can belong to different people, so no payee rule was created."
          : "Saved. A little clearer.",
      );
      saved = true;
    });
    return saved;
  };
  const editRule = (merchant: string, category: Category, alias?: string) =>
    perform(async () => {
      const s = state.current;
      const token = generation.current;
      const next = s.rules.map((r) =>
        merchantKey(r.merchant) === merchantKey(merchant)
          ? { ...r, category, alias: alias?.trim() || r.alias }
          : r,
      );
      await persist(s.transactions, next);
      if (token !== generation.current) return;
      setPrevious({ transactions: s.transactions, rules: s.rules });
      setRules(next);
      setNotice("Merchant rule updated for future payments.");
    });
  const undo = () =>
    perform(async () => {
      if (!previous) return;
      const token = generation.current;
      const next = mergeTransactions(
        previous.transactions,
        state.current.transactions,
      );
      await persist(next, previous.rules);
      if (token !== generation.current) return;
      setTransactions(next);
      setRules(previous.rules);
      setPrevious(null);
      setNotice("Change undone.");
    });
  const removeRule = (merchant: string) =>
    perform(async () => {
      const s = state.current;
      const token = generation.current;
      const next = s.rules.filter((r) => r.merchant !== merchant);
      await persist(s.transactions, next);
      if (token !== generation.current) return;
      setRules(next);
      setNotice("Merchant rule removed.");
    });
  const useDemo = () =>
    perform(async () => {
      if (realBuild)
        throw new Error(
          "Sample data is available in the browser preview and test app only.",
        );
      generation.current++;
      await closeLive();
      const saved = await AsyncStorage.getItem(DEMO);
      const data = saved
        ? JSON.parse(saved)
        : { transactions: sampleTransactions(), rules: [] };
      setMode("demo");
      setLocked(false);
      setSampleData(true);
      setTransactions(data.transactions);
      setRules(data.rules);
      setRecurringDecisions(ledgerMetadata(data.metadata).recurringDecisions);
      setPrevious(null);
      await AsyncStorage.setItem(MODE, "demo");
    });
  const setRecurringDecision = async (
    key: string,
    decision: RecurringDecision | null,
  ) => {
    let saved = false;
    let failure: unknown;
    await perform(async () => {
      try {
        if (
          !key ||
          key.length > 256 ||
          (decision !== null && !["confirmed", "ignored"].includes(decision))
        )
          throw new Error("Choose a valid recurring payment decision.");
        const token = generation.current;
        const next = { ...state.current.recurringDecisions };
        if (decision === null) delete next[key];
        else next[key] = decision;
        await persist(state.current.transactions, state.current.rules, next);
        if (token === generation.current) {
          setRecurringDecisions(next);
          saved = true;
        }
      } catch (error) {
        failure = error;
        throw error;
      }
    });
    if (failure) throw failure;
    if (!saved)
      throw new Error("The journal is busy or was locked. Please try again.");
  };
  const refreshMerchantLookup = async () => {
    lookupEpoch.current++;
    lookupRequests.current.clear();
    automaticAttempts.current.clear();
    setMerchantLookupHints({});
    setMerchantLookupErrors({});
    setMerchantLookupPending([]);
    await merchantLookup.clear();
    setLookupRevision((value) => value + 1);
  };
  const cancelMerchantSearch = async () => {
    lookupEpoch.current++;
    lookupRequests.current.clear();
    setMerchantLookupHints({});
    setMerchantLookupErrors({});
    setMerchantLookupPending([]);
    await merchantLookup.clear();
  };
  const searchMerchant = async (
    id: string,
    query: string,
    approved = false,
    kind: MerchantQueryKind = "business",
  ): Promise<boolean> => {
    const token = generation.current;
    const epoch = lookupEpoch.current;
    const original = state.current.transactions.find((t) => t.id === id);
    if (!original || state.current.locked || AppState.currentState !== "active")
      return false;
    const identity = original.originalMerchant || original.merchant;
    const request = Symbol(id);
    lookupRequests.current.set(id, request);
    const current = () => {
      const row = state.current.transactions.find((t) => t.id === id);
      return (
        token === generation.current &&
        epoch === lookupEpoch.current &&
        lookupRequests.current.get(id) === request &&
        !state.current.locked &&
        AppState.currentState === "active" &&
        row &&
        (row.originalMerchant || row.merchant) === identity &&
        (approved || row.review)
      );
    };
    setMerchantLookupErrors((previous) => ({ ...previous, [id]: "" }));
    setMerchantLookupPending((previous) => [...new Set([...previous, id])]);
    try {
      if (kind === "vpa" && !approved)
        throw new Error(
          "Review the exact UPI ID and approve sending it to Brave first.",
        );
      const checkedQuery =
        kind === "vpa"
          ? validateVpaQuery(query)
          : approved
            ? validatePublicBusinessQuery(query)
            : automaticMerchantQuery(query);
      if (!checkedQuery)
        throw new Error("Review a public business name before searching.");
      if (!native)
        throw new Error(
          "Web merchant lookup requires the Android app and your own Brave API key.",
        );
      const result = await merchantLookup.lookup(checkedQuery, approved, kind);
      if (!current()) return false;
      setMerchantLookupHints((previous) => ({ ...previous, [id]: result }));
      return true;
    } catch (error) {
      if (current())
        setMerchantLookupErrors((previous) => ({
          ...previous,
          [id]:
            error instanceof Error
              ? error.message
              : "Merchant lookup could not finish.",
        }));
      return false;
    } finally {
      if (lookupRequests.current.get(id) === request) {
        lookupRequests.current.delete(id);
        setMerchantLookupPending((previous) =>
          previous.filter((value) => value !== id),
        );
      }
    }
  };
  useEffect(() => {
    if (
      !native ||
      mode !== "live" ||
      locked ||
      automaticRunning.current ||
      AppState.currentState !== "active"
    )
      return;
    const candidates = transactions.filter(
      (t) =>
        t.review &&
        automaticMerchantQuery(t.originalMerchant || t.merchant) &&
        !automaticAttempts.current.has(
          `${t.id}:${t.originalMerchant || t.merchant}`,
        ),
    );
    if (!candidates.length) return;
    let live = true;
    let interrupted = false;
    const epoch = lookupEpoch.current;
    automaticRunning.current = true;
    (async () => {
      const prefs = await native.merchantLookupSettings();
      if (
        !prefs.enabled ||
        !prefs.automatic ||
        !prefs.hasKey ||
        prefs.dailyUsed >= prefs.dailyLimit ||
        prefs.monthlyUsed >= prefs.monthlyLimit
      )
        return;
      for (const transaction of candidates.slice(0, 5)) {
        if (
          !live ||
          epoch !== lookupEpoch.current ||
          state.current.locked ||
          AppState.currentState !== "active"
        ) {
          interrupted = true;
          break;
        }
        const current = state.current.transactions.find(
          (t) => t.id === transaction.id,
        );
        const identity = transaction.originalMerchant || transaction.merchant;
        if (
          !current?.review ||
          (current.originalMerchant || current.merchant) !== identity
        )
          continue;
        const budget = await native.merchantLookupSettings();
        if (
          !budget.enabled ||
          !budget.automatic ||
          !budget.hasKey ||
          budget.dailyUsed >= budget.dailyLimit ||
          budget.monthlyUsed >= budget.monthlyLimit
        )
          return;
        automaticAttempts.current.add(`${transaction.id}:${identity}`);
        const success = await searchMerchant(transaction.id, identity);
        // Failures, quota/cooldown and cancellation do not trigger a history-wide retry loop.
        if (!success) return;
      }
      interrupted = true; // Let the next pass pick remaining eligible transactions.
    })()
      .catch(() => {})
      .finally(() => {
        automaticRunning.current = false;
        if ((interrupted || !live) && AppState.currentState === "active")
          setLookupRevision((value) => value + 1);
      });
    return () => {
      live = false;
    };
  }, [mode, locked, transactions, lookupRevision]);
  useEffect(() => {
    const timer = setInterval(() => {
      setMerchantLookupHints((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(
            ([, result]) => Date.now() - result.fetchedAt < 5 * 60_000,
          ),
        ),
      );
    }, 30_000);
    return () => clearInterval(timer);
  }, []);
  // The floating companion listens when tapped, but an overlay cannot show Android's
  // permission dialog. Ask here, while Kanakku is open; denial keeps the open-app fallback.
  const askMicrophone = async () => {
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  };
  // Floating avatar already on (e.g. after an update) but no microphone yet: ask on opening.
  useEffect(() => {
    if (!loaded || !native || !overlay) return;
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)
      .then((granted) => (granted ? true : askMicrophone()))
      .catch(() => {});
  }, [loaded, overlay]);
  const setOverlay = async (value: boolean) => {
    if (!native) {
      setError("Floating over other apps requires the Android build.");
      return;
    }
    if (value && !native.status().overlay) {
      await native.overlaySettings();
      setNotice("Allow display over other apps, then enable the avatar here.");
      return;
    }
    setOverlayState(value);
    if (value && !(await askMicrophone()))
      setNotice(
        "Without the microphone, tapping the avatar opens Kanakku so you can type.",
      );
  };
  const previewOverlay = async () => {
    if (!native) {
      setError("Floating over other apps requires the Android build.");
      return;
    }
    if (native.status().overlay && !(await askMicrophone())) {
      setNotice(
        "Without the microphone, tapping the avatar opens Kanakku so you can type.",
      );
    }
    if ((await native.previewFloatingPrompt()) === "permission") {
      await native.overlaySettings();
      setNotice("Allow display over other apps, then try the preview again.");
      return;
    }
    setNotice(
      "Leave Kanakku within 30 seconds; the companion will float over your next app.",
    );
  };
  const resetVault = async (confirmation: string) => {
    let reset = false;
    await perform(async () => {
      if (!native || confirmation !== "RESET")
        throw new Error(
          "Type RESET to confirm removing this device's journal.",
        );
      cancelVoice();
      lookupEpoch.current++;
      lookupRequests.current.clear();
      void merchantLookup.clear();
      setMerchantLookupHints({});
      setMerchantLookupErrors({});
      generation.current++;
      setLocked(true);
      setTransactions([]);
      setRules([]);
      setRecurringDecisions({});
      setPrevious(null);
      await closeLive();
      await native.resetVault(confirmation);
      await AsyncStorage.setItem(MODE, "demo");
      setMode("demo");
      setLocked(false);
      setTransactions(realBuild ? [] : sampleTransactions());
      setSampleData(!realBuild);
      setRules([]);
      setRecurringDecisions({});
      setImportProgress(emptyImport);
      setOverlayState(false);
      setNotice(
        "Device journal removed. Your phone's SMS are unchanged; reconnect to import again.",
      );
      reset = true;
    });
    return reset;
  };
  useEffect(() => {
    if (mode === "live" && !locked)
      native
        ?.setReviewCount(transactions.filter((t) => t.review).length)
        .catch(() => {});
  }, [mode, locked, transactions]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (status) => {
      if (status !== "active") {
        lookupEpoch.current++;
        lookupRequests.current.clear();
        automaticAttempts.current.clear();
        void merchantLookup.clear();
        setMerchantLookupHints({});
        setMerchantLookupErrors({});
        setMerchantLookupPending([]);
      } else setLookupRevision((value) => value + 1);
      if (status === "background" && state.current.mode === "live") {
        generation.current++;
        setLocked(true);
        setTransactions([]);
        setRules([]);
        setRecurringDecisions({});
        setPrevious(null);
        closeLive().catch(() => {});
        cancelVoice();
      }
    });
    return () => listener.remove();
  }, []);
  requestRefresh.current = () => {
    if (state.current.mode !== "live" || state.current.locked) return;
    refreshPending.current = true;
    if (task.current) return;
    refreshPending.current = false;
    perform(async () => {
      const token = generation.current;
      try {
        const data = await flush(await readLive());
        if (token === generation.current) setTransactions(data.transactions);
      } catch (e) {
        if (token === generation.current) {
          generation.current++;
          setLocked(true);
          setTransactions([]);
          setRules([]);
          setRecurringDecisions({});
          setPrevious(null);
          await closeLive();
        }
        throw new Error(
          "Unlock Kanakku again to continue loading securely. Your import progress is saved.",
        );
      }
    });
  };
  useEffect(() => {
    const subscription = native?.addListener("onTransaction", () =>
      requestRefresh.current(),
    );
    return () => subscription?.remove();
  }, []);
  useEffect(() => {
    if (!native || !loaded || mode !== "live") return;
    let live = true;
    let checking = false;
    const refresh = async () => {
      if (checking || AppState.currentState === "background") return;
      checking = true;
      try {
        const progress = await native!.importStatus();
        if (live) {
          setImportProgress(progress);
          if (progress.pending > 0) requestRefresh.current();
        }
      } catch {
        /* Keep the last durable progress; the next foreground poll retries. */
      } finally {
        checking = false;
      }
    };
    native
      .reconcileHistory()
      .then((progress) => {
        if (live) setImportProgress(progress);
      })
      .catch(() => {});
    refresh();
    const subscription = native.addListener("onImportProgress", refresh);
    const timer = setInterval(refresh, 2000);
    const foreground = AppState.addEventListener("change", (value) => {
      if (value === "active") {
        native!.reconcileHistory().catch(() => {});
        refresh();
      }
    });
    return () => {
      live = false;
      subscription.remove();
      foreground.remove();
      clearInterval(timer);
    };
  }, [loaded, mode]);
  return (
    <AppContext.Provider
      value={{
        transactions,
        merchantLookupHints,
        merchantLookupErrors,
        merchantLookupPending,
        searchMerchant,
        cancelMerchantSearch,
        refreshMerchantLookup,
        rules,
        recurringDecisions,
        setRecurringDecision,
        theme,
        setTheme,
        dark,
        colors: palettes[dark ? "dark" : "light"],
        mode,
        locked,
        busy,
        loaded,
        error,
        setError,
        connect,
        unlock,
        importHistory,
        importProgress,
        pauseImport,
        resumeImport,
        useDemo,
        sampleData,
        resetVault,
        update,
        undo,
        canUndo: !!previous,
        removeRule,
        editRule,
        sounds,
        setSounds,
        overlay,
        setOverlay,
        previewOverlay,
        notice,
        setNotice,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("AppProvider missing");
  return value;
}
