import { MerchantRule, Transaction, isAccountPayee, merchantKey } from "./model";
export { awaitingContext, isAccountPayee } from "./model";

/** A masked destination suffix cannot uniquely identify a recipient. */
export const hasSafeRule = (rule: MerchantRule) =>
  !/^a\/c\s*••\d{2,8}$/i.test(rule.merchant.trim()) || Boolean(rule.bank);

/** Return the saved rule that would currently apply to this payment. */
export function rememberedRuleFor(
  transaction: Transaction,
  rules: MerchantRule[],
): MerchantRule | undefined {
  const merchant = merchantKey(
    transaction.originalMerchant || transaction.merchant,
  );
  const matching = rules.filter((rule) => merchantKey(rule.merchant) === merchant);
  if (isAccountPayee(transaction))
    return matching.find(
      (rule) => merchantKey(rule.bank || "") === merchantKey(transaction.bank),
    );
  return (
    matching.find(
      (rule) => merchantKey(rule.bank || "") === merchantKey(transaction.bank),
    ) || matching.find((rule) => !rule.bank)
  );
}

/** Replace or remove the saved rule for this transaction's payee identity. */
export function setRememberedRule(
  rules: MerchantRule[],
  transaction: Transaction,
  replacement?: MerchantRule,
): MerchantRule[] {
  const merchant = merchantKey(
    transaction.originalMerchant || transaction.merchant,
  );
  const accountPayee = isAccountPayee(transaction);
  const kept = rules.filter(
    (rule) =>
      !(
        merchantKey(rule.merchant) === merchant &&
        (accountPayee
          ? merchantKey(rule.bank || "") === merchantKey(transaction.bank)
          : !rule.bank)
      ),
  );
  return replacement ? [...kept, replacement] : kept;
}

/**
 * Applies remembered payee rules to rows the user has not confirmed: a remembered type
 * for a named payee always, and a remembered category to rows still
 * waiting for context. Rows the user edited are never changed.
 */
export function applyPayeeRules(
  rows: Transaction[],
  rules: MerchantRule[],
): Transaction[] {
  if (!rules.length) return rows;
  const byPayee = new Map(
    rules
      .filter(hasSafeRule)
      .map((r) => [
        `${merchantKey(r.bank || "")}::${merchantKey(r.merchant)}`,
        r,
      ]),
  );
  return rows.map((t) => {
    const rule =
      byPayee.get(
        `${merchantKey(t.bank)}::${merchantKey(t.originalMerchant || t.merchant)}`,
      ) || byPayee.get(`::${merchantKey(t.originalMerchant || t.merchant)}`);
    if (!rule || t.classification?.method === "user") return t;
    const category =
      rule.category !== "Uncategorized" ? rule.category : t.category;
    if (rule.kind && rule.kind !== t.kind)
      return {
        ...t,
        kind: rule.kind,
        review: false,
        category,
        merchant: rule.alias || t.merchant,
        reason: "Your payee rule",
        classification: { method: "rule" as const, version: "payee-rule-v1" },
      };
    if (!t.review || rule.category === "Uncategorized") return t;
    return {
      ...t,
      category,
      review: false,
      merchant: rule.alias || t.merchant,
      reason: "Your merchant rule",
      classification: { method: "rule" as const, version: "payee-rule-v1" },
    };
  });
}
