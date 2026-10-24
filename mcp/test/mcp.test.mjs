import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { decryptBackup, encryptBackup } from "../src/crypto.mjs";
import { ChangeSet } from "../src/journal.mjs";

const password = "local-test-password-123";
const roots = [];
const payment = (overrides = {}) => ({
  id: "tx-1",
  amount: 25000,
  merchant: "Cafe Green",
  account: "••1234",
  bank: "SBI",
  at: "2026-10-12T12:30:00.000Z",
  category: "Food & dining",
  kind: "purchase",
  review: false,
  excluded: false,
  note: "",
  source: "sms",
  reason: "merchant match",
  ...overrides,
});
const journal = {
  format: "kanakku-journal",
  version: 1,
  createdAt: "2026-10-20T12:00:00.000Z",
  transactions: [
    payment(),
    payment({
      id: "tx-2",
      amount: 5000,
      merchant: "Cafe Green",
      kind: "refund",
      at: "2026-10-13T10:00:00.000Z",
    }),
    payment({
      id: "tx-3",
      amount: 100000,
      merchant: "A/c ••45678",
      category: "Uncategorized",
      review: true,
      originalMerchant: "A/c ••45678",
    }),
    payment({ id: "tx-4", amount: 10000, merchant: "Hidden", excluded: true }),
    payment({
      id: "tx-6",
      amount: 12000,
      merchant: "Pet Store",
      category: "Pets",
    }),
    payment({
      id: "tx-5",
      amount: 30000,
      merchant: "Transfer to Maya",
      kind: "transfer",
    }),
  ],
  rules: [{ merchant: "Pet Store", category: "Pets" }],
  metadata: {
    recurringDecisions: { "Cafe:monthly": "confirmed" },
    customCategories: ["Pets"],
    categoryIcons: { Pets: "PawPrint" },
    loans: [],
  },
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("Kanakku encrypted backup matches the authenticated envelope and rejects tampering", () => {
  const envelope = encryptBackup(JSON.stringify(journal), password);
  assert.deepEqual(JSON.parse(decryptBackup(envelope, password)), journal);
  assert.throws(
    () => decryptBackup(envelope, "wrong-password-456"),
    /Could not unlock/,
  );
  const damaged = JSON.parse(envelope);
  damaged.ciphertext = `${damaged.ciphertext.slice(0, -4)}AAAA`;
  assert.throws(
    () => decryptBackup(JSON.stringify(damaged), password),
    /Could not unlock/,
  );
});

test("transaction MCP edits preserve source facts and protect linked loans", () => {
  const edits = new ChangeSet();
  const before = journal.transactions[0];
  edits.updateTransaction(journal, {
    id: before.id,
    patch: { kind: "transfer" },
  });
  const updated = edits
    .apply(journal)
    .transactions.find((tx) => tx.id === before.id);
  assert.equal(updated.kind, "transfer");
  assert.equal(updated.amount, before.amount);
  assert.equal(updated.at, before.at);

  const foreign = {
    ...before,
    id: "foreign-1",
    amount: 2500,
    currency: "USD",
    inrAmount: undefined,
  };
  const foreignJournal = {
    ...journal,
    transactions: [...journal.transactions, foreign],
  };
  const settlement = new ChangeSet();
  settlement.updateTransaction(foreignJournal, {
    id: foreign.id,
    patch: { inrAmount: 215000 },
  });
  assert.equal(
    settlement
      .apply(foreignJournal)
      .transactions.find((tx) => tx.id === foreign.id).inrAmount,
    215000,
  );

  const loanJournal = {
    ...journal,
    transactions: [
      ...journal.transactions,
      payment({ id: "loan-tx", kind: "lent", category: "Friends & family" }),
    ],
    metadata: {
      ...journal.metadata,
      loans: [{ transactionId: "loan-tx" }],
    },
  };
  assert.throws(
    () =>
      new ChangeSet().updateTransaction(loanJournal, {
        id: "loan-tx",
        patch: { kind: "purchase" },
      }),
    /linked to a loan/,
  );
});

test("preview-only mode is explicit and still requires the latest preview token", async () => {
  const root = await mkdtemp(join(tmpdir(), "kanakku-mcp-preview-only-"));
  roots.push(root);
  const backupFile = join(root, "source.kbk");
  const passwordFile = join(root, "password.txt");
  await writeFile(
    backupFile,
    encryptBackup(JSON.stringify(journal), password),
    {
      mode: 0o600,
    },
  );
  await writeFile(passwordFile, `${password}\n`, { mode: 0o600 });
  const client = new Client({ name: "kanakku-preview-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../server.mjs", import.meta.url))],
    env: {
      ...process.env,
      KANAKKU_BACKUP_FILE: backupFile,
      KANAKKU_BACKUP_PASSWORD_FILE: passwordFile,
      KANAKKU_MCP_OUTPUT_DIR: root,
      KANAKKU_MCP_APPROVAL_MODE: "preview-only",
    },
  });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    assert.ok(tools.includes("export_previewed_changes"));
    assert.ok(!tools.includes("export_approved_changes"));
    await client.callTool({
      name: "stage_update_transaction",
      arguments: { id: "tx-1", note: "Lunch" },
    });
    const previewResult = await client.callTool({
      name: "preview_changes",
      arguments: {},
    });
    const preview = JSON.parse(previewResult.content[0].text);
    assert.equal(preview.approvalMode, "preview-only");
    const result = await client.callTool({
      name: "export_previewed_changes",
      arguments: { preview_token: preview.approvalToken },
    });
    assert.equal(JSON.parse(result.content[0].text).originalPreserved, true);
  } finally {
    await client.close();
  }
});

