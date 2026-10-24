import { test, expect, home, transactions } from "./fixtures";

// Independent fixture: the fixed clock is 14 Oct 2026 (IST). HDFC ••4821 has a ₹2,000 statement
// with the fixture's ₹1,200 card repayment after it; Axis ••8046 has ₹4,520 and nothing repaid.
test.use({
  storedDemo: JSON.stringify({
    transactions,
    rules: [],
    metadata: {
      recurringDecisions: {},
      cardDues: [
        {
          id: "statement-8046",
          bank: "Axis Flipkart",
          account: "8046",
          totalDue: 452_000,
          minimumDue: 23_000,
          dueDate: "2026-10-23",
          at: "2026-10-02T09:00:00.000Z",
        },
        {
          id: "statement-4821",
          bank: "HDFC Swiggy",
          account: "4821",
          totalDue: 200_000,
          dueDate: "2026-10-16",
          at: "2026-10-01T09:00:00.000Z",
        },
      ],
    },
  }),
});

test("card bills show what is left, soonest first, and a manual paid mark persists", async ({
  page,
}) => {
  await home(page);
  const dues = page.getByTestId("card-dues");
  const hdfc = page.getByTestId("card-due-4821");
  const axis = page.getByTestId("card-due-8046");
  await expect(hdfc).toContainText("₹800 due in 2 days");
  await expect(hdfc).toContainText("HDFC Swiggy card ••4821 · ₹1,200 paid so far");
  await expect(axis).toContainText("₹4,520 due in 9 days");
  await expect(axis).toContainText("Axis Flipkart card ••8046 · min ₹230");
  await expect(dues.getByRole("button").first()).toHaveAttribute("data-testid", "card-due-4821");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Mark Axis Flipkart ••8046 as paid?");
    await dialog.accept();
  });
  await axis.click();
  await expect(axis).toContainText("Axis Flipkart card ••8046 paid");
  await expect(axis).toContainText("Marked paid");
  // Card bills are reminders only; they never change spending totals.
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");

  await page.reload();
  await expect(page.getByTestId("card-due-8046")).toContainText("••8046 paid");
  await expect(page.getByTestId("card-due-4821")).toContainText("₹800 due in 2 days");
});

test("dismissing the paid confirmation keeps the bill due", async ({ page }) => {
  await home(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByTestId("card-due-8046").click();
  await expect(page.getByTestId("card-due-8046")).toContainText("₹4,520 due in 9 days");
});
