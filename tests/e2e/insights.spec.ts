import { test, expect, home } from "./fixtures";

test("a rolling food question shows its period, correct net amount and matching rows", async ({
  page,
}) => {
  await home(page);
  await page.getByRole("tab", { name: "Insights", exact: true }).click();
  await page
    .getByRole("button", { name: "Food last 2 months", exact: true })
    .click();
  const answer = page.getByTestId("question-result");
  await expect(answer).toContainText("14 Aug 2026 – 14 Oct 2026");
  await expect(answer).toContainText("₹550");
  await expect(answer).toContainText("4 matching transactions · sample data");
  await answer
    .getByRole("button", { name: "View contributing transactions" })
    .click();
  await expect(page.getByTestId("activity-count")).toHaveText("4 TRANSACTIONS");
  await expect(page.getByTestId("activity-total")).toHaveText("₹550");
});

test("ambiguous questions ask for clarification; changing text clears a stale answer", async ({
  page,
}) => {
  await home(page);
  await page.getByRole("tab", { name: "Insights", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Spending question" });
  await input.fill("food and shopping this month");
  await page.getByRole("button", { name: "Find the answer" }).click();
  await expect(page.getByRole("alert")).toContainText("need clarification");
  await expect(page.getByTestId("question-result")).toHaveCount(0);
  await input.fill("home this month");
  await input.press("Enter");
  await expect(page.getByTestId("question-result")).toContainText("₹0");
  await expect(page.getByTestId("question-result")).toContainText(
    "0 matching transactions",
  );
  await input.fill("What is my bank balance?");
  await expect(page.getByTestId("question-result")).toHaveCount(0);
  await page.getByRole("button", { name: "Find the answer" }).click();
  await expect(page.getByRole("alert")).toContainText("Try");
});

test("merchant drill-down uses the exact merchant and subtracts its refund", async ({
  page,
}) => {
  await home(page);
  await page.getByRole("tab", { name: "Insights", exact: true }).click();
  await page
    .getByRole("button", { name: "View spending at Swiggy", exact: true })
    .click();
  await expect(page.getByTestId("activity-count")).toHaveText("2 TRANSACTIONS");
  await expect(page.getByTestId("activity-total")).toHaveText("₹50");
  await expect(page.getByTestId("transaction-zomato")).toHaveCount(0);
});

test("comparison excludes today and exposes both equivalent date ranges", async ({
  page,
}) => {
  await home(page);
  await page.getByRole("tab", { name: "Insights", exact: true }).click();
  await expect(page.getByText(/Completed days 1–13/)).toBeVisible();
  await expect(page.getByText(/₹1,550.*vs ₹1,000/)).toBeVisible();
  await page
    .getByRole("button", { name: "View selected period", exact: true })
    .click();
  await expect(page.getByTestId("activity-total")).toHaveText("₹1,550");
  await expect(page.getByTestId("transaction-swiggy")).toHaveCount(0);
  await page.getByRole("tab", { name: "Insights", exact: true }).click();
  await page
    .getByRole("button", { name: "View previous period", exact: true })
    .click();
  await expect(page.getByTestId("activity-count")).toHaveText("2 TRANSACTIONS");
  await expect(page.getByTestId("activity-total")).toHaveText("₹1,000");
});
