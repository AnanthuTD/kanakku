import {
  test,
  expect,
  home,
  openTransaction,
  closeReview,
  savedJournal,
  transactions,
} from "./fixtures";
import type { Transaction } from "../../src/domain/model";
const sms: Transaction = {
  id: "sms-email-match",
  source: "sms",
  bank: "SBI",
  account: "9902",
  merchant: "Synthetic store SMS",
  amount: 10000,
  at: "2026-10-10T12:00:00+05:30",
  category: "Shopping",
  kind: "purchase",
  review: false,
  excluded: false,
  note: "",
  reason: "Synthetic fixture",
};
const pending: Transaction = {
  ...sms,
  id: "email-pending",
  source: "email",
  merchant: "Synthetic store email",
  review: true,
  emailMatchCandidates: [sms.id],
};
const usd: Transaction = {
  ...sms,
  id: "usd-email",
  source: "email",
  bank: "SBI Card",
  merchant: "Synthetic foreign store",
  amount: 2500,
  currency: "USD",
  review: true,
  timePrecision: "day",
};
test.use({
  journal: { transactions: [...transactions, sms, pending, usd], rules: [] },
});

test("browser cannot claim Gmail connection or access mail and leaves the journal unchanged", async ({
  page,
}) => {
  await home(page);
  const before = await savedJournal(page);
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  const card = page.getByTestId("gmail-settings");
  await expect(
    card.getByText(/This browser preview cannot access your mailbox/),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Connect Gmail", exact: true }),
  ).toBeDisabled();
  expect(await savedJournal(page)).toEqual(before);
});

test("foreign email charge stays in USD and enters INR totals only after an explicit final charge", async ({
  page,
}) => {
  await home(page);
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,750");
  const review = await openTransaction(page, "Synthetic foreign store");
  await expect(review.getByText("USD 25.00", { exact: true })).toBeVisible();
  await expect(review.getByText(/No exchange rate is assumed/)).toBeVisible();
  await review
    .getByRole("textbox", { name: "Final INR charge", exact: true })
    .fill("1,2");
  await expect(
    review.getByRole("button", { name: "Save category", exact: true }),
  ).toBeDisabled();
  await review
    .getByRole("textbox", { name: "Final INR charge", exact: true })
    .fill("2134.56");
  await review.getByRole("button", { name: "Shopping", exact: true }).click();
  await review
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(
    review.getByText("✓ Saved. You can close this or make another change."),
  ).toBeVisible();
  await closeReview(page);
  await page.reload();
  await expect(page.getByTestId("overview-total")).toHaveText("₹3,884.56");
  const stored = (await savedJournal(page)).transactions.find(
    (t) => t.id === usd.id,
  )!;
  expect(stored).toMatchObject({
    amount: 2500,
    currency: "USD",
    inrAmount: 213456,
    source: "email",
    review: false,
  });
  const reopened = await openTransaction(page, "Synthetic foreign store");
  await expect(
    reopened.getByRole("textbox", { name: "Final INR charge", exact: true }),
  ).toHaveValue("2134.56");
});

test("a possible SMS match waits for a decision and linking it preserves the original payment", async ({
  page,
}) => {
  await home(page);
  const before = await savedJournal(page);
  const review = await openTransaction(page, "Synthetic store email");
  await expect(
    review.getByRole("button", { name: "Save category", exact: true }),
  ).toBeDisabled();
  await review
    .getByRole("button", { name: /^Same payment as Synthetic store SMS/ })
    .click();
  await expect(review).toBeHidden();
  const saved = await savedJournal(page);
  expect(saved.transactions.find((t) => t.id === pending.id)).toMatchObject({
    duplicateOf: sms.id,
    excluded: true,
    review: false,
    source: "email",
  });
  expect(saved.transactions.find((t) => t.id === sms.id)).toEqual(
    before.transactions.find((t) => t.id === sms.id),
  );
  await page.reload();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,750");
});

test("confirming a separate payment counts it once and the decision survives reload", async ({
  page,
}) => {
  await home(page);
  const review = await openTransaction(page, "Synthetic store email");
  await review
    .getByRole("button", { name: "Count as a separate payment", exact: true })
    .click();
  await expect(
    review.getByRole("button", { name: "Save category", exact: true }),
  ).toBeEnabled();
  await closeReview(page);
  await page.reload();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,850");
  const row = (await savedJournal(page)).transactions.find(
    (t) => t.id === pending.id,
  )!;
  expect(row.emailMatchCandidates).toBeUndefined();
  expect(row.classification?.method).toBe("user");
});
