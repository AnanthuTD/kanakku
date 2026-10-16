import { expect, it } from "vitest";
import { Transaction, netSpend, mergeTransactions } from "./model";
import { markDuplicateAlerts, isDuplicateAlert } from "./duplicateAlerts";
const upi: Transaction = {
  id: "upi",
  amount: 1500000,
  merchant: "Sample Store",
  account: "4821",
  bank: "Kerala Gramin Bank",
  at: "2026-09-10T10:00:00.000Z",
  category: "Uncategorized",
  kind: "purchase",
  review: true,
  excluded: false,
  note: "",
  source: "sms",
  reason: "Needs your context",
  reference: "612345678901",
};
const balance: Transaction = {
  ...upi,
  id: "balance",
  merchant: "Unknown merchant",
  at: "2026-09-10T10:01:10.000Z",
  reference: undefined,
  supplementaryAlert: true,
};
it("counts a payment once when the bank also sends a balance alert", () => {
  const rows = markDuplicateAlerts([upi, balance]);
  const twin = rows.find((t) => t.id === "balance")!;
  expect(twin).toMatchObject({
    excluded: true,
    review: false,
    duplicateOf: "upi",
  });
  expect(isDuplicateAlert(twin)).toBe(true);
  expect(netSpend(rows)).toBe(1500000);
  // Either arrival order; the UPI alert itself is untouched.
  expect(
    markDuplicateAlerts([balance, upi]).find((t) => t.id === "upi"),
  ).toEqual(upi);
});
it("keeps both when the evidence is weak or ambiguous", () => {
  const later = { ...balance, at: "2026-09-10T10:06:00.000Z" };
  const otherAccount = { ...balance, account: "9999" };
  const otherAmount = { ...balance, amount: 1500100 };
  const income = { ...balance, kind: "income" as const };
  for (const t of [later, otherAccount, otherAmount, income])
    expect(
      markDuplicateAlerts([upi, t]).find((r) => r.id === "balance"),
    ).toEqual(t);
  // Two UPI payments of the same amount within the window: no guess.
  const second = {
    ...upi,
    id: "upi2",
    reference: "612345678909",
    at: "2026-09-10T10:02:00.000Z",
  };
  expect(
    markDuplicateAlerts([upi, second, balance]).find((r) => r.id === "balance"),
  ).toEqual(balance);
  // An alert carrying its own reference is never treated as a twin.
  const plain = { ...balance, reference: "612345678999" };
  expect(
    markDuplicateAlerts([upi, plain]).find((r) => r.id === "balance"),
  ).toEqual(plain);
});
it("never overrides the user's decision once marked", () => {
  const restored = { ...balance, duplicateOf: "upi", excluded: false };
  expect(
    markDuplicateAlerts([upi, restored]).find((r) => r.id === "balance"),
  ).toEqual(restored);
  // Each UPI alert absorbs at most one balance alert.
  const another = {
    ...balance,
    id: "balance2",
    at: "2026-09-10T10:00:30.000Z",
  };
  const rows = markDuplicateAlerts([upi, balance, another]);
  expect(rows.filter((t) => t.duplicateOf === "upi")).toHaveLength(0);
});

it("does not hide ordinary or user-confirmed same-value purchases", () => {
  for (const patch of [
    { supplementaryAlert: undefined },
    { merchant: "Another shop" },
    { classification: { method: "user" as const, version: "review-v1" } },
    { note: "A separate purchase" },
    { excluded: true },
  ]) {
    const distinct = { ...balance, ...patch };
    expect(markDuplicateAlerts([upi, distinct])).toEqual([upi, distinct]);
  }
  const unrelatedSample = { ...upi, source: "sample" as const };
  expect(markDuplicateAlerts([unrelatedSample, balance])).toEqual([
    unrelatedSample,
    balance,
  ]);
});
it("keeps competing supplementary alerts separate instead of choosing by arrival order", () => {
  const another = { ...balance, id: "balance2" };
  const result = markDuplicateAlerts([upi, balance, another]);
  expect(result.filter((t) => t.duplicateOf)).toHaveLength(0);
});

it("uses bank transaction time when SMS delivery is delayed", () => {
  const primary = { ...upi, transactionAt: "2026-09-10T10:00:00Z" };
  const delayed = {
    ...balance,
    at: "2026-09-10T10:20:00Z",
    transactionAt: "2026-09-10T10:00:30Z",
  };
  expect(markDuplicateAlerts([primary, delayed])[1].duplicateOf).toBe("upi");
  expect(markDuplicateAlerts([delayed, primary])[0].duplicateOf).toBe("upi");
});
it("never falls back to nearby delivery when bank transaction times disagree", () => {
  const primary = { ...upi, transactionAt: "2026-09-10T10:00:00Z" };
  const separate = { ...balance, transactionAt: "2026-09-10T10:01:01Z" };
  expect(markDuplicateAlerts([primary, separate])).toEqual([primary, separate]);
  expect(markDuplicateAlerts([primary, { ...separate, transactionAt: "2026-09-10T10:01:00Z" }])[1].duplicateOf).toBe("upi");
});
it("retains delivery-time fallback for old imported rows and invalid event times", () => {
  for (const transactionAt of [undefined, "invalid"]) {
    expect(markDuplicateAlerts([upi, { ...balance, transactionAt }])[1].duplicateOf).toBe("upi");
  }
});
it("event-time matches still require account, bank, direction, amount and unique pairing", () => {
  const primary = { ...upi, transactionAt: upi.at };
  const twin = { ...balance, transactionAt: upi.at };
  for (const patch of [{ bank: "SBI" }, { account: "1234" }, { amount: 42 }, { kind: "refund" as const }]) {
    const other = { ...twin, ...patch };
    expect(markDuplicateAlerts([primary, other])).toEqual([primary, other]);
  }
  const another = { ...primary, id: "second", reference: "different123" };
  expect(markDuplicateAlerts([primary, another, twin]).some(t => t.duplicateOf)).toBe(false);
});

it("re-import adds missing event time while preserving every user decision", () => {
  const edited = { ...upi, note: "My note", category: "Transport" as const,
    kind: "transfer" as const, excluded: true,
    classification: { method: "user" as const, version: "review-v1" } };
  const parsed = { ...upi, transactionAt: upi.at };
  expect(mergeTransactions([edited], [parsed])).toEqual([{ ...edited, transactionAt: upi.at }]);
  for (const patch of [{ bank: "SBI" }, { account: "1234" }, { amount: 42 }, { transactionAt: "invalid" }])
    expect(mergeTransactions([edited], [{ ...parsed, ...patch }])).toEqual([edited]);
  const enriched = { ...edited, transactionAt: upi.at };
  expect(mergeTransactions([enriched], [{ ...parsed, transactionAt: balance.at }])).toEqual([enriched]);
});

it("never hides a supplementary payment behind an excluded or already-linked target", () => {
  for (const target of [
    { ...upi, excluded: true },
    { ...upi, duplicateOf: "another" },
    { ...upi, excluded: true, duplicateOf: "another" },
  ]) expect(markDuplicateAlerts([target, balance])).toEqual([target, balance]);
});
it("does not apply the KGB supplementary rule to another issuer", () => {
  const primary = { ...upi, bank: "SBI" };
  const second = { ...balance, bank: "SBI" };
  expect(markDuplicateAlerts([primary, second])).toEqual([primary, second]);
});
