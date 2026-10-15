import { expect, it } from "vitest";
import { applyAnswers, parseAnswers } from "./answers";
import type { Transaction } from "./model";

const payment = (
  id: string,
  patch: Partial<Transaction> = {},
): Transaction => ({
  id,
  amount: 50_000,
  merchant: "Rahul S",
  account: "2190",
  bank: "Kiwi",
  at: "2026-10-15T09:00:00+05:30",
  category: "Uncategorized",
  kind: "purchase",
  review: true,
  excluded: false,
  note: "",
  source: "sms",
  reason: "Needs your context",
  ...patch,
});

it("applies a companion answer as the user's correction without touching amounts", () => {
  const [answer] = parseAnswers([
    JSON.stringify({
      id: "a",
      note: "Auto to office.",
      category: "Transport",
      answeredAt: 1,
    }),
  ]);
  const { transactions, done } = applyAnswers(
    [payment("a"), payment("b")],
    [answer],
    2,
  );
  expect(transactions[0]).toMatchObject({
    note: "Auto to office.",
    category: "Transport",
    review: false,
    reason: "Confirmed by you",
    amount: 50_000,
    classification: { method: "user", version: "companion-v1" },
  });
  expect(transactions[1]).toEqual(payment("b"));
  expect(done).toEqual(["a"]);
});

it("keeps the payment in review when no known category was suggested", () => {
  const { transactions } = applyAnswers(
    [payment("a")],
    parseAnswers([
      JSON.stringify({
        id: "a",
        note: "For the party.",
        category: "Party stuff",
        answeredAt: 1,
      }),
    ]),
  );
  expect(transactions[0]).toMatchObject({
    note: "For the party.",
    category: "Uncategorized",
    review: true,
  });
});

it("waits for payments not yet in the ledger and drops month-old leftovers", () => {
  const answers = parseAnswers([
    JSON.stringify({
      id: "later",
      note: "x",
      answeredAt: 30 * 24 * 60 * 60 * 1000,
    }),
    JSON.stringify({ id: "gone", note: "y", answeredAt: 0 }),
    "not json",
  ]);
  const { done } = applyAnswers([], answers, 31 * 24 * 60 * 60 * 1000);
  expect(done).toEqual(["gone"]);
});
