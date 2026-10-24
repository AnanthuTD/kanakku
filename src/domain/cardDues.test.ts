import { describe, expect, it } from "vitest";
import {
  cardDueStatus,
  indiaToday,
  upsertCardDues,
  validCardDue,
  visibleCardDues,
  type CardDue,
} from "./cardDues";
import type { Transaction } from "./model";

const due: CardDue = {
  id: "s1",
  bank: "Axis",
  account: "8046",
  totalDue: 432150,
  minimumDue: 22000,
  dueDate: "2026-11-02",
  at: "2026-10-14T05:00:00.000Z",
};
const repayment = (amount: number, at = "2026-10-20T05:00:00.000Z", extra: Partial<Transaction> = {}): Transaction => ({
  id: `p${amount}${at}`,
  amount,
  merchant: "Unknown merchant",
  account: "8046",
  bank: "Axis",
  at,
  category: "Uncategorized",
  kind: "card_payment",
  review: false,
  excluded: false,
  note: "",
  source: "sms",
  reason: "Local merchant match",
  ...extra,
});

describe("card dues from statement alerts", () => {
  it("keeps only the latest statement per card and ignores replays", () => {
    const next = { ...due, id: "s2", dueDate: "2026-12-02", at: "2026-11-14T05:00:00.000Z" };
    const other = { ...due, id: "s3", account: "1111" };
    expect(upsertCardDues([due], [due, next, other]).map((d) => d.id)).toEqual(["s3", "s2"]);
    expect(upsertCardDues([next], [due]).map((d) => d.id)).toEqual(["s2"]);
  });

  it("counts only this card's repayments made after the statement", () => {
    const status = cardDueStatus(
      due,
      [
        repayment(100000),
        repayment(50000, "2026-10-01T05:00:00.000Z"),
        repayment(70000, "2026-10-21T05:00:00.000Z", { account: "9999" }),
        repayment(70000, "2026-10-21T05:00:00.000Z", { excluded: true }),
        repayment(70000, "2026-10-21T05:00:00.000Z", { kind: "purchase" }),
      ],
      "2026-10-24",
    );
    expect(status).toMatchObject({ state: "partly paid", paid: 100000, remaining: 332150, daysLeft: 9 });
  });

  it("moves through due, overdue and settled", () => {
    expect(cardDueStatus(due, [], "2026-11-02").state).toBe("due");
    expect(cardDueStatus(due, [], "2026-11-03")).toMatchObject({ state: "overdue", daysLeft: -1 });
    expect(cardDueStatus(due, [repayment(432150)], "2026-11-03").state).toBe("settled");
    expect(cardDueStatus({ ...due, settledByUser: true }, [], "2026-11-03").state).toBe("settled");
    expect(cardDueStatus({ ...due, totalDue: 0 }, [], "2026-10-24").state).toBe("settled");
  });

  it("shows unsettled bills and recently settled ones, soonest first", () => {
    const later = { ...due, id: "s4", account: "2222", dueDate: "2026-11-20" };
    const oldSettled = { ...due, id: "s5", account: "3333", dueDate: "2026-10-01", settledByUser: true };
    expect(visibleCardDues([later, due, oldSettled], [], "2026-10-24").map((s) => s.due.id)).toEqual(["s1", "s4"]);
  });

  it("validates stored records and uses the Indian calendar day", () => {
    expect(validCardDue(due)).toBe(true);
    expect(validCardDue({ ...due, totalDue: -1 })).toBe(false);
    expect(validCardDue({ ...due, dueDate: "2/11/26" })).toBe(false);
    expect(indiaToday(new Date("2026-10-23T19:00:00.000Z"))).toBe("2026-10-24");
  });
});
