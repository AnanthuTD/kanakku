import { expect, it } from "vitest";
import { MerchantRule, Transaction, netSpend, heldSpend } from "./model";
import {
  applyPayeeRules,
  awaitingContext,
  isAccountPayee,
  rememberedRuleFor,
  removePayeeRuleEffects,
  setRememberedRule,
} from "./payees";
const row: Transaction = {
  id: "a",
  amount: 1500000,
  merchant: "A/c ••7788",
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
};
const shop: Transaction = {
  ...row,
  id: "s",
  merchant: "Swiggy",
  amount: 42000,
  category: "Food & dining",
  review: false,
};
it("holds payments to an unnamed bank account out of spending until confirmed", () => {
  expect(isAccountPayee(row)).toBe(true);
  expect(
    isAccountPayee({
      ...row,
      merchant: "Rent",
      originalMerchant: "A/c ••7788",
    }),
  ).toBe(true);
  expect(isAccountPayee(shop)).toBe(false);
  expect(awaitingContext(row)).toBe(true);
  expect(netSpend([row, shop])).toBe(42000);
  expect(heldSpend([row, shop])).toBe(1500000);
  // Confirmed with a category: it is spending.
  const confirmed = {
    ...row,
    review: false,
    category: "Bills & utilities" as const,
  };
  expect(netSpend([confirmed])).toBe(1500000);
  expect(heldSpend([confirmed])).toBe(0);
  // Excluded and non-purchase rows are never held.
  expect(
    heldSpend([
      { ...row, excluded: true },
      { ...row, kind: "transfer" },
    ]),
  ).toBe(0);
});
it("a remembered named payee type applies to unreviewed and future payments only", () => {
  const named = { ...row, merchant: "Sample landlord" };
  const rules: MerchantRule[] = [
    {
      merchant: "Sample landlord",
      category: "Uncategorized",
      kind: "transfer",
    },
  ];
  const userConfirmed = {
    ...named,
    id: "b",
    review: false,
    kind: "purchase" as const,
    category: "Shopping" as const,
    classification: { method: "user" as const, version: "review-v1" },
  };
  const other = { ...row, id: "c", merchant: "A/c ••1111" };
  const [a, b, c] = applyPayeeRules([named, userConfirmed, other], rules);
  expect(a).toMatchObject({
    kind: "transfer",
    review: false,
    reason: "Your payee rule",
  });
  expect(b).toEqual(userConfirmed);
  expect(c).toEqual(other);
  expect(netSpend([a, b, c]) + heldSpend([a, b, c])).toBe(1500000 + 1500000);
  // A remembered category confirms other waiting payments to that account.
  const [d] = applyPayeeRules(
    [named],
    [
      {
        merchant: "Sample landlord",
        category: "Bills & utilities",
        alias: "Rent",
      },
    ],
  );
  expect(d).toMatchObject({
    category: "Bills & utilities",
    review: false,
    merchant: "Rent",
  });
  expect(netSpend([d])).toBe(1500000);
});

it("never treats a masked account suffix as a reusable recipient identity", () => {
  const unrelated = {
    ...row,
    id: "different-recipient",
    bank: "Axis",
    account: "9999",
  };
  const rules: MerchantRule[] = [
    {
      merchant: "A/c ••7788",
      category: "Bills & utilities",
      kind: "transfer",
      alias: "Rent",
    },
  ];
  expect(applyPayeeRules([row, unrelated], rules)).toEqual([row, unrelated]);
  expect(heldSpend(applyPayeeRules([row, unrelated], rules))).toBe(3000000);
});

it("allows an explicit bank-scoped account-ending rule and warns by keeping it opt-in", () => {
  const rule: MerchantRule = {
    merchant: "A/c ••14697",
    bank: "Kerala Gramin Bank",
    category: "Uncategorized",
    kind: "transfer",
    alias: "My friend",
  };
  const otherEnding = {
    ...row,
    id: "b",
    merchant: "A/c ••14697",
    bank: "Kerala Gramin Bank",
  };
  const sameEndingDifferentIssuer = { ...otherEnding, id: "c", bank: "Axis" };
  expect(
    applyPayeeRules([otherEnding, sameEndingDifferentIssuer], [rule]),
  ).toMatchObject([
    { kind: "transfer", merchant: "My friend", review: false },
    { kind: "purchase", merchant: "A/c ••14697", review: true },
  ]);
});

it("keeps the remember-payee switch on for its saved rule and removes only that rule when switched off", () => {
  const bankRule: MerchantRule = {
    merchant: "A/c ••7788",
    bank: "Kerala Gramin Bank",
    category: "Friends & family",
    kind: "transfer",
    alias: "Anu",
  };
  const differentBankRule: MerchantRule = {
    ...bankRule,
    bank: "SBI",
    alias: "Other account",
  };
  const rules = [bankRule, differentBankRule];

  expect(rememberedRuleFor(row, rules)).toEqual(bankRule);
  const updated = setRememberedRule(rules, row, {
    ...bankRule,
    category: "Home",
  });
  expect(rememberedRuleFor(row, updated)?.category).toBe("Home");
  expect(updated).toContainEqual(differentBankRule);

  const switchedOff = setRememberedRule(updated, row);
  expect(rememberedRuleFor(row, switchedOff)).toBeUndefined();
  expect(switchedOff).toEqual([differentBankRule]);
});

it("reverts only automatically labeled payments when a remembered rule is removed", () => {
  const rule: MerchantRule = {
    merchant: "A/c ••7788",
    bank: "Kerala Gramin Bank",
    category: "Friends & family",
    alias: "Ashwin",
  };
  const autoLabeled = applyPayeeRules([row], [rule])[0];
  const explicitlyNamed = {
    ...autoLabeled,
    id: "user-named",
    classification: { method: "user" as const, version: "review-v1" },
  };

  expect(removePayeeRuleEffects([autoLabeled, explicitlyNamed], rule)).toMatchObject([
    {
      merchant: "A/c ••7788",
      originalMerchant: "A/c ••7788",
      category: "Uncategorized",
      kind: "purchase",
      review: true,
      classification: { method: "unknown" },
    },
    { merchant: "Ashwin", review: false, classification: { method: "user" } },
  ]);
});

it("does not revert an automatic label from a different bank", () => {
  const rule: MerchantRule = {
    merchant: "A/c ••7788",
    bank: "Kerala Gramin Bank",
    category: "Friends & family",
    alias: "Ashwin",
  };
  const autoLabeled = applyPayeeRules(
    [{ ...row, bank: "SBI" }],
    [{ ...rule, bank: "SBI" }],
  )[0];

  expect(removePayeeRuleEffects([autoLabeled], rule)[0]).toBe(autoLabeled);
});
