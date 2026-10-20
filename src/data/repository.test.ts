/// <reference types="node" />
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrateLedger } from "./migrations";
import { Transaction } from "../domain/model";
import type { ReceiptDraft } from "../domain/receipt";
const fixture = vi.hoisted(() => ({
  file: "",
  cipher: true,
  writes: 0,
  fail: false,
}));
vi.mock("expo-sqlite", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  return {
    openDatabaseAsync: async () => {
      const sql = new DatabaseSync(fixture.file);
      const handle = {
        execAsync: async (query: string) => {
          if (!query.startsWith("PRAGMA key")) sql.exec(query);
        },
        getFirstAsync: async (query: string) =>
          query === "PRAGMA cipher_version"
            ? fixture.cipher
              ? { cipher_version: "test capability" }
              : null
            : (sql.prepare(query).get() ?? null),
        getAllAsync: async (query: string) => sql.prepare(query).all(),
        closeAsync: async () => sql.close(),
        runAsync: async (q: string, ...args: string[]) => {
          fixture.writes++;
          if (fixture.fail && fixture.writes > 1)
            throw new Error("interrupted write");
          sql.prepare(q).run(...args);
        },
        // Expo creates a separate unkeyed connection here. The host adapter
        // cannot perform encrypted writes on that connection either.
        withExclusiveTransactionAsync: async () => {
          throw new Error("Exclusive transaction opened an unkeyed connection");
        },
      };
      return handle;
    },
    deleteDatabaseAsync: async () => rmSync(fixture.file, { force: true }),
  };
});
import {
  openLive,
  closeLive,
  readLive,
  replaceLive,
  saveLive,
} from "./repository.native";
let folder = "";
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "kanakku-storage-test-"));
  fixture.file = join(folder, "ledger.db");
  fixture.cipher = true;
  fixture.writes = 0;
  fixture.fail = false;
});
afterEach(async () => {
  await closeLive();
  rmSync(folder, { recursive: true, force: true });
});
const transaction: Transaction = {
  id: "fixture",
  amount: 25000,
  merchant: "Rahul",
  bank: "HDFC",
  account: "1234",
  at: "2026-10-13T12:00:00Z",
  category: "Transport",
  kind: "purchase",
  review: false,
  excluded: false,
  note: "auto to office",
  source: "sample",
  reason: "Confirmed by you",
};
describe("SQLite ledger persistence and migrations (not cryptographic validation)", () => {
  it("preserves corrections and rules after reopening, without rewriting unchanged rows", async () => {
    await openLive("a".repeat(64));
    await readLive();
    await saveLive(
      [transaction],
      [{ merchant: "Rahul", category: "Transport" }],
    );
    fixture.writes = 0;
    await saveLive(
      [transaction],
      [{ merchant: "Rahul", category: "Transport" }],
    );
    expect(fixture.writes).toBe(0);
    await closeLive();
    await openLive("a".repeat(64));
    expect(await readLive()).toEqual({
      transactions: [transaction],
      rules: [{ merchant: "Rahul", category: "Transport" }],
      metadata: { recurringDecisions: {}, customCategories: [], loans: [] },
    });
  });
  it("restores an exact journal snapshot and rolls back replacement on failure", async () => {
    await openLive("a".repeat(64));
    await readLive();
    await saveLive(
      [transaction],
      [{ merchant: "Rahul", category: "Transport" }],
    );
    await replaceLive(
      [{ ...transaction, id: "restored", note: "Restored note" }],
      [{ merchant: "Cafe", category: "Food & dining" }],
      { recurringDecisions: { "Cafe:monthly": "confirmed" } },
    );
    expect(await readLive()).toEqual({
      transactions: [{ ...transaction, id: "restored", note: "Restored note" }],
      rules: [{ merchant: "Cafe", category: "Food & dining" }],
      metadata: {
        recurringDecisions: { "Cafe:monthly": "confirmed" },
        customCategories: [],
        loans: [],
      },
    });

    fixture.writes = 0;
    fixture.fail = true;
    await expect(
      replaceLive([transaction, { ...transaction, id: "second" }], [], {
        recurringDecisions: {},
      }),
    ).rejects.toThrow("interrupted write");
    fixture.fail = false;
    await closeLive();
    await openLive("a".repeat(64));
    expect(await readLive()).toEqual({
      transactions: [{ ...transaction, id: "restored", note: "Restored note" }],
      rules: [{ merchant: "Cafe", category: "Food & dining" }],
      metadata: {
        recurringDecisions: { "Cafe:monthly": "confirmed" },
        customCategories: [],
        loans: [],
      },
    });
  });
  it("round-trips receipt edits, removal and restored snapshots without changing the payment", async () => {
    const receipt: ReceiptDraft = {
      version: 1,
      currency: "INR",
      merchant: "Sample Cafe",
      date: "2026-10-12",
      items: [
        {
          name: "Coffee",
          quantity: 2,
          unitPricePaise: 10000,
          amountPaise: 20000,
        },
      ],
      subtotalPaise: 20000,
      taxPaise: 1000,
      totalPaise: 21000,
      warnings: [],
      reconciliation: "matches",
      confidence: "high",
    };
    const confirmed = {
      ...transaction,
      receipt,
      note: "Shared with colleagues",
    };
    await openLive("a".repeat(64));
    await readLive();
    await saveLive([confirmed], []);
    await closeLive();
    await openLive("a".repeat(64));
    const beforeRemoval = (await readLive()).transactions;
    expect(beforeRemoval).toEqual([confirmed]);
    const { receipt: _removed, ...withoutReceipt } = confirmed;
    await saveLive([withoutReceipt], []);
    await closeLive();
    await openLive("a".repeat(64));
    expect((await readLive()).transactions).toEqual([withoutReceipt]);
    // Undo supplies its original committed snapshot to this same persistence boundary.
    await saveLive(beforeRemoval, []);
    await closeLive();
    await openLive("a".repeat(64));
    const restored = (await readLive()).transactions;
    expect(restored).toEqual([confirmed]);
    expect(restored[0].amount).toBe(25000);
    expect(restored[0].at).toBe(transaction.at);
    expect(restored[0].receipt?.totalPaise).toBe(21000);
  });
  it("rolls back receipt edits with the entire interrupted journal write", async () => {
    const receipt: ReceiptDraft = {
      version: 1,
      currency: "INR",
      merchant: "Sample Cafe",
      items: [{ name: "Coffee", amountPaise: 25000 }],
      totalPaise: 25000,
      warnings: [],
      reconciliation: "matches",
      confidence: "high",
    };
    const confirmed = { ...transaction, receipt };
    await openLive("a".repeat(64));
    await readLive();
    await saveLive([confirmed], []);
    fixture.writes = 0;
    fixture.fail = true;
    await expect(
      saveLive(
        [
          {
            ...confirmed,
            receipt: { ...receipt, merchant: "Edited merchant" },
          },
          { ...transaction, id: "second" },
        ],
        [],
      ),
    ).rejects.toThrow("interrupted write");
    await closeLive();
    await openLive("a".repeat(64));
    expect((await readLive()).transactions).toEqual([confirmed]);
  });
  it("persists recurring decisions with the journal and preserves them during ordinary corrections", async () => {
    await openLive("a".repeat(64));
    await readLive();
    await saveLive([transaction], [], {
      recurringDecisions: { "recurring-fixture": "confirmed" },
    });
    await saveLive([{ ...transaction, note: "edited" }], []);
    await closeLive();
    await openLive("a".repeat(64));
    expect((await readLive()).metadata.recurringDecisions).toEqual({
      "recurring-fixture": "confirmed",
    });
    expect((await readLive()).transactions[0].note).toBe("edited");
  });
  it("persists custom category labels inside the encrypted journal metadata", async () => {
    await openLive("a".repeat(64));
    await readLive();
    await saveLive([transaction], [], {
      recurringDecisions: {},
      customCategories: ["Friends"],
    });
    await closeLive();
    await openLive("a".repeat(64));
    expect((await readLive()).metadata.customCategories).toEqual(["Friends"]);
  });
  it("rolls back an interrupted write rather than committing a partial journal", async () => {
    await openLive("a".repeat(64));
    await readLive();
    fixture.fail = true;
    await expect(
      saveLive([transaction, { ...transaction, id: "second" }], []),
    ).rejects.toThrow("interrupted");
    await closeLive();
    await openLive("a".repeat(64));
    expect((await readLive()).transactions).toEqual([]);
  });
  it("serializes concurrent journal writes and keeps the final committed snapshot after reopen", async () => {
    await openLive("a".repeat(64));
    await readLive();
    const second = {
      ...transaction,
      id: "second",
      amount: 12345,
      note: "Second event",
    };
    await Promise.all([
      saveLive([transaction], []),
      saveLive([transaction, second], [], {
        recurringDecisions: { fixture: "confirmed" },
      }),
    ]);
    await closeLive();
    await openLive("a".repeat(64));
    const saved = await readLive();
    expect(saved.transactions).toEqual([transaction, second]);
    expect(saved.metadata.recurringDecisions).toEqual({ fixture: "confirmed" });
  });
  it("fails closed when SQLCipher capability is absent", async () => {
    fixture.cipher = false;
    await expect(openLive("a".repeat(64))).rejects.toThrow(
      "does not include SQLCipher",
    );
    await expect(readLive()).rejects.toThrow("Unlock");
  });
  it("migrates a version-one journal without losing its rows, and refuses future schemas", async () => {
    const sql = new DatabaseSync(fixture.file);
    sql.exec(
      "CREATE TABLE transactions(id TEXT PRIMARY KEY,value TEXT); CREATE TABLE rules(merchant TEXT PRIMARY KEY,value TEXT); PRAGMA user_version=1;",
    );
    sql
      .prepare("INSERT INTO transactions VALUES (?,?)")
      .run(transaction.id, JSON.stringify(transaction));
    sql.close();
    await openLive("a".repeat(64));
    expect((await readLive()).transactions[0]).toEqual(transaction);
    await closeLive();
    const future = new DatabaseSync(fixture.file);
    future.exec("PRAGMA user_version=999");
    future.close();
    await expect(openLive("a".repeat(64))).rejects.toThrow("newer Kanakku");
  });
});
