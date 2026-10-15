import { test as base, expect, Page, Locator } from "@playwright/test";
import type { Transaction, MerchantRule } from "../../src/domain/model";

// Independent fixture amounts: October 1650 net; food 250; prior month 1000.
// Do not import production calculators or sample generation as the test oracle.
const transaction = (
  id: string,
  merchant: string,
  amount: number,
  day: string,
  patch: Partial<Transaction> = {},
): Transaction => ({
  id,
  merchant,
  amount,
  at: `${day}T12:00:00+05:30`,
  bank: "HDFC Swiggy",
  account: "4821",
  category: "Food & dining",
  kind: "purchase",
  review: false,
  excluded: false,
  note: "",
  source: "sample",
  reason: "E2E fixture",
  ...patch,
});
export const transactions: Transaction[] = [
  transaction("swiggy", "Swiggy", 10_000, "2026-10-14"),
  transaction("zomato", "Zomato", 20_000, "2026-10-13"),
  transaction("refund", "Swiggy", 5_000, "2026-10-12", { kind: "refund" }),
  transaction("flipkart", "Flipkart", 100_000, "2026-10-11", {
    bank: "Axis Flipkart",
    account: "8046",
    category: "Shopping",
  }),
  transaction("rahul", "Rahul S", 15_000, "2026-10-10", {
    bank: "Kiwi",
    account: "2190",
    category: "Uncategorized",
    review: true,
  }),
  transaction("lakshmi", "Lakshmi Stores", 25_000, "2026-10-09", {
    bank: "Kiwi",
    account: "2190",
    category: "Uncategorized",
    review: true,
  }),
  transaction("repayment", "Credit card repayment", 120_000, "2026-10-08", {
    category: "Uncategorized",
    kind: "card_payment",
  }),
  transaction("income", "Salary", 500_000, "2026-10-07", {
    bank: "SBI",
    account: "6218",
    category: "Uncategorized",
    kind: "income",
  }),
  transaction("transfer", "Own account transfer", 60_000, "2026-10-06", {
    bank: "Slice",
    account: "3710",
    category: "Uncategorized",
    kind: "transfer",
  }),
  transaction("excluded", "Amazon", 40_000, "2026-10-05", {
    bank: "SBI",
    account: "6218",
    category: "Shopping",
    excluded: true,
  }),
  transaction("previous-food", "Swiggy", 30_000, "2026-09-10"),
  transaction("previous-shopping", "Flipkart", 70_000, "2026-09-09", {
    bank: "Axis Flipkart",
    account: "8046",
    category: "Shopping",
  }),
  transaction("old-food", "Swiggy", 90_000, "2026-07-01"),
];
export interface Journal {
  transactions: Transaction[];
  rules: MerchantRule[];
}
export const test = base.extend<{
  journal: Journal;
  storedDemo: string | undefined;
  runtimeCheck: void;
}>({
  journal: [{ transactions, rules: [] }, { option: true }],
  storedDemo: [undefined, { option: true }],
  page: async ({ page, journal, storedDemo }, use) => {
    // Date is fixed while real animation/event timers continue to run.
    await page.clock.setFixedTime(new Date("2026-10-14T07:00:00Z"));
    await page.addInitScript(
      ({ data }) => {
        if (localStorage.getItem("kanakku-e2e-seeded")) return;
        localStorage.setItem("kanakku-e2e-seeded", "1");
        localStorage.setItem("kanakku-demo-v1", data);
        localStorage.setItem("kanakku-mode", "demo");
        localStorage.setItem("kanakku-theme", "light");
      },
      { data: storedDemo ?? JSON.stringify(journal) },
    );
    await use(page);
  },
  runtimeCheck: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await use();
      expect(
        errors,
        "No uncaught exceptions or console errors during a user journey",
      ).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
export async function home(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("overview-total")).toBeVisible();
}
export async function activity(page: Page) {
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Search transactions" }),
  ).toBeVisible();
}
export async function openTransaction(page: Page, merchant: string) {
  await activity(page);
  await page
    .getByRole("textbox", { name: "Search transactions" })
    .fill(merchant);
  await page
    .getByRole("button", { name: new RegExp(`^${merchant},`) })
    .first()
    .click();
  await expect(page.getByTestId("review-form")).toBeVisible();
  return page.getByTestId("review-form");
}
export async function closeReview(page: Page) {
  await page
    .getByRole("button", { name: "Close transaction", exact: true })
    .click();
  await expect(page.getByTestId("review-form")).toBeHidden();
}
export async function savedJournal(page: Page): Promise<Journal> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("kanakku-demo-v1")!),
  );
}

export async function setSwitch(control: Locator, checked: boolean) {
  await expect(control).toBeEnabled();
  if ((await control.isChecked()) !== checked) await control.click();
  // React Native Web commits controlled switch state after the click event.
  await expect(control).toBeChecked({ checked });
}
