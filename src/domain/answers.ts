import { CATEGORIES, Category, Transaction } from "./model";

/** A voice answer given to the floating companion, sealed natively until the next unlock. */
export interface CompanionAnswer {
  id: string;
  note: string;
  category?: string;
  answeredAt: number;
}

// Answers for payments that never reach the ledger (e.g. after a reset) are dropped.
const STALE_MS = 30 * 24 * 60 * 60 * 1000;

export function parseAnswers(values: string[]): CompanionAnswer[] {
  return values.flatMap((value) => {
    try {
      const a = JSON.parse(value);
      return typeof a?.id === "string" && typeof a?.note === "string"
        ? [
            {
              id: a.id,
              note: a.note.slice(0, 500),
              category: typeof a.category === "string" ? a.category : undefined,
              answeredAt: Number(a.answeredAt) || 0,
            },
          ]
        : [];
    } catch {
      return [];
    }
  });
}

/**
 * Applies answers as the user's own correction: the note always, the category only
 * when it is a known one (then the payment leaves the review queue). Returns the ids
 * that can be acknowledged: applied or stale.
 */
export function applyAnswers(
  transactions: Transaction[],
  answers: CompanionAnswer[],
  now = Date.now(),
): { transactions: Transaction[]; done: string[] } {
  const byId = new Map(answers.map((a) => [a.id, a]));
  const done: string[] = [];
  const next = transactions.map((t) => {
    const answer = byId.get(t.id);
    if (!answer) return t;
    done.push(t.id);
    const category = (CATEGORIES as readonly string[]).includes(
      answer.category ?? "",
    )
      ? (answer.category as Category)
      : undefined;
    return {
      ...t,
      note: answer.note,
      ...(category
        ? {
            category,
            review: false,
            reason: "Confirmed by you",
            classification: {
              method: "user" as const,
              version: "companion-v1",
            },
          }
        : {}),
    };
  });
  for (const a of answers)
    if (!done.includes(a.id) && now - a.answeredAt > STALE_MS) done.push(a.id);
  return { transactions: next, done };
}
