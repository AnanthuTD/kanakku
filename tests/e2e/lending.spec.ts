import { test, expect, home } from "./fixtures";

test("money lent stays outside spending and partial repayments persist", async ({
  page,
}) => {
  await home(page);
  await page.getByRole("tab", { name: "Insights", exact: true }).click();
  await page.getByRole("button", { name: "Open money lent tracker" }).click();

  await page.getByRole("textbox", { name: "Person who owes you" }).fill("Maya");
  await page.getByRole("textbox", { name: "Amount lent" }).fill("500");
  await page
    .getByRole("button", { name: "Choose expected return date" })
    .click();
  await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("button", { name: "Sunday, 1 November 2026" }).click();
  await page.getByRole("button", { name: "Add to money lent" }).click();
  const repayment = page.getByRole("textbox", {
    name: "Repayment amount for Maya",
  });
  await repayment.fill("200");
  await expect(page.getByText("₹500", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByText("₹300", { exact: true }).last()).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Repayment amount for Maya" }),
  ).toBeVisible();
  await expect(page.getByText("₹300", { exact: true }).last()).toBeVisible();
  await page.goto("/");
  await home(page);
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
});

test("marking a counted bank payment as lent immediately lowers monthly spending", async ({
  page,
}) => {
  await home(page);
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");

  await page.goto("/lending?transactionId=rahul");
  await expect(
    page.getByRole("textbox", { name: "Person who owes you" }),
  ).toHaveValue("Rahul S");
  await expect(page.getByRole("textbox", { name: "Amount lent" })).toHaveValue(
    "150.00",
  );
  await page.getByRole("button", { name: "Save as money lent" }).click();

  await page.goto("/");
  await home(page);
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,500");
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(
    page.getByTestId("transaction-rahul").getByText("Lent", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("transaction-rahul").getByText("Rahul S", { exact: true }),
  ).toBeVisible();

  await page.getByTestId("transaction-rahul").click();
  const detail = page.getByTestId("review-form");
  await expect(detail.getByText(/tracked as money lent/)).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Self transfer", exact: true }),
  ).toBeHidden();
  await detail.getByRole("button", { name: "Unmark as money lent" }).click();
  await expect(detail.getByText(/return to its previous type/)).toBeVisible();
  await detail.getByRole("button", { name: "Unmark loan" }).click();
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
});
