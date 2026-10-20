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
    .getByRole("textbox", { name: "Expected return date" })
    .fill("2026-11-01");
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
