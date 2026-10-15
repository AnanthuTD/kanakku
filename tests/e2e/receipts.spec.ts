import {
  test,
  expect,
  home,
  openTransaction,
  closeReview,
  savedJournal,
  transactions,
} from "./fixtures";
import type { ReceiptDraft } from "../../src/domain/receipt";

// Independently authored structured observations; no camera/transcript/OCR mocks.
const bill: ReceiptDraft = {
  version: 1,
  currency: "INR",
  merchant: "Sample Cafe",
  date: "2026-10-10",
  items: [
    {
      name: "Takeaway dinner",
      quantity: 1,
      unitPricePaise: 12000,
      amountPaise: 12000,
    },
    { name: "Tea", quantity: 1, unitPricePaise: 2000, amountPaise: 2000 },
  ],
  subtotalPaise: 14000,
  taxPaise: 1000,
  totalPaise: 15000,
  warnings: [],
  reconciliation: "matches",
  confidence: "high",
};
const seeded = transactions.map((t) =>
  t.id === "rahul"
    ? { ...t, note: "Original typed context", receipt: bill }
    : t,
);
test.use({ journal: { transactions: seeded, rules: [] } });

async function openBill(page: Parameters<typeof home>[0]) {
  await home(page);
  const review = await openTransaction(page, "Rahul S");
  await review
    .getByRole("button", { name: "Edit bill details", exact: true })
    .click();
  return review;
}

