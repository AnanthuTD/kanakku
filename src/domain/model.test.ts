import { describe, it, expect } from "vitest";
import {
  classify,
  categoryTotals,
  decimalToPaise,
  inMonth,
  isMixedCategoryText,
  mergeTransactions,
  money,
  netSpend,
  Transaction,
} from "./model";
const base: Transaction = {
  id: "a",
  amount: 50000,
  merchant: "Rahul",
  account: "1234",
  bank: "SBI",
  at: "2026-10-13T12:00:00Z",
  category: "Uncategorized",
  kind: "purchase",
  review: true,
  excluded: false,
  note: "",
  source: "sms",
  reason: "Needs context",
};
describe("ledger correctness", () => {
  it("keeps uncertain purchases in spend and excludes card repayments and transfers", () => {
    expect(
      netSpend([
        base,
        { ...base, id: "b", kind: "card_payment" },
        { ...base, id: "c", kind: "transfer" },
      ]),
    ).toBe(50000);
  });
  it("subtracts partial refunds and honors exclusions", () =>
    expect(
      netSpend([
        base,
        { ...base, id: "r", kind: "refund", amount: 12000 },
        { ...base, id: "e", excluded: true },
      ]),
    ).toBe(38000));
  it("deduplicates delivery IDs but keeps different equal-value payments", () =>
    expect(
      mergeTransactions([base], [base, { ...base, id: "b" }]),
    ).toHaveLength(2));
  it("preserves a correction when an event is replayed", () =>
    expect(
      mergeTransactions(
        [{ ...base, category: "Transport", review: false }],
        [base],
      )[0].category,
    ).toBe("Transport"));
  it("re-import corrects a legacy foreign charge recorded as the card limit, keeping user context", () => {
    const legacy = { ...base, amount: 4500050, category: "Entertainment", note: "Music app", review: false };
    const [row] = mergeTransactions([legacy], [{ ...base, amount: 999, currency: "USD" }]);
    expect(row).toMatchObject({ amount: 999, currency: "USD", note: "Music app", category: "Entertainment", review: true });
    expect(row.inrAmount).toBeUndefined();
    expect(netSpend([row])).toBe(0);
  });
  it("never rewrites a foreign row the user already settled, or rows from another account", () => {
    const settled = { ...base, amount: 999, currency: "USD", inrAmount: 84000, review: false };
    expect(mergeTransactions([settled], [{ ...base, amount: 999, currency: "USD" }])[0]).toEqual(settled);
    const other = { ...base, account: "9999" };
    expect(mergeTransactions([other], [{ ...base, amount: 999, currency: "USD" }])[0]).toEqual(other);
  });
  it("shows paise with two digits and whole rupees without decimals", () => {
    expect(money(432150)).toBe("₹4,321.50");
    expect(money(42000)).toBe("₹420");
    expect(money(30025)).toBe("₹300.25");
    expect(money(42000, true)).toBe("₹420.00");
  });
  it("parses currency with integer arithmetic and rejects invalid values", () => {
    expect(decimalToPaise("1,234.56")).toBe(123456);
    expect(decimalToPaise("0.29")).toBe(29);
    expect(decimalToPaise("NaN")).toBeNull();
    expect(decimalToPaise("-12")).toBeNull();
    expect(decimalToPaise("1.234")).toBeNull();
  });
  it("accepts Indian and international grouping but rejects malformed grouping", () => {
    expect(decimalToPaise("1,23,456.78")).toBe(12345678);
    expect(decimalToPaise("123,456.78")).toBe(12345678);
    for (const input of [
      "1,2",
      "12,34",
      "1,,234",
      ",123",
      "123,",
      "1,234,56",
      "1.2,3",
    ])
      expect(decimalToPaise(input), input).toBeNull();
    expect(decimalToPaise("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(decimalToPaise("90071992547409.92")).toBeNull();
  });
  it("uses the refund's posting period and preserves negative net spending", () => {
    const entries: Transaction[] = [
      { ...base, amount: 100000, category: "Shopping" },
      {
        ...base,
        id: "partial-one",
        at: "2026-11-01T12:00:00Z",
        kind: "refund",
        amount: 25000,
        category: "Shopping",
      },
      {
        ...base,
        id: "partial-two",
        at: "2026-11-03T12:00:00Z",
        kind: "refund",
        amount: 75000,
        category: "Shopping",
      },
      {
        ...base,
        id: "excluded-refund",
        kind: "refund",
        amount: 99999,
        excluded: true,
      },
      ...(["income", "cash", "transfer", "card_payment"] as const).map(
        (kind) => ({ ...base, id: kind, kind }),
      ),
    ];
    expect(netSpend(inMonth(entries, "2026-10"))).toBe(100000);
    expect(netSpend(inMonth(entries, "2026-11"))).toBe(-100000);
    expect(netSpend(entries)).toBe(0);
    expect(categoryTotals(inMonth(entries, "2026-11"))).toEqual([
      { category: "Shopping", amount: -100000 },
    ]);
  });
  it("preserves every correction field and provenance on a historical/live replay", () => {
    const corrected: Transaction = {
      ...base,
      merchant: "Office auto",
      originalMerchant: "Rahul",
      category: "Transport",
      review: false,
      excluded: true,
      note: "Morning commute",
      classification: { method: "user", version: "user-v1" },
      reference: "123456789001",
    };
    const replay = {
      ...base,
      reference: corrected.reference,
      reason: "New model result",
      classification: {
        method: "model" as const,
        version: "new-v2",
        score: 0.99,
      },
    };
    expect(mergeTransactions([corrected], [replay, replay])).toEqual([
      corrected,
    ]);
  });
  it("does not merge ambiguous cross-source alerts or shared references without ingestion identity", () => {
    const entries = mergeTransactions(
      [],
      [
        {
          ...base,
          id: "card-alert",
          reference: "123456789001",
          bank: "Axis",
          account: "5678",
        },
        {
          ...base,
          id: "wallet-alert",
          reference: "123456789001",
          bank: "Slice",
          account: "5678",
        },
        {
          ...base,
          id: "another-account",
          reference: "123456789001",
          bank: "Axis",
          account: "0001",
        },
        {
          ...base,
          id: "second-payment",
          reference: "123456789002",
          bank: "Axis",
          account: "5678",
        },
      ],
    );
    expect(entries.map((t) => t.id)).toEqual([
      "card-alert",
      "wallet-alert",
      "another-account",
      "second-payment",
    ]);
    expect(netSpend(entries)).toBe(200000);
  });
});
describe("local classification", () => {
  it.each([
    ["auto to office", "Transport"],
    ["chai with friends", "Food & dining"],
    ["paid the maid", "Home"],
  ])("classifies %s", (text, category) =>
    expect(classify(text).category).toBe(category),
  );
  it("abstains on personal names and ambiguous phrases", () => {
    expect(classify("paid Rahul").confidence).toBe(0);
    expect(classify("groceries and rent").confidence).toBe(0);
  });
  it("uses exact personal merchant overrides", () => {
    expect(
      classify("  RAHUL ", [{ merchant: "Rahul", category: "Home" }]).category,
    ).toBe("Home");
    expect(
      classify("Rahul S", [{ merchant: "Rahul", category: "Home" }]).confidence,
    ).toBe(0);
  });
  it.each([
    ["takeaway from the cafe", "Food & dining"],
    ["take-away dinner", "Food & dining"],
    ["take away lunch", "Food & dining"],
    ["new headphones", "Shopping"],
    ["headphone replacement", "Shopping"],
    ["new shoes", "Shopping"],
    ["a blood test", "Health"],
  ])("recognizes ordinary single-purpose note %s", (text, category) => {
    expect(classify(text).category).toBe(category);
    expect(isMixedCategoryText(text)).toBe(false);
  });
  it.each([
    "groceries and rent",
    "coffee and headphones",
    "takeaway dinner plus new headphones",
    "taxi to office and electricity recharge",
    "Netflix and pharmacy",
    "  ＣＯＦＦＥＥ   and ＨＥＡＤＰＨＯＮＥＳ  ",
    "Split payment for shoes and a blood test",
    "One payment covered taxi fare and takeaway",
    "Bought vegetables and headphones together",
  ])("retains deliberate ambiguity for mixed-purpose note %s", (text) => {
    expect(isMixedCategoryText(text)).toBe(true);
    expect(classify(text)).toMatchObject({
      category: "Uncategorized",
      confidence: 0,
    });
  });
  it.each([
    ["coffee and dinner with friends", "Food & dining"],
    ["milk, vegetables and groceries", "Groceries"],
    ["headphones and clothes", "Shopping"],
    ["auto, metro and petrol", "Transport"],
  ])(
    "does not confuse same-category terms with multiple purposes in %s",
    (text, category) => {
      expect(isMixedCategoryText(text)).toBe(false);
      expect(classify(text).category).toBe(category);
    },
  );
  it.each([
    "paid Rahul",
    "unknown public merchant",
    "",
    "autograph supplies",
    "chair repair",
  ])(
    "distinguishes unknown text from recognized mixed purposes in %s",
    (text) => {
      expect(isMixedCategoryText(text)).toBe(false);
      expect(classify(text).category).toBe("Uncategorized");
    },
  );
  it("preserves explicit personal rule precedence even for a mixed keyword merchant", () => {
    const text = " Coffee and Headphones ";
    expect(isMixedCategoryText(text)).toBe(true);
    expect(
      classify(text, [{ merchant: "coffee and headphones", category: "Home" }]),
    ).toEqual({
      category: "Home",
      confidence: 1,
      reason: "Your merchant rule",
    });
    expect(
      classify(text, [
        { merchant: "coffee and headphones", category: "Uncategorized" },
      ]).confidence,
    ).toBe(0);
  });
});
