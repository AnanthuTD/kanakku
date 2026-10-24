import { validateVpaQuery } from "../domain/merchantLookup";
import { MerchantLookupEvidence } from "./MerchantLookupSettings";
import { ReceiptEditor } from "./ReceiptEditor";
import {
  normalizeReceipt,
  buildReceiptNote,
  type ReceiptDraft,
} from "../domain/receipt";
import {
  isAccountPayee,
  payeeRuleImpactCount,
  rememberedRuleFor,
} from "../domain/payees";
import { cancelReceipt } from "../native/receipt";
import { beginInteraction } from "../state/interactions";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { router, type Href, useFocusEffect } from "expo-router";
import {
  View,
  Pressable,
  Switch,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
  Keyboard,
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetBackdrop,
  type BottomSheetScrollViewMethods,
} from "@gorhom/bottom-sheet";
import { Mic, Square, X, Check, ArrowRight } from "lucide-react-native";
import { useApp } from "../state/AppContext";
import {
  Category,
  Kind,
  MerchantRule,
  classify,
  isMixedCategoryText,
  money,
  transactionMoney,
  needsInrSettlement,
  decimalToPaise,
} from "../domain/model";
import { Text, Button, CategoryIcon } from "./ui";
import { Mascot } from "./Avatar";
import { tapFeedback, successFeedback } from "./feedback";
import { native, type ModelDownloadStatus } from "../native/bridge";
import { listen, cancelVoice, finishVoice } from "../native/voice";
import { voiceLanguageLabel, voiceLanguages } from "../native/voiceModel";
import { VoicePhase } from "../native/voice.types";
import { OptionalModelPrompt } from "./OptionalModelPrompt";
const ReviewInput = Platform.OS === "web" ? TextInput : BottomSheetTextInput;
export interface ReviewHandle {
  open: (
    id: string,
    options?: {
      queue?: boolean;
      queueIds?: string[];
      voice?: boolean;
      photo?: boolean;
    },
  ) => void;
}
export const ReviewSheet = forwardRef<ReviewHandle>(
  function ReviewSheet(_, ref) {
    const {
      colors,
      transactions,
      rules,
      categories,
      loans,
      update,
      busy,
      notice,
      error,
      undo,
      canUndo,
      removeLoan,
      setNotice,
      merchantLookupHints,
      merchantLookupErrors,
      merchantLookupPending,
      searchMerchant,
      cancelMerchantSearch,
    } = useApp();
    const modal = useRef<BottomSheetModal>(null);
    const reviewScroll = useRef<BottomSheetScrollViewMethods | null>(null);
    const noteInputY = useRef(0);
    const openedFrom = useRef<HTMLElement | null>(null);
    const [id, setId] = useState<string | null>(null);
    const [sheetReady, setSheetReady] = useState(false);
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    useEffect(() => {
      const shown = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
      const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
      return () => {
        shown.remove();
        hidden.remove();
      };
    }, []);
    useEffect(() => {
      if (sheetReady && id) return beginInteraction();
    }, [sheetReady, id]);
    const [category, setCategory] = useState<Category>("Uncategorized");
    const [note, setNote] = useState("");
    const [settlementText, setSettlementText] = useState("");
    const [receipt, setReceipt] = useState<ReceiptDraft | undefined>();
    const [receiptValid, setReceiptValid] = useState(true);
    const [autoPhoto, setAutoPhoto] = useState(false);
    const [merchantName, setMerchantName] = useState("");
    // Freeze input seeds while typing. Parent state echoes travel through the
    // asynchronous sheet portal and can otherwise overwrite newer keystrokes.
    const [inputSeeds, setInputSeeds] = useState({
      merchant: "",
      note: "",
      noteRevision: 0,
    });
    const [confirmWebSearch, setConfirmWebSearch] = useState(false);
    const [vpaQuery, setVpaQuery] = useState("");
    const [confirmVpaSearch, setConfirmVpaSearch] = useState(false);
    const [vpaApproved, setVpaApproved] = useState(false);
    const manualSearch = useRef(false);
    const stopManualSearch = () => {
      if (!manualSearch.current) return;
      manualSearch.current = false;
      void cancelMerchantSearch().catch(() => {});
    };
    const [remember, setRemember] = useState(false);
    const [listening, setListening] = useState(false);
    const [voicePhase, setVoicePhase] = useState<VoicePhase>("preparing");
    const voiceVersion = useRef(0);
    const [voiceError, setVoiceError] = useState("");
    const [modelPrompt, setModelPrompt] = useState<
      ModelDownloadStatus["id"] | null
    >(null);
    const promptedModels = useRef(new Set<ModelDownloadStatus["id"]>());
    const [kind, setKind] = useState<Kind>("purchase");
    const [excluded, setExcluded] = useState(false);
    const [confirmUnmark, setConfirmUnmark] = useState(false);
    const reopenAfterLoan = useRef<string | null>(null);
    const openTransactionRef = useRef<(value: string) => void>(() => {});
    const tx = transactions.find((t) => t.id === id);
    const linkedLoan =
      tx?.kind === "lent"
        ? loans.find((loan) => loan.transactionId === tx.id)
        : undefined;
    const recording = useRef(false);
    const suggestionVersion = useRef(0);
    const draftVersion = useRef(0);
    const [suggesting, setSuggesting] = useState(false);
    const [queueMode, setQueueMode] = useState(false);
    const [autoVoice, setAutoVoice] = useState(false);
    const queue = useRef<string[]>([]);
    const visited = useRef(new Set<string>());
    const load = (value: string) => {
      stopManualSearch();
      const t = transactions.find((x) => x.id === value);
      if (!t) return;
      recording.current = false;
      voiceVersion.current++;
      cancelVoice();
      suggestionVersion.current++;
      const draftToken = ++draftVersion.current;
      const suggestionToken = suggestionVersion.current;
      setId(value);
      setCategory(t.category);
      setNote(t.note);
      setSettlementText(t.inrAmount ? (t.inrAmount / 100).toFixed(2) : "");
      cancelReceipt();
      setReceipt(normalizeReceipt(t.receipt));
      setReceiptValid(true);
      setAutoPhoto(false);
      setMerchantName(t.merchant);
      setInputSeeds({ merchant: t.merchant, note: t.note, noteRevision: 0 });
      setKind(t.kind);
      setExcluded(t.excluded);
      setConfirmUnmark(false);
      setRemember(Boolean(rememberedRuleFor(t, rules)));
      setConfirmWebSearch(false);
      setConfirmVpaSearch(false);
      setVpaApproved(false);
      let parsedVpa = "";
      try {
        parsedVpa = validateVpaQuery(t.originalMerchant || t.merchant);
      } catch {}
      setVpaQuery(parsedVpa);
      setVoiceError("");
      setModelPrompt(null);
      promptedModels.current.clear();
      setListening(false);
      setSuggesting(false);
      // The native companion carries only an unsaved, exact-payment draft in memory.
      // Never let a delayed handoff overwrite typing, a newer payment or an explicit category.
      void native
        ?.takeCompanionDraft(value)
        .then((draft) => {
          if (!draft || draftToken !== draftVersion.current) return;
          // The draft is already taken from native memory: keep its note even when the
          // user picked a category first; only that explicit category wins.
          const categoryChosen = suggestionToken !== suggestionVersion.current;
          setNote(draft.note);
          setInputSeeds((current) => ({
            ...current,
            note: draft.note,
            noteRevision: current.noteRevision + 1,
          }));
          if (!categoryChosen)
            setCategory(
              !isMixedCategoryText(draft.note) &&
                categories.includes(draft.category as Category)
                ? (draft.category as Category)
                : classify(draft.note).category,
            );
        })
        .catch(() => {});
    };
    const openTransaction = (
      value: string,
      options?: {
        queue?: boolean;
        queueIds?: string[];
        voice?: boolean;
        photo?: boolean;
      },
    ) => {
      const t = transactions.find((x) => x.id === value);
      if (!t) return;
      if (Platform.OS === "web") {
        openedFrom.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      }
      visited.current.clear();
      queue.current = options?.queue
        ? [
            value,
            ...transactions
              .filter(
                (x) =>
                  x.review &&
                  x.id !== value &&
                  (!options.queueIds || options.queueIds.includes(x.id)),
              )
              .map((x) => x.id),
          ]
        : [];
      setQueueMode(!!options?.queue);
      setAutoVoice(!!options?.voice && !options?.photo);
      setSheetReady(false);
      load(value);
      setAutoPhoto(!!options?.photo);
      modal.current?.present();
    };
    openTransactionRef.current = (value) => openTransaction(value);
    useFocusEffect(
      useCallback(() => {
        const transactionId = reopenAfterLoan.current;
        if (!transactionId) return;
        reopenAfterLoan.current = null;
        const timer = setTimeout(
          () => openTransactionRef.current(transactionId),
          150,
        );
        return () => clearTimeout(timer);
      }, []),
    );
    useImperativeHandle(
      ref,
      () => ({
        open: openTransaction,
      }),
      [transactions, rules],
    );
    useEffect(
      () => () => {
        stopManualSearch();
        recording.current = false;
        voiceVersion.current++;
        cancelVoice();
        cancelReceipt();
        draftVersion.current++;
      },
      [],
    );
    // Gorhom commits web portal content separately from its parent. Observe the
    // actual host mount/enable state instead of assuming onChange or a forwarded
    // scrollable ref means the dialog is ready. Android never installs DOM hooks.
    useEffect(() => {
      if (Platform.OS !== "web" || !sheetReady) return;
      let dialog: HTMLElement | null = null;
      let attached = false;
      const focusable = () =>
        dialog
          ? Array.from(
              dialog.querySelectorAll<HTMLElement>(
                'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
              ),
            ).filter(
              (element) =>
                !element.hasAttribute("disabled") &&
                element.getAttribute("aria-disabled") !== "true" &&
                !element.closest('[aria-hidden="true"]') &&
                element.getClientRects().length > 0,
            )
          : [];
      const keyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          modal.current?.dismiss();
          return;
        }
        if (event.key !== "Tab") return;
        const controls = focusable();
        if (!controls.length) {
          event.preventDefault();
          return;
        }
        const current = controls.indexOf(document.activeElement as HTMLElement);
        if (
          current < 0 ||
          (event.shiftKey && current === 0) ||
          (!event.shiftKey && current === controls.length - 1)
        ) {
          event.preventDefault();
          controls[event.shiftKey ? controls.length - 1 : 0].focus();
        }
      };
      const focusIn = (event: FocusEvent) => {
        if (!(event.target instanceof Node) || !dialog?.contains(event.target))
          focusable()[0]?.focus();
      };
      const attach = () => {
        if (attached) return;
        const host = document.getElementById("kanakku-review-dialog");
        const closeControl = host?.querySelector<HTMLElement>(
          '[aria-label="Close transaction"]',
        );
        if (
          !host?.isConnected ||
          !closeControl ||
          closeControl.hasAttribute("disabled") ||
          closeControl.getAttribute("aria-disabled") === "true" ||
          !host.getClientRects().length
        )
          return;
        dialog = host;
        attached = true;
        observer.disconnect();
        document.addEventListener("keydown", keyDown, true);
        document.addEventListener("focusin", focusIn);
        closeControl.focus();
      };
      const observer = new MutationObserver(attach);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["disabled", "aria-disabled", "id", "style"],
      });
      attach();
      return () => {
        observer.disconnect();
        document.removeEventListener("keydown", keyDown, true);
        document.removeEventListener("focusin", focusIn);
        // Queue changes keep the modal open; only final dismissal restores focus.
        if (attached) {
          const opener = openedFrom.current;
          const fallback = document.querySelector<HTMLElement>(
            '[role="tab"][aria-selected="true"]',
          );
          if (opener?.isConnected && opener.getClientRects().length > 0)
            opener.focus();
          else fallback?.focus();
        }
      };
    }, [sheetReady]);
    useEffect(() => {
      if (Platform.OS === "web" && sheetReady)
        document
          .getElementById("kanakku-review-dialog")
          ?.querySelector<HTMLElement>('[aria-label="Close transaction"]')
          ?.focus();
    }, [id, sheetReady]);
    const applyText = (text: string, fromVoice = false) => {
      draftVersion.current++;
      if (fromVoice)
        setInputSeeds((current) => ({
          ...current,
          note: text,
          noteRevision: current.noteRevision + 1,
        }));
      setNote(text);
      const result = classify(text);
      setCategory(result.category);
    };
    const suggestCategory = async (
      text: string,
      version: number,
      promptIfUnavailable = false,
    ) => {
      if (!native) return;
      setSuggesting(true);
      try {
        const result = await native.suggestCategory(text);
        if (
          version === suggestionVersion.current &&
          result.similarity >= 0.3 &&
          result.margin >= 0.055 &&
          categories.includes(result.category as Category)
        )
          setCategory(result.category as Category);
      } catch {
        if (
          !promptIfUnavailable ||
          version !== suggestionVersion.current ||
          promptedModels.current.has("categories")
        )
          return;
        const statuses = await native.modelDownloads().catch(() => []);
        if (
          version === suggestionVersion.current &&
          statuses.find((item) => item.id === "categories")?.state !== "ready"
        ) {
          promptedModels.current.add("categories");
          setModelPrompt("categories");
        }
      } finally {
        if (version === suggestionVersion.current) setSuggesting(false);
      }
    };
    useEffect(() => {
      const version = ++suggestionVersion.current;
      setSuggesting(false);
      if (
        !note.trim() ||
        !native ||
        isMixedCategoryText(note) ||
        classify(note).confidence >= 0.8
      )
        return;
      const timer = setTimeout(async () => {
        // An explicit category choice or dismissal can invalidate this timer
        // without changing the note. Do not begin stale inference or re-open
        // its spinner after the user has already moved on.
        if (version !== suggestionVersion.current) return;
        await suggestCategory(note, version);
      }, 400);
      return () => clearTimeout(timer);
    }, [note]);
    const record = async () => {
      tapFeedback();
      setVoiceError("");
      if (native) {
        try {
          const status = (await native.modelDownloads()).find(
            (item) => item.id === "voice",
          );
          if (status?.state !== "ready") {
            setModelPrompt("voice");
            return;
          }
        } catch {
          setVoiceError(
            "Could not check offline voice. Open Settings to retry.",
          );
          return;
        }
      }
      setListening(true);
      recording.current = true;
      setVoicePhase("preparing");
      const version = ++voiceVersion.current;
      try {
        const text = await listen((phase) => {
          if (version === voiceVersion.current) setVoicePhase(phase);
        }, merchantName || tx?.merchant);
        if (recording.current && version === voiceVersion.current)
          applyText(text, true);
      } catch (e) {
        if (
          recording.current &&
          version === voiceVersion.current &&
          e instanceof Error &&
          (e.message.startsWith("Download English voice") ||
            ("code" in e && e.code === "MODEL_NOT_READY"))
        ) {
          setModelPrompt("voice");
        } else if (recording.current && version === voiceVersion.current)
          setVoiceError(
            e instanceof Error
              ? e.message
              : "Voice is unavailable. Type your answer below.",
          );
      } finally {
        if (version === voiceVersion.current) {
          setListening(false);
          recording.current = false;
        }
      }
    };
    useEffect(() => {
      if (!autoVoice || !id) return;
      const timer = setTimeout(() => {
        setAutoVoice(false);
        record();
      }, 400);
      return () => clearTimeout(timer);
    }, [autoVoice, id]);
    const advance = () => {
      if (id) visited.current.add(id);
      const next = queue.current.find(
        (value) =>
          !visited.current.has(value) &&
          transactions.some((t) => t.id === value && t.review),
      );
      if (next) load(next);
      else {
        modal.current?.dismiss();
        setNotice("Review pass finished. Skipped payments stay in your queue.");
      }
    };
    useEffect(() => {
      if (notice === "Saved. A little clearer.") successFeedback();
    }, [notice]);
    const close = () => {
      stopManualSearch();
      setConfirmVpaSearch(false);
      setVpaApproved(false);
      recording.current = false;
      setListening(false);
      suggestionVersion.current++;
      setAutoVoice(false);
      draftVersion.current++;
      voiceVersion.current++;
      cancelVoice();
      cancelReceipt();
      setAutoPhoto(false);
    };
    return (
      <>
        <BottomSheetModal
          ref={modal}
          accessible={false}
          style={{ maxWidth: 540, width: "100%", alignSelf: "center" }}
          snapPoints={["88%"]}
          enableDynamicSizing={false}
          enablePanDownToClose
          enableContentPanningGesture={Platform.OS !== "web"}
          onChange={(index) => setSheetReady(index >= 0)}
          onDismiss={close}
          backgroundStyle={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
          }}
          handleIndicatorStyle={{ backgroundColor: colors.line, width: 36 }}
          backdropComponent={(props) => (
            <BottomSheetBackdrop
              {...props}
              appearsOnIndex={0}
              disappearsOnIndex={-1}
              opacity={0.35}
            />
          )}
          keyboardBehavior="interactive"
          android_keyboardInputMode="adjustResize"
        >
          <BottomSheetScrollView
            ref={reviewScroll}
            {...(Platform.OS === "web"
              ? {
                  nativeID: "kanakku-review-dialog",
                  role: "dialog" as const,
                  "aria-modal": true,
                  accessibilityLabel: "Review payment",
                }
              : {})}
            testID="review-form"
            contentContainerStyle={{ padding: 24, paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
          >
            {tx && (
              <>
                {queueMode && (
                  <Text muted style={{ fontSize: 11, marginBottom: 12 }}>
                    PAYMENT{" "}
                    {Math.min(visited.current.size + 1, queue.current.length)}{" "}
                    OF {queue.current.length} · REVIEW AT YOUR PACE
                  </Text>
                )}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontSize: 10, letterSpacing: 1.5 }} muted>
                    {tx.review
                      ? "A LITTLE CONTEXT GOES A LONG WAY"
                      : "TRANSACTION DETAILS"}
                  </Text>
                  <Pressable
                    accessibilityLabel="Close transaction"
                    disabled={!sheetReady}
                    accessibilityRole="button"
                    onPress={() => modal.current?.dismiss()}
                    style={{ padding: 12 }}
                  >
                    <X size={20} color={colors.text} />
                  </Pressable>
                </View>
                <View style={{ alignItems: "center", marginBottom: keyboardOpen ? 8 : 20 }}>
                  {!keyboardOpen && (
                    <Mascot
                      size={90}
                      mood={
                        listening ? "listening" : tx.review ? "thinking" : "happy"
                      }
                    />
                  )}
                  <Text
                    serif
                    style={{ fontSize: keyboardOpen ? 22 : 30, lineHeight: keyboardOpen ? 28 : 38, marginTop: keyboardOpen ? 0 : 8 }}
                  >
                    {tx.review ? "What was this for?" : "All in the details."}
                  </Text>
                  <Text
                    serif
                    style={{ fontSize: keyboardOpen ? 30 : 42, lineHeight: keyboardOpen ? 38 : 56, marginTop: keyboardOpen ? 4 : 12 }}
                  >
                    {transactionMoney(tx, true)}
                  </Text>
                  <Text bold>{tx.merchant}</Text>
                  {isAccountPayee(tx) && (
                    <Text
                      muted
                      style={{ fontSize: 12, lineHeight: 18, marginTop: 8 }}
                    >
                      The destination is masked, so it stays out of totals until
                      you decide. Choose Self transfer for your own account, or
                      Purchase and a category for a real expense.
                    </Text>
                  )}
                  <Text muted style={{ fontSize: 12, marginTop: 4 }}>
                    {tx.bank} · {tx.account} ·{" "}
                    {new Date(tx.at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </Text>
                </View>
                {tx.source === "email" && (
                  <Text muted>
                    Source: authenticated bank email
                    {tx.timePrecision === "day"
                      ? " · Bank provided a date only"
                      : ""}
                    .
                  </Text>
                )}
                {!!tx.emailMatchCandidates?.length && (
                  <View style={{ gap: 10, marginVertical: 12 }}>
                    <Text accessibilityRole="alert">
                      This may already be recorded from SMS. It is not counted
                      while you decide.
                    </Text>
                    {tx.emailMatchCandidates
                      .map((value) => transactions.find((t) => t.id === value))
                      .filter(Boolean)
                      .map((candidate) => (
                        <Button
                          key={candidate!.id}
                          secondary
                          disabled={busy}
                          onPress={async () => {
                            const saved = await update(tx.id, {
                              duplicateOf: candidate!.id,
                              excluded: true,
                              review: false,
                              emailMatchCandidates: undefined,
                              reason: "You linked these alerts to one payment",
                              reconciliationDecision: "linked",
                            });
                            if (saved) modal.current?.dismiss();
                          }}
                        >
                          Same payment as {candidate!.merchant} ·{" "}
                          {transactionMoney(candidate!)} ·{" "}
                          {new Date(candidate!.at).toLocaleDateString("en-IN")}
                        </Button>
                      ))}
                    <Button
                      secondary
                      disabled={busy}
                      onPress={() =>
                        update(tx.id, {
                          emailMatchCandidates: undefined,
                          reason: "You confirmed a separate payment",
                          reconciliationDecision: "distinct",
                        })
                      }
                    >
                      Count as a separate payment
                    </Button>
                  </View>
                )}
                {tx.currency && tx.currency !== "INR" && (
                  <View style={{ gap: 10, marginVertical: 12 }}>
                    <Text accessibilityRole="alert">
                      The bank reported {transactionMoney(tx)}. Enter the final
                      INR charge from your bank to include it in INR spending.
                      No exchange rate is assumed.
                    </Text>
                    <ReviewInput
                      key={`${id}-inr`}
                      accessibilityLabel="Final INR charge"
                      defaultValue={
                        tx.inrAmount ? (tx.inrAmount / 100).toFixed(2) : ""
                      }
                      onChangeText={setSettlementText}
                      keyboardType="decimal-pad"
                      placeholder="Final charge in rupees"
                      style={{
                        color: colors.text,
                        padding: 14,
                        borderWidth: 1,
                        borderColor: colors.line,
                        borderRadius: 12,
                      }}
                    />
                    {!!settlementText.trim() &&
                      decimalToPaise(settlementText) === null && (
                        <Text accessibilityRole="alert">
                          Enter a valid INR amount with up to two decimals.
                        </Text>
                      )}
                  </View>
                )}
                {!keyboardOpen ? <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    listening
                      ? voicePhase === "listening"
                        ? "Finish recording"
                        : "Cancel voice"
                      : "Explain payment by voice"
                  }
                  onPress={() => {
                    if (listening) {
                      if (voicePhase === "listening") finishVoice();
                      else {
                        recording.current = false;
                        voiceVersion.current++;
                        cancelVoice();
                        setListening(false);
                      }
                    } else record();
                  }}
                  style={{
                    backgroundColor: colors.accent,
                    borderRadius: 20,
                    padding: 18,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  {listening ? (
                    <Square color={colors.accentText} size={22} />
                  ) : (
                    <Mic color={colors.accentText} size={22} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text bold style={{ color: colors.accentText }}>
                      {listening
                        ? voicePhase === "preparing"
                          ? "Preparing offline voice…"
                          : voicePhase === "listening"
                            ? "Listening…"
                            : "Understanding your words…"
                        : "Tell me in your own words"}
                    </Text>
                    <Text
                      style={{
                        color: colors.accentText,
                        fontSize: 11,
                        opacity: 0.8,
                      }}
                    >
                      {listening
                        ? voicePhase === "listening"
                          ? "Tap to finish · up to 15 seconds"
                          : "Tap to cancel"
                        : `${voiceLanguageLabel} · tap to speak`}
                    </Text>
                  </View>
                  {listening && <ActivityIndicator color={colors.accentText} />}
                </Pressable> : null}
                {!keyboardOpen ? <Text muted style={{ fontSize: 11, marginTop: 8 }}>
                  {voiceLanguages.length > 1
                    ? `${voiceLanguageLabel} speech becomes an editable English note.`
                    : `Speak in ${voiceLanguageLabel}; your words become an editable note.`}{" "}
                  Check the words and category before saving. Audio stays on
                  this device.
                </Text> : null}
                {voiceError ? (
                  <Text
                    style={{
                      color: colors.orange,
                      fontSize: 12,
                      marginTop: 12,
                    }}
                  >
                    {voiceError}
                  </Text>
                ) : null}
                <ReviewInput
                  key={`${id}-merchant-${inputSeeds.merchant}`}
                  accessibilityLabel="Merchant name"
                  defaultValue={inputSeeds.merchant}
                  onChangeText={(value) => {
                    stopManualSearch();
                    setConfirmWebSearch(false);
                    setMerchantName(value);
                  }}
                  maxLength={80}
                  placeholder="Who was this payment to?"
                  placeholderTextColor={colors.muted}
                  style={{
                    fontFamily: "DMSans",
                    fontSize: 14,
                    color: colors.text,
                    backgroundColor: colors.card,
                    borderColor: colors.line,
                    borderWidth: 1,
                    borderRadius: 16,
                    minHeight: 52,
                    padding: 16,
                    marginTop: 16,
                  }}
                />
                <Text muted style={{ fontSize: 10, marginTop: 5 }}>
                  Bank merchant: {tx.originalMerchant || tx.merchant}. Naming it
                  and choosing a category are separate.
                </Text>
                <View style={{ gap: 10, marginTop: 16 }}>
                  {merchantLookupHints[tx.id] && (
                    <MerchantLookupEvidence
                      result={merchantLookupHints[tx.id]}
                    />
                  )}
                  {!!merchantLookupErrors[tx.id] && (
                    <Text
                      accessibilityRole="alert"
                      style={{ color: colors.orange, fontSize: 12 }}
                    >
                      {merchantLookupErrors[tx.id]}
                    </Text>
                  )}
                  {merchantLookupPending.includes(tx.id) ? (
                    <View style={{ gap: 8 }}>
                      <Text muted>Looking for public business matches…</Text>
                      <Button
                        secondary
                        onPress={() => {
                          manualSearch.current = true;
                          stopManualSearch();
                        }}
                      >
                        Cancel current web search
                      </Button>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      <Button
                        secondary
                        onPress={() => {
                          setConfirmVpaSearch(false);
                          setVpaApproved(false);
                          setConfirmWebSearch(true);
                        }}
                      >
                        Look up a public business
                      </Button>
                      <Button
                        secondary
                        onPress={() => {
                          setConfirmWebSearch(false);
                          setVpaApproved(false);
                          setConfirmVpaSearch(true);
                        }}
                      >
                        Look up a UPI ID
                      </Button>
                    </View>
                  )}
                  {confirmWebSearch && (
                    <View style={{ gap: 10 }}>
                      <Text muted style={{ fontSize: 12 }}>
                        Search Brave for “{merchantName}”? Check this is a
                        public business name. Do not use a person's name or
                        payment details. Web results will not change this
                        payment.
                      </Text>
                      <Button
                        disabled={!merchantName.trim()}
                        secondary
                        onPress={() => {
                          setConfirmWebSearch(false);
                          manualSearch.current = true;
                          void searchMerchant(tx.id, merchantName, true);
                        }}
                      >
                        Search this public business
                      </Button>
                      <Button
                        secondary
                        onPress={() => setConfirmWebSearch(false)}
                      >
                        Cancel web search
                      </Button>
                    </View>
                  )}
                  {confirmVpaSearch && (
                    <View style={{ gap: 10 }}>
                      <Text bold>Find a merchant from a UPI ID</Text>
                      <Text muted style={{ fontSize: 12 }}>
                        Brave will receive this complete UPI ID (VPA). It may
                        identify a person and many addresses have no public
                        results. No SMS, amount, account, bank or note is sent.
                        Search evidence cannot verify who received your payment.
                        Check the sources, then edit and save the merchant
                        yourself.
                      </Text>
                      <ReviewInput
                        key={`${id}-vpa`}
                        testID="vpa-query"
                        accessibilityLabel="UPI ID to search"
                        defaultValue={vpaQuery}
                        onChangeText={(value) => {
                          stopManualSearch();
                          setVpaQuery(value);
                          setVpaApproved(false);
                        }}
                        maxLength={164}
                        placeholder="shop@bank"
                        placeholderTextColor={colors.muted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={{
                          color: colors.text,
                          backgroundColor: colors.card,
                          minHeight: 52,
                          padding: 14,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: colors.line,
                        }}
                      />
                      <Text muted style={{ fontSize: 12 }}>
                        Search Brave for “{vpaQuery.trim().toLowerCase()}” only.
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 12,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ flex: 1, fontSize: 12 }}>
                          I agree to send this exact UPI ID to Brave.
                        </Text>
                        <Switch
                          testID="vpa-consent"
                          accessibilityLabel="Approve sending this UPI ID to Brave"
                          value={vpaApproved}
                          onValueChange={setVpaApproved}
                          trackColor={{
                            true: colors.accent,
                            false: colors.line,
                          }}
                        />
                      </View>
                      <Button
                        secondary
                        disabled={!vpaApproved || !vpaQuery.trim()}
                        onPress={() => {
                          setConfirmVpaSearch(false);
                          setVpaApproved(false);
                          manualSearch.current = true;
                          void searchMerchant(tx.id, vpaQuery, true, "vpa");
                        }}
                      >
                        Search this UPI ID
                      </Button>
                      <Button
                        secondary
                        onPress={() => {
                          setConfirmVpaSearch(false);
                          setVpaApproved(false);
                        }}
                      >
                        Cancel UPI ID search
                      </Button>
                    </View>
                  )}
                </View>
                <ReviewInput
                  key={`${id}-note-${inputSeeds.noteRevision}`}
                  testID="payment-note"
                  accessibilityLabel="Payment note"
                  defaultValue={inputSeeds.note}
                  onChangeText={applyText}
                  onLayout={(event) => {
                    noteInputY.current = event.nativeEvent.layout.y;
                  }}
                  onFocus={() => {
                    if (Platform.OS === "web") return;
                    // The review header can push the note below the keyboard on
                    // smaller phones. Bring the focused field into the visible
                    // sheet area after Android finishes its keyboard resize.
                    setTimeout(() => {
                      reviewScroll.current?.scrollTo({
                        y: Math.max(0, noteInputY.current - 96),
                        animated: true,
                      });
                    }, 250);
                  }}
                  placeholder="Or type what it was for…"
                  placeholderTextColor={colors.muted}
                  multiline
                  style={{
                    fontFamily: "DMSans",
                    fontSize: 14,
                    color: colors.text,
                    backgroundColor: colors.card,
                    borderColor: colors.line,
                    borderWidth: 1,
                    borderRadius: 16,
                    minHeight: 62,
                    padding: 16,
                    marginVertical: 16,
                  }}
                />
                {sheetReady && (
                  <ReceiptEditor
                    key={`${id}-receipt`}
                    value={receipt}
                    onChange={(value) => {
                      suggestionVersion.current++;
                      setSuggesting(false);
                      setReceipt(value);
                    }}
                    onValidationChange={setReceiptValid}
                    disabled={busy || listening}
                    closeCamera={listening}
                    paymentAmount={
                      !tx.currency || tx.currency === "INR"
                        ? tx.amount
                        : tx.inrAmount
                    }
                    autoCapture={autoPhoto}
                    onCaptureHandled={() => setAutoPhoto(false)}
                    onUseMerchant={(value) => {
                      const merchant = value.trim().slice(0, 80);
                      setMerchantName(merchant);
                      setInputSeeds((current) => ({ ...current, merchant }));
                    }}
                  />
                )}
                {receipt && (
                  <Button
                    secondary
                    disabled={busy || listening || !receiptValid}
                    style={{ marginVertical: 12 }}
                    onPress={async () => {
                      const context = `${note} ${buildReceiptNote(receipt)}`;
                      const version = ++suggestionVersion.current;
                      const local = classify(context);
                      setCategory(local.category);
                      if (
                        !native ||
                        local.confidence >= 0.8 ||
                        isMixedCategoryText(context)
                      )
                        return;
                      await suggestCategory(context, version, true);
                    }}
                  >
                    Suggest category from bill and note
                  </Button>
                )}
                <Text bold style={{ marginBottom: 12 }}>
                  {suggesting ? "Finding a suggestion…" : "Choose a category"}
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {categories.map((c) => (
                    <Pressable
                      key={c}
                      accessibilityRole="button"
                      accessibilityState={{ selected: category === c }}
                      aria-pressed={category === c}
                      onPress={() => {
                        suggestionVersion.current++;
                        setSuggesting(false);
                        setCategory(c);
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor:
                          category === c ? colors.accent : colors.line,
                        backgroundColor:
                          category === c ? colors.accentSoft : colors.card,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        borderRadius: 14,
                        flexDirection: "row",
                        gap: 6,
                        alignItems: "center",
                      }}
                    >
                      <CategoryIcon category={c} size={24} />
                      {category === c && (
                        <Check size={13} color={colors.accent} />
                      )}
                      <Text style={{ fontSize: 12 }}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
                {tx.kind !== "lent" && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginVertical: 20,
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text bold style={{ fontSize: 13 }}>
                        {isAccountPayee(tx)
                          ? "Remember this account ending"
                          : "Remember this payee"}
                      </Text>
                      <Text muted style={{ fontSize: 11 }}>
                        {isAccountPayee(tx)
                          ? `Future alerts from ${tx.bank} with this same masked ending will use your choice. Account endings can overlap; remove the rule in Settings if it matches the wrong payments.`
                          : "Use this category and type for its other payments."}
                      </Text>
                    </View>
                    <Switch
                      accessibilityLabel="Remember merchant category"
                      disabled={
                        category === "Uncategorized" &&
                        kind === "purchase" &&
                        !remember
                      }
                      value={remember}
                      onValueChange={setRemember}
                      trackColor={{ true: colors.accent, false: colors.line }}
                    />
                  </View>
                )}
                <Text bold style={{ marginBottom: 10 }}>
                  Transaction type
                </Text>
                {tx.kind === "lent" ? (
                  <Text muted style={{ fontSize: 11, lineHeight: 17 }}>
                    This payment is tracked as money lent. Unmark it from this
                    screen before changing its transaction type.
                  </Text>
                ) : (
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {(
                      [
                        ["purchase", "Purchase"],
                        ["refund", "Refund"],
                        ["transfer", "Self transfer"],
                        ["card_payment", "Card repayment"],
                        ["income", "Income"],
                        ["cash", "Cash withdrawal"],
                      ] as [Kind, string][]
                    ).map(([k, label]) => (
                      <Pressable
                        key={k}
                        accessibilityRole="button"
                        onPress={() => setKind(k)}
                        style={{
                          padding: 11,
                          borderRadius: 12,
                          backgroundColor:
                            kind === k ? colors.accentSoft : colors.card,
                          borderWidth: 1,
                          borderColor: kind === k ? colors.accent : colors.line,
                        }}
                      >
                        <Text style={{ fontSize: 11 }}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {kind === "transfer" && tx.kind !== "lent" && (
                  <Text
                    muted
                    style={{ fontSize: 11, lineHeight: 17, marginTop: 8 }}
                  >
                    Use Self transfer only when moving money between accounts
                    you own.
                  </Text>
                )}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginVertical: 18,
                  }}
                >
                  <Text>Exclude from spending</Text>
                  <Switch
                    accessibilityLabel="Exclude from spending"
                    value={excluded}
                    onValueChange={setExcluded}
                    trackColor={{ true: colors.accent, false: colors.line }}
                  />
                </View>
                <Text muted style={{ fontSize: 11, marginBottom: 18 }}>
                  Categorization: {tx.reason}. All totals are calculated from
                  your ledger.
                </Text>
                {error ? (
                  <Text style={{ color: colors.danger, marginBottom: 12 }}>
                    {error}
                  </Text>
                ) : null}
                {notice === "Saved. A little clearer." ? (
                  <Text style={{ color: colors.accent, marginBottom: 12 }}>
                    ✓ Saved. You can close this or make another change.
                  </Text>
                ) : null}
                <Button
                  disabled={
                    busy ||
                    listening ||
                    !sheetReady ||
                    !receiptValid ||
                    !!tx.emailMatchCandidates?.length ||
                    (!!settlementText.trim() &&
                      decimalToPaise(settlementText) === null)
                  }
                  onPress={() => {
                    const saveDraft = async () => {
                      // Save confirms this draft. A late suggestion must not change
                      // the selected chip after the confirmed category is persisted.
                      suggestionVersion.current++;
                      setSuggesting(false);
                      const saved = await update(
                        tx.id,
                        {
                          category,
                          merchant: merchantName,
                          note,
                          receipt: normalizeReceipt(receipt),
                          inrAmount:
                            tx.currency && tx.currency !== "INR"
                              ? (decimalToPaise(settlementText) ?? undefined)
                              : tx.inrAmount,
                          review:
                            (category === "Uncategorized" &&
                              kind === "purchase") ||
                            (!!tx.currency &&
                              tx.currency !== "INR" &&
                              !decimalToPaise(settlementText)),
                          kind,
                          excluded,
                          reason: "Confirmed by you",
                        },
                        tx.kind === "lent" ? null : remember,
                      );
                      if (saved && queueMode) advance();
                    };
                    if (!remember || tx.kind === "lent") {
                      void saveDraft();
                      return;
                    }
                    const rule: MerchantRule = {
                      merchant: tx.originalMerchant || tx.merchant,
                      ...(isAccountPayee(tx) ? { bank: tx.bank } : {}),
                      category,
                      alias: merchantName.trim() || tx.merchant,
                      ...(kind !== "purchase" ? { kind } : {}),
                    };
                    const affected = payeeRuleImpactCount(
                      transactions,
                      tx.id,
                      rule,
                    );
                    const typeNote =
                      kind !== "purchase"
                        ? ` and mark them as ${kind === "transfer" ? "self transfer" : kind}`
                        : "";
                    const scope = isAccountPayee(tx)
                      ? `Future ${tx.bank} alerts with this masked ending are also covered. Similar account endings can belong to different people.`
                      : "Future payments with this same payee will also be covered.";
                    const title = `Apply to ${affected} payment${affected === 1 ? "" : "s"}?`;
                    const message = `This will use “${category}”${typeNote} for ${affected} matching payment${affected === 1 ? "" : "s"}, including this one. ${scope}`;
                    if (Platform.OS === "web") {
                      if (globalThis.confirm(`${title}\n\n${message}`))
                        void saveDraft();
                    } else {
                      Alert.alert(title, message, [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: `Save for ${affected}`,
                          onPress: () => void saveDraft(),
                        },
                      ]);
                    }
                  }}
                >
                  {busy
                    ? "Saving…"
                    : queueMode
                      ? "Save & next payment"
                      : "Save category"}
                </Button>
                <Button
                  secondary
                  disabled={!sheetReady}
                  style={{ marginTop: 10 }}
                  onPress={queueMode ? advance : () => modal.current?.dismiss()}
                >
                  {queueMode ? "Skip for now" : "Done"}
                </Button>
                {!queueMode &&
                  tx.kind !== "lent" &&
                  !loans.some((loan) => loan.transactionId === tx.id) && (
                    <Button
                      secondary
                      disabled={
                        busy ||
                        !sheetReady ||
                        !receiptValid ||
                        (!!settlementText.trim() &&
                          decimalToPaise(settlementText) === null)
                      }
                      style={{ marginTop: 10 }}
                      onPress={async () => {
                        suggestionVersion.current++;
                        setSuggesting(false);
                        const saved = await update(
                          tx.id,
                          {
                            category,
                            merchant: merchantName,
                            note,
                            receipt: normalizeReceipt(receipt),
                            inrAmount:
                              tx.currency && tx.currency !== "INR"
                                ? (decimalToPaise(settlementText) ?? undefined)
                                : tx.inrAmount,
                            review:
                              (category === "Uncategorized" &&
                                kind === "purchase") ||
                              (!!tx.currency &&
                                tx.currency !== "INR" &&
                                !decimalToPaise(settlementText)),
                            kind,
                            excluded,
                            reason: "Confirmed by you",
                          },
                          null,
                        );
                        if (!saved) return;
                        reopenAfterLoan.current = tx.id;
                        modal.current?.dismiss();
                        router.push(
                          `/lending?transactionId=${encodeURIComponent(tx.id)}` as Href,
                        );
                      }}
                    >
                      {busy ? "Saving…" : "Record this payment as money lent"}
                    </Button>
                  )}
                {!queueMode &&
                  tx.kind === "lent" &&
                  linkedLoan &&
                  (linkedLoan.repayments.length ? (
                    <Text muted style={{ marginTop: 10, fontSize: 11 }}>
                      This loan has repayments, so it stays linked to preserve
                      its history.
                    </Text>
                  ) : confirmUnmark ? (
                    <View
                      style={{
                        marginTop: 12,
                        padding: 14,
                        gap: 10,
                        borderRadius: 14,
                        backgroundColor: colors.accentSoft,
                      }}
                    >
                      <Text style={{ fontSize: 12, lineHeight: 18 }}>
                        The payment will return to its previous type. If it was
                        an expense, it will count in spending again.
                      </Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Button
                          secondary
                          style={{ flex: 1 }}
                          onPress={() => setConfirmUnmark(false)}
                        >
                          Keep loan
                        </Button>
                        <Button
                          disabled={busy}
                          style={{ flex: 1 }}
                          onPress={async () => {
                            const removed = await removeLoan(linkedLoan.id);
                            if (removed) {
                              setConfirmUnmark(false);
                              modal.current?.dismiss();
                            }
                          }}
                        >
                          Unmark loan
                        </Button>
                      </View>
                    </View>
                  ) : (
                    <Button
                      secondary
                      disabled={busy}
                      style={{ marginTop: 10 }}
                      onPress={() => setConfirmUnmark(true)}
                    >
                      Unmark as money lent
                    </Button>
                  ))}
                {canUndo && (
                  <Button secondary onPress={undo} style={{ marginTop: 10 }}>
                    Undo last change
                  </Button>
                )}
              </>
            )}
          </BottomSheetScrollView>
        </BottomSheetModal>
        <OptionalModelPrompt
          modelId={modelPrompt}
          onClose={() => setModelPrompt(null)}
          onContinue={
            modelPrompt === "voice"
              ? () => void record()
              : modelPrompt === "categories"
                ? () => void suggestCategory(note, suggestionVersion.current, true)
                : undefined
          }
        />
      </>
    );
  },
);
