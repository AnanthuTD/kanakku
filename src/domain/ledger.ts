import { isDuplicateAlert } from "./duplicateAlerts";
import {
  Category,
  Kind,
  Transaction,
  awaitingContext,
  merchantKey,
  netSpend,
} from "./model";

export interface DateRange {
  start: string | null;
  end: string | null;
  label: string;
}
export interface LedgerFilter {
  range?: DateRange;
  category?: Category | null;
  account?: string | null;
  kind?: Kind | null;
  reviewOnly?: boolean;
  awaitingContextOnly?: boolean;
  query?: string;
  merchant?: string | null;
  source?: "sms" | "email" | null;
}
export const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "purchase", label: "Purchases" },
  { value: "refund", label: "Refunds" },
  { value: "transfer", label: "Transfers" },
  { value: "card_payment", label: "Card repayments" },
  { value: "income", label: "Income" },
  { value: "cash", label: "Cash withdrawals" },
  { value: "lent", label: "Money lent" },
];
export function dateKey(value: string | Date) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00`);
  return !Number.isNaN(d.getTime()) && dateKey(d) === value;
}
export function monthRange(month: string): DateRange {
  const [year, m] = month.split("-").map(Number);
  const start = new Date(year, m - 1, 1);
  return {
    start: dateKey(start),
    end: dateKey(new Date(year, m, 0)),
    label: start.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    }),
  };
}
export function rangeLabel(range: DateRange) {
  if (!range.start && !range.end) return "All captured history";
  const format = (day: string | null) =>
    day
      ? new Date(`${day}T12:00:00`).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "Any date";
  return `${format(range.start)} – ${format(range.end)}`;
}
export function filterLedger(rows: Transaction[], f: LedgerFilter) {
  const query = f.query?.trim().toLowerCase();
  return rows
    .filter((t) => {
      // A bank's second alert for one payment is kept in data but never listed twice.
      if (isDuplicateAlert(t)) return false;
      const day = dateKey(t.at);
      return (
        (!f.range?.start || day >= f.range.start) &&
        (!f.range?.end || day <= f.range.end) &&
        (!f.category || t.category === f.category) &&
        (!f.account || `${t.bank} ${t.account}` === f.account) &&
        (!f.kind || t.kind === f.kind) &&
        (!f.reviewOnly || t.review) &&
        (!f.awaitingContextOnly || awaitingContext(t)) &&
        (!f.merchant || merchantKey(t.merchant) === merchantKey(f.merchant)) &&
        (!f.source || t.source === f.source) &&
        (!query ||
          `${t.merchant} ${t.note} ${t.bank} ${t.account}`
            .toLowerCase()
            .includes(query))
      );
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}
export function merchantTotals(rows: Transaction[]) {
  const groups = new Map<string, Transaction[]>();
  rows.forEach((t) => {
    const key = merchantKey(t.merchant);
    const group = groups.get(key);
    if (group) group.push(t);
    else groups.set(key, [t]);
  });
  return [...groups.values()]
    .map((group) => ({
      merchant: group[0].merchant,
      amount: netSpend(group),
      count: group.length,
    }))
    .filter((t) => t.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
}
/** Equal calendar-day spans; never compare a partial current month with a full prior month. */
export function equivalentPeriods(month: string, now = new Date()) {
  const [y, m] = month.split("-").map(Number);
  const current = monthRange(month);
  const isCurrent = y === now.getFullYear() && m === now.getMonth() + 1;
  const previous = monthRange(
    `${new Date(y, m - 2, 1).getFullYear()}-${String(new Date(y, m - 2, 1).getMonth() + 1).padStart(2, "0")}`,
  );
  const lastCurrent = new Date(y, m, 0).getDate();
  const lastPrevious = new Date(y, m - 1, 0).getDate();
  const days = Math.min(
    isCurrent ? now.getDate() - 1 : lastCurrent,
    lastPrevious,
  );
  return {
    current: {
      ...current,
      end: dateKey(new Date(y, m - 1, Math.max(1, days))),
    },
    previous: {
      ...previous,
      end: dateKey(new Date(y, m - 2, Math.max(1, days))),
    },
    days,
  };
}
export type SpendingQuestion =
  | { ok: true; filter: LedgerFilter; interpretation: string }
  | { ok: false; message: string };
export function interpretQuestion(
  input: string,
  now = new Date(),
): SpendingQuestion {
  const text = input
    .toLowerCase()
    .trim()
    .replace(/[?!.]+$/g, "")
    .replace(/\s+(?:over|in) the\s+/g, " ")
    .replace(/\s+/g, " ");
  const match = text.match(
    /^(?:(?:how much did i spend on|how much did i spend|how much went on|show|spending on)\s+)?(.+?)\s+(this month|last month|this year|last year|today|last 7 days|last (?:\d+|one|two|three|four|six|twelve) months|all time)$/,
  );
  if (!match)
    return {
      ok: false,
      message:
        "Try “food last 2 months”, “total this month”, or “at Swiggy last month”. Choose a date range in Activity for other periods.",
    };
  const [, subject, period] = match;
  let range: DateRange;
  if (period === "all time")
    range = { start: null, end: null, label: "All captured history" };
  else if (period === "today")
    range = { start: dateKey(now), end: dateKey(now), label: "Today" };
  else if (period === "this month" || period === "last month")
    range = monthRange(
      `${new Date(now.getFullYear(), now.getMonth() - (period === "last month" ? 1 : 0), 1).getFullYear()}-${String(new Date(now.getFullYear(), now.getMonth() - (period === "last month" ? 1 : 0), 1).getMonth() + 1).padStart(2, "0")}`,
    );
  else if (period === "this year" || period === "last year") {
    const y = now.getFullYear() - (period === "last year" ? 1 : 0);
    range = {
      start: `${y}-01-01`,
      end: period === "this year" ? dateKey(now) : `${y}-12-31`,
      label: period,
    };
  } else {
    const d = new Date(now);
    if (period === "last 7 days") d.setDate(d.getDate() - 6);
    else {
      const token = period.split(" ")[1];
      const n =
        (
          { one: 1, two: 2, three: 3, four: 4, six: 6, twelve: 12 } as Record<
            string,
            number
          >
        )[token] ?? Number(token);
      if (!Number.isInteger(n) || n < 1 || n > 120)
        return {
          ok: false,
          message:
            "Choose between 1 and 120 months, or use a custom date range.",
        };
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() - n);
      d.setDate(
        Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()),
      );
    }
    range = { start: dateKey(d), end: dateKey(now), label: period };
  }
  const categories: Record<string, Category> = {
    food: "Food & dining",
    dining: "Food & dining",
    "food & dining": "Food & dining",
    groceries: "Groceries",
    transport: "Transport",
    shopping: "Shopping",
    bills: "Bills & utilities",
    utilities: "Bills & utilities",
    entertainment: "Entertainment",
    health: "Health",
    home: "Home",
    uncategorized: "Uncategorized",
  };
  if (categories[subject])
    return {
      ok: true,
      filter: { range, category: categories[subject] },
      interpretation: `${categories[subject]} · ${rangeLabel(range)} · purchases less refunds`,
    };
  if (["total", "everything", "all spending", "spending"].includes(subject))
    return {
      ok: true,
      filter: { range },
      interpretation: `Net spending · ${rangeLabel(range)}`,
    };
  if (subject.startsWith("at ") && subject.length > 3)
    return {
      ok: true,
      filter: { range, merchant: subject.slice(3) },
      interpretation: `Merchant “${subject.slice(3)}” · ${rangeLabel(range)}`,
    };
  return {
    ok: false,
    message:
      "Choose one category, “total”, or a merchant using “at Swiggy”. Mixed or unfamiliar categories need clarification.",
  };
}
