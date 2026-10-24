import type { Transaction } from "./model";

/** The latest statement read from a card's SMS: what was billed and when it is due. */
export interface CardDue {
  id: string;
  bank: string;
  account: string;
  /** Integer paise. Zero means the card carried a credit balance. */
  totalDue: number;
  minimumDue?: number;
  /** ISO calendar date (yyyy-MM-dd) printed by the bank. */
  dueDate: string;
  /** When the statement alert arrived. */
  at: string;
  /** The user said this bill is settled, e.g. paid from an account Kanakku cannot see. */
  settledByUser?: boolean;
}

export type CardDueState = "settled" | "partly paid" | "due" | "overdue";
export interface CardDueStatus {
  due: CardDue;
  state: CardDueState;
  /** Card repayments seen for this card since the statement arrived. */
  paid: number;
  remaining: number;
  daysLeft: number;
  payments: Transaction[];
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
export function validCardDue(value: unknown): value is CardDue {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  const text = (v: unknown, max = 80) =>
    typeof v === "string" && v.length > 0 && v.length <= max;
  return (
    text(d.id, 128) &&
    text(d.bank) &&
    text(d.account, 16) &&
    Number.isSafeInteger(d.totalDue) &&
    (d.totalDue as number) >= 0 &&
    (d.minimumDue === undefined ||
      (Number.isSafeInteger(d.minimumDue) && (d.minimumDue as number) >= 0)) &&
    typeof d.dueDate === "string" &&
    isoDate.test(d.dueDate) &&
    text(d.at) &&
    Number.isFinite(Date.parse(d.at as string)) &&
    (d.settledByUser === undefined || typeof d.settledByUser === "boolean")
  );
}

const cardKey = (d: Pick<CardDue, "bank" | "account">) =>
  `${d.bank.toLocaleLowerCase()}|${d.account}`;

/** Keeps one statement per card: the one with the latest due date. Replays are no-ops. */
export function upsertCardDues(current: CardDue[], incoming: CardDue[]): CardDue[] {
  const byCard = new Map(current.map((d) => [cardKey(d), d]));
  for (const d of incoming) {
    const existing = byCard.get(cardKey(d));
    if (!existing || d.dueDate > existing.dueDate) byCard.set(cardKey(d), d);
  }
  return [...byCard.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
/** Today's calendar date in India, where the bank's due dates are written. */
export const indiaToday = (now: Date) =>
  new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);

export function cardDueStatus(due: CardDue, transactions: Transaction[], today: string): CardDueStatus {
  const payments = transactions.filter(
    (t) =>
      t.kind === "card_payment" &&
      !t.excluded &&
      t.bank.toLocaleLowerCase() === due.bank.toLocaleLowerCase() &&
      t.account === due.account &&
      t.at >= due.at,
  );
  const paid = payments.reduce((sum, t) => sum + t.amount, 0);
  const remaining = Math.max(0, due.totalDue - paid);
  const daysLeft = dayNumber(due.dueDate) - dayNumber(today);
  const state: CardDueState =
    due.settledByUser || remaining === 0
      ? "settled"
      : daysLeft < 0
        ? "overdue"
        : paid > 0
          ? "partly paid"
          : "due";
  return { due, state, paid, remaining, daysLeft, payments };
}

/**
 * Bills worth showing: unsettled ones, plus anything settled whose due date is within the
 * last week (so the user sees it was handled). Older statements are history, not reminders.
 */
export function visibleCardDues(dues: CardDue[], transactions: Transaction[], today: string): CardDueStatus[] {
  return dues
    .map((d) => cardDueStatus(d, transactions, today))
    .filter((s) => (s.state === "settled" ? s.daysLeft >= -7 : s.daysLeft >= -45))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
