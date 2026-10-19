import { Transaction, merchantKey } from "./model";
import { dateKey } from "./ledger";

export type RecurringDecision = "confirmed" | "ignored";
export type RecurringCadence = "weekly" | "monthly" | "yearly";
export interface RecurringPayment {
  key: string;
  merchant: string;
  bank: string;
  account: string;
  type: "subscription" | "bill" | "recurring";
  cadence: RecurringCadence;
  confidence: "likely" | "possible";
  evidence: string[];
  transactionIds: string[];
  lastPaidAt: string;
  estimatedNextAt: string;
  status: "expected" | "no_recent_charge";
  usualAmount: number;
  minAmount: number;
  maxAmount: number;
}

// These identities only help label a repeated pattern. A name alone is never
// evidence of enrolment, a mandate, a due date, or an active subscription.
const subscriptions =
  /\b(netflix|spotify|youtube premium|amazon prime|prime video|hotstar|apple music|apple tv|icloud|google one|adobe|microsoft 365|canva|chatgpt)\b/i;
const bills =
  /\b(rent|electricity|broadband|internet|airtel|jio|insurance|water bill|maintenance|househelp|maid)\b/i;
const personal =
  /(?:@|\b(upi|person|friend|family)\b|^[\p{L}]+\s[\p{L}]\.?$)/iu;
const calendarDay = (value: string) => new Date(`${dateKey(value)}T12:00:00`);
const dayOrdinal = (d: Date) =>
  Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
const lastDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const isMonthEnd = (d: Date) => d.getDate() >= lastDay(d) - 2;
const sameBillingDay = (a: Date, b: Date) =>
  Math.abs(a.getDate() - b.getDate()) <= 4 || (isMonthEnd(a) && isMonthEnd(b));

export function recurringKey(
  t: Pick<Transaction, "merchant" | "bank" | "account">,
) {
  return JSON.stringify([
    merchantKey(t.merchant),
    merchantKey(t.bank),
    t.account.trim(),
  ]);
}

function cadenceFor(
  dates: Date[],
): { cadence: RecurringCadence; skipped: boolean } | null {
  const gaps = dates.slice(1).map((d, i) => ({
    days: dayOrdinal(d) - dayOrdinal(dates[i]),
    months:
      (d.getFullYear() - dates[i].getFullYear()) * 12 +
      d.getMonth() -
      dates[i].getMonth(),
    years: d.getFullYear() - dates[i].getFullYear(),
    aligned: sameBillingDay(dates[i], d),
  }));
  if (dates.length >= 4 && gaps.every((g) => g.days >= 6 && g.days <= 8))
    return { cadence: "weekly", skipped: false };
  if (
    dates.length >= 3 &&
    gaps.every((g) => g.aligned && (g.months === 1 || g.months === 2)) &&
    gaps.filter((g) => g.months === 1).length / gaps.length >= 0.75
  )
    return { cadence: "monthly", skipped: gaps.some((g) => g.months === 2) };
  if (
    dates.length >= 3 &&
    gaps.every(
      (g) => g.years === 1 && g.days >= 350 && g.days <= 380 && g.aligned,
    )
  )
    return { cadence: "yearly", skipped: false };
  return null;
}

function nextDate(last: Date, cadence: RecurringCadence, dates: Date[]) {
  if (cadence === "weekly") {
    const next = new Date(last);
    next.setDate(last.getDate() + 7);
    return next;
  }
  const month = last.getMonth() + (cadence === "monthly" ? 1 : 12);
  const next = new Date(last.getFullYear(), month, 1, 12);
  const billingDay = dates.every((d) => d.getDate() === lastDay(d))
    ? lastDay(next)
    : median(dates.map((d) => d.getDate()));
  next.setDate(Math.min(billingDay, lastDay(next)));
  return next;
}

