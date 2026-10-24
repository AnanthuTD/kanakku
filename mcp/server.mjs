#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { basename } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import {
  BUILTIN_CATEGORIES,
  CATEGORY_ICON_KEYS,
  ChangeSet,
  categoryList,
  configSummary,
  analyticsReport,
  filterTransactions,
  readEncryptedJournal,
  spendingSummary,
  writeEditedBackup,
} from "./src/journal.mjs";

const backupPath = process.env.KANAKKU_BACKUP_FILE;
const passwordFile = process.env.KANAKKU_BACKUP_PASSWORD_FILE;
const approvalMode = process.env.KANAKKU_MCP_APPROVAL_MODE ?? "required";
if (!["required", "preview-only"].includes(approvalMode))
  throw new Error(
    "KANAKKU_MCP_APPROVAL_MODE must be 'required' or 'preview-only'.",
  );
let password;
let changes = new ChangeSet();
let stagedDigest = null;
let approvalToken = null;

function localDateSchema() {
  return z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
}

async function init() {
  if (!backupPath || !passwordFile)
    throw new Error(
      "Set KANAKKU_BACKUP_FILE and KANAKKU_BACKUP_PASSWORD_FILE in the MCP server environment.",
    );
  const secretInfo = await lstat(passwordFile);
  if (secretInfo.isSymbolicLink() || !secretInfo.isFile())
    throw new Error("The password file must be a regular, private local file.");
  if (process.platform !== "win32" && (secretInfo.mode & 0o077) !== 0)
    throw new Error(
      "The password file must not be readable by group or others; use chmod 600.",
    );
  password = (await readFile(passwordFile, "utf8")).replace(/[\r\n]+$/, "");
  if (password.length < 12)
    throw new Error("Backup password must contain at least 12 characters.");
  await readEncryptedJournal(backupPath, password);
}

