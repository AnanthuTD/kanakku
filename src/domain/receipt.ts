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
  /** Restaurant service charge, printed between subtotal and total. */
  serviceChargePaise?: number;
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
  "serviceChargePaise",
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
  `(?:^|\\s|:|=|₹\\s*|[-−])(${MONEY})\\s*(?:INR|Rs\\.?)?$`,
  "i",
);
const summaryLabel =
  /^(?:grand\s*total|sub\s*total|total(?:\s*due)?|bill\s*amount|gross\s*(?:amt|amount)|net(?:\s*(?:amt|amount|payable|total))?|amount\s*(?:payable|due)?|[a-z/ ]*(?:charges?|duty|surcharge|arrears|interest\s*on\s*\w+|adjustment|loss\/gain|recorded\s*md|mats\s*amount|acd\s*due)|cgst|sgst|igst|gst|tax(?:able)?|discount|round\s*(?:off|ing)|cash(?:\s*amount)?|tender(?:ed)?|change|balance|paid|payment|upi|card|credit|debit(?:\s*card)?|savings?|you\s*have\s*saved|disc\.?|service\s*charge|delivery|packing)\b/i;
const noise =
  /(?:gstin|gst\s*(?:no|number)|tax\s*invoice|invoice\s*(?:no|number)|bill\s*(?:no|number)|receipt\s*(?:no|number)|order\s*(?:no|number)|fssai|pan\s*[:#]|\bphone\b|\bph\s*[:#]|\bmobile\b|\bcontact\b|\btel\b|\btoken\s*no|\bord\s*no|\bcheck\s*print|\bpoints?\b|\bearning\s*amt|\bearning\s*amount|\blic\s*no|www\.|https?:|@|thank\s*you|visit\s*again|customer\s*(?:name|copy)|address|\broad\b|\bstreet\b|\bpincode\b|\bpin\s*code\b|\p{L}{3,}-\d{2,6}\b)/iu;
// Receipt bookkeeping lines whose trailing number is a count, never money.
const counter =
  /^(?:print\s*cnt|print\s*count|pax|covers?|guests?|tbl|table|bill\s*no|order\s*no|ord\s*no|token\s*no|total\s*(?:items?|qty|quantity)|tot\s*(?:qty|items?)|no\.?\s*of\.?\s*items?|items?|qty|units?|days|meter\s*no|sc\s*no|usc\s*no|contracted\s*load|present|previous|cat\s*:|mrid|ero\s*:|sec\s*:|area\s*:|ph\s*:)\b/i;
const headerWord =
  /^(?:s\.?no\.?|#|item|items|name|description|product|qty\.?|quantity|qty\/wt|wt|rate|@rate|price|net|amount|amt|value|total|hsn|code|unit|mrp|disc\.?|sts|kwh|date|time|₹|rs\.?|am|pm|\d{1,2}:\d{2})$/i;
const header = {
  test: (line: string) => {
    const words = line.trim().split(/\s+/);
    return (
      words.length >= 2 &&
      !trailingMoney.test(line) &&
      words.every((word) => headerWord.test(word)) &&
      words.filter((word) => !/^(?:\d{1,2}:\d{2}|am|pm|₹)$/i.test(word))
        .length >= 2
    );
  },
};

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
const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  sept: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};
function readDate(line: string): string | undefined {
  const named =
    /\b([a-z]{3,4})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i.exec(line) ??
    /\b(\d{1,2})[-\s/]([a-z]{3,4})[-\s/,]+(20\d{2})\b/i.exec(line);
  if (named) {
    const [a, b, year] = [named[1], named[2], named[3]];
    const month = MONTHS[(/^\d/.test(a) ? b : a).toLowerCase()];
    const day = /^\d/.test(a) ? a : b;
    if (month) return calendarDate(`${year}-${month}-${day.padStart(2, "0")}`);
  }
  const iso = /\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/.exec(line);
  const indian =
    /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/.exec(line) ??
    /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b(?![-/.:\d])/.exec(line);
  const parts = iso
    ? [iso[1], iso[2], iso[3]]
    : indian
      ? [
          indian[3].length === 2 ? `20${indian[3]}` : indian[3],
          indian[2],
          indian[1],
        ]
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
  // A clock time ("07:57", "09:01 PM") carries no amount.
  if (/^\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?$/i.test(line.trim())) return;
  const match = trailingMoney.exec(line);
  if (!match) return;
  // Phone numbers, consumer/meter/HSN/auth codes: long unbroken digit runs are identifiers.
  if (/^\d{7,}$/.test(match[2])) return;
  return {
    prefix: line.slice(0, match.index).trim(),
    amount: moneyValue(match[2]),
    negative: /^[-−]/.test(match[0].trim()),
  };
}
function itemFrom(rawLine: string): ReceiptItem | undefined {
  if (counter.test(rawLine)) return;
  // HSN/SAC codes printed between the name and the amounts ("19052.000", "821210901.000").
  const line = clean(
    rawLine
      .replace(/\s\d{4,}\.000(?=\s)/g, " ")
      .replace(/\s\d{8,}(?=\s)/g, " "),
  );
  const last = lastMoney(line);
  if (!last || last.amount === undefined || last.negative || !last.prefix)
    return;
  let name = last.prefix;
  let quantity: number | undefined, unitPricePaise: number | undefined;
  const fourColumns = new RegExp(
    `^(.*?)\\s+(\\d+(?:\\.\\d{1,3})?)\\s+${MONEY}\\s+${MONEY}$`,
    "i",
  ).exec(name);
  const columns =
    fourColumns ??
    new RegExp(
      `^(.*?)\\s+(\\d+(?:\\.\\d{1,3})?)\\s*(?:[x×]\\s*|\\s+)${MONEY}$`,
      "i",
    ).exec(name);
  // "08041.000" / "73231.000" in the quantity column is an HSN code, not a quantity.
  if (columns && /^\d{4,}\.\d{3}$/.test(columns[2])) return;
  if (fourColumns && columns) {
    // columns[3] is the MRP; the rate is the last captured money column.
    columns[3] = fourColumns[4];
  }
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
  // "1. Item" / "1) Item" are list numbers; a bare leading count ("2 Katsu Roll") is the
  // quantity when none was found in a column. Keep it only when it is small and plausible.
  name = name.replace(/^\d+[.)]\s+/, "");
  if (quantity === undefined) {
    const lead = /^(\d{1,3})\s+(\p{L}.*)$/u.exec(name);
    if (lead && +lead[1] > 0) {
      quantity = +lead[1];
      name = lead[2];
    }
  }
  name = clean(name);
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
      draft.serviceChargePaise ?? 0,
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
        Math.abs(item.quantity * item.unitPricePaise - item.amountPaise) > 1,
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
  const printedAmounts = lines
    .map((line) => trailingMoney.exec(line)?.[2] ?? "")
    .filter((value) => /^\d[\d,]{4,}$/.test(value));
  if (
    !foreign &&
    printedAmounts.length >= 4 &&
    printedAmounts.every(
      (value) =>
        /(?:,|^)\d{1,3}(?:,\d{3})*$/.test(value) &&
        /\d{3}$/.test(value) &&
        !/\./.test(value),
    ) &&
    printedAmounts.filter((value) => /000$/.test(value)).length >=
      printedAmounts.length * 0.6
  )
    draft.warnings.push("This bill may not be in rupees. Check the amounts.");
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
      !/^\d/.test(line) &&
      !/^(?:no\.?\s*\d|#\s*\d|\d+[,/-])/i.test(line) &&
      !/\b(?:nagar|colony|block|chambers|floor|lane|cross|main|layout|sector|phase)\b/i.test(
        line,
      ) &&
      !/-\s*\d{6}\b/.test(line) &&
      !/\b(?:cashier|biller|time|server|waiter|crew|token|counter)\b/i.test(
        line,
      ) &&
      !/^[a-z]{2,5}\.?\s*(?:no\.?)?\s*[:#]?\s*\d/i.test(line) &&
      !/^[a-z]{2,5}\s*:/i.test(line),
  );
  if (merchantIndex >= 0) {
    draft.merchant = clean(lines[merchantIndex]);
    const next = lines[merchantIndex + 1];
    // A name wrapped onto a second header line (ends with "-", or a short bare word line).
    if (
      next &&
      /\p{L}/u.test(next) &&
      !noise.test(next) &&
      !counter.test(next) &&
      !summaryLabel.test(next) &&
      !readDate(next) &&
      !lastMoney(next) &&
      !/\d/.test(next) &&
      (/-$/.test(draft.merchant) || next.split(/\s+/).length <= 3)
    )
      draft.merchant = clean(`${draft.merchant} ${next}`);
  }
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
    // A counter sharing a line with a summary label keeps the label part.
    const counterSegment =
      /^(?:total\s*(?:items?|qty|quantity)|no\.?\s*of\.?\s*items?|tot\s*(?:qty|items?))\s*:?\s*\d+(?:\.\d+)?\s*/i;
    let stripped = line;
    while (counterSegment.test(stripped))
      stripped = stripped.replace(counterSegment, "").trim();
    if (stripped !== line) {
      if (!stripped || counter.test(stripped)) {
        pending = "";
        continue;
      }
      line = stripped;
    }
    if (
      index === merchantIndex ||
      noise.test(line) ||
      header.test(line) ||
      counter.test(line) ||
      /^[-=*_\s]+$/.test(line)
    ) {
      pending = "";
      continue;
    }
    if (foreign) continue;
    // A label or an item may wrap onto a separate amount/quantity line.
    const numbersOnly =
      /^(?:(?:₹|Rs\.?|INR)\s*)?[\d.,]+(?:\s+[\d.,]+){0,3}$/i.test(line);
    if (pending && /^(?:(?:₹|Rs\.?|INR)\s*)?\d/i.test(line)) {
      // "name" + "rate qty value": reorder to the "name qty rate value" column form.
      const three = /^([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/.exec(line);
      line =
        three && /\.\d{3}$/.test(three[2])
          ? `${pending} ${three[2]} ${three[1]} ${three[3]}`
          : `${pending} ${line}`;
      pending = "";
    } else if (
      !pending &&
      numbersOnly &&
      !/\s/.test(line) &&
      lines[index + 1] !== undefined &&
      summaryLabel.test(lines[index + 1])
    ) {
      // An unlabelled amount directly above GST/round-off/net is the subtotal.
      const amount = lastMoney(line);
      if (amount?.amount !== undefined && draft.subtotalPaise === undefined) {
        draft.subtotalPaise = amount.amount;
        continue;
      }
    } else if (
      pending &&
      !summaryLabel.test(pending) &&
      !summaryLabel.test(line) &&
      lastMoney(line) &&
      line.replace(trailingMoney, "").trim().split(/\s+/).length <= 2 &&
      !/\d/.test(line.replace(trailingMoney, ""))
    ) {
      // A wrapped item name whose last fragment carries the amount.
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
      if (
        last.negative &&
        last.amount !== 0 &&
        !/^(?:discount|round\s*(?:off|ing))\b/i.test(line)
      ) {
        draft.warnings.push("A negative bill amount needs manual review.");
        continue;
      }
      const amount = last.amount;
      if (
        /^sub\s*total\b/i.test(line) ||
        /^total\s*\(?\s*excl/i.test(line) ||
        /^amount\s*:?$/i.test(last.prefix)
      )
        draft.subtotalPaise = amount;
      else if (/^gross\s*(?:amt|amount)\b/i.test(line)) {
        /* informational; equals the subtotal on these bills */
      } else if (/^(?:cgst|sgst|igst)\b/i.test(line)) {
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
      else if (/^disc(?:ount|\.)?\b/i.test(line)) draft.discountPaise = amount;
      else if (/^service\s*charge\b/i.test(line))
        draft.serviceChargePaise = amount;
      else if (/^round\s*(?:off|ing)\b/i.test(line))
        draft.roundingPaise = /[-−]\s*(?:₹|Rs\.?|INR)?\s*\d/i.test(line)
          ? -amount
          : amount;
      else {
        const priority = /^grand\s*total\b/i.test(line)
          ? 3
          : /^(?:net(?:\s*(?:amt|amount|payable|total))?|amount\s*(?:payable|due)|bill\s*amount|total\s*due)\b/i.test(
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
    } else if (
      !last &&
      /\p{L}/u.test(line) &&
      (!/^\d/.test(line) || /^\d{1,3}\s+\p{L}/u.test(line))
    ) {
      const previous = draft.items[draft.items.length - 1];
      const nextLine = lines[index + 1];
      // Continuation of the item just above: short bare fragment with no price of its own,
      // where the next line is not itself an amount-only continuation of this fragment.
      const prevLine = lines[index - 1];
      const justAfterItem =
        previous &&
        prevLine !== undefined &&
        itemFrom(prevLine)?.name === previous.name;
      if (
        justAfterItem &&
        !pending &&
        line.split(/\s+/).length <= 3 &&
        !counter.test(line) &&
        !/[:@]/.test(line) &&
        !(nextLine && /^(?:(?:₹|Rs\.?|INR)\s*)?\d/i.test(nextLine))
      ) {
        previous.name = clean(`${previous.name} ${line}`);
      } else
        pending =
          pending && !summaryLabel.test(pending)
            ? clean(`${pending} ${line}`)
            : line;
    } else {
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
