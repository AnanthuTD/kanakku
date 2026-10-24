import {
  test,
  expect,
  home,
  activity,
  openTransaction,
  closeReview,
  savedJournal,
  setSwitch,
} from "./fixtures";

for (const note of [
  "Taxi ride and takeaway dinner",
  "Vegetables and headphones",
  "Split payment for shoes and a blood test",
]) {
  test(`mixed-purpose note stays unresolved until an explicit category choice: ${note}`, async ({
    page,
  }) => {
    await home(page);
    const review = await openTransaction(page, "Rahul S");
    await review.getByRole("textbox", { name: "Payment note" }).fill(note);
    await expect(
      review.getByRole("button", { name: "Uncategorized", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await review
      .getByRole("button", { name: "Transport", exact: true })
      .click();
    await review
      .getByRole("button", { name: "Save category", exact: true })
      .click();
    await expect(
      review.getByText("✓ Saved. You can close this or make another change."),
    ).toBeVisible();
    await closeReview(page);
    const saved = await savedJournal(page);
    expect(
      saved.transactions.find((entry) => entry.id === "rahul"),
    ).toMatchObject({
      category: "Transport",
      note,
      review: false,
    });
    expect(saved.rules).toEqual([]);
    await page.reload();
    await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
  });
}

test("correction and note survive reload without changing unrelated transactions or totals", async ({
  page,
}) => {
  await home(page);
  const review = await openTransaction(page, "Rahul S");
  await review
    .getByRole("textbox", { name: "Payment note" })
    .fill("auto to office");
  await review
    .getByRole("textbox", { name: "Merchant name", exact: true })
    .fill("Rahul Auto");
  await review
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(
    review.getByText("✓ Saved. You can close this or make another change."),
  ).toBeVisible();
  await closeReview(page);
  const data = await savedJournal(page);
  expect(data.transactions.find((t) => t.id === "rahul")).toMatchObject({
    category: "Transport",
    review: false,
    note: "auto to office",
    merchant: "Rahul Auto",
    originalMerchant: "Rahul S",
  });
  expect(data.transactions.find((t) => t.id === "lakshmi")).toMatchObject({
    category: "Uncategorized",
    review: true,
    note: "",
  });
  expect(data.rules).toEqual([]);
  await page.reload();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
  const reopened = await openTransaction(page, "Rahul Auto");
  await expect(
    reopened.getByRole("textbox", { name: "Payment note" }),
  ).toHaveValue("auto to office");
  await expect(reopened.getByText(/Bank merchant: Rahul S/)).toBeVisible();
});

test("undo restores category, merchant, note and review status durably", async ({
  page,
}) => {
  await home(page);
  const review = await openTransaction(page, "Rahul S");
  await review
    .getByRole("textbox", { name: "Payment note" })
    .fill("taxi to office");
  await review
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(
    review.getByText("✓ Saved. You can close this or make another change."),
  ).toBeVisible();
  await closeReview(page);
  await page.getByRole("button", { name: "Undo last ledger change" }).click();
  await expect(page.getByTestId("transaction-rahul")).toHaveAttribute(
    "aria-label",
    "Rahul S, ₹150, needs review",
  );
  await page.reload();
  const reopened = await openTransaction(page, "Rahul S");
  await expect(
    reopened.getByRole("textbox", { name: "Payment note" }),
  ).toHaveValue("");
  expect(
    (await savedJournal(page)).transactions.find((t) => t.id === "rahul")
      ?.review,
  ).toBe(true);
});

test("queue skip preserves one payment, saving the next finishes, and undo restores it", async ({
  page,
}) => {
  await home(page);
  await activity(page);
  await page
    .getByRole("button", { name: "Needs context · 2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review 2 payments one by one", exact: true })
    .click();
  const review = page.getByTestId("review-form");
  await expect(
    review.getByRole("textbox", { name: "Merchant name", exact: true }),
  ).toHaveValue("Rahul S");
  await review
    .getByRole("button", { name: "Skip for now", exact: true })
    .click();
  await expect(
    review.getByRole("textbox", { name: "Merchant name", exact: true }),
  ).toHaveValue("Lakshmi Stores");
  await review
    .getByRole("textbox", { name: "Payment note" })
    .fill("vegetables and milk");
  await review
    .getByRole("button", { name: "Save & next payment", exact: true })
    .click();
  await expect(review).toBeHidden();
  await expect(page.getByTestId("activity-count")).toHaveText("1 TRANSACTIONS");
  await expect(page.getByTestId("transaction-rahul")).toBeVisible();
  await page.getByRole("button", { name: "Undo last ledger change" }).click();
  await expect(page.getByTestId("activity-count")).toHaveText("2 TRANSACTIONS");
  await expect(page.getByTestId("transaction-lakshmi")).toHaveAttribute(
    "aria-label",
    "Lakshmi Stores, ₹250, needs review",
  );
});

test("dismissed edits are discarded and a mixed-purpose note remains uncertain", async ({
  page,
}) => {
  await home(page);
  const review = await openTransaction(page, "Rahul S");
  await review
    .getByRole("textbox", { name: "Payment note" })
    .fill("taxi and dinner");
  await expect(
    review.getByRole("switch", { name: "Remember merchant category" }),
  ).toBeDisabled();
  await review
    .getByRole("textbox", { name: "Merchant name", exact: true })
    .fill("Unsaved name");
  await closeReview(page);
  await page.getByTestId("transaction-rahul").click();
  await expect(
    review.getByRole("textbox", { name: "Payment note" }),
  ).toHaveValue("");
  await expect(
    review.getByRole("textbox", { name: "Merchant name", exact: true }),
  ).toHaveValue("Rahul S");
  expect((await savedJournal(page)).rules).toEqual([]);
});

test("a learned rule can be edited and removed without recategorizing past payments", async ({
  page,
}) => {
  await home(page);
  const review = await openTransaction(page, "Rahul S");
  await review.getByRole("button", { name: "Transport", exact: true }).click();
  await setSwitch(
    review.getByRole("switch", { name: "Remember merchant category" }),
    true,
  );
  // Remembering a payee asks for confirmation of how many payments it affects.
  const confirmations: string[] = [];
  page.once("dialog", async (dialog) => {
    confirmations.push(dialog.message());
    await dialog.accept();
  });
  await review
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(
    review.getByText("✓ Saved. You can close this or make another change."),
  ).toBeVisible();
  expect(confirmations).toEqual([
    "Apply to 1 payment?\n\nThis will use “Transport” for 1 matching payment, including this one. Future payments with this same payee will also be covered.",
  ]);
  await closeReview(page);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByTestId("settings-menu-tools").click();
  await page.getByRole("button", { name: "Edit rule for Rahul S" }).click();
  const rule = page.getByTestId("rule-sheet");
  await rule
    .getByRole("textbox", { name: "Merchant display name" })
    .fill("Rahul household");
  await rule.getByRole("button", { name: "Home", exact: true }).click();
  await rule.getByRole("button", { name: "Save merchant rule" }).click();
  await expect(rule).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Edit rule for Rahul S" }),
  ).toContainText("Rahul household");
  const data = await savedJournal(page);
  expect(data.rules).toEqual([
    { merchant: "Rahul S", category: "Home", alias: "Rahul household" },
  ]);
  expect(data.transactions.find((t) => t.id === "rahul")?.category).toBe(
    "Transport",
  );
  await page.getByRole("button", { name: "Remove rule for Rahul S" }).click();
  await expect(
    page.getByRole("button", { name: "Edit rule for Rahul S" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Edit rule for Rahul S" }),
  ).toHaveCount(0);
  expect((await savedJournal(page)).rules).toEqual([]);
  expect(
    (await savedJournal(page)).transactions.find((t) => t.id === "rahul")
      ?.category,
  ).toBe("Transport");
});

for (const kind of ["Self transfer", "Card repayment"]) {
  test(`marking a purchase as ${kind} removes it from net spending and undo restores it`, async ({
    page,
  }) => {
    await home(page);
    const review = await openTransaction(page, "Flipkart");
    await review.getByRole("button", { name: kind, exact: true }).click();
    await review
      .getByRole("button", { name: "Save category", exact: true })
      .click();
    await expect(
      review.getByText("✓ Saved. You can close this or make another change."),
    ).toBeVisible();
    await closeReview(page);
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await expect(page.getByTestId("overview-total")).toHaveText("₹650");
    await activity(page);
    await page.getByRole("button", { name: "Undo last ledger change" }).click();
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
  });
}

test("excluding and including a payment updates totals without losing its note", async ({
  page,
}) => {
  await home(page);
  const review = await openTransaction(page, "Flipkart");
  await review
    .getByRole("textbox", { name: "Payment note" })
    .fill("phone case");
  await setSwitch(
    review.getByRole("switch", { name: "Exclude from spending" }),
    true,
  );
  await review
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(
    review.getByText("✓ Saved. You can close this or make another change."),
  ).toBeVisible();
  await closeReview(page);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.getByTestId("overview-total")).toHaveText("₹650");
  await openTransaction(page, "Flipkart");
  await expect(
    review.getByRole("textbox", { name: "Payment note" }),
  ).toHaveValue("phone case");
  await setSwitch(
    review.getByRole("switch", { name: "Exclude from spending" }),
    false,
  );
  await review
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(
    review.getByText("✓ Saved. You can close this or make another change."),
  ).toBeVisible();
  await closeReview(page);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
});

test("avatar voice entry gives a clear web fallback and the typed answer can still be saved", async ({
  page,
}) => {
  await home(page);
  const avatar = page.getByTestId("floating-avatar");
  await avatar
    .getByRole("button", { name: "Review 2 unclear payments", exact: true })
    .click();
  await avatar
    .getByRole("button", { name: "Answer by voice", exact: true })
    .click();
  const review = page.getByTestId("review-form");
  await expect(
    review.getByText(
      "Voice notes are available in the Android build. Type a note here.",
    ),
  ).toBeVisible();
  await review
    .getByRole("textbox", { name: "Payment note" })
    .fill("auto to office");
  await review
    .getByRole("button", { name: "Save & next payment", exact: true })
    .click();
  await expect(
    review.getByRole("textbox", { name: "Merchant name", exact: true }),
  ).toHaveValue("Lakshmi Stores");
  expect(
    (await savedJournal(page)).transactions.find((t) => t.id === "rahul"),
  ).toMatchObject({ category: "Transport", review: false });
});

test("a blank merchant cannot be saved and does not overwrite the existing record", async ({
  page,
}) => {
  await home(page);
  const review = await openTransaction(page, "Rahul S");
  await review
    .getByRole("textbox", { name: "Merchant name", exact: true })
    .fill("  ");
  await review
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(
    review.getByText("Enter a merchant name between 1 and 80 characters."),
  ).toBeVisible();
  expect(
    (await savedJournal(page)).transactions.find((t) => t.id === "rahul")
      ?.merchant,
  ).toBe("Rahul S");
});

test("an already-loaded journal remains editable without network access", async ({
  page,
  context,
}) => {
  await home(page);
  await context.setOffline(true);
  const review = await openTransaction(page, "Rahul S");
  await review.getByRole("button", { name: "Transport", exact: true }).click();
  await review
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(
    review.getByText("✓ Saved. You can close this or make another change."),
  ).toBeVisible();
  expect(
    (await savedJournal(page)).transactions.find((t) => t.id === "rahul")
      ?.category,
  ).toBe("Transport");
});
