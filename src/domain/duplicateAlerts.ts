import { Transaction } from "./model";

/**
 * Banks can send two alerts for one payment, e.g. Kerala Gramin Bank's balance alert
 * ("Bal after txn", no reference) beside its UPI alert. Only a reference-less alert is
 * ever linked to a referenced one; two referenced alerts with different references are
 * distinct payments, and two reference-less alerts give no evidence either way.
 */
const WINDOW_MS = 5 * 60_000;
const TRANSACTION_WINDOW_MS = 60_000;

/** Prefer bank-stated event times; never override conflicting event times with delivery proximity. */
function samePaymentTime(a: Transaction, b: Transaction): boolean {
  const eventA = Date.parse(a.transactionAt ?? "");
  const eventB = Date.parse(b.transactionAt ?? "");
  if (Number.isFinite(eventA) && Number.isFinite(eventB))
    return Math.abs(eventA - eventB) <= TRANSACTION_WINDOW_MS;
  return Math.abs(Date.parse(a.at) - Date.parse(b.at)) <= WINDOW_MS;
}

export const isDuplicateAlert = (t: Transaction) =>
  !!t.duplicateOf && t.excluded;

/**
 * Links only parser-proven supplementary balance alerts to exactly one referenced alert with the
 * same bank, account, direction and amount within one minute of bank-stated transaction
 * times, or five minutes of SMS receipt when either event time is unavailable. The row is kept, excluded
 * and linked; ambiguous or weaker matches stay as separate payments. User-confirmed rows and rows already linked
 * are never revisited, so a user who restores one keeps it.
 */
export function markDuplicateAlerts(rows: Transaction[]): Transaction[] {
  const claimed = new Set(
    rows.filter((t) => t.duplicateOf).map((t) => t.duplicateOf!),
  );
  let changed = false;
  const result = rows.map((t) => {
    if (
      t.source !== "sms" ||
      !t.supplementaryAlert ||
      t.bank !== "Kerala Gramin Bank" ||
      t.reference ||
      t.duplicateOf ||
      t.classification?.method === "user" ||
      t.note ||
      t.receipt ||
      t.excluded ||
      (t.originalMerchant || t.merchant) !== "Unknown merchant"
    )
      return t;
    const matches = rows.filter(
      (o) =>
        o.id !== t.id &&
        o.source === "sms" &&
        !!o.reference &&
        !o.supplementaryAlert &&
        !o.excluded &&
        !o.duplicateOf &&
        !!o.account &&
        o.bank === t.bank &&
        o.account === t.account &&
        o.kind === t.kind &&
        o.amount === t.amount &&
        samePaymentTime(o, t),
    );
    if (matches.length !== 1 || claimed.has(matches[0].id)) return t;
    const target = matches[0];
    const competing = rows.filter(
      (o) =>
        o.source === "sms" &&
        o.supplementaryAlert &&
        !o.reference &&
        !o.duplicateOf &&
        !o.excluded &&
        o.classification?.method !== "user" &&
        !o.note &&
        !o.receipt &&
        (o.originalMerchant || o.merchant) === "Unknown merchant" &&
        o.bank === target.bank &&
        o.account === target.account &&
        o.kind === target.kind &&
        o.amount === target.amount &&
        samePaymentTime(o, target),
    );
    if (competing.length !== 1) return t;
    claimed.add(matches[0].id);
    changed = true;
    return {
      ...t,
      duplicateOf: matches[0].id,
      excluded: true,
      review: false,
      reason: "Same payment as another bank alert",
    };
  });
  return changed ? result : rows;
}