async function readJournal() {
  return readEncryptedJournal(backupPath, password);
}

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function registerTools(server) {
  const filterSchema = {
    start_date: localDateSchema()
      .optional()
      .describe("Inclusive local date, YYYY-MM-DD"),
    end_date: localDateSchema()
      .optional()
      .describe("Inclusive local date, YYYY-MM-DD"),
    category: z.string().max(80).optional(),
    source: z.enum(["sms", "email", "sample"]).optional(),
    kind: z
      .enum([
        "purchase",
        "income",
        "refund",
        "transfer",
        "card_payment",
        "cash",
        "lent",
      ])
      .optional(),
    account: z
      .string()
      .max(300)
      .optional()
      .describe("Exact bank and masked account, for example SBI · ••1234"),
    merchant: z
      .string()
      .max(256)
      .optional()
      .describe("Case-insensitive merchant substring"),
    query: z
      .string()
      .max(200)
      .optional()
      .describe("Search merchant, bank, masked account and category"),
  };

  server.registerTool(
    "spending_summary",
    {
      description:
        "Read spending totals from the selected encrypted Kanakku backup. Supports date, category, source, transaction-kind, account, merchant and text filters; optionally groups by category, merchant, account or source. Values use INR paise internally and also include INR rupees. Excluded and unresolved items are clearly excluded from spend.",
      inputSchema: {
        ...filterSchema,
        group_by: z
          .enum(["category", "merchant", "account", "source"])
          .default("category"),
      },
    },
    async (args) => {
      const { journal } = await readJournal();
      const { group_by, ...filters } = args;
      return textResult(
        spendingSummary(journal.transactions, filters, group_by),
      );
    },
  );

  server.registerTool(
    "analytics_report",
    {
      description:
        "Build a read-only report from the selected encrypted backup: INR spend, category and merchant totals, month-by-month spend, transaction counts by source and kind, needs-review counts, and outstanding lending. Filters use inclusive Asia/Kolkata dates. Spending follows Kanakku's rules and does not include transfers, income, repayments, cash withdrawals, loans, excluded or unresolved records.",
      inputSchema: filterSchema,
    },
    async (filters) => {
      const { journal } = await readJournal();
      return textResult(analyticsReport(journal, filters));
    },
  );

  server.registerTool(
    "list_transactions",
    {
      description:
        "List normalized transaction records from the selected encrypted backup. Raw SMS and email bodies are never present in this backup. Notes are omitted unless include_notes=true. Use IDs from this result for explicit edits; bulk edits are capped at 100 IDs.",
      inputSchema: {
        ...filterSchema,
        limit: z.number().int().min(1).max(100).default(30),
        offset: z.number().int().min(0).max(200_000).default(0),
        include_notes: z.boolean().default(false),
      },
    },
    async (args) => {
      const { journal } = await readJournal();
      const rows = filterTransactions(journal.transactions, args);
      const selected = rows
        .slice(args.offset, args.offset + args.limit)
        .map((tx) => ({
          id: tx.id,
          date: tx.at,
          merchant: tx.merchant,
          amountMinorUnits: tx.amount,
          currency: tx.currency ?? "INR",
          inrAmountMinorUnits: tx.inrAmount ?? null,
          ...(tx.currency === "USD"
            ? {
                amountValue: Number((tx.amount / 100).toFixed(2)),
                inrAmountRupees:
                  tx.inrAmount == null
                    ? null
                    : Number((tx.inrAmount / 100).toFixed(2)),
              }
            : { amountRupees: Number((tx.amount / 100).toFixed(2)) }),
          account: tx.account,
          bank: tx.bank,
          category: tx.category,
          kind: tx.kind,
          source: tx.source,
          excluded: tx.excluded,
          needsReview: tx.review,
          ...(args.include_notes ? { note: tx.note } : {}),
        }));
      return textResult({
        totalMatches: rows.length,
        offset: args.offset,
        transactions: selected,
      });
    },
  );

  server.registerTool(
    "get_categories",
    {
      description:
        "List built-in and custom categories, their saved icon keys, and transaction counts in the backup.",
      inputSchema: {},
    },
    async () => {
      const { journal } = await readJournal();
      return textResult({
        categories: categoryList(journal),
        availableCustomIcons: CATEGORY_ICON_KEYS,
      });
    },
  );

  server.registerTool(
    "get_journal_configs",
    {
      description:
        "Read backed-up merchant/payee rules and recurring-payment decisions. Also explains which device-only settings are not stored in the backup and therefore cannot be edited through MCP.",
      inputSchema: {},
    },
    async () => {
      const { journal } = await readJournal();
      return textResult(configSummary(journal));
    },
  );

  server.registerTool(
    "stage_create_category",
    {
      description:
        "Stage a custom category and one of Kanakku's supported icon keys. This does not change the source backup or phone journal. Review all edits with preview_changes, then ask the user to approve before exporting.",
      inputSchema: {
        name: z.string().min(1).max(32),
        icon_key: z.enum(CATEGORY_ICON_KEYS),
      },
    },
    async ({ name, icon_key }) => {
      const { journal, digest } = await readJournal();
      if (stagedDigest && stagedDigest !== digest)
        throw new Error(
          "The source backup changed while edits were staged. Discard them and start again.",
        );
      changes.addCategory(journal, { name, iconKey: icon_key });
      stagedDigest = digest;
      approvalToken = null;
      return textResult({
        staged: true,
        changeCount: changes.changes.length,
        category: name.trim(),
        iconKey: icon_key,
        next: "Call preview_changes before requesting export.",
      });
    },
  );

  server.registerTool(
    "stage_update_category",
    {
      description:
        "Stage a rename and icon change for an existing custom category. Shows how many transactions and merchant rules will change. Built-in categories cannot be renamed.",
      inputSchema: {
        name: z.string().min(1).max(32),
        new_name: z.string().min(1).max(32),
        icon_key: z.enum(CATEGORY_ICON_KEYS),
      },
    },
    async ({ name, new_name, icon_key }) => {
      const { journal, digest } = await readJournal();
      if (stagedDigest && stagedDigest !== digest)
        throw new Error(
          "The source backup changed while edits were staged. Discard them and start again.",
        );
      changes.updateCategory(journal, {
        name,
        newName: new_name,
        iconKey: icon_key,
      });
      stagedDigest = digest;
      approvalToken = null;
      return textResult({
        staged: true,
        changeCount: changes.changes.length,
        next: "Call preview_changes before requesting export.",
      });
    },
  );

  server.registerTool(
    "stage_set_merchant_rule",
    {
      description:
        "Stage a backed-up merchant/payee rule. Same merchant plus same bank scope replaces a saved rule; omitting bank creates a global rule. Rules affect future classification after the edited backup is restored. Preview before export.",
      inputSchema: {
        merchant: z.string().min(1).max(256),
        bank: z.string().max(256).optional(),
        alias: z.string().max(256).optional(),
        category: z.string().min(1).max(80),
        kind: z
          .enum([
            "purchase",
            "income",
            "refund",
            "transfer",
            "card_payment",
            "cash",
            "lent",
          ])
          .optional(),
      },
    },
    async (rule) => {
      const { journal, digest } = await readJournal();
      if (stagedDigest && stagedDigest !== digest)
        throw new Error(
          "The source backup changed while edits were staged. Discard them and start again.",
        );
      changes.setMerchantRule(journal, rule);
      stagedDigest = digest;
      approvalToken = null;
      return textResult({
        staged: true,
        changeCount: changes.changes.length,
        next: "Call preview_changes before requesting export.",
      });
    },
  );

  server.registerTool(
    "stage_remove_merchant_rule",
    {
      description:
        "Stage removal of exactly one saved merchant rule by exact merchant and optional exact bank scope. Use get_journal_configs first if the rule identity is uncertain.",
      inputSchema: {
        merchant: z.string().min(1).max(256),
        bank: z.string().max(256).nullable().optional(),
      },
    },
    async ({ merchant, bank }) => {
      const { journal, digest } = await readJournal();
      if (stagedDigest && stagedDigest !== digest)
        throw new Error(
          "The source backup changed while edits were staged. Discard them and start again.",
        );
      changes.removeMerchantRule(journal, { merchant, bank });
      stagedDigest = digest;
      approvalToken = null;
      return textResult({
        staged: true,
        changeCount: changes.changes.length,
        next: "Call preview_changes before requesting export.",
      });
    },
  );

  server.registerTool(
    "stage_recurring_decision",
    {
      description:
        "Stage a confirmed/ignored recurring-payment decision, or clear it with decision=null. Provide the exact key from get_journal_configs. This changes only the backed-up recognition decision.",
      inputSchema: {
        key: z.string().min(1).max(256),
        decision: z.enum(["confirmed", "ignored"]).nullable(),
      },
    },
    async ({ key, decision }) => {
      const { journal, digest } = await readJournal();
      if (stagedDigest && stagedDigest !== digest)
        throw new Error(
          "The source backup changed while edits were staged. Discard them and start again.",
        );
      changes.setRecurringDecision(journal, { key, decision });
      stagedDigest = digest;
      approvalToken = null;
      return textResult({
        staged: true,
        changeCount: changes.changes.length,
        next: "Call preview_changes before requesting export.",
      });
    },
  );

  server.registerTool(
    "stage_update_transaction",
    {
      description:
        "Stage a precise edit to one transaction using its ID. Editable fields are category, merchant, note, excluded status, non-loan transaction kind, and a user-confirmed INR settlement for foreign-currency items. It never modifies source message data, bank/account values, original amount/currency, timestamps, or lending links. Source backup remains unchanged until a separately approved encrypted copy is exported.",
      inputSchema: {
        id: z.string().min(1).max(256),
        category: z.string().max(80).optional(),
        merchant: z.string().max(256).optional(),
        note: z.string().max(500).optional(),
        excluded: z.boolean().optional(),
        kind: z
          .enum([
            "purchase",
            "income",
            "refund",
            "transfer",
            "card_payment",
            "cash",
          ])
          .optional(),
        inr_amount_minor_units: z.number().int().positive().optional(),
      },
    },
    async ({ id, inr_amount_minor_units, ...patch }) => {
      const { journal, digest } = await readJournal();
      if (stagedDigest && stagedDigest !== digest)
        throw new Error(
          "The source backup changed while edits were staged. Discard them and start again.",
        );
      changes.updateTransaction(journal, {
        id,
        patch: {
          ...patch,
          ...(inr_amount_minor_units !== undefined
            ? { inrAmount: inr_amount_minor_units }
            : {}),
        },
      });
      stagedDigest = digest;
      approvalToken = null;
      return textResult({
        staged: true,
        changeCount: changes.changes.length,
        transactionId: id,
        next: "Call preview_changes before requesting export.",
      });
    },
  );

  server.registerTool(
    "stage_bulk_categorize",
    {
      description:
        "Stage a category change for explicitly supplied transaction IDs. The selected count must match expected_count; no filter can silently expand the set. Maximum 100 IDs per call. Show the affected transactions and ask the user to approve before exporting.",
      inputSchema: {
        transaction_ids: z.array(z.string().min(1).max(256)).min(1).max(100),
        category: z.string().max(80),
        expected_count: z.number().int().min(1).max(100),
      },
    },
    async ({ transaction_ids, category, expected_count }) => {
      const { journal, digest } = await readJournal();
      if (stagedDigest && stagedDigest !== digest)
        throw new Error(
          "The source backup changed while edits were staged. Discard them and start again.",
        );
      changes.bulkCategorize(journal, {
        transactionIds: transaction_ids,
        category,
        expectedCount: expected_count,
      });
      stagedDigest = digest;
      approvalToken = null;
      return textResult({
        staged: true,
        changeCount: changes.changes.length,
        selectedTransactions: transaction_ids.length,
        next: "Call preview_changes before requesting export.",
      });
    },
  );

  server.registerTool(
    "preview_changes",
    {
      description:
        approvalMode === "required"
          ? "Show the exact staged edits, including each affected transaction's current and proposed values. This is read-only and does not write any file. The returned one-time token is required for user-approved export."
          : "Show the exact staged edits, including each affected transaction's current and proposed values. This read-only preview is still required before export, but the approval token can be used without the additional explicit approval phrase because preview-only mode is enabled.",
      inputSchema: {},
    },
    async () => {
      const { journal, digest } = await readJournal();
      if (!changes.changes.length)
        return textResult({
          changes: [],
          message: "There are no staged changes.",
        });
      if (stagedDigest !== digest)
        throw new Error(
          "The source backup changed while edits were staged. Discard them and start again.",
        );
      approvalToken = randomBytes(18).toString("hex");
      return textResult({
        sourceBackup: basename(backupPath),
        changeCount: changes.changes.length,
        changes: changes.preview(journal),
        approvalToken,
        approvalMode,
        exportSafety:
          "The original file is never overwritten. Export creates a separate encrypted backup that must be uploaded and restored by the user.",
      });
    },
  );

  const exportToolName =
    approvalMode === "required"
      ? "export_approved_changes"
      : "export_previewed_changes";
  server.registerTool(
    exportToolName,
    {
      description:
        approvalMode === "required"
          ? "Create a new encrypted .kbk file with the staged edits. Requires the one-time preview token and the user's explicit approval phrase. The original backup is never overwritten, and the app is not changed automatically."
          : "Create a new encrypted .kbk file with the staged edits after preview. This local server is configured for preview-only mode, so it does not require the extra approval phrase. The original backup is never overwritten and the phone is not changed automatically. Use this mode only if you intentionally enabled it in your local MCP configuration.",
      inputSchema:
        approvalMode === "required"
          ? {
              approval_token: z.string().min(1).max(100),
              approval_phrase: z.literal(
                "I reviewed the preview and approve exporting these changes.",
              ),
            }
          : { preview_token: z.string().min(1).max(100) },
    },
    async (args) => {
      const suppliedToken =
        approvalMode === "required" ? args.approval_token : args.preview_token;
      if (
        !changes.changes.length ||
        !approvalToken ||
        suppliedToken !== approvalToken
      )
        throw new Error(
          "No current preview token matches. Preview the staged changes again.",
        );
      const { journal, digest } = await readJournal();
      if (stagedDigest !== digest)
        throw new Error(
          "The source backup changed since preview. Discard and stage changes again.",
        );
      const updated = changes.apply(journal);
      const result = await writeEditedBackup({
        inputPath: backupPath,
        outputDir: process.env.KANAKKU_MCP_OUTPUT_DIR,
        journal: updated,
        password,
      });
      changes.clear();
      stagedDigest = null;
      approvalToken = null;
      return textResult({
        ...result,
        originalPreserved: true,
        phoneUpdated: false,
        next: "Upload this new .kbk file to Google Drive in place of the existing Kanakku backup, then use Kanakku → Settings → Email & backup → Restore to apply it on the phone.",
      });
    },
  );

  server.registerTool(
    "discard_staged_changes",
    {
      description:
        "Discard every staged edit without changing or writing any file.",
      inputSchema: {},
    },
    async () => {
      const count = changes.changes.length;
      changes.clear();
      stagedDigest = null;
      approvalToken = null;
      return textResult({ discarded: count });
    },
  );
}