/** Deterministic suggestions over recorded purchases, never a financial forecast. */
export function detectRecurringPayments(
  transactions: Transaction[],
  now = new Date(),
): RecurringPayment[] {
  const groups = new Map<string, Transaction[]>();
  const ids = new Set<string>();
  const references = new Set<string>();
  for (const t of transactions) {
    if (
      ids.has(t.id) ||
      t.excluded ||
      (t.currency && t.currency !== "INR") ||
      !!t.emailMatchCandidates?.length ||
      !Number.isSafeInteger(t.amount) ||
      t.amount <= 0 ||
      !Number.isFinite(new Date(t.at).getTime()) ||
      new Date(t.at) > now ||
      !["purchase", "refund"].includes(t.kind)
    )
      continue;
    ids.add(t.id);
    const key = recurringKey(t);
    // Importing the same bank reference twice must not strengthen a pattern.
    const reference = t.reference?.trim()
      ? JSON.stringify([
          merchantKey(t.bank),
          t.account,
          t.kind,
          t.reference.trim(),
          // Several refund fragments may point at one purchase reference.
          // Only identical refund events should be deduplicated here.
          ...(t.kind === "refund" ? [t.amount, new Date(t.at).getTime()] : []),
        ])
      : null;
    if (reference && references.has(reference)) continue;
    if (reference) references.add(reference);
    const group = groups.get(key) || [];
    group.push(t);
    groups.set(key, group);
  }
  const result: RecurringPayment[] = [];
  for (const [key, group] of groups) {
    const refunds = group.filter((t) => t.kind === "refund");
    const usedRefunds = new Set<string>();
    let partialRefund = false;
    const purchases = group
      .filter(
        (t) =>
          t.kind === "purchase" && !t.review && t.category !== "Uncategorized",
      )
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const charges: Transaction[] = [];
    // Match each refund to one preceding charge, favouring an explicit reference.
    for (const charge of [...purchases].reverse()) {
      // Separate partial refunds can fully reverse a charge, but only combine
      // them when the bank explicitly links every fragment to that charge.
      // Amount/time proximity alone is insufficient for aggregation.
      const linkedRefunds = charge.reference?.trim()
        ? refunds.filter(
            (r) =>
              !usedRefunds.has(r.id) &&
              r.reference?.trim() === charge.reference?.trim() &&
              new Date(r.at) >= new Date(charge.at),
          )
        : [];
      if (
        linkedRefunds.length > 1 &&
        linkedRefunds.reduce((sum, r) => sum + r.amount, 0) === charge.amount
      ) {
        linkedRefunds.forEach((r) => usedRefunds.add(r.id));
        continue;
      }
      const exactRefund = refunds.find(
        (r) =>
          !usedRefunds.has(r.id) &&
          !!r.reference &&
          r.reference.trim() === charge.reference?.trim() &&
          r.amount === charge.amount &&
          new Date(r.at) >= new Date(charge.at),
      );
      const refund =
        exactRefund ||
        refunds.find(
          (r) =>
            !usedRefunds.has(r.id) &&
            r.amount === charge.amount &&
            new Date(r.at) >= new Date(charge.at) &&
            // An explicit mismatch is evidence against pairing, even when
            // amount and time happen to match.
            (!(r.reference?.trim() && charge.reference?.trim()) ||
              r.reference?.trim() === charge.reference?.trim()) &&
            ((!!r.reference?.trim() &&
              r.reference?.trim() === charge.reference?.trim()) ||
              new Date(r.at).getTime() - new Date(charge.at).getTime() <=
                14 * 86_400_000),
        );
      if (refund) {
        usedRefunds.add(refund.id);
        continue;
      }
      const linkedAmount = linkedRefunds.reduce((sum, r) => sum + r.amount, 0);
      if (linkedAmount > 0 && linkedAmount < charge.amount)
        partialRefund = true;
      charges.push(charge);
    }
    charges.reverse();
    if (charges.length < 3) continue;
    const latest = charges[charges.length - 1];
    const type = subscriptions.test(latest.merchant)
      ? "subscription"
      : bills.test(`${latest.merchant} ${latest.note}`)
        ? "bill"
        : "recurring";
    // An unidentified payee or a payment to a person needs context, not a
    // subscription label. A user-labelled rent/househelp bill remains eligible.
    if (
      type === "recurring" &&
      (personal.test(latest.merchant) ||
        ["Home", "Uncategorized"].includes(latest.category))
    )
      continue;
    const dates = charges.map((t) => calendarDay(t.at));
    const pattern = cadenceFor(dates);
    if (!pattern) continue;
    const amounts = charges.map((t) => t.amount);
    const usualAmount = median(amounts);
    const minAmount = Math.min(...amounts),
      maxAmount = Math.max(...amounts);
    if (maxAmount - minAmount > usualAmount * 0.2) continue;
    const next = nextDate(dates[dates.length - 1], pattern.cadence, dates);
    const grace =
      pattern.cadence === "weekly" ? 3 : pattern.cadence === "monthly" ? 7 : 14;
    const stale = dayOrdinal(now) > dayOrdinal(next) + grace;
    const varied = minAmount !== maxAmount;
    const evidence = [
      `${charges.length} recorded purchases with ${pattern.cadence} spacing on this account.`,
      varied
        ? "Amounts vary by no more than 20% of the median charge."
        : "The recorded charge amount is unchanged.",
      ...(pattern.skipped
        ? ["One or more cycles are missing from captured history."]
        : []),
      ...(usedRefunds.size
        ? ["Matched fully refunded charges were left out of this pattern."]
        : []),
      ...(partialRefund
        ? [
            "A linked partial refund is recorded; amounts show original charges, not net spending.",
          ]
        : []),
      ...(stale
        ? [
            "No recent charge matches the next expected cycle; this may have stopped or an SMS may be missing.",
          ]
        : []),
    ];
    result.push({
      key,
      merchant: latest.merchant,
      bank: latest.bank,
      account: latest.account,
      type,
      cadence: pattern.cadence,
      confidence:
        varied ||
        pattern.skipped ||
        stale ||
        partialRefund ||
        type === "recurring"
          ? "possible"
          : "likely",
      evidence,
      transactionIds: charges.map((t) => t.id),
      lastPaidAt: dateKey(latest.at),
      estimatedNextAt: dateKey(next),
      status: stale ? "no_recent_charge" : "expected",
      usualAmount,
      minAmount,
      maxAmount,
    });
  }
  return result.sort(
    (a, b) =>
      a.estimatedNextAt.localeCompare(b.estimatedNextAt) ||
      a.key.localeCompare(b.key),
  );
}
