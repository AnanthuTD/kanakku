import {
  test,
  expect,
  home,
  openTransaction,
  closeReview,
  savedJournal,
  transactions,
} from "./fixtures";

const unsupportedMessage =
  "Web merchant lookup requires the Android app and your own Brave API key.";

test("web Settings explains the optional provider without collecting a key or enabling search", async ({
  page,
}) => {
  const providerRequests: string[] = [];
  page.on("request", (request) => {
    if (
      /api\.search\.brave\.com|generativelanguage\.googleapis\.com/.test(
        request.url(),
      )
    )
      providerRequests.push(request.url());
  });
  await home(page);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByTestId("settings-menu-tools").click();
  await expect(
    page.getByText("Optional web merchant lookup", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Provider setup is available in the Android app. This preview makes no search requests.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/No SMS, amount, bank, account or note is sent/),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Brave Search API key" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "Enable Brave merchant lookup" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Public business search query" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "View Brave API pricing" }),
  ).toBeVisible();
  expect(providerRequests).toEqual([]);
});

test("review shows the exact public query and cancelling preserves the original payment", async ({
  page,
}) => {
  await home(page);
  const before = await savedJournal(page);
  const review = await openTransaction(page, "Rahul S");
  await review
    .getByRole("textbox", { name: "Merchant name", exact: true })
    .fill("Netflix");
  await review
    .getByRole("button", { name: "Look up a public business", exact: true })
    .click();
  await expect(review.getByText(/Search Brave for “Netflix”/)).toBeVisible();
  await expect(
    review.getByText(/Web results will not change this payment/),
  ).toBeVisible();
  await review
    .getByRole("button", { name: "Cancel web search", exact: true })
    .click();
  await expect(
    review.getByRole("button", {
      name: "Search this public business",
      exact: true,
    }),
  ).toBeHidden();
  await expect(
    review.getByRole("textbox", { name: "Merchant name", exact: true }),
  ).toHaveValue("Netflix");
  await closeReview(page);
  expect((await savedJournal(page)).transactions).toEqual(before.transactions);
  expect((await savedJournal(page)).rules).toEqual(before.rules);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
});

for (const query of ["Netflix"]) {
  test(`a confirmed web lookup for ${query} has an honest Android fallback and preserves the ledger`, async ({
    page,
  }) => {
    const providerRequests: string[] = [];
    page.on("request", (request) => {
      if (
        /api\.search\.brave\.com|generativelanguage\.googleapis\.com/.test(
          request.url(),
        )
      )
        providerRequests.push(request.url());
    });
    await home(page);
    const before = await savedJournal(page);
    const review = await openTransaction(page, "Rahul S");
    await review
      .getByRole("textbox", { name: "Merchant name", exact: true })
      .fill(query);
    await review
      .getByRole("button", { name: "Look up a public business", exact: true })
      .click();
    await review
      .getByRole("button", { name: "Search this public business", exact: true })
      .click();
    // Web has no native provider. Identifier validation before real transport is covered
    // by the domain tests; this journey must not pretend to exercise Android networking.
    await expect(review.getByRole("alert")).toHaveText(unsupportedMessage);
    await expect(
      review.getByText("Looking for public business matches…", { exact: true }),
    ).toBeHidden();
    await expect(
      review.getByRole("button", {
        name: "Look up a public business",
        exact: true,
      }),
    ).toBeVisible();
    await closeReview(page);
    expect((await savedJournal(page)).transactions).toEqual(
      before.transactions,
    );
    expect((await savedJournal(page)).rules).toEqual(before.rules);
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
    expect(providerRequests).toEqual([]);
  });
}

test("UPI lookup requires exact-address consent and changing the address revokes it", async ({
  page,
}) => {
  await home(page);
  const before = await savedJournal(page);
  const review = await openTransaction(page, "Rahul S");
  await review
    .getByRole("button", { name: "Look up a UPI ID", exact: true })
    .click();
  const query = review.getByRole("textbox", {
    name: "UPI ID to search",
    exact: true,
  });
  const consent = review.getByRole("switch", {
    name: "Approve sending this UPI ID to Brave",
    exact: true,
  });
  const submit = review.getByRole("button", {
    name: "Search this UPI ID",
    exact: true,
  });
  await query.fill("shop@oksbi");
  await expect(
    review.getByText("Search Brave for “shop@oksbi” only.", { exact: true }),
  ).toBeVisible();
  await expect(review.getByText(/It may identify a person/)).toBeVisible();
  await expect(submit).toBeDisabled();
  await consent.click();
  await expect(submit).toBeEnabled();
  await query.fill("shop@okaxis");
  await expect(consent).not.toBeChecked();
  await expect(submit).toBeDisabled();
  await review
    .getByRole("button", { name: "Cancel UPI ID search", exact: true })
    .click();
  await expect(query).toBeHidden();
  await review
    .getByRole("button", { name: "Look up a UPI ID", exact: true })
    .click();
  await expect(consent).not.toBeChecked();
  await closeReview(page);
  expect((await savedJournal(page)).transactions).toEqual(before.transactions);
  expect((await savedJournal(page)).rules).toEqual(before.rules);
});