test("MCP exposes filtered spend and stages an icon category into a new encrypted copy", async () => {
  const root = await mkdtemp(join(tmpdir(), "kanakku-mcp-test-"));
  roots.push(root);
  const backupFile = join(root, "source.kbk");
  const passwordFile = join(root, "password.txt");
  const original = encryptBackup(JSON.stringify(journal), password);
  await writeFile(backupFile, original, { mode: 0o600 });
  await writeFile(passwordFile, `${password}\n`, { mode: 0o600 });

  const client = new Client({ name: "kanakku-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../server.mjs", import.meta.url))],
    env: {
      ...process.env,
      KANAKKU_BACKUP_FILE: backupFile,
      KANAKKU_BACKUP_PASSWORD_FILE: passwordFile,
      KANAKKU_MCP_OUTPUT_DIR: root,
    },
  });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    for (const name of [
      "spending_summary",
      "stage_create_category",
      "stage_update_category",
      "stage_set_merchant_rule",
      "stage_recurring_decision",
      "analytics_report",
      "get_journal_configs",
    ])
      assert.ok(
        listed.tools.some((tool) => tool.name === name),
        name,
      );

    const summaryResult = await client.callTool({
      name: "spending_summary",
      arguments: {
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        merchant: "Cafe Green",
        group_by: "merchant",
      },
    });
    const summary = JSON.parse(summaryResult.content[0].text);
    assert.equal(summary.totalMinorUnits, 20000);
    assert.equal(summary.totalRupees, 200);
    assert.equal(summary.includedTransactions, 2);
    assert.equal(summary.groups[0].label, "Cafe Green");

    const analyticsResult = await client.callTool({
      name: "analytics_report",
      arguments: {
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        merchant: "Cafe Green",
      },
    });
    const analytics = JSON.parse(analyticsResult.content[0].text);
    assert.equal(analytics.spending.totalMinorUnits, 20000);
    assert.equal(analytics.monthlySpend[0].month, "2026-10");
    assert.equal(analytics.transactionCounts.bySource[0].source, "sms");

    const configResult = await client.callTool({
      name: "get_journal_configs",
      arguments: {},
    });
    const config = JSON.parse(configResult.content[0].text);
    assert.equal(config.recurringDecisions[0].key, "Cafe:monthly");
    assert.ok(config.deviceOnlySettings.includes("biometric lock"));

    const stage = await client.callTool({
      name: "stage_create_category",
      arguments: { name: "Travel", icon_key: "Plane" },
    });
    assert.equal(JSON.parse(stage.content[0].text).staged, true);
    await client.callTool({
      name: "stage_update_category",
      arguments: {
        name: "Pets",
        new_name: "Animals",
        icon_key: "PawPrint",
      },
    });
    await client.callTool({
      name: "stage_set_merchant_rule",
      arguments: {
        merchant: "Cafe Green",
        alias: "Corner Cafe",
        bank: "SBI",
        category: "Food & dining",
        kind: "purchase",
      },
    });
    await client.callTool({
      name: "stage_recurring_decision",
      arguments: { key: "Cafe:monthly", decision: "ignored" },
    });
    const categorize = await client.callTool({
      name: "stage_update_transaction",
      arguments: { id: "tx-3", category: "Friends & family" },
    });
    assert.equal(JSON.parse(categorize.content[0].text).staged, true);
    const previewResult = await client.callTool({
      name: "preview_changes",
      arguments: {},
    });
    const preview = JSON.parse(previewResult.content[0].text);
    assert.equal(preview.changes[0].iconKey, "Plane");
    const txEdit = preview.changes.find(
      (change) => change.type === "update_transaction",
    );
    assert.equal(txEdit.affected[0].before.review, true);
    assert.equal(txEdit.affected[0].after.review, false);
    assert.equal(
      preview.changes.find((change) => change.type === "set_merchant_rule")
        .after.alias,
      "Corner Cafe",
    );
    assert.equal(
      preview.changes.find((change) => change.type === "set_recurring_decision")
        .before,
      "confirmed",
    );
    const exportResult = await client.callTool({
      name: "export_approved_changes",
      arguments: {
        approval_token: preview.approvalToken,
        approval_phrase:
          "I reviewed the preview and approve exporting these changes.",
      },
    });
    const exported = JSON.parse(exportResult.content[0].text);
    assert.equal(exported.originalPreserved, true);
    assert.equal(exported.phoneUpdated, false);
    assert.equal(await readFile(backupFile, "utf8"), original);
    const output = JSON.parse(
      decryptBackup(await readFile(exported.path, "utf8"), password),
    );
    assert.deepEqual(output.metadata.categoryIcons, {
      Travel: "Plane",
      Animals: "PawPrint",
    });
    assert.deepEqual(output.metadata.customCategories, ["Animals", "Travel"]);
    assert.deepEqual(output.rules, [
      { merchant: "Pet Store", category: "Animals" },
      {
        merchant: "Cafe Green",
        bank: "SBI",
        alias: "Corner Cafe",
        kind: "purchase",
        category: "Food & dining",
      },
    ]);
    assert.equal(
      output.transactions.find((tx) => tx.id === "tx-6").category,
      "Animals",
    );
    assert.equal(output.metadata.recurringDecisions["Cafe:monthly"], "ignored");
    const resolved = output.transactions.find((tx) => tx.id === "tx-3");
    assert.equal(resolved.category, "Friends & family");
    assert.equal(resolved.review, false);
  } finally {
    await client.close();
  }
});
