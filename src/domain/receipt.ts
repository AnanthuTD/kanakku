import { decimalToPaise } from "./model";

/** An editable observation from a bill, never an independent ledger transaction. */
export interface ReceiptItem {
  name: string;
  quantity?: number;
  unitPricePaise?: number;
  amountPaise?: number;
}
export interface ReceiptDraft {
  version: 1;
  currency: "INR";
  merchant: string;
  /** Calendar date, without an invented time or timezone. */
  date?: string;
  items: ReceiptItem[];
  totalPaise?: number;
  subtotalPaise?: number;
  taxPaise?: number;
  discountPaise?: number;
  roundingPaise?: number;
  warnings: string[];
  reconciliation: "matches" | "mismatch" | "incomplete";
  confidence: "high" | "medium" | "low";
}
export const RECEIPT_LIMITS = { text: 24000, lines: 400, items: 80, name: 120 };
const amountFields = [
  "totalPaise",
  "subtotalPaise",
  "taxPaise",
  "discountPaise",
  "roundingPaise",
] as const;
const clean = (value: string, length = RECEIPT_LIMITS.name) =>
  value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, length);
const safeAmount = (value: unknown, signed = false): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  (signed || value >= 0);
const moneyValue = (value: string): number | undefined =>
  /^(?:0|0\.0{1,2})$/.test(value) ? 0 : (decimalToPaise(value) ?? undefined);
const MONEY = "(?:₹\\s*|Rs\\.?\\s*|INR\\s*)?([0-9][0-9,]*(?:\\.[0-9]+)?)";
const trailingMoney = new RegExp(
  `(?:^|\\s|:|=|₹|[-−])(${MONEY})\\s*(?:INR|Rs\\.?)?$`,
  "i",
);
const summaryLabel =
  /^(?:grand\s*total|sub\s*total|total|net\s*(?:amount|payable|total)|amount\s*(?:payable|due)|cgst|sgst|igst|gst|tax(?:able)?|discount|round\s*(?:off|ing)|cash|tender(?:ed)?|change|balance|paid|payment|upi|card|credit|debit|savings?|service\s*charge|delivery|packing)\b/i;