test("a reviewed UPI ID has an honest Android fallback without transmitting or altering the ledger", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/api\.search\.brave\.com/.test(request.url()))
      requests.push(request.url());
  });
  await home(page);
  const before = await savedJournal(page);
  const review = await openTransaction(page, "Rahul S");
  await review
    .getByRole("button", { name: "Look up a UPI ID", exact: true })
    .click();
  await review
    .getByRole("textbox", { name: "UPI ID to search", exact: true })
    .fill("shop@oksbi");
  await review
    .getByRole("switch", {
      name: "Approve sending this UPI ID to Brave",
      exact: true,
    })
    .click();
  await review
    .getByRole("button", { name: "Search this UPI ID", exact: true })
    .click();
  await expect(review.getByRole("alert")).toHaveText(unsupportedMessage);
  await closeReview(page);
  expect((await savedJournal(page)).transactions).toEqual(before.transactions);
  expect((await savedJournal(page)).rules).toEqual(before.rules);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
  expect(requests).toEqual([]);
});

test("UPI search rejects embedded SMS and public-name search cannot bypass address consent", async ({
  page,
}) => {
  await home(page);
  const before = await savedJournal(page);
  const review = await openTransaction(page, "Rahul S");
  await review
    .getByRole("textbox", { name: "Merchant name", exact: true })
    .fill("shop@oksbi");
  await review
    .getByRole("button", { name: "Look up a public business", exact: true })
    .click();
  await review
    .getByRole("button", { name: "Search this public business", exact: true })
    .click();
  await expect(review.getByRole("alert")).toHaveText(
    /Enter only a public business name/,
  );
  await review
    .getByRole("button", { name: "Look up a UPI ID", exact: true })
    .click();
  await review
    .getByRole("textbox", { name: "UPI ID to search", exact: true })
    .fill("INR 500 sent to shop@oksbi");
  await review
    .getByRole("switch", {
      name: "Approve sending this UPI ID to Brave",
      exact: true,
    })
    .click();
  await review
    .getByRole("button", { name: "Search this UPI ID", exact: true })
    .click();
  await expect(review.getByRole("alert")).toHaveText(
    /Enter one complete UPI ID/,
  );
  await closeReview(page);
  expect((await savedJournal(page)).transactions).toEqual(before.transactions);
  expect((await savedJournal(page)).rules).toEqual(before.rules);
});

test.describe("VPA search from the bank merchant label", () => {
  test.use({
    journal: {
      rules: [],
      transactions: transactions.map((row) =>
        row.id === "rahul"
          ? { ...row, merchant: "My café", originalMerchant: "SHOP.42@OKAXIS" }
          : row,
      ),
    },
  });
  test("prefills only the preserved exact address even after editing the merchant name", async ({
    page,
  }) => {
    await home(page);
    const before = await savedJournal(page);
    const review = await openTransaction(page, "My café");
    await review
      .getByRole("textbox", { name: "Merchant name", exact: true })
      .fill("Another business");
    await review
      .getByRole("button", { name: "Look up a UPI ID", exact: true })
      .click();
    await expect(
      review.getByRole("textbox", { name: "UPI ID to search", exact: true }),
    ).toHaveValue("shop.42@okaxis");
    await expect(
      review.getByRole("switch", {
        name: "Approve sending this UPI ID to Brave",
        exact: true,
      }),
    ).not.toBeChecked();
    await closeReview(page);
    expect((await savedJournal(page)).transactions).toEqual(
      before.transactions,
    );
  });
});

test.describe("VPA search cannot extract and send other transaction text", () => {
  test.use({
    journal: {
      rules: [],
      transactions: transactions.map((row) =>
        row.id === "rahul"
          ? {
              ...row,
              originalMerchant: "INR 500 paid to shop@oksbi",
              note: "other@upi account 123",
            }
          : row,
      ),
    },
  });
  test("leaves the address blank when original merchant is a payment fragment", async ({
    page,
  }) => {
    await home(page);
    const review = await openTransaction(page, "Rahul S");
    await review
      .getByRole("button", { name: "Look up a UPI ID", exact: true })
      .click();
    await expect(
      review.getByRole("textbox", { name: "UPI ID to search", exact: true }),
    ).toHaveValue("");
    await expect(
      review.getByRole("button", { name: "Search this UPI ID", exact: true }),
    ).toBeDisabled();
  });
});
