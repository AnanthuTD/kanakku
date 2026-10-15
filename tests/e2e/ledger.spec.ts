import { test, expect, home, activity } from "./fixtures";

test("net spending subtracts refunds and ignores repayment, income, transfer and excluded rows", async ({
  page,
}) => {
  await home(page);
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
  await page
    .getByRole("button", { name: "View transactions in this spending total" })
    .click();
  await expect(page.getByTestId("activity-count")).toHaveText(
    "10 TRANSACTIONS",
  );
  await expect(page.getByTestId("activity-total")).toHaveText("₹1,650");
});

test("month navigation selects the correct ledger and can return to the current month", async ({
  page,
}) => {
  await home(page);
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByText("September 2026", { exact: true })).toBeVisible();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,000");
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
});

test("hiding amounts also hides them from transaction and chart accessibility labels", async ({
  page,
}) => {
  await home(page);
  await page.getByRole("button", { name: "Hide spending amount" }).click();
  await expect(page.getByTestId("overview-total")).toHaveText("₹ •••••");
  await expect(page.getByRole("button", { name: /Swiggy, ₹100/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /\d+ rupees/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Show spending amount" }).click();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
});

test("merchant/account search, empty result and clear search keep totals consistent", async ({
  page,
}) => {
  await home(page);
  await activity(page);
  const search = page.getByRole("textbox", { name: "Search transactions" });
  await search.fill("4821");
  await expect(page.getByTestId("activity-count")).toHaveText("4 TRANSACTIONS");
  await expect(page.getByTestId("activity-total")).toHaveText("₹250");
  await search.fill("a merchant that does not exist");
  await expect(page.getByText("Nothing here just yet.")).toBeVisible();
  await expect(page.getByTestId("activity-total")).toHaveText("₹0");
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByTestId("activity-count")).toHaveText(
    "10 TRANSACTIONS",
  );
});

test("custom dates, account, type and category combine and survive navigation", async ({
  page,
}) => {
  await home(page);
  await activity(page);
  await page.getByRole("button", { name: "Open transaction filters" }).click();
  const filters = page.getByTestId("filters-sheet");
  await filters.getByRole("textbox", { name: "Start date" }).fill("2026-10-10");
  await filters.getByRole("textbox", { name: "End date" }).fill("2026-10-11");
  await filters
    .getByRole("button", { name: "Axis Flipkart 8046", exact: true })
    .click();
  await filters.getByRole("button", { name: "Purchases", exact: true }).click();
  await filters.getByRole("button", { name: "Shopping", exact: true }).click();
  await filters.getByRole("button", { name: "Show transactions" }).click();
  await expect(filters).toBeHidden();
  await expect(page.getByTestId("activity-count")).toHaveText("1 TRANSACTIONS");
  await expect(page.getByTestId("activity-total")).toHaveText("₹1,000");
  await expect(page.getByTestId("transaction-flipkart")).toBeVisible();
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await activity(page);
  await expect(page.getByTestId("activity-count")).toHaveText("1 TRANSACTIONS");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Back to overview" }).click();
  await expect(page.getByTestId("activity-total")).toHaveText("₹1,000");
  await expect(page.getByTestId("transaction-flipkart")).toBeVisible();
});

for (const [from, to] of [
  ["2026-02-30", "2026-10-11"],
  ["2026-10-12", "2026-10-10"],
]) {
  test(`invalid date range ${from}–${to} cannot change the ledger`, async ({
    page,
  }) => {
    await home(page);
    await activity(page);
    await page
      .getByRole("button", { name: "Open transaction filters" })
      .click();
    const filters = page.getByTestId("filters-sheet");
    await filters.getByRole("textbox", { name: "Start date" }).fill(from);
    await filters.getByRole("textbox", { name: "End date" }).fill(to);
    await filters.getByRole("button", { name: "Show transactions" }).click();
    await expect(filters.getByRole("alert")).toContainText("Enter valid dates");
    await filters
      .getByRole("button", { name: "Close Find your transactions" })
      .click();
    await expect(page.getByTestId("activity-total")).toHaveText("₹1,650");
  });
}

test("cancelling draft filters leaves the ledger unchanged; resetting removes restrictions", async ({
  page,
}) => {
  await home(page);
  await activity(page);
  await page.getByRole("button", { name: "Open transaction filters" }).click();
  const filters = page.getByTestId("filters-sheet");
  await filters.getByRole("button", { name: "Kiwi 2190", exact: true }).click();
  await filters
    .getByRole("button", { name: "Close Find your transactions" })
    .click();
  await expect(page.getByTestId("activity-count")).toHaveText(
    "10 TRANSACTIONS",
  );
  await page.getByRole("button", { name: "Open transaction filters" }).click();
  await filters.getByRole("button", { name: "Kiwi 2190", exact: true }).click();
  await filters
    .getByRole("button", { name: "Only payments needing context" })
    .click();
  await filters.getByRole("button", { name: "Show transactions" }).click();
  await expect(page.getByTestId("activity-count")).toHaveText("2 TRANSACTIONS");
  await page.getByRole("button", { name: "Open transaction filters" }).click();
  await filters.getByRole("button", { name: "Reset filters" }).click();
  await filters.getByRole("button", { name: "Show transactions" }).click();
  await expect(page.getByTestId("activity-count")).toHaveText(
    "10 TRANSACTIONS",
  );
});

test("category total opens the exact purchases and refunds contributing to it", async ({
  page,
}) => {
  await home(page);
  await page
    .getByRole("button", { name: "Food & dining ₹250", exact: true })
    .click();
  await expect(page.getByTestId("activity-count")).toHaveText("3 TRANSACTIONS");
  await expect(page.getByTestId("activity-total")).toHaveText("₹250");
  await expect(page.getByTestId("transaction-refund")).toBeVisible();
  await expect(page.getByTestId("transaction-flipkart")).toHaveCount(0);
});

test.describe("empty journal", () => {
  test.use({ journal: { transactions: [], rules: [] } });
  test("an empty journal shows zero, no review prompt and a useful empty state", async ({
    page,
  }) => {
    await home(page);
    await expect(page.getByTestId("overview-total")).toHaveText("₹0");
    await expect(
      page.getByRole("button", { name: /Review \d+ unclear payments/ }),
    ).toHaveCount(0);
    await activity(page);
    await expect(page.getByText("Nothing here just yet.")).toBeVisible();
  });
});

test.describe("damaged local data", () => {
  test.use({ storedDemo: "{broken-json" });
  test("malformed preview storage recovers to labeled sample data without a spinner", async ({
    page,
  }) => {
    await home(page);
    await expect(
      page.getByText(
        "Saved preview could not be loaded. Showing fresh sample data.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("A preview with sample transactions"),
    ).toBeVisible();
  });
});