const noise =
  /(?:gstin|gst\s*(?:no|number)|tax\s*invoice|invoice\s*(?:no|number)|bill\s*(?:no|number)|receipt\s*(?:no|number)|order\s*(?:no|number)|fssai|pan\s*[:#]|\bphone\b|\bmobile\b|\bcontact\b|\btel\b|www\.|https?:|@|thank\s*you|visit\s*again|customer\s*(?:name|copy)|address|\broad\b|\bstreet\b|\bpincode\b|\bpin\s*code\b)/i;
const header =
  /^(?:(?:s\.?\s*no\.?|#|item|description|product|qty|quantity|rate|price|amount|hsn|unit|mrp)\s*)+$/i;

function calendarDate(value: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return;
  const year = +match[1],
    month = +match[2],
    day = +match[3];
  if (year < 2000 || year > 2100) return;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : undefined;
}
function readDate(line: string): string | undefined {
  const iso = /\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/.exec(line);
  const indian = /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/.exec(line);
  const parts = iso
    ? [iso[1], iso[2], iso[3]]
    : indian
      ? [indian[3], indian[2], indian[1]]
      : undefined;
  return parts
    ? calendarDate(
        `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`,
      )
    : undefined;
}
function lastMoney(
  line: string,
):
  | { prefix: string; amount: number | undefined; negative: boolean }
  | undefined {
  const match = trailingMoney.exec(line);
  if (!match) return;
  return {
    prefix: line.slice(0, match.index).trim(),
    amount: moneyValue(match[2]),
    negative: /^[-−]/.test(match[0].trim()),
  };
}
function itemFrom(line: string): ReceiptItem | undefined {
  const last = lastMoney(line);
  if (!last || last.amount === undefined || last.negative || !last.prefix)
    return;
  let name = last.prefix;
  let quantity: number | undefined, unitPricePaise: number | undefined;
  const columns = new RegExp(
    `^(.*?)\\s+(\\d+(?:\\.\\d{1,3})?)\\s*(?:[x×]\\s*|\\s+)${MONEY}$`,
    "i",
  ).exec(name);
  if (columns) {
    name = columns[1];
    quantity = +columns[2];
    unitPricePaise = moneyValue(columns[3]);
    if (!(quantity > 0 && quantity <= 10000) || unitPricePaise === undefined)
      return;
  } else {
    const qty = /^(.*?)\s+(\d+(?:\.\d{1,3})?)\s*[x×]$/i.exec(name);
    if (qty) {
      name = qty[1];
      quantity = +qty[2];
      if (!(quantity > 0 && quantity <= 10000)) return;
    }
  }
  name = clean(name.replace(/^\d+[.)]\s+/, ""));
  if (
    !/\p{L}/u.test(name) ||
    noise.test(name) ||
    summaryLabel.test(name) ||
    header.test(name)
  )
    return;
  return {
    name,
    ...(quantity !== undefined && { quantity }),
    ...(unitPricePaise !== undefined && { unitPricePaise }),
    amountPaise: last.amount,
  };
}
function sum(values: number[]): number | undefined {
  const exact = values.reduce(
    (total, value) => total + BigInt(value),
    BigInt(0),
  );
  return exact >= BigInt(-Number.MAX_SAFE_INTEGER) &&
    exact <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(exact)
    : undefined;
}
function reconcile(draft: ReceiptDraft): ReceiptDraft {
  const derived = new Set([
    "Merchant was not clear. Please enter it.",
    "No clear bill total found. The transaction amount is unchanged.",
    "No clear item rows found. You can describe the purchase yourself.",
    "Item amounts do not match the printed subtotal.",
    "Items, tax and adjustments do not match the printed total. Check the bill.",
    "An item quantity and unit price do not match its printed amount.",
  ]);
  // User edits can fix a mismatch; recalculate these warnings from the current fields.
  const warnings = new Set(
    draft.warnings.filter((warning) => !derived.has(warning)),
  );
  if (!draft.merchant) warnings.add("Merchant was not clear. Please enter it.");
  if (draft.totalPaise === undefined)
    warnings.add(
      "No clear bill total found. The transaction amount is unchanged.",
    );
  if (!draft.items.length)
    warnings.add(
      "No clear item rows found. You can describe the purchase yourself.",
    );
  let mismatch = false,
    compared = false;
  const totals = draft.items.map((item) => item.amountPaise);
  const itemSum =
    totals.length && totals.every((value) => value !== undefined)
      ? sum(totals as number[])
      : undefined;
  if (itemSum !== undefined && draft.subtotalPaise !== undefined) {
    compared = true;
    if (itemSum !== draft.subtotalPaise) {
      mismatch = true;
      warnings.add("Item amounts do not match the printed subtotal.");
    }
  }
  const base = draft.subtotalPaise ?? itemSum;
  if (base !== undefined && draft.totalPaise !== undefined) {
    const expected = sum([
      base,
      draft.taxPaise ?? 0,
      -(draft.discountPaise ?? 0),
      draft.roundingPaise ?? 0,
    ]);
    compared = true;
    if (expected !== draft.totalPaise) {
      mismatch = true;
      warnings.add(
        "Items, tax and adjustments do not match the printed total. Check the bill.",
      );
    }
  }
  if (
    draft.items.some(
      (item) =>
        item.quantity !== undefined &&
        item.unitPricePaise !== undefined &&
        item.amountPaise !== undefined &&
        Math.round(item.quantity * item.unitPricePaise) !== item.amountPaise,
    )
  ) {
    mismatch = true;
    warnings.add(
      "An item quantity and unit price do not match its printed amount.",
    );
  }
  draft.reconciliation = mismatch
    ? "mismatch"
    : compared
      ? "matches"
      : "incomplete";
  draft.warnings = [...warnings].slice(0, 12);
  draft.confidence =
    !warnings.size && compared && draft.totalPaise !== undefined
      ? "high"
      : draft.totalPaise !== undefined && !mismatch
        ? "medium"
        : "low";
  return draft;
}

/** Conservative Latin-script INR bill parser. Never infers a missing printed amount. */
export function parseReceipt(text: string): ReceiptDraft {
  const draft: ReceiptDraft = {
    version: 1,
    currency: "INR",
    merchant: "",
    items: [],
    warnings: [],
    reconciliation: "incomplete",
    confidence: "low",
  };
  const rawLines = text
    .slice(0, RECEIPT_LIMITS.text)
    .split(/\r?\n/)
    .map((line) => clean(line, 400))
    .filter(Boolean);
  if (
    text.length > RECEIPT_LIMITS.text ||
    rawLines.length > RECEIPT_LIMITS.lines
  )
    draft.warnings.push(
      "The bill was long; only the first part was read. Check for missing items.",
    );
  const lines = rawLines.slice(0, RECEIPT_LIMITS.lines);
  const foreign = /(?:\b(?:USD|EUR|GBP|AED|CAD|AUD)\b|[$€£])/i.test(
    text.slice(0, RECEIPT_LIMITS.text),
  );
  if (foreign)
    draft.warnings.push(
      "Only INR bills are supported. Enter amounts manually.",
    );
  const merchantIndex = lines.findIndex(
    (line, index) =>
      index < 8 &&
      /\p{L}/u.test(line) &&
      !noise.test(line) &&
      !header.test(line) &&
      !summaryLabel.test(line) &&
      !/^date\b/i.test(line) &&
      !readDate(line) &&
      !lastMoney(line) &&
      !/^\d/.test(line),
  );
  if (merchantIndex >= 0) draft.merchant = clean(lines[merchantIndex]);
  let pending = "",
    totalPriority = 0;
  const taxes: number[] = [],
    taxLabels = new Set<string>();
  let combinedTax: number | undefined;
  let itemLimit = false;
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index];
    const date = readDate(line);
    if (date) {
      if (!draft.date) draft.date = date;
      else if (draft.date !== date)
        draft.warnings.push(
          "More than one date was printed. Check the bill date.",
        );
      pending = "";
      continue;
    }
    if (/\bdate\b/i.test(line) && /\d/.test(line)) {
      draft.warnings.push("The printed date could not be read safely.");
      pending = "";
      continue;
    }
    if (
      index === merchantIndex ||
      noise.test(line) ||
      header.test(line) ||
      /^[-=*_\s]+$/.test(line)
    ) {
      pending = "";
      continue;
    }
    if (foreign) continue;
    // A label or an item may wrap onto a separate amount/quantity line.
    if (pending && /^(?:(?:₹|Rs\.?|INR)\s*)?\d/i.test(line)) {
      line = `${pending} ${line}`;
      pending = "";
    }
    const last = lastMoney(line);
    if (summaryLabel.test(line)) {
      pending = "";
      if (!last) {
        if (!/\d|%/.test(line)) pending = line;
        continue;
      }
      if (last.amount === undefined) {
        draft.warnings.push("A printed amount was malformed. Please check it.");
        continue;
      }
      if (last.negative && !/^(?:discount|round\s*(?:off|ing))\b/i.test(line)) {
        draft.warnings.push("A negative bill amount needs manual review.");
        continue;
      }
      const amount = last.amount;
      if (/^sub\s*total\b/i.test(line)) draft.subtotalPaise = amount;
      else if (/^(?:cgst|sgst|igst)\b/i.test(line)) {
        const label = /^(cgst|sgst|igst)/i.exec(line)![1].toLowerCase();
        if (taxLabels.has(label))
          draft.warnings.push(
            "A tax label was repeated. Check the tax amount.",
          );
        else {
          taxes.push(amount);
          taxLabels.add(label);
        }
      } else if (
        /^(?:gst|total\s*(?:gst|tax)|tax)\b/i.test(line) &&
        !/^taxable\b/i.test(line)
      )
        combinedTax = amount;
      else if (/^discount\b/i.test(line)) draft.discountPaise = amount;
      else if (/^round\s*(?:off|ing)\b/i.test(line))
        draft.roundingPaise = /[-−]\s*(?:₹|Rs\.?|INR)?\s*\d/i.test(line)
          ? -amount
          : amount;
      else {
        const priority = /^grand\s*total\b/i.test(line)
          ? 3
          : /^(?:net\s*(?:amount|payable|total)|amount\s*(?:payable|due))\b/i.test(
                line,
              )
            ? 2
            : /^total(?:\s+(?:amount|payable|bill|value))?$/i.test(last.prefix)
              ? 1
              : 0;
        if (priority && priority >= totalPriority) {
          if (
            priority === totalPriority &&
            draft.totalPaise !== undefined &&
            draft.totalPaise !== amount
          )
            draft.warnings.push(
              "Different totals were printed. Confirm the bill total.",
            );
          draft.totalPaise = amount;
          totalPriority = priority;
        }
      }
      continue;
    }
    const item = itemFrom(line);
    if (item) {
      if (draft.items.length < RECEIPT_LIMITS.items) draft.items.push(item);
      else itemLimit = true;
      pending = "";
    } else if (!last && /\p{L}/u.test(line) && !/^\d/.test(line))
      pending =
        pending && !summaryLabel.test(pending)
          ? clean(`${pending} ${line}`)
          : line;
    else {
      if (last) draft.warnings.push("An item amount could not be read safely.");
      pending = "";
    }
  }
  const tax = sum(taxes);
  if (combinedTax !== undefined) {
    draft.taxPaise = combinedTax;
    if (taxes.length && tax !== combinedTax)
      draft.warnings.push("The printed total tax differs from its components.");
  } else if (taxes.length) draft.taxPaise = tax;
  if (itemLimit)
    draft.warnings.push(
      "Some item rows were omitted from this long bill. Check the details.",
    );
  return reconcile(draft);
}

/** Whitelists bounded editable fields before encrypted persistence; never keeps OCR text or photo URIs. */
export function normalizeReceipt(value: unknown): ReceiptDraft | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const input = value as Record<string, unknown>;
  if (
    input.version !== 1 ||
    input.currency !== "INR" ||
    !Array.isArray(input.items)
  )
    return;
  const draft: ReceiptDraft = {
    version: 1,
    currency: "INR",
    merchant: typeof input.merchant === "string" ? clean(input.merchant) : "",
    items: [],
    warnings: [],
    reconciliation: "incomplete",
    confidence: "low",
  };
  if (typeof input.date === "string") draft.date = calendarDate(input.date);
  for (const field of amountFields)
    if (safeAmount(input[field], field === "roundingPaise"))
      draft[field] = input[field];
  for (const value of input.items.slice(0, RECEIPT_LIMITS.items)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const name = typeof row.name === "string" ? clean(row.name) : "";
    if (!name) continue;
    const item: ReceiptItem = { name };
    if (
      typeof row.quantity === "number" &&
      Number.isFinite(row.quantity) &&
      row.quantity > 0 &&
      row.quantity <= 10000 &&
      Math.round(row.quantity * 1000) / 1000 === row.quantity
    )
      item.quantity = row.quantity;
    if (safeAmount(row.unitPricePaise))
      item.unitPricePaise = row.unitPricePaise;
    if (safeAmount(row.amountPaise)) item.amountPaise = row.amountPaise;
    draft.items.push(item);
  }
  // Warnings generated by this parser/user edits remain useful, but never accept arbitrarily large payloads.
  if (Array.isArray(input.warnings))
    draft.warnings = input.warnings
      .filter((warning): warning is string => typeof warning === "string")
      .slice(0, 12)
      .map((warning) => clean(warning, 200));
  return reconcile(draft);
}

/** Optional context for category suggestion. A mixed basket remains mixed; no category is assigned here. */
export function buildReceiptNote(draft: ReceiptDraft): string {
  return draft.items
    .slice(0, RECEIPT_LIMITS.items)
    .map(
      (item) =>
        `${clean(item.name)}${item.quantity !== undefined ? ` × ${item.quantity}` : ""}`,
    )
    .join(", ")
    .slice(0, 2000);
}
