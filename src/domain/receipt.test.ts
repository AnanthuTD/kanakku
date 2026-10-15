import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify } from "./model";
import {
  buildReceiptNote,
  normalizeReceipt,
  parseReceipt,
  RECEIPT_LIMITS,
} from "./receipt";

const grocery = readFileSync(
  new URL("../../tests/receipts/grocery.txt", import.meta.url),
  "utf8",
);
const fixture = (name: string) =>
  readFileSync(
    new URL(`../../tests/receipts/${name}.txt`, import.meta.url),
    "utf8",
  );
const ichiban = readFileSync(
  new URL("../../tests/receipts/ichiban-sushi.txt", import.meta.url),
  "utf8",
);
describe("editable offline bill extraction", () => {
  it("reads a restaurant bill with counters, a named-month date and a service charge", () => {
    const bill = parseReceipt(ichiban);
    // Print count, PAX and table number are counters, never priced items.
    expect(bill.items.map((item) => item.name)).toEqual([
      "Beef Teriyaki Ramen",
      "Sapporo Garlic Sesame Rame (DITA",
      "Katsu Roll",
      "Salmon sakura",
      "Spicy Creamy Namazu Roll",
      "Black Current 1L",
    ]);
    expect(bill.items.map((item) => item.quantity)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(bill.date).toBe("2024-08-19");
    expect(bill.subtotalPaise).toBe(22300000);
    expect(bill.taxPaise).toBe(2341500);
    expect(bill.totalPaise).toBe(25756500);
    // Service charge is a printed adjustment between subtotal and total.
    expect(bill.serviceChargePaise).toBe(1115000);
    expect(bill.reconciliation).toBe("matches");
    // Amounts add up, but the currency hint (below) rightly holds confidence at medium.
    expect(bill.confidence).toBe("medium");
  });
  it("reads a column bill with wrapped item names, a two-digit year and a negative round-off", () => {
    const bill = parseReceipt(fixture("brahmins-idli"));
    expect(bill.merchant).toBe("Brahmins Thatte Idli- Basaveshwar nagar");
    expect(bill.date).toBe("2026-04-21");
    expect(bill.items).toEqual([
      {
        name: "Ghee Podi Thatte Idli (1Pcs)",
        quantity: 1,
        unitPricePaise: 7500,
        amountPaise: 7500,
      },
      {
        name: "Ghee Podi Masala Dosa",
        quantity: 5,
        unitPricePaise: 9500,
        amountPaise: 47500,
      },
    ]);
    expect(bill.subtotalPaise).toBe(55000);
    expect(bill.roundingPaise).toBe(-3);
    expect(bill.totalPaise).toBe(55000);
    // Token/bill numbers and the FSSAI licence are never items; the 3-paise round-off is a
    // printed oddity the user can see, so the mismatch stays visible rather than hidden.
    expect(bill.warnings).not.toContain(
      "An item amount could not be read safely.",
    );
    expect(bill.warnings).not.toContain(
      "The printed date could not be read safely.",
    );
  });
  it("reads a quantity-first bill with a wrapped name, excl-GST subtotal, gross amount and net total", () => {
    const bill = parseReceipt(fixture("jagavis-kritunga"));
    expect(bill.merchant).toBe("JAGAVIS KRITUNGA");
    expect(bill.date).toBe("2025-01-16");
    expect(
      bill.items.map((item) => [item.name, item.quantity, item.amountPaise]),
    ).toEqual([
      ["RAGI MUDDA (SANKATI)", 4, 44000],
      ["NATUKODI PULUSU", 2, 69800],
      ["GONGURA CHICKEN BIRYA NI", 1, 34900],
      ["PRAWNS BIRYANI", 1, 36900],
      ["MUTTON BIRYANI", 1, 39900],
      ["WATER BOTTLE", 2, 4000],
      ["DOUBLE KA MEETA", 2, 28000],
    ]);
    expect(bill.subtotalPaise).toBe(257500);
    expect(bill.taxPaise).toBe(12675);
    expect(bill.totalPaise).toBe(270175);
    expect(bill.reconciliation).toBe("matches");
  });
  it("reads an MRP/rate/amount grocery bill, ignoring phone numbers and loyalty-point rows", () => {
    const bill = parseReceipt(fixture("grocery-chengalpattu"));
    expect(bill.date).toBe("2025-01-20");
    expect(bill.items).toHaveLength(10);
    expect(bill.items[0]).toEqual({
      name: "MODERN RUSK 10RS",
      quantity: 1,
      unitPricePaise: 1000,
      amountPaise: 1000,
    });
    expect(bill.items[3]).toEqual({
      name: "IYARKAI CHEKKU SE",
      quantity: 1,
      unitPricePaise: 17500,
      amountPaise: 17500,
    });
    expect(bill.items.map((item) => item.name)).not.toContain("PH");
    expect(bill.items.some((item) => /points|earning/i.test(item.name))).toBe(
      false,
    );
    expect(bill.totalPaise).toBe(41600);
    expect(bill.reconciliation).toBe("matches");
  });
  it("refuses a US-dollar receipt instead of guessing rupee amounts", () => {
    const bill = parseReceipt(fixture("riverside-market-usd"));
    expect(bill.items).toEqual([]);
    expect(bill.totalPaise).toBeUndefined();
    expect(bill.warnings).toContain(
      "Only INR bills are supported. Enter amounts manually.",
    );
  });
  it("reads a utility bill: charge rows, Bill Amount as the total, and no identifiers as money", () => {
    const bill = parseReceipt(fixture("electricity-tgspdcl"));
    expect(bill.items).toEqual([]);
    expect(bill.totalPaise).toBe(16100);
    expect(bill.date).toBe("2025-09-02");
    // Consumer/meter numbers and mobile numbers are identifiers, never amounts.
    expect(JSON.stringify(bill)).not.toMatch(/11118168100|8712472162|7101500/);
  });
  it("reads a crumpled hypermarket bill: HSN codes are not amounts and tender rows are not items", () => {
    const bill = parseReceipt(fixture("tsb-hypermarket"));
    expect(bill.totalPaise).toBe(194900);
    expect(bill.subtotalPaise).toBe(194900);
    expect(bill.discountPaise).toBe(0);
    const names = bill.items.map((item) => item.name);
    expect(names).not.toContain("Amount :");
    expect(names).not.toContain("You Have Saved :");
    expect(names.some((name) => /^Hsn|Qty Time/.test(name))).toBe(false);
    expect(
      bill.items.some(
        (item) => item.amountPaise !== undefined && item.amountPaise > 100000,
      ),
    ).toBe(false);
  });
  it("reads a weighed-produce bill: fractional kg quantities, a 1X row, an unlabelled subtotal and NET total", () => {
    const bill = parseReceipt(fixture("grand-fresh"));
    expect(bill.items).toHaveLength(15);
    expect(bill.items[0]).toEqual({
      name: "DRUMSTIC",
      quantity: 0.09,
      unitPricePaise: 22000,
      amountPaise: 1980,
    });
    expect(bill.items[6]).toEqual({
      name: "RAW BANNAN",
      quantity: 1,
      unitPricePaise: 1200,
      amountPaise: 1200,
    });
    expect(bill.subtotalPaise).toBe(39756);
    expect(bill.roundingPaise).toBe(44);
    expect(bill.totalPaise).toBe(39800);
    expect(bill.reconciliation).toBe("matches");
    expect(bill.confidence).toBe("high");
  });
  it("reads a three-line HSN produce layout (name / rate kg value / code) without inventing amounts", () => {
    const bill = parseReceipt(fixture("veg-hsn-crop"));
    // A mid-bill crop: no merchant header and no total are expected; the rows must still be sane.
    expect(bill.totalPaise).toBeUndefined();
    expect(bill.items.length).toBeGreaterThanOrEqual(12);
    const beans = bill.items.find(
      (item) => item.name === "STRING LESS BEANS kg",
    );
    expect(beans).toEqual({
      name: "STRING LESS BEANS kg",
      quantity: 0.889,
      unitPricePaise: 7900,
      amountPaise: 7023,
    });
    expect(
      bill.items.every(
        (item) => item.amountPaise !== undefined && item.amountPaise < 100000,
      ),
    ).toBe(true);
    // HSN codes never become quantities or amounts.
    expect(JSON.stringify(bill.items)).not.toMatch(/7092000|8031010|7104000/);
  });
  it("flags a bill whose amounts are not rupees instead of silently treating them as INR", () => {
    const bill = parseReceipt(ichiban);
    expect(bill.warnings).toContain(
      "This bill may not be in rupees. Check the amounts.",
    );
  });
  it("handles discounts and signed rounding as printed adjustments", () => {
    const bill = parseReceipt(
      "MART\nTea 100.00\nDiscount -10.00\nRound off -0.25\nTotal 89.75",
    );
    expect(bill).toMatchObject({
      totalPaise: 8975,
      discountPaise: 1000,
      roundingPaise: -25,
      reconciliation: "matches",
    });
  });
  it("does not reinterpret negative item or total amounts as positive purchases", () => {
    const bill = parseReceipt("MART\nReturned milk -50.00\nTotal -50.00");
    expect(bill.items).toEqual([]);
    expect(bill.totalPaise).toBeUndefined();
    expect(bill.confidence).toBe("low");
  });
  it("does not mistake item counts for the bill total or cash-like item names for tender", () => {
    const bill = parseReceipt(
      "MART\nCashew 100.00\nCashmere shirt 500.00\nTotal Items 2\nTotal No of Items 2\nGrand Total 600.00",
    );
    expect(bill.items).toHaveLength(2);
    expect(bill.totalPaise).toBe(60000);
    expect(
      parseReceipt("MART\nTea 100.00\nTotal No of Items 1").totalPaise,
    ).toBeUndefined();
  });
  it("joins a multi-line item name and preserves decimal printed quantities", () => {
    const bill = parseReceipt(
      "MART\nOrganic\nRice\n1.5 x 50.00 75.00\nTotal 75.00",
    );
    expect(bill.items).toEqual([
      {
        name: "Organic Rice",
        quantity: 1.5,
        unitPricePaise: 5000,
        amountPaise: 7500,
      },
    ]);
    expect(bill.reconciliation).toBe("matches");
  });
  it("recalculates mismatch warnings when the user corrects an extracted amount", () => {
    const bill = parseReceipt("MART\nMilk 50.00\nTotal 60.00");
    expect(bill.reconciliation).toBe("mismatch");
    const corrected = normalizeReceipt({ ...bill, totalPaise: 5000 });
    expect(corrected?.reconciliation).toBe("matches");
    expect(corrected?.warnings).toEqual([]);
  });
  it("reads integer-paise items and explicit GST components, excluding tender/change", () => {
    const bill = parseReceipt(grocery);
    expect(bill).toMatchObject({
      merchant: "COCONUT MART",
      date: "2026-10-15",
      subtotalPaise: 17600,
      taxPaise: 880,
      totalPaise: 18480,
      reconciliation: "matches",
      confidence: "high",
      warnings: [],
    });
    expect(bill.items).toEqual([
      { name: "Milk", quantity: 2, unitPricePaise: 2800, amountPaise: 5600 },
      { name: "Rice", quantity: 1, unitPricePaise: 12000, amountPaise: 12000 },
    ]);
  });
  it("prefers grand total over total and does not substitute cash/change/balance/payment", () => {
    const bill = parseReceipt(
      "GREEN CAFE\nTea 40.00\nTotal 40.00\nGrand Total 42.00\nTotal 40.00\nCash 100.00\nChange 58.00\nBalance 0.00\nUPI 42.00",
    );
    expect(bill.totalPaise).toBe(4200);
    expect(bill.items).toEqual([{ name: "Tea", amountPaise: 4000 }]);
    expect(bill.reconciliation).toBe("mismatch");
  });
  it("does not infer the total from a cash tender or item sum", () => {
    const bill = parseReceipt("MART\nMilk 50.00\nCash 100.00\nChange 50.00");
    expect(bill.totalPaise).toBeUndefined();
    expect(bill.reconciliation).toBe("incomplete");
    expect(bill.confidence).toBe("low");
  });
  it("does not treat a tax percentage as a rupee amount", () => {
    const bill = parseReceipt("MART\nTea 100.00\nGST 5%\nTotal 100.00");
    expect(bill.taxPaise).toBeUndefined();
    expect(bill.totalPaise).toBe(10000);
  });
  it("uses printed total tax once when components and total coexist", () => {
    const bill = parseReceipt(
      "MART\nTea 100.00\nSubtotal 100.00\nCGST 2.5% 2.50\nSGST 2.5% 2.50\nTotal Tax 5.00\nTotal 105.00",
    );
    expect(bill.taxPaise).toBe(500);
    expect(bill.reconciliation).toBe("matches");
  });
  it("warns if the tax components disagree with the printed total tax", () => {
    expect(
      parseReceipt(
        "MART\nTea 100.00\nCGST 2.50\nSGST 2.50\nGST 7.00\nTotal 107.00",
      ).warnings,
    ).toContain("The printed total tax differs from its components.");
  });
  it("preserves duplicate item names as separate rows", () => {
    expect(
      parseReceipt("MART\nMilk 28.00\nMilk 28.00\nTotal 56.00").items,
    ).toEqual([
      { name: "Milk", amountPaise: 2800 },
      { name: "Milk", amountPaise: 2800 },
    ]);
  });
  it("joins wrapped item quantities and total labels", () => {
    const bill = parseReceipt(
      "MART\nOrganic rice\n2 x 50.00 100.00\nGrand Total\n100.00",
    );
    expect(bill.items).toEqual([
      {
        name: "Organic rice",
        quantity: 2,
        unitPricePaise: 5000,
        amountPaise: 10000,
      },
    ]);
    expect(bill.totalPaise).toBe(10000);
  });
  it("supports Indian and international comma grouping without fixing malformed amounts", () => {
    expect(
      parseReceipt("MART\nLaptop 1,23,456.78\nTotal 1,23,456.78").totalPaise,
    ).toBe(12345678);
    expect(
      parseReceipt("MART\nLaptop 123,456.78\nTotal 123,456.78").totalPaise,
    ).toBe(12345678);
    for (const value of ["1,2", "12,34", "10.001", "90071992547409.92"]) {
      const bill = parseReceipt(`MART\nMilk ${value}\nTotal ${value}`);
      expect(bill.totalPaise).toBeUndefined();
      expect(bill.items).toEqual([]);
    }
  });
  it("rejects dates that overflow the actual calendar without inventing a time", () => {
    expect(
      parseReceipt("MART\nDate 31/02/2026\nTotal 50.00").date,
    ).toBeUndefined();
    expect(parseReceipt("MART\nDate 2024-02-29\nTotal 50.00").date).toBe(
      "2024-02-29",
    );
  });
  it("warns about different equally ranked totals", () => {
    expect(parseReceipt("MART\nTotal 50.00\nTotal 60.00").warnings).toContain(
      "Different totals were printed. Confirm the bill total.",
    );
  });
  it("checks printed quantity multiplication, without changing the observed amounts", () => {
    const bill = parseReceipt("MART\nMilk 2 x 28.00 60.00\nTotal 60.00");
    expect(bill.items[0]).toEqual({
      name: "Milk",
      quantity: 2,
      unitPricePaise: 2800,
      amountPaise: 6000,
    });
    expect(bill.reconciliation).toBe("mismatch");
  });
  it("does not convert foreign currency into INR", () => {
    const bill = parseReceipt("MART\nMilk USD 10.00\nTOTAL $10.00");
    expect(bill.items).toEqual([]);
    expect(bill.totalPaise).toBeUndefined();
    expect(bill.warnings).toContain(
      "Only INR bills are supported. Enter amounts manually.",
    );
  });
  it("keeps quantities in descriptions unless rate/amount columns disambiguate them", () => {
    expect(
      parseReceipt("MART\nVitamin B12 120.00\nOil 1 litre 150.00\nTotal 270.00")
        .items,
    ).toEqual([
      { name: "Vitamin B12", amountPaise: 12000 },
      { name: "Oil 1 litre", amountPaise: 15000 },
    ]);
  });
  it("offers mixed item context without assigning a category or altering the SMS amount", () => {
    const bill = parseReceipt(
      "MART\nMilk 50.00\nHeadphones 1000.00\nTotal 1050.00",
    );
    const note = buildReceiptNote(bill);
    expect(note).toBe("Milk, Headphones");
    expect(classify(note).category).toBe("Uncategorized");
    expect(bill).not.toHaveProperty("category");
  });
  it("retains user-edited fields, dropping OCR, photo URI and unknown nested properties", () => {
    const saved = normalizeReceipt({
      ...parseReceipt(grocery),
      rawText: "private text",
      uri: "file:///private.jpg",
      items: [
        {
          name: "Corrected item",
          quantity: 1,
          amountPaise: 18480,
          extra: "ignored",
        },
      ],
      subtotalPaise: undefined,
      taxPaise: undefined,
    });
    expect(saved?.items).toEqual([
      { name: "Corrected item", quantity: 1, amountPaise: 18480 },
    ]);
    expect(saved).not.toHaveProperty("rawText");
    expect(saved).not.toHaveProperty("uri");
    expect(saved?.reconciliation).toBe("matches");
  });
  it("rejects invalid stored shapes and never persists non-integer paise", () => {
    for (const value of [
      null,
      [],
      {},
      { version: 2, currency: "INR", items: [] },
      { version: 1, currency: "USD", items: [] },
    ])
      expect(normalizeReceipt(value)).toBeUndefined();
    const saved = normalizeReceipt({
      version: 1,
      currency: "INR",
      merchant: "MART",
      date: "2026-02-31",
      totalPaise: 50.25,
      taxPaise: -5,
      items: [
        {
          name: "Tea",
          quantity: Infinity,
          unitPricePaise: NaN,
          amountPaise: Number.MAX_SAFE_INTEGER + 1,
        },
      ],
    });
    expect(saved?.date).toBeUndefined();
    expect(saved?.totalPaise).toBeUndefined();
    expect(saved?.taxPaise).toBeUndefined();
    expect(saved?.items).toEqual([{ name: "Tea" }]);
  });
  it("bounds long OCR text and stored edited payloads", () => {
    const bill = parseReceipt(`MART\n${"Tea 1.00\n".repeat(500)}Total 500.00`);
    expect(bill.items).toHaveLength(RECEIPT_LIMITS.items);
    expect(bill.warnings.some((warning) => /long/.test(warning))).toBe(true);
    expect(
      normalizeReceipt({
        ...bill,
        merchant: "m".repeat(1000),
        warnings: Array(100).fill("w".repeat(1000)),
        items: Array(200).fill({ name: "n".repeat(1000), amountPaise: 100 }),
      })?.items,
    ).toHaveLength(RECEIPT_LIMITS.items);
    expect(
      normalizeReceipt({ ...bill, merchant: "m".repeat(1000) })?.merchant,
    ).toHaveLength(RECEIPT_LIMITS.name);
  });
});
