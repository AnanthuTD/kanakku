import { Page } from "@playwright/test";
import {
  test,
  expect,
  home,
  activity,
  savedJournal,
  transactions,
} from "./fixtures";
import type { Transaction } from "../../src/domain/model";

// Independent evidence fixture; do not import the detector or its key helper
// as an oracle. These historical charges do not change October's ₹1,650 total.
const netflix: Transaction[] = ["2026-07-10", "2026-08-10", "2026-09-10"].map(
  (day, index) => ({
    id: `netflix-${index}`,
    merchant: "Netflix",
    amount: 64_900,
    at: `${day}T12:00:00+05:30`,
    bank: "HDFC Swiggy",
    account: "4821",
    category: "Entertainment",
    kind: "purchase",
    review: false,
    excluded: false,
    note: "",
    source: "sample",
    reason: "Recurring-payment E2E fixture",
  }),
);
const decisionKey = '["netflix","hdfc swiggy","4821"]';
async function openRecurring(page: Page) {
  await home(page);
  await page.getByRole("tab", { name: "Insights", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Subscriptions & recurring payments",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("subscriptions-screen")).toBeVisible();
}
async function openNetflix(page: Page) {
  await page
    .getByRole("button", {
      name: "Review Netflix monthly pattern",
      exact: true,
    })
    .click();
  const detail = page.getByTestId("recurring-detail");
  await expect(detail).toBeVisible();
  return detail;
}
async function storedDecision(page: Page) {
  return page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem("kanakku-demo-v1")!).metadata
        ?.recurringDecisions?.[key],
    decisionKey,
  );
}

test.describe("subscription and recurring-payment review", () => {
  test.use({
    journal: { transactions: [...transactions, ...netflix], rules: [] },
  });

  test("three historical charges show a labelled pattern with traceable evidence and an estimate", async ({
    page,
  }, testInfo) => {
    await openRecurring(page);
    await expect(
      page.getByText("You’re exploring sample data.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Review Netflix monthly pattern",
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      page.getByText("Likely · subscription pattern", { exact: true }),
    ).toBeVisible();
    const detail = await openNetflix(page);
    await expect(detail).toContainText("₹649");
    await expect(
      detail.getByText("HDFC Swiggy · 4821", { exact: true }),
    ).toBeVisible();
    await expect(
      detail.getByText(
        "• 3 recorded purchases with monthly spacing on this account.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      detail.getByText("• The recorded charge amount is unchanged.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      detail.getByText("Recorded charges", { exact: true }),
    ).toBeVisible();
    await expect(detail.getByText(/Next estimated charge:/)).toBeVisible();
    await expect(
      detail.getByText(/not a payment reminder or a verified due date/),
    ).toBeVisible();
    // Three source amounts are distinct from the card's median summary.
    await expect(detail.getByText("₹649", { exact: true })).toHaveCount(3);
    await page.screenshot({
      animations: "disabled",
      path: `${process.cwd()}/artifacts/subscriptions-evidence-${testInfo.project.name}.png`,
    });
    await detail
      .getByRole("button", { name: "Close Netflix", exact: true })
      .click();
    await expect(detail).toBeHidden();
    await expect(
      page.getByText("You’re exploring sample data.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Review Netflix monthly pattern",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      animations: "disabled",
      path: `${process.cwd()}/artifacts/subscriptions-${testInfo.project.name}.png`,
    });
  });

  test("confirmation survives reload without rewriting transactions or changing spending totals", async ({
    page,
  }) => {
    await home(page);
    await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
    const original = await savedJournal(page);
    await openRecurring(page);
    const detail = await openNetflix(page);
    await detail
      .getByRole("button", { name: "Confirm recurring pattern", exact: true })
      .click();
    await expect(detail).toBeHidden();
    await expect.poll(() => storedDecision(page)).toBe("confirmed");
    await expect(
      page.getByText("No patterns to review yet.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Confirmed", exact: true }).click();
    await expect(
      page.getByText("Confirmed by you", { exact: true }),
    ).toBeVisible();
    await openNetflix(page);
    await expect(page.getByTestId("recurring-restore")).toBeVisible();
    expect((await savedJournal(page)).transactions).toEqual(
      original.transactions,
    );
    expect((await savedJournal(page)).rules).toEqual(original.rules);
    await home(page);
    await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
    await activity(page);
    await expect(page.getByTestId("activity-total")).toHaveText("₹1,650");
    await expect(page.getByTestId("activity-count")).toHaveText(
      "10 TRANSACTIONS",
    );
  });

  test("ignored patterns persist and can be restored to review without changing ledger rows", async ({
    page,
  }) => {
    await openRecurring(page);
    const original = await savedJournal(page);
    const detail = await openNetflix(page);
    await detail
      .getByRole("button", { name: "Ignore this pattern", exact: true })
      .click();
    await expect(detail).toBeHidden();
    await expect.poll(() => storedDecision(page)).toBe("ignored");
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: "Review Netflix monthly pattern",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Ignored", exact: true }).click();
    await expect(
      page.getByText("Ignored by you", { exact: true }),
    ).toBeVisible();
    const ignoredDetail = await openNetflix(page);
    await ignoredDetail
      .getByRole("button", { name: "Move back to review", exact: true })
      .click();
    await expect(ignoredDetail).toBeHidden();
    await expect.poll(() => storedDecision(page)).toBeUndefined();
    await page
      .getByRole("button", { name: "To review (1)", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Review Netflix monthly pattern",
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: "Review Netflix monthly pattern",
        exact: true,
      }),
    ).toBeVisible();
    expect((await savedJournal(page)).transactions).toEqual(
      original.transactions,
    );
  });
});

test.describe("insufficient recurring-payment evidence", () => {
  test.describe("one brand charge", () => {
    test.use({
      journal: { transactions: [...transactions, netflix[0]], rules: [] },
    });
    test("a single Netflix purchase is not treated as a subscription", async ({
      page,
    }) => {
      await openRecurring(page);
      await expect(
        page.getByText("No patterns to review yet.", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(/A single Netflix payment is not enough evidence/),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Review Netflix monthly pattern",
          exact: true,
        }),
      ).toHaveCount(0);
    });
  });
  test.describe("empty journal", () => {
    test.use({ journal: { transactions: [], rules: [] } });
    test("empty history has a useful empty state and no actionable estimate", async ({
      page,
    }) => {
      await openRecurring(page);
      await expect(
        page.getByText("No patterns to review yet.", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^Review .+ pattern$/ }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Confirmed", exact: true })
        .click();
      await expect(
        page.getByText("Nothing confirmed yet.", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Ignored", exact: true }).click();
      await expect(
        page.getByText("Nothing ignored.", { exact: true }),
      ).toBeVisible();
    });
  });
  test.describe("different card accounts", () => {
    test.use({
      journal: {
        transactions: [
          ...transactions,
          ...netflix.map((t, i) => ({
            ...t,
            account: i === 2 ? "9999" : "4821",
          })),
        ],
        rules: [],
      },
    });
    test("charges on different cards do not create one artificial monthly pattern", async ({
      page,
    }) => {
      await openRecurring(page);
      await expect(
        page.getByText("No patterns to review yet.", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Review Netflix monthly pattern",
          exact: true,
        }),
      ).toHaveCount(0);
    });
  });
});
