import {
  test,
  expect,
  home,
  activity,
  openTransaction,
  closeReview,
  savedJournal,
  transactions,
} from "./fixtures";
import type { Transaction } from "../../src/domain/model";

// Bank-to-bank UPI alerts name only the receiving account. They wait for the user
// before counting, and masked account endings cannot create a global payee rule.
const accountPayment = (id: string, day: string): Transaction => ({
  id,
  merchant: "A/c ••7788",
  amount: 1_500_000,
  at: `${day}T12:00:00+05:30`,
  bank: "Kerala Gramin Bank",
  account: "4821",
  category: "Uncategorized",
  kind: "purchase",
  review: true,
  excluded: false,
  note: "",
  source: "sms",
  reason: "E2E fixture",
  reference: `ref-${id}`,
});
const duplicate: Transaction = {
  ...accountPayment("kgb-balance", "2026-10-12"),
  merchant: "Unknown merchant",
  reference: undefined,
  duplicateOf: "kgb-1",
  excluded: true,
  review: false,
};
test.use({
  journal: {
    transactions: [
      ...transactions,
      accountPayment("kgb-1", "2026-10-12"),
      accountPayment("kgb-2", "2026-10-11"),
      duplicate,
    ],
    rules: [],
  },
});

test("payments to an unnamed bank account wait for context; a suffix cannot settle unrelated payments", async ({
  page,
}) => {
  await home(page);
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
  await expect(page.getByTestId("held-spend")).toContainText(
    "₹30,000 to bank accounts not counted yet",
  );
  // The held amount opens the contributing rows; the linked duplicate alert is not listed.
  await page.getByTestId("held-spend").click();
  await expect(page.getByTestId("activity-held")).toHaveText(
    "+ ₹30,000 awaiting context",
  );
  await expect(page.getByTestId("activity-count")).toHaveText("2 TRANSACTIONS");
  await expect(page.getByRole("button", { name: /^Rahul S,/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^A\/c ••7788,/ })).toHaveCount(
    2,
  );
  await expect(
    page.getByRole("button", { name: /^Unknown merchant,/ }),
  ).toHaveCount(0);

  const review = await openTransaction(page, "A/c ••7788");
  await review.getByRole("button", { name: "Transfer", exact: true }).click();
  await expect(
    review.getByRole("switch", { name: "Remember merchant category" }),
  ).toBeDisabled();
  await expect(
    review.getByText(
      "A masked account ending cannot identify a unique payee. Save this payment only.",
      { exact: true },
    ),
  ).toBeVisible();
  await review
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(
    review.getByText("Categorization: Confirmed by you.", { exact: false }),
  ).toBeVisible();
  await closeReview(page);

  const saved = await savedJournal(page);
  expect(saved.transactions.find((t) => t.id === "kgb-1")).toMatchObject({
    kind: "transfer",
    review: false,
  });
  expect(saved.transactions.find((t) => t.id === "kgb-2")).toMatchObject({
    kind: "purchase",
    review: true,
  });
  expect(saved.rules).toEqual([]);
  await page.reload();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
  await expect(page.getByTestId("held-spend")).toContainText(
    "₹15,000 to bank accounts not counted yet",
  );
  await activity(page);
  await expect(page.getByTestId("activity-held")).toHaveText(
    "+ ₹15,000 awaiting context",
  );
});

test("held-payment review stays within its contributing rows and does not visit unrelated payments", async ({
  page,
}) => {
  await home(page);
  const before = await savedJournal(page);
  await page.getByTestId("held-spend").click();
  await page
    .getByRole("button", { name: "Review 2 payments one by one", exact: true })
    .click();
  const review = page.getByRole("dialog", { name: "Review payment" });
  await expect(
    review.getByText("PAYMENT 1 OF 2 · REVIEW AT YOUR PACE"),
  ).toBeVisible();
  await expect(
    review.getByRole("textbox", { name: "Merchant name", exact: true }),
  ).toHaveValue("A/c ••7788");
  await review
    .getByRole("button", { name: "Skip for now", exact: true })
    .click();
  await expect(
    review.getByText("PAYMENT 2 OF 2 · REVIEW AT YOUR PACE"),
  ).toBeVisible();
  await expect(
    review.getByRole("textbox", { name: "Merchant name", exact: true }),
  ).toHaveValue("A/c ••7788");
  await review
    .getByRole("button", { name: "Skip for now", exact: true })
    .click();
  await expect(review).toBeHidden();
  expect(await savedJournal(page)).toEqual(before);
  // The broader review list remains available after leaving the held-only view.
  await page.getByRole("button", { name: /^Needs context ·/ }).click();
  await expect(page.getByRole("button", { name: /^Rahul S,/ })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Review 4 payments one by one",
      exact: true,
    }),
  ).toBeVisible();
});
