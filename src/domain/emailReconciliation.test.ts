import { expect, it } from "vitest";
import { reconcileEmailAlerts } from "./emailReconciliation";
import { netSpend, transactionMoney, Transaction } from "./model";
const sms: Transaction = {
  id: "sms",
  source: "sms",
  bank: "SBI",
  account: "9902",
  merchant: "SAMPLE MART",
  amount: 10000,
  at: "2026-10-10T12:00:00+05:30",
  category: "Shopping",
  kind: "purchase",
  review: true,
  excluded: false,
  note: "",
  reason: "fixture",
  reference: "TESTREF001",
};
const email: Transaction = {
  ...sms,
  id: "email",
  source: "email",
  currency: "INR",
};
it("keeps originals and counts a strongly identified email/SMS payment once in either arrival order", () => {
  for (const rows of [
    [sms, email],
    [email, sms],
  ]) {
    const out = reconcileEmailAlerts(rows);
    expect(out.find((t) => t.id === "email")).toMatchObject({
      duplicateOf: "sms",
      excluded: true,
      review: false,
    });
    expect(netSpend(out)).toBe(10000);
    expect(out.find((t) => t.id === "sms")).toEqual(sms);
    expect(reconcileEmailAlerts(out)).toEqual(out);
  }
});
it("different references, issuers, cards, amounts and direction stay distinct", () => {
  for (const patch of [
    { reference: "OTHER001" },
    { bank: "SBI Card" },
    { account: "9903" },
    { amount: 12000 },
    { kind: "refund" as const },
  ]) {
    const other = { ...email, ...patch };
    expect(reconcileEmailAlerts([sms, other])).toEqual([sms, other]);
  }
});
it("weak or multiple matches wait for review without silently counting both", () => {
  const weak = { ...email, reference: undefined };
  const out = reconcileEmailAlerts([sms, weak]);
  expect(out[1]).toMatchObject({
    review: true,
    emailMatchCandidates: ["sms"],
    excluded: false,
  });
  expect(netSpend(out)).toBe(10000);
  const ambiguous = reconcileEmailAlerts([
    sms,
    { ...sms, id: "another" },
    email,
  ]);
  expect(ambiguous[2].duplicateOf).toBeUndefined();
  expect(ambiguous[2].emailMatchCandidates).toHaveLength(2);
});
it("never overwrites user notes or decisions; an untouched SMS can link to a confirmed email", () => {
  const confirmed = {
    ...email,
    note: "My purchase",
    classification: { method: "user" as const, version: "fixture" },
  };
  const out = reconcileEmailAlerts([sms, confirmed]);
  expect(out[1]).toEqual(confirmed);
  expect(out[0]).toMatchObject({ duplicateOf: "email", excluded: true });
  const explicit = {
    ...sms,
    classification: { method: "user" as const, version: "fixture" },
  };
  expect(reconcileEmailAlerts([explicit, confirmed])).toEqual([
    explicit,
    confirmed,
  ]);
});
it("USD is displayed as USD and contributes only an explicitly recorded INR settlement", () => {
  const usd = { ...email, currency: "USD" as const, amount: 2500 };
  expect(transactionMoney(usd)).toBe("USD 25.00");
  expect(netSpend([usd])).toBe(0);
  expect(netSpend([{ ...usd, inrAmount: 213456 }])).toBe(213456);
  expect(
    netSpend([{ ...usd, inrAmount: 213456, emailMatchCandidates: ["sms"] }]),
  ).toBe(0);
  expect(netSpend([{ ...usd, inrAmount: 213456, kind: "refund" }])).toBe(
    -213456,
  );
});

it("a foreign alert can wait for a same-day INR alert without guessing a conversion", () => {
  const foreign = {
    ...email,
    currency: "USD" as const,
    amount: 2500,
    reference: undefined,
  };
  const out = reconcileEmailAlerts([sms, foreign]);
  expect(out[1].emailMatchCandidates).toEqual([sms.id]);
  expect(netSpend(out)).toBe(10000);
});
it("a later untouched SMS waits behind an already confirmed INR settlement", () => {
  const foreign = {
    ...email,
    currency: "USD" as const,
    amount: 2500,
    inrAmount: 10000,
    reference: undefined,
    classification: { method: "user" as const, version: "fixture" },
  };
  const out = reconcileEmailAlerts([foreign, sms]);
  expect(out[0]).toEqual(foreign);
  expect(out[1].emailMatchCandidates).toEqual([foreign.id]);
  expect(netSpend(out)).toBe(10000);
  const distinct = { ...foreign, reconciliationDecision: "distinct" as const };
  expect(reconcileEmailAlerts([distinct, sms])).toEqual([distinct, sms]);
});

it("an equal reference with different currencies cannot automatically link unequal bank values", () => {
  const foreign = { ...email, currency: "USD" as const };
  const out = reconcileEmailAlerts([sms, foreign]);
  expect(out[1].duplicateOf).toBeUndefined();
  expect(out[1].emailMatchCandidates).toEqual([sms.id]);
  expect(out[0]).toEqual(sms);
  expect(netSpend(out)).toBe(10000);
});