const server = new McpServer({ name: "kanakku-local", version: "0.1.0" });
server.registerResource(
  "privacy-and-sync",
  "kanakku://privacy-and-sync",
  {
    title: "Kanakku MCP privacy and synchronization",
    description:
      "Explains which data the local MCP server exposes and how encrypted edits reach the phone.",
    mimeType: "text/plain",
  },
  async () => ({
    contents: [
      {
        uri: "kanakku://privacy-and-sync",
        mimeType: "text/plain",
        text: `This MCP server runs locally over stdio. It reads the user-selected, password-encrypted Kanakku .kbk backup and decrypts it only in local process memory. When an agent calls read tools, normalized financial data in the tool result is available to that agent/provider under its own terms. No Kanakku backend or telemetry is used. Export approval mode is ${approvalMode}. Edits are staged and always require a preview. In required mode, export also needs an explicit approval phrase; in preview-only mode, export needs the preview token but no extra phrase. Export writes a new encrypted backup beside the source and never overwrites the original or changes the phone. Upload the new file to the user's Google Drive backup and restore it in Kanakku to apply edits. Raw SMS/email message bodies are not part of the backup and are not exposed.`,
      },
    ],
  }),
);
registerTools(server);

init()
  .then(() => {
    console.error("Kanakku MCP server ready on stdio.");
    return serveStdio(() => server);
  })
  .catch((error) => {
    console.error(`Kanakku MCP setup failed: ${error.message}`);
    process.exitCode = 1;
  });