test("edited bill fields and combined category context survive reload without changing the payment", async ({
  page,
}) => {
  const review = await openBill(page);
  const unchanged = (await savedJournal(page)).transactions.filter(
    (t) => t.id !== "rahul",
  );
  await review
    .getByRole("textbox", { name: "Bill merchant", exact: true })
    .fill("Sample Dinner House");
  await expect(
    review.getByRole("textbox", { name: "Merchant name", exact: true }),
  ).toHaveValue("Rahul S");
  await review
    .getByRole("button", {
      name: "Use bill merchant for this payment",
      exact: true,
    })
    .click();
  await expect(
    review.getByRole("textbox", { name: "Merchant name", exact: true }),
  ).toHaveValue("Sample Dinner House");
  await review
    .getByRole("textbox", { name: "Bill date (YYYY-MM-DD)", exact: true })
    .fill("2026-10-09");
  await review
    .getByRole("textbox", { name: "Bill total (₹)", exact: true })
    .fill("160.00");
  await review
    .getByRole("textbox", { name: "Bill tax (₹)", exact: true })
    .fill("20.00");
  await review
    .getByRole("textbox", { name: "Bill item 1 description", exact: true })
    .fill("Vegetables");
  await review
    .getByRole("textbox", { name: "Bill item 1 quantity", exact: true })
    .fill("2");
  await review
    .getByRole("textbox", { name: "Bill item 1 unit price (₹)", exact: true })
    .fill("50.00");
  await review
    .getByRole("textbox", { name: "Bill item 1 amount (₹)", exact: true })
    .fill("100.00");
  await review
    .getByRole("textbox", { name: "Bill item 2 unit price (₹)", exact: true })
    .fill("40.00");
  await review
    .getByRole("textbox", { name: "Bill item 2 amount (₹)", exact: true })
    .fill("40.00");
  await expect(review.getByTestId("receipt-summary")).toHaveText(
    "Sample Dinner House · 2 items · ₹160.00",
  );
  await expect(
    review.getByText(/Bill total ₹160.00 differs from this payment ₹150.00/),
  ).toBeVisible();
  await review
    .getByRole("textbox", { name: "Payment note", exact: true })
    .fill("Taxi home");
  await review
    .getByRole("button", {
      name: "Suggest category from bill and note",
      exact: true,
    })
    .click();
  // Transport in the note plus groceries on the bill must not be silently collapsed.
  await expect(
    review.getByRole("button", { name: "Uncategorized", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    review.getByRole("textbox", { name: "Payment note", exact: true }),
  ).toHaveValue("Taxi home");
  await review.getByRole("button", { name: "Groceries", exact: true }).click();
  await review
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(
    review.getByText("Categorization: Confirmed by you.", { exact: false }),
  ).toBeVisible();
  await closeReview(page);
  const saved = await savedJournal(page);
  const transaction = saved.transactions.find((t) => t.id === "rahul")!;
  expect(transaction).toMatchObject({
    amount: 15000,
    at: "2026-10-10T12:00:00+05:30",
    source: "sample",
    merchant: "Sample Dinner House",
    originalMerchant: "Rahul S",
    note: "Taxi home",
    category: "Groceries",
    receipt: {
      merchant: "Sample Dinner House",
      date: "2026-10-09",
      totalPaise: 16000,
      subtotalPaise: 14000,
      taxPaise: 2000,
      reconciliation: "matches",
      items: [
        {
          name: "Vegetables",
          quantity: 2,
          unitPricePaise: 5000,
          amountPaise: 10000,
        },
        { name: "Tea", quantity: 1, unitPricePaise: 4000, amountPaise: 4000 },
      ],
    },
  });
  expect(saved.transactions.filter((t) => t.id !== "rahul")).toEqual(unchanged);
  expect(saved.transactions).toHaveLength(seeded.length);
  await page.reload();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
  const reopened = await openTransaction(page, "Sample Dinner House");
  await reopened
    .getByRole("button", { name: "Edit bill details", exact: true })
    .click();
  await expect(
    reopened.getByRole("textbox", {
      name: "Bill date (YYYY-MM-DD)",
      exact: true,
    }),
  ).toHaveValue("2026-10-09");
  await expect(
    reopened.getByRole("textbox", {
      name: "Bill item 1 description",
      exact: true,
    }),
  ).toHaveValue("Vegetables");
  await expect(
    reopened.getByRole("textbox", { name: "Bill tax (₹)", exact: true }),
  ).toHaveValue("20.00");
  expect(
    (await savedJournal(page)).transactions.find((t) => t.id === "rahul"),
  ).toEqual(transaction);
});

test("removing a bill is saved independently of the note and undo restores it durably", async ({
  page,
}) => {
  const review = await openBill(page);
  const before = (await savedJournal(page)).transactions.find(
    (t) => t.id === "rahul",
  )!;
  await review
    .getByRole("button", { name: "Remove bill details", exact: true })
    .click();
  await expect(review.getByTestId("receipt-summary")).toBeHidden();
  await review
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(
    review.getByText("Categorization: Confirmed by you.", { exact: false }),
  ).toBeVisible();
  await closeReview(page);
  const removed = (await savedJournal(page)).transactions.find(
    (t) => t.id === "rahul",
  )!;
  expect(removed.receipt).toBeUndefined();
  expect(removed.note).toBe(before.note);
  expect(removed.amount).toBe(15000);
  await page
    .getByRole("button", { name: "Undo last ledger change", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await savedJournal(page)).transactions.find((t) => t.id === "rahul"),
    )
    .toEqual(before);
  await page.reload();
  const reopened = await openTransaction(page, "Rahul S");
  await expect(reopened.getByTestId("receipt-summary")).toHaveText(
    "Sample Cafe · 2 items · ₹150.00",
  );
  await expect(
    reopened.getByRole("textbox", { name: "Payment note", exact: true }),
  ).toHaveValue("Original typed context");
});

test("a malformed bill total remains unsavable when another item is removed", async ({
  page,
}) => {
  const review = await openBill(page);
  const before = await savedJournal(page);
  await review
    .getByRole("textbox", { name: "Bill total (₹)", exact: true })
    .fill("1,2");
  await expect(
    review.getByRole("button", { name: "Save category", exact: true }),
  ).toBeDisabled();
  await review
    .getByRole("button", { name: "Remove bill item 2", exact: true })
    .click();
  await expect(
    review.getByText("Use a valid rupee amount with up to two decimals.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    review.getByRole("button", { name: "Save category", exact: true }),
  ).toBeDisabled();
  await closeReview(page);
  expect(await savedJournal(page)).toEqual(before);
});

test("invalid calendar dates and quantities block save until corrected", async ({
  page,
}) => {
  const review = await openBill(page);
  await review
    .getByRole("textbox", { name: "Bill date (YYYY-MM-DD)", exact: true })
    .fill("2026-02-31");
  await expect(
    review.getByText("Enter an actual date as YYYY-MM-DD.", { exact: true }),
  ).toBeVisible();
  await expect(
    review.getByRole("button", { name: "Save category", exact: true }),
  ).toBeDisabled();
  await review
    .getByRole("textbox", { name: "Bill date (YYYY-MM-DD)", exact: true })
    .fill("2026-02-28");
  await review
    .getByRole("textbox", { name: "Bill item 1 quantity", exact: true })
    .fill("-2");
  await expect(
    review.getByRole("button", { name: "Save category", exact: true }),
  ).toBeDisabled();
  await review
    .getByRole("textbox", { name: "Bill item 1 quantity", exact: true })
    .fill("1");
  await expect(
    review.getByRole("button", { name: "Save category", exact: true }),
  ).toBeEnabled();
});

test("unsupported photo retake preserves the existing bill, unsaved note and journal", async ({
  page,
}) => {
  const review = await openBill(page);
  const before = await savedJournal(page);
  await review
    .getByRole("textbox", { name: "Payment note", exact: true })
    .fill("Shared dinner with colleagues");
  await review
    .getByRole("button", { name: "Retake bill photo", exact: true })
    .click();
  await expect(page.getByText("Bill photos", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/This browser preview cannot read a real photo/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close camera", exact: true }).click();
  await expect(
    review.getByRole("textbox", { name: "Payment note", exact: true }),
  ).toHaveValue("Shared dinner with colleagues");
  await expect(review.getByTestId("receipt-summary")).toHaveText(
    "Sample Cafe · 2 items · ₹150.00",
  );
  expect(await savedJournal(page)).toEqual(before);
  await closeReview(page);
  const reopened = await openTransaction(page, "Rahul S");
  await expect(
    reopened.getByRole("textbox", { name: "Payment note", exact: true }),
  ).toHaveValue("Original typed context");
});
