import { createHash, randomBytes } from "node:crypto";
import { chmod, lstat, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { decryptBackup, encryptBackup } from "./crypto.mjs";

export const BUILTIN_CATEGORIES = [
  "Food & dining",
  "Groceries",
  "Transport",
  "Shopping",
  "Bills & utilities",
  "Entertainment",
  "Health",
  "Home",
  "Friends & family",
  "Uncategorized",
];
export const CATEGORY_ICON_KEYS = [
  "Tag",
  "ShoppingBag",
  "Coffee",
  "Plane",
  "Heart",
  "BookOpen",
  "Gift",
  "Briefcase",
  "Dumbbell",
  "PawPrint",
];
const KINDS = new Set([
  "purchase",
  "income",
  "refund",
  "transfer",
  "card_payment",
  "cash",
  "lent",
]);
const indiaDay = (instant) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));

function assertJournal(value) {
  if (
    !value ||
    value.format !== "kanakku-journal" ||
    value.version !== 1 ||
    typeof value.createdAt !== "string" ||
    !Array.isArray(value.transactions) ||
    value.transactions.length > 200_000 ||
    !Array.isArray(value.rules) ||
    !value.metadata ||
    typeof value.metadata !== "object"
  )
    throw new Error("The decrypted file is not a supported Kanakku journal.");
  const custom = value.metadata.customCategories ?? [];
  if (
    !Array.isArray(custom) ||
    custom.length > 40 ||
    !custom.every(
      (name) =>
        typeof name === "string" &&
        name.trim().length > 0 &&
        name.trim().length <= 32,
    )
  )
    throw new Error("The journal has invalid custom category metadata.");
  const categories = new Set([...BUILTIN_CATEGORIES, ...custom]);
  const ids = new Set();
  for (const tx of value.transactions) {
    if (
      !tx ||
      typeof tx !== "object" ||
      typeof tx.id !== "string" ||
      !tx.id ||
      ids.has(tx.id) ||
      !Number.isSafeInteger(tx.amount) ||
      tx.amount <= 0 ||
      typeof tx.merchant !== "string" ||
      typeof tx.account !== "string" ||
      typeof tx.bank !== "string" ||
      typeof tx.at !== "string" ||
      !categories.has(tx.category) ||
      !KINDS.has(tx.kind) ||
      typeof tx.review !== "boolean" ||
      typeof tx.excluded !== "boolean" ||
      typeof tx.note !== "string" ||
      !["sms", "email", "sample"].includes(tx.source)
    )
      throw new Error(
        "The journal contains a transaction that failed validation.",
      );
    ids.add(tx.id);
  }
  for (const rule of value.rules) {
    if (
      !rule ||
      typeof rule.merchant !== "string" ||
      !rule.merchant ||
      !categories.has(rule.category) ||
      (rule.bank !== undefined && typeof rule.bank !== "string") ||
      (rule.alias !== undefined && typeof rule.alias !== "string") ||
      (rule.kind !== undefined && !KINDS.has(rule.kind))
    )
      throw new Error(
        "The journal contains a merchant rule that failed validation.",
      );
  }
  return value;
}

export function journalDigest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readEncryptedJournal(filePath, password) {
  const info = await lstat(filePath);
  if (info.isSymbolicLink() || !info.isFile())
    throw new Error("The configured Kanakku backup must be a regular file.");
  if (info.size > 36 * 1024 * 1024)
    throw new Error("The configured Kanakku backup exceeds 36 MiB.");
  const bytes = await readFile(filePath);
  const plaintext = decryptBackup(bytes.toString("utf8"), password);
  let journal;
  try {
    journal = JSON.parse(plaintext);
  } catch {
    throw new Error("The backup decrypted but its journal JSON is damaged.");
  }
  return { journal: assertJournal(journal), digest: journalDigest(bytes) };
}

export function spendAmount(tx) {
  if (
    tx.excluded ||
    tx.duplicateOf ||
    tx.emailMatchCandidates?.length ||
    (tx.kind === "purchase" &&
      tx.review &&
      /^A\/c ••\d{2,8}$/.test((tx.originalMerchant || tx.merchant).trim()))
  )
    return 0;
  const amount =
    tx.currency && tx.currency !== "INR" ? tx.inrAmount : tx.amount;
  if (!Number.isSafeInteger(amount) || amount <= 0) return 0;
  if (tx.kind === "refund") return -amount;
  return tx.kind === "purchase" ? amount : 0;
}

