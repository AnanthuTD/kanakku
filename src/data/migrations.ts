export const LEDGER_VERSION = 2;
export interface MigrationDatabase {
  getFirstAsync<T>(sql: string): Promise<T | null>;
  execAsync(sql: string): Promise<void>;
}
export async function migrateLedger(db: MigrationDatabase) {
  const version =
    (await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version"))
      ?.user_version ?? 0;
  if (version > LEDGER_VERSION)
    throw new Error(
      "This journal was created by a newer Kanakku version. Update the app to open it.",
    );
  await db.execAsync("BEGIN IMMEDIATE;");
  try {
    if (version < 1)
      await db.execAsync(
        "CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS rules (merchant TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);",
      );
    if (version < 2)
      await db.execAsync(
        "CREATE TABLE IF NOT EXISTS ledger_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); INSERT OR IGNORE INTO ledger_meta (key,value) VALUES ('format','json-events-v2');",
      );
    await db.execAsync(`PRAGMA user_version = ${LEDGER_VERSION}; COMMIT;`);
  } catch (e) {
    await db.execAsync("ROLLBACK;");
    throw e;
  }
}
