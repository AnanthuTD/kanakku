import { reconcileEmailAlerts } from "../domain/emailReconciliation";
import { normalizeReceipt } from "../domain/receipt";
import { applyAnswers, parseAnswers } from "../domain/answers";
import { markDuplicateAlerts } from "../domain/duplicateAlerts";
import {
  applyPayeeRules,
  awaitingContext,
  isAccountPayee,
  hasSafeRule,
  removePayeeRuleEffects,
  setRememberedRule,
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
import {
  LoanRecord,
  applyLinkedLoans,
  loanOutstanding,
  restoreLentTransaction,
} from "../domain/lending";
import { makeJournalBackup } from "../domain/backup";
import {
  DEFAULT_AUTO_LOCK_DELAY,
  shouldLockAfterBackground,
} from "../domain/autoLock";
import { validDay } from "../domain/ledger";
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
  CATEGORIES,
  Category,
  MerchantRule,
  ThemeMode,
  Transaction,
  classify,
  merchantKey,
  mergeTransactions,
  money,
  spendOf,
} from "../domain/model";
import { sampleTransactions } from "../data/sample";
import {
  closeLive,
  openLive,
  readLive,
  replaceLive,
  saveLive,
} from "../data/repository";
import {
  native,
  requestSms,
  ImportProgress,
  emptyImport,
  GmailStatus,
  requestNotifications,
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
  categories: Category[];
  customCategories: string[];
  addCategory: (label: string) => Promise<boolean>;
  loans: LoanRecord[];
  addLoan: (
    input: Omit<LoanRecord, "id" | "lentAt" | "repayments" | "remind"> & {
      lentAt?: string;
      remind?: boolean;
    },
  ) => Promise<boolean>;
  removeLoan: (loanId: string) => Promise<boolean>;
  recordLoanRepayment: (
    loanId: string,
    amount: number,
    note?: string,
  ) => Promise<boolean>;
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
  autoLockDelay: number;
  setAutoLockDelay: (delayMs: number) => void;
  busy: boolean;
  loaded: boolean;
  error: string;
  setError: (s: string) => void;
  connect: (months?: number | null) => Promise<void>;
  connectEmail: (months: number) => Promise<GmailStatus | undefined>;
  restoreBackup: (backup: {
    transactions: Transaction[];
    rules: MerchantRule[];
    metadata: LedgerMetadata;
  }) => Promise<boolean>;
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
    remember?: boolean | null,
  ) => Promise<boolean>;
  undo: () => Promise<void>;
  canUndo: boolean;
  removeRule: (merchant: string, bank?: string) => Promise<void>;
  editRule: (
    merchant: string,
    category: Category,
    alias?: string,
    bank?: string,
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
const AUTO_LOCK = "kanakku-auto-lock-delay";
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
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
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
  const [autoLockDelay, setAutoLockDelayState] = useState(
    DEFAULT_AUTO_LOCK_DELAY,
  );
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
    customCategories,
    loans,
    mode,
    locked,
    autoLockDelay,
  });
  state.current = {
    transactions,
    rules,
    recurringDecisions,
    customCategories,
    loans,
    mode,
    locked,
    autoLockDelay,
  };
  const generation = useRef(0);
  const task = useRef(false);
  const refreshPending = useRef(false);
  const requestRefresh = useRef<() => void>(() => {});
  useEffect(() => {
    let live = true;
    (async () => {
      const [savedTheme, savedDemo, savedMode, savedAutoLock] =
        await Promise.all([
          AsyncStorage.getItem(THEME),
          AsyncStorage.getItem(DEMO),
          AsyncStorage.getItem(MODE),
          AsyncStorage.getItem(AUTO_LOCK),
        ]);
      if (!live) return;
      if (savedTheme && ["light", "dark", "system"].includes(savedTheme))
        setThemeState(savedTheme as ThemeMode);
      if (savedAutoLock !== null) {
        const delay = Number(savedAutoLock);
        if ([0, 60_000, 300_000, 900_000].includes(delay))
          setAutoLockDelayState(delay);
      }
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
        setCustomCategories(
          ledgerMetadata(data?.metadata).customCategories ?? [],
        );
        setLoans(ledgerMetadata(data?.metadata).loans ?? []);
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
  const setAutoLockDelay = (delayMs: number) => {
    if (![0, 60_000, 300_000, 900_000].includes(delayMs)) return;
    setAutoLockDelayState(delayMs);
    AsyncStorage.setItem(AUTO_LOCK, String(delayMs)).catch(() =>
      setError("Could not save the auto-lock preference."),
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
  const saveJournalAndSnapshot = async (
    transactions: Transaction[],
    rules: MerchantRule[],
    metadata: LedgerMetadata,
  ) => {
    await saveLive(transactions, rules, metadata);
    await native
      ?.saveAutoBackupSnapshot(
        JSON.stringify(makeJournalBackup(transactions, rules, metadata)),
      )
      .catch(() => {});
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
          const applicableRules = data.rules.filter(
            (r) =>
              hasSafeRule(r) &&
              (!r.bank || merchantKey(r.bank) === merchantKey(t.bank)),
          );
          const rule = applicableRules.find(
            (r) => merchantKey(r.merchant) === merchantKey(original),
          );
          const c = classify(original, applicableRules);
          return {
            ...t,
            originalMerchant: original,
            merchant: rule?.alias || t.merchant,
            category: c.confidence >= 0.8 ? c.category : t.category,
            review:
              (t.kind === "purchase" && c.confidence < 0.8 && t.review) ||
              (!!t.currency && t.currency !== "INR" && !t.inrAmount),
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
      transactions = reconcileEmailAlerts(
        markDuplicateAlerts(
          mergeTransactions(
            transactions,
            applyPayeeRules(incoming, data.rules),
          ),
        ),
      );
      await saveJournalAndSnapshot(transactions, data.rules, data.metadata);
      await native.acknowledge(incoming.map((t) => t.id));
    }
    // Voice answers given to the floating companion while Kanakku was closed.
    const answers = parseAnswers(await native.pendingAnswers());
    if (answers.length) {
      const applied = applyAnswers(
        transactions,
        answers,
        Date.now(),
        data.metadata.customCategories ?? [],
      );
      if (applied.done.length) {
        transactions = applied.transactions;
        await saveJournalAndSnapshot(transactions, data.rules, data.metadata);
        await native.acknowledgeAnswers(applied.done);
      }
    }
    // Also links second alerts already in the ledger (e.g. imported by an older build).
    const linked = reconcileEmailAlerts(markDuplicateAlerts(transactions));
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
      await saveJournalAndSnapshot(transactions, data.rules, data.metadata);
    }
    const linkedLoans = applyLinkedLoans(
      transactions,
      data.metadata.loans ?? [],
    );
    if (linkedLoans !== transactions) {
      transactions = linkedLoans;
      await saveJournalAndSnapshot(transactions, data.rules, data.metadata);
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
      setCustomCategories(ledgerMetadata(data.metadata).customCategories ?? []);
      setLoans(ledgerMetadata(data.metadata).loans ?? []);
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
      setCustomCategories(ledgerMetadata(data.metadata).customCategories ?? []);
      setLoans(ledgerMetadata(data.metadata).loans ?? []);
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
  const connectEmail = async (months: number) => {
    let result: GmailStatus | undefined;
    await perform(async () => {
      if (!native) throw new Error("Gmail capture requires the Android app.");
      const key = await native.unlock();
      const token = ++generation.current;
      await openLive(key);
      const data = await flush(await readLive());
      if (token !== generation.current) return;
      setTransactions(data.transactions);
      setRules(data.rules);
      setRecurringDecisions(ledgerMetadata(data.metadata).recurringDecisions);
      setCustomCategories(ledgerMetadata(data.metadata).customCategories ?? []);
      setLoans(ledgerMetadata(data.metadata).loans ?? []);
      setMode("live");
      setLocked(false);
      setPrevious(null);
      await AsyncStorage.setItem(MODE, "live");
      result = await native.connectGmail(months);
    });
    return result;
  };
  const importHistory = (months: number) =>
    perform(async () => {
      if (!native || state.current.mode !== "live" || state.current.locked)
        throw new Error("Connect and unlock your vault first.");
      // History import reads the SMS inbox directly. A reinstall or Android's
      // permission reset can revoke SMS access even while the vault stays live,
      // so request it here rather than failing inside the native reader.
      await requestSms();
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
    categories = state.current.customCategories,
    nextLoans = state.current.loans,
  ) => {
    if (state.current.mode === "live") {
      if (state.current.locked) throw new Error("Unlock Kanakku first");
      const metadata = {
        recurringDecisions: decisions,
        customCategories: categories,
        loans: nextLoans,
      };
      // Refresh only an explicitly enabled, device-encrypted backup snapshot.
      // The scheduled worker never opens the biometric-protected SQLCipher DB.
      await saveJournalAndSnapshot(next, nextRules, metadata);
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
          metadata: {
            recurringDecisions: decisions,
            customCategories: categories,
            loans: nextLoans,
          },
        }),
      );
  };
  const update = async (
    id: string,
    patch: Partial<Transaction>,
    remember?: boolean | null,
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
      if (
        patch.inrAmount !== undefined &&
        (!Number.isSafeInteger(patch.inrAmount) || patch.inrAmount <= 0)
      )
        throw new Error("Enter a valid final INR amount.");
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
      const canSaveRule =
        (patch.category && patch.category !== "Uncategorized") || rememberKind;
      const nextRules =
        remember === undefined || remember === null
          ? s.rules
          : remember
            ? canSaveRule
              ? setRememberedRule(s.rules, current, {
                  merchant: current.originalMerchant || current.merchant,
                  ...(isAccountPayee(current) ? { bank: current.bank } : {}),
                  category: patch.category || "Uncategorized",
                  alias: patch.merchant || current.merchant,
                  ...(rememberKind ? { kind: rememberKind } : {}),
                })
              : s.rules
            : setRememberedRule(s.rules, current);
      // A remembered payee also settles that payee's other unconfirmed payments.
      const settled =
        nextRules === s.rules ? next : applyPayeeRules(next, nextRules);
      await persist(settled, nextRules);
      if (token !== generation.current) return;
      setPrevious({ transactions: s.transactions, rules: s.rules });
      setTransactions(settled);
      setRules(nextRules);
      setNotice(
        remember === true && isAccountPayee(current)
          ? "Saved a rule for this account ending at this bank. Another person may share the same ending; you can remove the rule in Settings."
          : "Saved. A little clearer.",
      );
      saved = true;
    });
    return saved;
  };
  const editRule = (
    merchant: string,
    category: Category,
    alias?: string,
    bank?: string,
  ) =>
    perform(async () => {
      const s = state.current;
      const token = generation.current;
      const next = s.rules.map((r) =>
        merchantKey(r.merchant) === merchantKey(merchant) &&
        (!bank || merchantKey(r.bank || "") === merchantKey(bank))
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
  const removeRule = (merchant: string, bank?: string) =>
    perform(async () => {
      const s = state.current;
      const token = generation.current;
      const removed = s.rules.find(
        (r) => r.merchant === merchant && (bank ? r.bank === bank : !r.bank),
      );
      const next = s.rules.filter(
        (r) => !(r.merchant === merchant && (bank ? r.bank === bank : !r.bank)),
      );
      const reverted = removed
        ? removePayeeRuleEffects(s.transactions, removed)
        : s.transactions;
      const nextTransactions = applyPayeeRules(reverted, next);
      const restoredCount = reverted.reduce(
        (count, transaction, index) =>
          count +
          (transaction !== s.transactions[index] &&
          nextTransactions[index].classification?.method === "unknown" &&
          nextTransactions[index].review
            ? 1
            : 0),
        0,
      );
      await persist(nextTransactions, next);
      if (token !== generation.current) return;
      setPrevious({ transactions: s.transactions, rules: s.rules });
      setTransactions(nextTransactions);
      setRules(next);
      setNotice(
        restoredCount
          ? `Rule removed. ${restoredCount} payment${restoredCount === 1 ? "" : "s"} returned to review.`
          : "Merchant rule removed.",
      );
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
      setCustomCategories(ledgerMetadata(data.metadata).customCategories ?? []);
      setLoans(ledgerMetadata(data.metadata).loans ?? []);
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
  const addCategory = async (label: string) => {
    const normalized = label.trim().replace(/\s+/g, " ");
    if (!normalized || normalized.length > 32) {
      setError("Category names must contain 1–32 characters.");
      return false;
    }
    if (normalized.toLocaleLowerCase() === "uncategorized") {
      setError("Uncategorized is reserved for payments that need context.");
      return false;
    }
    if (
      [...CATEGORIES, ...state.current.customCategories].some(
        (category) =>
          category.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
      )
    ) {
      setError("That category already exists.");
      return false;
    }
    if (state.current.customCategories.length >= 40) {
      setError("You can create up to 40 custom categories.");
      return false;
    }
    const next = [...state.current.customCategories, normalized];
    try {
      await persist(
        state.current.transactions,
        state.current.rules,
        state.current.recurringDecisions,
        next,
      );
      setCustomCategories(next);
      setError("");
      setNotice(
        `Added “${normalized}”. You can choose it when editing a payment.`,
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the category.");
      return false;
    }
  };
  const addLoan: ContextValue["addLoan"] = async (input) => {
    const person = input.person.trim().replace(/\s+/g, " ");
    if (
      !person ||
      person.length > 80 ||
      !Number.isSafeInteger(input.amount) ||
      input.amount <= 0
    ) {
      setError("Enter a person’s name and a valid amount to lend.");
      return false;
    }
    if (input.dueDate && !validDay(input.dueDate)) {
      setError("Enter the return date as YYYY-MM-DD.");
      return false;
    }
    const id =
      globalThis.crypto?.randomUUID?.() ||
      `loan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const existing = state.current.transactions.find(
      (t) => t.id === input.transactionId,
    );
    const loan: LoanRecord = {
      id,
      person,
      amount: input.amount,
      lentAt: input.lentAt || new Date().toISOString(),
      dueDate: input.dueDate || null,
      note: input.note.trim().slice(0, 500),
      repayments: [],
      remind: Boolean(input.remind && input.dueDate),
      ...(input.transactionId ? { transactionId: input.transactionId } : {}),
      ...(existing
        ? {
            previousTransaction: {
              merchant: existing.merchant,
              category: existing.category,
              kind: existing.kind,
              review: existing.review,
              reason: existing.reason,
              ...(existing.classification
                ? { classification: existing.classification }
                : {}),
            },
          }
        : {}),
    };
    if (
      input.transactionId &&
      state.current.loans.some(
        (loan) => loan.transactionId === input.transactionId,
      )
    ) {
      setError("This bank payment is already linked to a loan.");
      return false;
    }
    if (input.transactionId && !existing) {
      setError(
        "That bank transaction is no longer available. Reopen it and try again.",
      );
      return false;
    }
    const nextTransactions = existing
      ? state.current.transactions.map((transaction) =>
          transaction.id === existing.id
            ? {
                ...transaction,
                merchant: person,
                originalMerchant:
                  transaction.originalMerchant || transaction.merchant,
                category: "Friends & family",
                kind: "lent" as const,
                review: false,
                reason: "Money lent; repayment tracked separately",
                classification: {
                  method: "user" as const,
                  version: "lending-v1",
                },
              }
            : transaction,
        )
      : state.current.transactions;
    const spendReduction = existing ? spendOf(existing) : 0;
    const spendImpact =
      spendReduction > 0
        ? `${money(spendReduction)} removed from monthly spending.`
        : existing
          ? "This payment was already excluded from spending, so the total stays the same."
          : "";
    const nextLoans = [...state.current.loans, loan];
    try {
      await persist(
        nextTransactions,
        state.current.rules,
        undefined,
        undefined,
        nextLoans,
      );
      if (existing) {
        setPrevious({
          transactions: state.current.transactions,
          rules: state.current.rules,
        });
        setTransactions(nextTransactions);
      }
      setLoans(nextLoans);
      setError("");
      if (input.remind && loan.dueDate && native) {
        try {
          const granted = await requestNotifications();
          if (granted) {
            const [year, month, day] = loan.dueDate.split("-").map(Number);
            const dueAt = new Date(year, month - 1, day, 10, 0, 0, 0).getTime();
            await native.scheduleLendingReminder(
              id,
              Math.max(dueAt, Date.now() + 60_000),
            );
            setNotice(
              `Added money lent to ${person}; reminder set for ${loan.dueDate}.${spendImpact ? ` ${spendImpact}` : ""}`,
            );
          } else {
            setNotice(
              `Added money lent to ${person}. Turn on notifications to get a return-date reminder.${spendImpact ? ` ${spendImpact}` : ""}`,
            );
          }
        } catch {
          setNotice(
            `Added money lent to ${person}. The return date is saved, but Android could not schedule a notification.${spendImpact ? ` ${spendImpact}` : ""}`,
          );
        }
      } else {
        setNotice(
          `Added money lent to ${person}.${spendImpact ? ` ${spendImpact}` : ""}`,
        );
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this loan.");
      return false;
    }
  };
  const removeLoan: ContextValue["removeLoan"] = async (loanId) => {
    const loan = state.current.loans.find((item) => item.id === loanId);
    if (!loan) {
      setError("This lending record is no longer available.");
      return false;
    }
    if (loan.repayments.length) {
      setError(
        "This lending record has repayments. Keep it so the return history and balance stay accurate.",
      );
      return false;
    }
    const transaction = loan.transactionId
      ? state.current.transactions.find(
          (item) => item.id === loan.transactionId,
        )
      : undefined;
    const nextTransactions = transaction
      ? state.current.transactions.map((item) =>
          item.id !== transaction.id
            ? item
            : restoreLentTransaction(item, loan),
        )
      : state.current.transactions;
    const nextLoans = state.current.loans.filter((item) => item.id !== loanId);
    try {
      await persist(
        nextTransactions,
        state.current.rules,
        undefined,
        undefined,
        nextLoans,
      );
      if (transaction) setTransactions(nextTransactions);
      setLoans(nextLoans);
      await native?.cancelLendingReminder(loanId).catch(() => {});
      setError("");
      setNotice(
        transaction
          ? "Removed from money lent. The payment is back to its previous classification."
          : "Lending record removed.",
      );
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not remove this record.",
      );
      return false;
    }
  };
  const recordLoanRepayment: ContextValue["recordLoanRepayment"] = async (
    loanId,
    amount,
    note = "",
  ) => {
    const currentLoan = state.current.loans.find((loan) => loan.id === loanId);
    if (
      !currentLoan ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > loanOutstanding(currentLoan)
    ) {
      setError(
        "Enter a valid repayment no larger than the outstanding amount.",
      );
      return false;
    }
    const nextLoans = state.current.loans.map((loan) =>
      loan.id === loanId
        ? {
            ...loan,
            repayments: [
              ...loan.repayments,
              {
                id:
                  globalThis.crypto?.randomUUID?.() ||
                  `repayment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                amount,
                at: new Date().toISOString(),
                ...(note.trim() ? { note: note.trim().slice(0, 200) } : {}),
              },
            ],
          }
        : loan,
    );
    try {
      await persist(
        state.current.transactions,
        state.current.rules,
        undefined,
        undefined,
        nextLoans,
      );
      setLoans(nextLoans);
      if (loanOutstanding(nextLoans.find((loan) => loan.id === loanId)!) === 0)
        await native?.cancelLendingReminder(loanId).catch(() => {});
      setError("");
      setNotice("Repayment recorded. It does not count as income or spending.");
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not record the repayment.",
      );
      return false;
    }
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
      for (const loan of state.current.loans)
        await native.cancelLendingReminder(loan.id).catch(() => false);
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
      setCustomCategories([]);
      setLoans([]);
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
      setCustomCategories([]);
      setLoans([]);
      setImportProgress(emptyImport);
      setOverlayState(false);
      setNotice(
        "Device journal removed. Your phone's SMS are unchanged; reconnect to import again.",
      );
      reset = true;
    });
    return reset;
  };
  const restoreBackup = async (backup: {
    transactions: Transaction[];
    rules: MerchantRule[];
    metadata: LedgerMetadata;
  }) => {
    let restored = false;
    await perform(async () => {
      if (!native || state.current.mode !== "live" || state.current.locked)
        throw new Error("Unlock your journal before restoring a backup.");
      if (["queued", "running", "waiting"].includes(importProgress.state))
        throw new Error("Pause SMS history import before restoring a backup.");
      // The user confirms replacement in the restore sheet first, then verifies
      // the action with the device credential before the SQLCipher transaction.
      const key = await native.unlock();
      for (const oldLoan of state.current.loans)
        await native.cancelLendingReminder(oldLoan.id).catch(() => false);
      generation.current++;
      cancelVoice();
      await closeLive();
      await openLive(key);
      await replaceLive(backup.transactions, backup.rules, backup.metadata);
      await native
        .saveAutoBackupSnapshot(
          JSON.stringify(
            makeJournalBackup(
              backup.transactions,
              backup.rules,
              backup.metadata,
            ),
          ),
        )
        .catch(() => {});
      await native.saveRules(
        backup.rules
          .filter(hasSafeRule)
          .map(({ merchant, category }) => ({ merchant, category })),
      );
      setTransactions(backup.transactions);
      setRules(backup.rules);
      setRecurringDecisions(ledgerMetadata(backup.metadata).recurringDecisions);
      setCustomCategories(
        ledgerMetadata(backup.metadata).customCategories ?? [],
      );
      const restoredLoans = ledgerMetadata(backup.metadata).loans ?? [];
      setLoans(restoredLoans);
      for (const loan of restoredLoans) {
        if (!loan.remind || !loan.dueDate || loanOutstanding(loan) === 0)
          continue;
        const [year, month, day] = loan.dueDate.split("-").map(Number);
        const dueAt = new Date(year, month - 1, day, 10, 0, 0, 0).getTime();
        if (dueAt > Date.now())
          await native
            .scheduleLendingReminder(loan.id, dueAt)
            .catch(() => false);
      }
      setPrevious(null);
      setNotice(
        "Backup restored. Your journal now matches the selected Drive backup.",
      );
      restored = true;
    });
    return restored;
  };
  useEffect(() => {
    if (mode === "live" && !locked)
      native
        ?.setReviewCount(transactions.filter((t) => t.review).length)
        .catch(() => {});
  }, [mode, locked, transactions]);
  useEffect(() => {
    let backgroundedAt: number | null = null;
    let lockTimer: ReturnType<typeof setTimeout> | undefined;
    const clearTimer = () => {
      if (lockTimer) clearTimeout(lockTimer);
      lockTimer = undefined;
    };
    const lockJournal = () => {
      if (state.current.mode !== "live" || state.current.locked) return;
      generation.current++;
      setLocked(true);
      setTransactions([]);
      setRules([]);
      setRecurringDecisions({});
      setCustomCategories([]);
      setLoans([]);
      setPrevious(null);
      closeLive().catch(() => {});
      cancelVoice();
    };
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
        backgroundedAt = Date.now();
        clearTimer();
        if (state.current.autoLockDelay <= 0) lockJournal();
        else {
          lockTimer = setTimeout(lockJournal, state.current.autoLockDelay);
        }
      } else if (status === "active" && backgroundedAt !== null) {
        const elapsedFrom = backgroundedAt;
        backgroundedAt = null;
        clearTimer();
        if (
          shouldLockAfterBackground(
            state.current.autoLockDelay,
            elapsedFrom,
            Date.now(),
          )
        )
          lockJournal();
      }
    });
    return () => {
      clearTimer();
      listener.remove();
    };
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
          setCustomCategories([]);
          setLoans([]);
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
        categories: [
          ...new Set([
            ...CATEGORIES,
            ...customCategories,
            ...transactions.map((transaction) => transaction.category),
            ...rules.map((rule) => rule.category),
          ]),
        ],
        customCategories,
        addCategory,
        loans,
        addLoan,
        removeLoan,
        recordLoanRepayment,
        recurringDecisions,
        setRecurringDecision,
        theme,
        setTheme,
        dark,
        colors: palettes[dark ? "dark" : "light"],
        mode,
        locked,
        autoLockDelay,
        setAutoLockDelay,
        busy,
        loaded,
        error,
        setError,
        connect,
        connectEmail,
        restoreBackup,
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
