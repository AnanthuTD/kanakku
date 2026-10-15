import * as SQLite from "expo-sqlite";
import { Transaction, MerchantRule } from "../domain/model";
import { LedgerMetadata, ledgerMetadata } from "./metadata";
import { migrateLedger } from "./migrations";
let db: SQLite.SQLiteDatabase | null = null;
let cache: {
  transactions: Transaction[];
  rules: MerchantRule[];
  metadata: LedgerMetadata;
} | null = null;
let savedMetadata = "";
let savedValues = new Map<string, string>();
let savedRules = "";
let tail: Promise<unknown> = Promise.resolve();
function serial<T>(action: () => Promise<T>): Promise<T> {
  const next = tail.then(action);
  tail = next.catch(() => undefined);
  return next;
}
export const openLive = (key: string) =>
  serial(async () => {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid vault key");
    if (db) await db.closeAsync();
    db = null;
    cache = null;
    savedValues.clear();
    savedRules = "";
    savedMetadata = "";
    const candidate = await SQLite.openDatabaseAsync("kanakku-v1.db");
    try {
      await candidate.execAsync(`PRAGMA key = '${key}';`);
      const cipher = await candidate.getFirstAsync<{ cipher_version: string }>(
        "PRAGMA cipher_version",
      );
      if (!cipher?.cipher_version)
        throw new Error(
          "This build does not include SQLCipher. Real SMS storage is disabled.",
        );
      await candidate.execAsync("PRAGMA journal_mode = WAL;");
      await migrateLedger(candidate);
      db = candidate;
    } catch (e) {
      await candidate.closeAsync();
      throw e;
    }
  });
export const readLive = () =>
  serial(
    async (): Promise<{
      transactions: Transaction[];
      rules: MerchantRule[];
      metadata: LedgerMetadata;
    }> => {
      if (!db) throw new Error("Unlock Kanakku first");
      if (cache) return cache;
      const rows = await db.getAllAsync<{ id: string; value: string }>(
        "SELECT id,value FROM transactions",
      );
      const transactions = rows.map((r) => JSON.parse(r.value));
      savedValues = new Map(rows.map((r) => [r.id, r.value]));
      const rules = (
        await db.getAllAsync<{ value: string }>("SELECT value FROM rules")
      ).map((r) => JSON.parse(r.value));
      savedRules = JSON.stringify(rules);
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM ledger_meta WHERE key = 'preferences'",
      );
      const metadata = ledgerMetadata(row ? JSON.parse(row.value) : null);
      savedMetadata = JSON.stringify(metadata);
      cache = { transactions, rules, metadata };
      return cache;
    },
  );
export const saveLive = (
  transactions: Transaction[],
  rules: MerchantRule[],
  metadata: LedgerMetadata = cache?.metadata ?? ledgerMetadata(),
) =>
  serial(async () => {
    if (!db) throw new Error("Unlock Kanakku first");
    const handle = db;
    const values = transactions.map((t) => [t.id, JSON.stringify(t)] as const);
    const changed = values.filter(
      ([id, value]) => savedValues.get(id) !== value,
    );
    const nextRules = JSON.stringify(rules);
    const rulesChanged = nextRules !== savedRules;
    const cleanMetadata = ledgerMetadata(metadata);
    const nextMetadata = JSON.stringify(cleanMetadata);
    // Expo's exclusive transaction opens a new connection without our SQLCipher
    // key. Every repository operation already uses serial(), so transact on the
    // authenticated connection and keep writes/rollback under that same queue.
    await handle.execAsync("BEGIN IMMEDIATE;");
    try {
      for (const [id, value] of changed)
        await handle.runAsync(
          "INSERT OR REPLACE INTO transactions (id, value) VALUES (?, ?)",
          id,
          value,
        );
      if (nextMetadata !== savedMetadata)
        await handle.runAsync(
          "INSERT OR REPLACE INTO ledger_meta (key,value) VALUES ('preferences',?)",
          nextMetadata,
        );
      if (rulesChanged) {
        await handle.runAsync("DELETE FROM rules");
        for (const r of rules)
          await handle.runAsync(
            "INSERT INTO rules (merchant, value) VALUES (?, ?)",
            r.merchant,
            JSON.stringify(r),
          );
      }
      await handle.execAsync("COMMIT;");
    } catch (error) {
      await handle.execAsync("ROLLBACK;");
      throw error;
    }
    savedValues = new Map(values);
    savedRules = nextRules;
    savedMetadata = nextMetadata;
    cache = { transactions, rules, metadata: cleanMetadata };
  });
export const closeLive = () =>
  serial(async () => {
    const handle = db;
    db = null;
    cache = null;
    savedValues.clear();
    savedRules = "";
    savedMetadata = "";
    await handle?.closeAsync();
  });
export const deleteLive = () =>
  serial(async () => {
    const handle = db;
    db = null;
    cache = null;
    savedValues.clear();
    savedRules = "";
    savedMetadata = "";
    await handle?.closeAsync();
    await SQLite.deleteDatabaseAsync("kanakku-v1.db");
  });
