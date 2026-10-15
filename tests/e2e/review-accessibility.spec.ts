import { test, expect, home, activity, savedJournal } from "./fixtures";

test("keyboard review opens with close focus, contains both tab directions and Escape discards edits", async ({
  page,
}) => {
  await home(page);
  await activity(page);
  await page
    .getByRole("textbox", { name: "Search transactions" })
    .fill("Rahul S");
  const opener = page.getByTestId("transaction-rahul");
  await opener.focus();
  await page.keyboard.press("Enter");
  const review = page.getByRole("dialog", { name: "Review payment" });
  await expect(review).toBeVisible();
  const close = review.getByRole("button", {
    name: "Close transaction",
    exact: true,
  });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    review.getByRole("button", { name: "Done", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  for (let i = 0; i < 34; i++) {
    await page.keyboard.press("Tab");
    await expect(review.locator(":focus")).toHaveCount(1);
  }
  for (let i = 0; i < 34; i++) {
    await page.keyboard.press("Shift+Tab");
    await expect(review.locator(":focus")).toHaveCount(1);
  }
  await review
    .getByRole("textbox", { name: "Payment note" })
    .fill("Unsaved office trip");
  const merchant = review.getByRole("textbox", {
    name: "Merchant name",
    exact: true,
  });
  await merchant.fill("");
  await page.keyboard.type("Unsaved merchant name");
  await expect(merchant).toHaveValue("Unsaved merchant name");
  await page.keyboard.press("Escape");
  await expect(review).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(
    (await savedJournal(page)).transactions.find((t) => t.id === "rahul")?.note,
  ).toBe("");
  await page.keyboard.press("Enter");
  await expect(
    review.getByRole("textbox", { name: "Payment note" }),
  ).toHaveValue("");
  await expect(close).toBeFocused();
});

test("voice failure retains keyboard typing and save without leaking focus to the page", async ({
  page,
}) => {
  await home(page);
  await activity(page);
  await page
    .getByRole("textbox", { name: "Search transactions" })
    .fill("Rahul S");
  const opener = page.getByTestId("transaction-rahul");
  await opener.focus();
  await page.keyboard.press("Enter");
  const review = page.getByRole("dialog", { name: "Review payment" });
  await expect(
    review.getByRole("button", { name: "Close transaction", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    review.getByRole("button", { name: "Explain payment by voice" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    review.getByText(
      "Voice notes are available in the Android build. Type a note here.",
    ),
  ).toBeVisible();
  const note = review.getByRole("textbox", { name: "Payment note" });
  await note.focus();
  await page.keyboard.type("auto to office");
  await expect(note).toHaveValue("auto to office");
  await expect(
    review.getByRole("button", { name: "Transport", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const save = review.getByRole("button", {
    name: "Save category",
    exact: true,
  });
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(
    review.getByText("✓ Saved. You can close this or make another change."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(review).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(
    (await savedJournal(page)).transactions.find((t) => t.id === "rahul"),
  ).toMatchObject({
    note: "auto to office",
    category: "Transport",
    review: false,
  });
});

test("finishing a keyboard review queue restores a visible navigation focus when its opener disappears", async ({
  page,
}) => {
  await home(page);
  await activity(page);
  await page
    .getByRole("button", { name: "Needs context · 2", exact: true })
    .click();
  const opener = page.getByRole("button", {
    name: "Review 2 payments one by one",
    exact: true,
  });
  await opener.focus();
  await page.keyboard.press("Enter");
  const review = page.getByRole("dialog", { name: "Review payment" });
  await expect(
    review.getByRole("button", { name: "Close transaction", exact: true }),
  ).toBeFocused();
  await review
    .getByRole("textbox", { name: "Payment note" })
    .fill("auto to office");
  let save = review.getByRole("button", {
    name: "Save & next payment",
    exact: true,
  });
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(
    review.getByRole("textbox", { name: "Merchant name", exact: true }),
  ).toHaveValue("Lakshmi Stores");
  await expect(
    review.getByRole("button", { name: "Close transaction", exact: true }),
  ).toBeFocused();
  await review
    .getByRole("textbox", { name: "Payment note" })
    .fill("vegetables and milk");
  save = review.getByRole("button", {
    name: "Save & next payment",
    exact: true,
  });
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(review).toHaveCount(0);
  await expect(opener).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Activity", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
});
