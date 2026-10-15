import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Plus,
  ReceiptText,
  Trash2,
} from "lucide-react-native";
import { decimalToPaise, money } from "../domain/model";
import {
  normalizeReceipt,
  RECEIPT_LIMITS,
  type ReceiptDraft,
  type ReceiptItem,
} from "../domain/receipt";
import { useApp } from "../state/AppContext";
import { receiptErrorsAfterItemRemoval } from "../domain/receiptEditing";
import { ReceiptCamera } from "./ReceiptCamera";
import { Text } from "./ui";

const Input = Platform.OS === "web" ? TextInput : BottomSheetTextInput;
export interface ReceiptEditorProps {
  value: ReceiptDraft | undefined;
  onChange: (value: ReceiptDraft | undefined) => void;
  disabled?: boolean;
  /** Closes the camera for good (e.g. voice listening); a journal refresh never does. */
  closeCamera?: boolean;
  paymentAmount: number;
  onUseMerchant?: (merchant: string) => void;
  autoCapture?: boolean;
  onCaptureHandled?: () => void;
  onValidationChange?: (valid: boolean) => void;
}
function Field({
  label,
  value,
  onChange,
  numeric = false,
  disabled,
  error,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  numeric?: boolean;
  disabled?: boolean;
  error?: string;
}) {
  const { colors } = useApp();
  // Like the review note, keep the uncontrolled seed fixed while asynchronous sheet commits arrive.
  const seed = useRef(value);
  return (
    <View style={{ flex: 1, minWidth: numeric ? 90 : 160, gap: 5 }}>
      <Text muted style={{ fontSize: 11 }}>
        {label}
      </Text>
      <Input
        accessibilityLabel={label}
        defaultValue={seed.current}
        onChangeText={onChange}
        editable={!disabled}
        keyboardType={numeric ? "decimal-pad" : "default"}
        maxLength={numeric ? 18 : 120}
        placeholderTextColor={colors.muted}
        style={{
          minHeight: 44,
          borderWidth: 1,
          borderColor: error ? colors.orange : colors.line,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 9,
          color: colors.text,
          fontFamily: "DMSans",
          fontSize: 14,
          backgroundColor: colors.bg,
        }}
      />
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={{ fontSize: 11, color: colors.orange }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
const amountText = (value: number | undefined) =>
  value === undefined ? "" : (value / 100).toFixed(2);
function amountValue(text: string, signed = false): number | undefined | null {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const negative = signed && trimmed.startsWith("-");
  const positive = negative ? trimmed.slice(1) : trimmed;
  const amount = /^(?:0|0\.0{1,2})$/.test(positive)
    ? 0
    : decimalToPaise(positive);
  return amount === null ? null : negative ? -amount : amount;
}
function validDate(text: string) {
  if (!text) return true;
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text
  );
}
export function ReceiptEditor({
  value,
  onChange,
  disabled = false,
  closeCamera = false,
  paymentAmount,
  onUseMerchant,
  autoCapture = false,
  onCaptureHandled,
  onValidationChange,
}: ReceiptEditorProps) {
  const { colors } = useApp();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const itemKeys = useRef<string[]>([]);
  const nextItemKey = useRef(0);
  while (itemKeys.current.length < (value?.items.length ?? 0))
    itemKeys.current.push(`item-${nextItemKey.current++}`);
  const callbacks = useRef({ onValidationChange, onCaptureHandled });
  callbacks.current = { onValidationChange, onCaptureHandled };
  const handledAutoCapture = useRef(false);
  useEffect(() => {
    if (!autoCapture) handledAutoCapture.current = false;
    if (autoCapture && !disabled && !handledAutoCapture.current) {
      handledAutoCapture.current = true;
      setCameraOpen(true);
      callbacks.current.onCaptureHandled?.();
    }
  }, [autoCapture, disabled]);
  // Once closed by the caller, the camera must not reopen without a fresh tap.
  useEffect(() => {
    if (closeCamera) setCameraOpen(false);
  }, [closeCamera]);
  useEffect(() => {
    callbacks.current.onValidationChange?.(
      !Object.values(errors).some(Boolean),
    );
  }, [errors]);
  useEffect(
    () => () => {
      callbacks.current.onValidationChange?.(true);
    },
    [],
  );
  // Keep even a temporarily blank row visible while editing. Normalize only the preview
  // warnings; persistence is separately validated by the parent on explicit Save.
  const bill = value;
  const checked = value && normalizeReceipt(value);
  function invalid(key: string, message: string) {
    setErrors((current) => ({ ...current, [key]: message }));
  }
  function patch(field: keyof ReceiptDraft, next: unknown) {
    if (value) onChange({ ...value, [field]: next });
  }
  function changeAmount(
    key: string,
    text: string,
    setter: (amount: number | undefined) => void,
    signed = false,
  ) {
    const amount = amountValue(text, signed);
    invalid(
      key,
      amount === null
        ? "Use a valid rupee amount with up to two decimals."
        : "",
    );
    setter(amount === null ? undefined : amount);
  }
  function changeItem(index: number, patch: Partial<ReceiptItem>) {
    if (value)
      onChange({
        ...value,
        items: value.items.map((item, i) =>
          i === index ? { ...item, ...patch } : item,
        ),
      });
  }
  function action(
    label: string,
    callback: () => void,
    icon: React.ReactNode,
    danger = false,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={callback}
        style={{
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 13,
          backgroundColor: danger ? colors.card : colors.accentSoft,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {icon}
        <Text
          bold
          style={{ color: danger ? colors.muted : colors.accent, fontSize: 12 }}
        >
          {label}
        </Text>
      </Pressable>
    );
  }
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 20,
        padding: 16,
        gap: 12,
        backgroundColor: colors.card,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <ReceiptText color={colors.accent} size={20} />
        <Text bold>Bill details</Text>
        <Text muted style={{ fontSize: 11 }}>
          OPTIONAL
        </Text>
      </View>
      <Text muted style={{ fontSize: 12 }}>
        Photograph a bill to add item context alongside your voice or typed
        note. Read on this phone; review before saving.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {action(
          value ? "Retake bill photo" : "Scan a bill",
          () => setCameraOpen(true),
          <Camera color={colors.accent} size={16} />,
        )}
        {bill &&
          action(
            expanded ? "Hide bill details" : "Edit bill details",
            () => setExpanded(!expanded),
            expanded ? (
              <ChevronUp color={colors.accent} size={16} />
            ) : (
              <ChevronDown color={colors.accent} size={16} />
            ),
          )}
      </View>
      {bill && (
        <>
          <Text testID="receipt-summary" style={{ fontSize: 13 }}>
            {bill.merchant || "Bill"} · {bill.items.length} items
            {bill.totalPaise !== undefined
              ? ` · ${money(bill.totalPaise, true)}`
              : " · total needs review"}
          </Text>
          <Text muted style={{ fontSize: 11 }}>
            This bill does not change the original payment amount or save a
            second transaction.
          </Text>
          {bill.totalPaise !== undefined &&
            bill.totalPaise !== paymentAmount && (
              <Text accessibilityRole="alert" style={{ color: colors.orange }}>
                Bill total {money(bill.totalPaise, true)} differs from this
                payment {money(paymentAmount, true)}. It may be a split payment;
                check the details.
              </Text>
            )}
          {(checked?.warnings ?? bill.warnings).map((warning, index) => (
            <Text
              key={`${index}:${warning}`}
              accessibilityRole="alert"
              style={{ color: colors.orange, fontSize: 12 }}
            >
              {warning}
            </Text>
          ))}
          {expanded && (
            <View key={revision} style={{ gap: 14 }}>
              <Field
                label="Bill merchant"
                value={bill.merchant}
                onChange={(text) => patch("merchant", text)}
                disabled={disabled}
              />
              {!!bill.merchant &&
                onUseMerchant &&
                action(
                  "Use bill merchant for this payment",
                  () => onUseMerchant(bill.merchant),
                  <ReceiptText color={colors.accent} size={15} />,
                )}
              <Field
                label="Bill date (YYYY-MM-DD)"
                value={bill.date ?? ""}
                onChange={(text) => {
                  invalid(
                    "date",
                    validDate(text.trim())
                      ? ""
                      : "Enter an actual date as YYYY-MM-DD.",
                  );
                  patch("date", text.trim() || undefined);
                }}
                disabled={disabled}
                error={errors.date}
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {(
                  [
                    ["totalPaise", "Bill total (₹)"],
                    ["subtotalPaise", "Bill subtotal (₹)"],
                    ["taxPaise", "Bill tax (₹)"],
                    ["discountPaise", "Bill discount (₹)"],
                    ["roundingPaise", "Bill rounding (₹)"],
                  ] as const
                ).map(([field, label]) => (
                  <Field
                    key={field}
                    label={label}
                    value={amountText(bill[field])}
                    numeric
                    disabled={disabled}
                    error={errors[field]}
                    onChange={(text) =>
                      changeAmount(
                        field,
                        text,
                        (amount) => patch(field, amount),
                        field === "roundingPaise",
                      )
                    }
                  />
                ))}
              </View>
              <Text bold>Items</Text>
              {bill.items.map((item, index) => (
                <View
                  key={itemKeys.current[index]}
                  style={{
                    gap: 10,
                    borderTopWidth: 1,
                    borderColor: colors.line,
                    paddingTop: 12,
                  }}
                >
                  <Field
                    label={`Bill item ${index + 1} description`}
                    value={item.name}
                    disabled={disabled}
                    error={errors[`name${index}`]}
                    onChange={(text) => {
                      invalid(
                        `name${index}`,
                        text.trim()
                          ? ""
                          : "Give this item a description, or remove it.",
                      );
                      changeItem(index, { name: text });
                    }}
                  />
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    <Field
                      label={`Bill item ${index + 1} quantity`}
                      value={
                        item.quantity === undefined ? "" : String(item.quantity)
                      }
                      numeric
                      disabled={disabled}
                      error={errors[`qty${index}`]}
                      onChange={(text) => {
                        const quantity = text.trim() ? Number(text) : undefined;
                        const valid =
                          quantity === undefined ||
                          (/^\d+(?:\.\d{1,3})?$/.test(text) &&
                            quantity > 0 &&
                            quantity <= 10000);
                        invalid(
                          `qty${index}`,
                          valid
                            ? ""
                            : "Use a quantity above zero, up to three decimals.",
                        );
                        changeItem(index, {
                          quantity: valid ? quantity : undefined,
                        });
                      }}
                    />
                    <Field
                      label={`Bill item ${index + 1} unit price (₹)`}
                      value={amountText(item.unitPricePaise)}
                      numeric
                      disabled={disabled}
                      error={errors[`price${index}`]}
                      onChange={(text) =>
                        changeAmount(`price${index}`, text, (amount) =>
                          changeItem(index, { unitPricePaise: amount }),
                        )
                      }
                    />
                    <Field
                      label={`Bill item ${index + 1} amount (₹)`}
                      value={amountText(item.amountPaise)}
                      numeric
                      disabled={disabled}
                      error={errors[`amount${index}`]}
                      onChange={(text) =>
                        changeAmount(`amount${index}`, text, (amount) =>
                          changeItem(index, { amountPaise: amount }),
                        )
                      }
                    />
                  </View>
                  {action(
                    `Remove bill item ${index + 1}`,
                    () => {
                      if (value)
                        onChange({
                          ...value,
                          items: value.items.filter((_, i) => index !== i),
                        });
                      itemKeys.current.splice(index, 1);
                      setErrors((current) =>
                        receiptErrorsAfterItemRemoval(current, index),
                      );
                    },
                    <Trash2 color={colors.muted} size={15} />,
                    true,
                  )}
                </View>
              ))}
              {bill.items.length < RECEIPT_LIMITS.items &&
                action(
                  "Add bill item",
                  () => {
                    if (value)
                      onChange({
                        ...value,
                        items: [...value.items, { name: "" }],
                      });
                    invalid(
                      `name${bill.items.length}`,
                      "Give this item a description, or remove it.",
                    );
                  },
                  <Plus color={colors.accent} size={15} />,
                )}
              {action(
                "Remove bill details",
                () => {
                  onChange(undefined);
                  setErrors({});
                  setExpanded(false);
                  setRevision((v) => v + 1);
                },
                <Trash2 color={colors.muted} size={15} />,
                true,
              )}
            </View>
          )}
        </>
      )}
      <ReceiptCamera
        visible={cameraOpen && !closeCamera}
        onClose={() => setCameraOpen(false)}
        onRead={(draft) => {
          onChange(draft);
          setErrors({});
          setExpanded(true);
          setRevision((v) => v + 1);
        }}
      />
    </View>
  );
}