export function filterTransactions(transactions, filters = {}) {
  const query = filters.query?.trim().toLocaleLowerCase();
  return transactions
    .filter((tx) => {
      const day = indiaDay(tx.at);
      return (
        !tx.duplicateOf &&
        (!filters.start_date || day >= filters.start_date) &&
        (!filters.end_date || day <= filters.end_date) &&
        (!filters.category || filters.category === tx.category) &&
        (!filters.source || filters.source === tx.source) &&
        (!filters.kind || filters.kind === tx.kind) &&
        (!filters.account ||
          `${tx.bank} · ${tx.account}`.toLocaleLowerCase() ===
            filters.account.trim().toLocaleLowerCase()) &&
        (!filters.merchant ||
          tx.merchant
            .toLocaleLowerCase()
            .includes(filters.merchant.toLocaleLowerCase())) &&
        (!query ||
          `${tx.merchant} ${tx.bank} ${tx.account} ${tx.category}`
            .toLocaleLowerCase()
            .includes(query))
      );
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function spendingSummary(
  transactions,
  filters = {},
  groupBy = "category",
) {
  const rows = filterTransactions(transactions, filters);
  const buckets = new Map();
  let total = 0;
  for (const tx of rows) {
    const amount = spendAmount(tx);
    total += amount;
    const key =
      groupBy === "merchant"
        ? tx.merchant
        : groupBy === "account"
          ? `${tx.bank} · ${tx.account}`
          : groupBy === "source"
            ? tx.source
            : tx.category;
    const bucket = buckets.get(key) ?? { label: key, amount: 0, count: 0 };
    bucket.amount += amount;
    if (amount) bucket.count++;
    buckets.set(key, bucket);
  }
  return {
    period: {
      start: filters.start_date ?? null,
      end: filters.end_date ?? null,
    },
    filters: {
      category: filters.category ?? null,
      source: filters.source ?? null,
      kind: filters.kind ?? null,
      account: filters.account ?? null,
      merchant: filters.merchant ?? null,
      query: filters.query ?? null,
    },
    includedTransactions: rows.filter((tx) => spendAmount(tx) !== 0).length,
    matchedRows: rows.length,
    totalMinorUnits: total,
    totalRupees: Number((total / 100).toFixed(2)),
    currency: "INR",
    groupBy,
    groups: [...buckets.values()]
      .filter((bucket) => bucket.amount !== 0)
      .sort((a, b) => b.amount - a.amount)
      .map((bucket) => ({
        ...bucket,
        amountRupees: Number((bucket.amount / 100).toFixed(2)),
      })),
    countingNote:
      "Spending includes eligible purchases minus refunds. Excluded, duplicate, unresolved masked-account, and possible cross-source matches are not counted; transfers, income, card repayments, cash withdrawals, and money lent are reported in rows but not as spending.",
  };
}

export function categoryList(journal) {
  const custom = journal.metadata.customCategories ?? [];
  const icons = journal.metadata.categoryIcons ?? {};
  const counts = new Map();
  for (const tx of journal.transactions)
    counts.set(tx.category, (counts.get(tx.category) ?? 0) + 1);
  return [...new Set([...BUILTIN_CATEGORIES, ...custom])].map((name) => ({
    name,
    custom: custom.includes(name),
    iconKey: icons[name] ?? null,
    transactionCount: counts.get(name) ?? 0,
  }));
}

export function configSummary(journal) {
  return {
    merchantRules: journal.rules.map((rule) => ({ ...rule })),
    recurringDecisions: Object.entries(
      journal.metadata.recurringDecisions ?? {},
    ).map(([key, decision]) => ({ key, decision })),
    deviceOnlySettings: [
      "theme and appearance",
      "biometric lock",
      "notification and reminder schedules",
      "Gmail and Google Drive authorization",
      "automatic backup schedule and local keys",
    ],
    note: "The encrypted journal backup does not contain device-only settings, so MCP edits cannot change them.",
  };
}

const indiaMonth = (instant) => {
  const day = indiaDay(instant);
  return day.slice(0, 7);
};

export function analyticsReport(journal, filters = {}) {
  const rows = filterTransactions(journal.transactions, filters);
  const byKind = new Map();
  const bySource = new Map();
  const monthlySpend = new Map();
  let needsReview = 0;
  let reviewAmount = 0;
  for (const tx of rows) {
    byKind.set(tx.kind, (byKind.get(tx.kind) ?? 0) + 1);
    bySource.set(tx.source, (bySource.get(tx.source) ?? 0) + 1);
    if (tx.review) {
      needsReview++;
      reviewAmount += spendAmount(tx);
    }
    const month = indiaMonth(tx.at);
    monthlySpend.set(month, (monthlySpend.get(month) ?? 0) + spendAmount(tx));
  }
  const totalOutstanding = (journal.metadata.loans ?? []).reduce(
    (sum, loan) =>
      sum +
      Math.max(
        0,
        loan.amount -
          (loan.repayments ?? []).reduce(
            (repaid, repayment) => repaid + repayment.amount,
            0,
          ),
      ),
    0,
  );
  const toRows = (map, key) =>
    [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => ({ [key]: label, count }));
  return {
    period: {
      start: filters.start_date ?? null,
      end: filters.end_date ?? null,
      timezone: "Asia/Kolkata",
    },
    spending: spendingSummary(journal.transactions, filters, "category"),
    categoryTotals: spendingSummary(journal.transactions, filters, "category")
      .groups,
    merchantTotals: spendingSummary(journal.transactions, filters, "merchant")
      .groups,
    accountTotals: spendingSummary(journal.transactions, filters, "account")
      .groups,
    sourceTotals: spendingSummary(journal.transactions, filters, "source")
      .groups,
    monthlySpend: [...monthlySpend.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amountMinorUnits]) => ({
        month,
        amountMinorUnits,
        amountRupees: Number((amountMinorUnits / 100).toFixed(2)),
      })),
    transactionCounts: {
      matchedRows: rows.length,
      needsReview,
      reviewAmountMinorUnits: reviewAmount,
      byKind: toRows(byKind, "kind"),
      bySource: toRows(bySource, "source"),
    },
    lending: {
      loanCount: (journal.metadata.loans ?? []).length,
      outstandingMinorUnits: totalOutstanding,
      outstandingRupees: Number((totalOutstanding / 100).toFixed(2)),
    },
  };
}

function categoryDecisionPatch(tx, category) {
  const unresolved = Boolean(
    (category === "Uncategorized" && tx.kind === "purchase") ||
    (tx.currency && tx.currency !== "INR" && !tx.inrAmount),
  );
  return {
    category,
    review: unresolved,
    reason: unresolved ? tx.reason : "Confirmed using an AI assistant",
    classification: { method: "user", version: "mcp-v1" },
  };
}

export class ChangeSet {
  #changes = [];

  get changes() {
    return this.#changes;
  }

  clear() {
    this.#changes = [];
  }

  addCategory(journal, { name, iconKey }) {
    const normalized = name.trim().replace(/\s+/g, " ");
    if (!normalized || normalized.length > 32)
      throw new Error("Category names must contain 1–32 characters.");
    if (normalized.toLocaleLowerCase() === "uncategorized")
      throw new Error(
        "Uncategorized is reserved for payments needing context.",
      );
    const known = [
      ...BUILTIN_CATEGORIES,
      ...(journal.metadata.customCategories ?? []),
    ];
    if (
      known.some(
        (item) => item.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
      )
    )
      throw new Error("That category already exists.");
    if (
      (journal.metadata.customCategories ?? []).length +
        this.#changes.filter((change) => change.type === "create_category")
          .length >=
      40
    )
      throw new Error("You can create up to 40 custom categories.");
    if (!CATEGORY_ICON_KEYS.includes(iconKey))
      throw new Error(`Choose an icon from: ${CATEGORY_ICON_KEYS.join(", ")}.`);
    this.#changes.push({ type: "create_category", name: normalized, iconKey });
  }

  updateCategory(journal, { name, newName, iconKey }) {
    const normalized = newName.trim().replace(/\s+/g, " ");
    const custom = journal.metadata.customCategories ?? [];
    if (!custom.includes(name))
      throw new Error("Only a saved custom category can be renamed here.");
    if (!normalized || normalized.length > 32)
      throw new Error("Category names must contain 1–32 characters.");
    if (normalized.toLocaleLowerCase() === "uncategorized")
      throw new Error(
        "Uncategorized is reserved for payments needing context.",
      );
    const known = [
      ...BUILTIN_CATEGORIES,
      ...custom.filter((item) => item !== name),
    ];
    if (
      known.some(
        (item) => item.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
      )
    )
      throw new Error("That category already exists.");
    if (!CATEGORY_ICON_KEYS.includes(iconKey))
      throw new Error(`Choose an icon from: ${CATEGORY_ICON_KEYS.join(", ")}.`);
    this.#changes.push({
      type: "update_category",
      name,
      newName: normalized,
      iconKey,
    });
  }

  setMerchantRule(journal, rule) {
    const merchant = rule.merchant.trim();
    const bank = rule.bank?.trim();
    const categories = [
      ...BUILTIN_CATEGORIES,
      ...(journal.metadata.customCategories ?? []),
      ...this.#changes
        .filter((change) => change.type === "create_category")
        .map((change) => change.name),
    ];
    if (!merchant || merchant.length > 256)
      throw new Error("Merchant pattern must contain 1–256 characters.");
    if (bank !== undefined && bank.length > 256)
      throw new Error("Bank scope must be at most 256 characters.");
    if (rule.alias !== undefined && rule.alias.length > 256)
      throw new Error("Payee alias must be at most 256 characters.");
    if (!categories.includes(rule.category))
      throw new Error("Choose an existing category or stage it first.");
    if (rule.kind !== undefined && !KINDS.has(rule.kind))
      throw new Error("Choose a supported transaction kind.");
    const normalized = {
      merchant,
      ...(bank ? { bank } : {}),
      ...(rule.alias?.trim() ? { alias: rule.alias.trim() } : {}),
      ...(rule.kind ? { kind: rule.kind } : {}),
      category: rule.category,
    };
    this.#changes.push({ type: "set_merchant_rule", rule: normalized });
  }

  removeMerchantRule(journal, { merchant, bank }) {
    const matches = journal.rules.filter(
      (rule) =>
        rule.merchant === merchant && (rule.bank ?? null) === (bank ?? null),
    );
    if (matches.length !== 1)
      throw new Error(
        matches.length
          ? "More than one rule has that identity. Add the exact bank scope."
          : "No merchant rule with that exact identity was found.",
      );
    this.#changes.push({
      type: "remove_merchant_rule",
      merchant,
      bank: bank ?? null,
    });
  }

  setRecurringDecision(journal, { key, decision }) {
    if (key.length < 1 || key.length > 256)
      throw new Error("Recurring item key must contain 1–256 characters.");
    if (decision !== null && !["confirmed", "ignored"].includes(decision))
      throw new Error("Decision must be confirmed, ignored, or null to clear.");
    if (!(journal.metadata.recurringDecisions ?? {})[key] && decision === null)
      throw new Error("No saved recurring decision exists for that key.");
    this.#changes.push({ type: "set_recurring_decision", key, decision });
  }

  updateTransaction(journal, { id, patch }) {
    const current = journal.transactions.find((tx) => tx.id === id);
    if (!current)
      throw new Error("Transaction ID was not found in this backup.");
    const allowed = {};
    let finalCategory = current.category;
    let finalKind = current.kind;
    let finalInrAmount = current.inrAmount;
    if (patch.category !== undefined) {
      const categories = [
        ...BUILTIN_CATEGORIES,
        ...(journal.metadata.customCategories ?? []),
        ...this.#changes
          .filter((change) => change.type === "create_category")
          .map((change) => change.name),
      ];
      if (!categories.includes(patch.category))
        throw new Error("Choose an existing category or stage it first.");
      finalCategory = patch.category;
    }
    if (patch.merchant !== undefined) {
      if (
        typeof patch.merchant !== "string" ||
        !patch.merchant.trim() ||
        patch.merchant.length > 256
      )
        throw new Error("Merchant name must contain 1–256 characters.");
      allowed.merchant = patch.merchant.trim();
      allowed.originalMerchant = current.originalMerchant || current.merchant;
    }
    if (patch.note !== undefined) {
      if (typeof patch.note !== "string" || patch.note.length > 500)
        throw new Error("Note must be at most 500 characters.");
      allowed.note = patch.note;
    }
    if (patch.excluded !== undefined) {
      if (typeof patch.excluded !== "boolean")
        throw new Error("excluded must be true or false.");
      allowed.excluded = patch.excluded;
    }
    if (patch.kind !== undefined) {
      if (!KINDS.has(patch.kind) || patch.kind === "lent")
        throw new Error(
          "Choose a supported non-lending kind; money-lent status must be managed in Kanakku.",
        );
      if (
        (journal.metadata.loans ?? []).some((loan) => loan.transactionId === id)
      )
        throw new Error(
          "This transaction is linked to a loan. Manage it in Kanakku so the loan history stays consistent.",
        );
      allowed.kind = patch.kind;
      finalKind = patch.kind;
    }
    if (patch.inrAmount !== undefined) {
      if (!current.currency || current.currency === "INR")
        throw new Error(
          "INR settlement can only be edited for foreign-currency transactions.",
        );
      if (!Number.isSafeInteger(patch.inrAmount) || patch.inrAmount <= 0)
        throw new Error("INR settlement must be a positive amount in paise.");
      allowed.inrAmount = patch.inrAmount;
      finalInrAmount = patch.inrAmount;
    }
    if (
      patch.category !== undefined ||
      patch.kind !== undefined ||
      patch.inrAmount !== undefined
    ) {
      const classification = categoryDecisionPatch(
        { ...current, ...allowed, kind: finalKind, inrAmount: finalInrAmount },
        finalCategory,
      );
      Object.assign(allowed, classification);
      if (patch.kind !== undefined && classification.review === current.review)
        allowed.reason = "Transaction type confirmed using an AI assistant";
    }
    if (!Object.keys(allowed).length)
      throw new Error("No editable fields were provided.");
    this.#changes.push({ type: "update_transaction", id, patch: allowed });
  }

  bulkCategorize(journal, { transactionIds, category, expectedCount }) {
    if (
      !Array.isArray(transactionIds) ||
      transactionIds.length < 1 ||
      transactionIds.length > 100
    )
      throw new Error("Select between 1 and 100 explicit transaction IDs.");
    if (new Set(transactionIds).size !== transactionIds.length)
      throw new Error("Transaction IDs must be unique.");
    if (expectedCount !== transactionIds.length)
      throw new Error(
        `Safety check failed: you supplied ${transactionIds.length} IDs but confirmed ${expectedCount}.`,
      );
    const allowedCategories = [
      ...BUILTIN_CATEGORIES,
      ...(journal.metadata.customCategories ?? []),
      ...this.#changes
        .filter((change) => change.type === "create_category")
        .map((change) => change.name),
    ];
    if (!allowedCategories.includes(category))
      throw new Error("Choose an existing category or stage it first.");
    const known = new Set(journal.transactions.map((tx) => tx.id));
    if (transactionIds.some((id) => !known.has(id)))
      throw new Error(
        "At least one selected transaction ID is not in this backup.",
      );
    this.#changes.push({ type: "bulk_categorize", transactionIds, category });
  }

  preview(journal) {
    return this.#changes.map((change) => {
      if (change.type === "create_category") return { ...change };
      if (change.type === "update_category")
        return {
          ...change,
          transactionsAffected: journal.transactions.filter(
            (tx) => tx.category === change.name,
          ).length,
          merchantRulesAffected: journal.rules.filter(
            (rule) => rule.category === change.name,
          ).length,
          beforeIconKey: journal.metadata.categoryIcons?.[change.name] ?? null,
        };
      if (change.type === "set_merchant_rule") {
        const index = journal.rules.findIndex(
          (rule) =>
            rule.merchant === change.rule.merchant &&
            (rule.bank ?? null) === (change.rule.bank ?? null),
        );
        return {
          ...change,
          before: index < 0 ? null : journal.rules[index],
          after: change.rule,
        };
      }
      if (change.type === "remove_merchant_rule") {
        return {
          ...change,
          before: journal.rules.find(
            (rule) =>
              rule.merchant === change.merchant &&
              (rule.bank ?? null) === change.bank,
          ),
          after: null,
        };
      }
      if (change.type === "set_recurring_decision")
        return {
          ...change,
          before: journal.metadata.recurringDecisions?.[change.key] ?? null,
          after: change.decision,
        };
      const ids =
        change.type === "bulk_categorize" ? change.transactionIds : [change.id];
      return {
        ...change,
        affected: ids.map((id) => {
          const tx = journal.transactions.find((row) => row.id === id);
          const patch =
            change.type === "bulk_categorize"
              ? categoryDecisionPatch(tx, change.category)
              : change.patch;
          return {
            id,
            merchant: tx.merchant,
            date: indiaDay(tx.at),
            amountMinorUnits: tx.amount,
            currency: tx.currency ?? "INR",
            before: Object.fromEntries(
              Object.keys(patch).map((key) => [key, tx[key]]),
            ),
            after: patch,
          };
        }),
      };
    });
  }

  apply(journal) {
    const output = structuredClone(journal);
    output.createdAt = new Date().toISOString();
    output.metadata.customCategories ??= [];
    output.metadata.categoryIcons ??= {};
    output.metadata.recurringDecisions ??= {};
    for (const change of this.#changes) {
      if (change.type === "create_category") {
        if (!output.metadata.customCategories.includes(change.name))
          output.metadata.customCategories.push(change.name);
        output.metadata.categoryIcons[change.name] = change.iconKey;
        continue;
      }
      if (change.type === "update_category") {
        output.metadata.customCategories = output.metadata.customCategories.map(
          (name) => (name === change.name ? change.newName : name),
        );
        const oldIcon = output.metadata.categoryIcons[change.name];
        delete output.metadata.categoryIcons[change.name];
        output.metadata.categoryIcons[change.newName] =
          change.iconKey ?? oldIcon;
        for (const tx of output.transactions)
          if (tx.category === change.name) tx.category = change.newName;
        for (const rule of output.rules)
          if (rule.category === change.name) rule.category = change.newName;
        continue;
      }
      if (change.type === "set_merchant_rule") {
        const index = output.rules.findIndex(
          (rule) =>
            rule.merchant === change.rule.merchant &&
            (rule.bank ?? null) === (change.rule.bank ?? null),
        );
        if (index < 0) output.rules.push(change.rule);
        else output.rules[index] = change.rule;
        continue;
      }
      if (change.type === "remove_merchant_rule") {
        output.rules = output.rules.filter(
          (rule) =>
            !(
              rule.merchant === change.merchant &&
              (rule.bank ?? null) === change.bank
            ),
        );
        continue;
      }
      if (change.type === "set_recurring_decision") {
        if (change.decision === null)
          delete output.metadata.recurringDecisions[change.key];
        else output.metadata.recurringDecisions[change.key] = change.decision;
        continue;
      }
      const ids =
        change.type === "bulk_categorize" ? change.transactionIds : [change.id];
      for (const tx of output.transactions) {
        if (!ids.includes(tx.id)) continue;
        const patch =
          change.type === "bulk_categorize"
            ? categoryDecisionPatch(tx, change.category)
            : change.patch;
        Object.assign(tx, patch);
      }
    }
    return assertJournal(output);
  }
}

export async function writeEditedBackup({
  inputPath,
  outputDir,
  journal,
  password,
}) {
  const directory = outputDir || dirname(inputPath);
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const output = join(
    directory,
    `kanakku-agent-review-${stamp}-${randomBytes(3).toString("hex")}.kbk`,
  );
  const temporary = `${output}.partial`;
  const envelope = encryptBackup(JSON.stringify(journal), password);
  await writeFile(temporary, envelope, { flag: "wx", mode: 0o600 });
  try {
    await rename(temporary, output);
    await chmod(output, 0o600);
  } catch (error) {
    await import("node:fs/promises").then(({ unlink }) =>
      unlink(temporary).catch(() => {}),
    );
    throw error;
  }
  return {
    path: output,
    fileName: basename(output),
    bytes: Buffer.byteLength(envelope),
  };
}
