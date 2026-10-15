import { test, expect, home, activity } from "./fixtures";

test("tabs support arrow, Home and End keys with one selected focus stop", async ({
  page,
}) => {
  await home(page);
  const overview = page.getByRole("tab", { name: "Overview", exact: true });
  const active = page.getByRole("tab", { name: "Activity", exact: true });
  const insights = page.getByRole("tab", { name: "Insights", exact: true });
  await overview.focus();
  await page.keyboard.press("ArrowRight");
  await expect(active).toBeFocused();
  await expect(active).toHaveAttribute("aria-selected", "true");
  await expect(active).toHaveAttribute("tabindex", "0");
  await expect(overview).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("End");
  await expect(insights).toBeFocused();
  await expect(insights).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(overview).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(insights).toBeFocused();
  await page.keyboard.press("Home");
  await expect(overview).toBeFocused();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
});

test("filter dialog contains keyboard focus and Escape returns it to the opener", async ({
  page,
}) => {
  await home(page);
  await activity(page);
  const opener = page.getByRole("button", { name: "Open transaction filters" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Find your transactions" });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", {
    name: "Close Find your transactions",
  });
  await expect(close).toBeFocused();
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press("Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("hidden amounts stay hidden in transaction accessible names", async ({
  page,
}) => {
  await home(page);
  await page.getByRole("button", { name: "Hide spending amount" }).click();
  await expect(page.getByTestId("overview-total")).not.toContainText("1,650");
  const rows = page.locator('[data-testid^="transaction-"]');
  await expect(rows.first()).toHaveAttribute("aria-label", /amount hidden/);
  for (const row of await rows.all()) {
    await expect(row).not.toHaveAttribute("aria-label", /₹|[0-9],[0-9]{3}/);
  }
  await page.getByRole("button", { name: "Show spending amount" }).click();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
});

test("primary navigation and search controls meet 44px pointer targets", async ({
  page,
}) => {
  await home(page);
  const controls = [
    page.getByRole("button", { name: "Open settings" }),
    page.getByRole("button", { name: "Switch to dark theme" }),
    ...(await page.getByRole("tablist").getByRole("tab").all()),
  ];
  await activity(page);
  await page
    .getByRole("textbox", { name: "Search transactions" })
    .fill("Swiggy");
  controls.push(page.getByRole("button", { name: "Clear search" }));
  for (const control of controls) {
    const box = await control.boundingBox();
    expect(
      box,
      (await control.getAttribute("aria-label")) ?? "control",
    ).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test("200 percent browser text keeps search, navigation and filter recovery usable", async ({
  page,
}) => {
  await home(page);
  await activity(page);
  // Computed pixel fonts are doubled only on text-bearing nodes, not inherited
  // containers. This simulates text resize rather than image/page magnification.
  await page.evaluate(() => {
    const measured = [...document.querySelectorAll<HTMLElement>("*")]
      .filter(
        (e) =>
          e instanceof HTMLInputElement ||
          [...e.childNodes].some(
            (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
          ),
      )
      .map((e) => ({
        e,
        font: parseFloat(getComputedStyle(e).fontSize),
        line: parseFloat(getComputedStyle(e).lineHeight),
      }));
    for (const { e, font, line } of measured) {
      e.style.fontSize = `${font * 2}px`;
      if (Number.isFinite(line)) e.style.lineHeight = `${line * 2}px`;
    }
  });
  const search = page.getByRole("textbox", { name: "Search transactions" });
  await search.fill("not-a-merchant");
  await expect(page.getByText("Nothing here just yet.")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByTestId("activity-count")).toHaveText(
    "10 TRANSACTIONS",
  );
  await page.getByRole("button", { name: "Open transaction filters" }).click();
  const sheet = page.getByTestId("filters-sheet");
  await sheet.getByRole("textbox", { name: "Start date" }).fill("2026-99-99");
  await sheet.getByRole("button", { name: "Show transactions" }).click();
  await expect(sheet.getByRole("alert")).toContainText("Enter valid dates");
  await sheet.getByRole("button", { name: "Reset filters" }).click();
  await sheet.getByRole("button", { name: "Show transactions" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("activity-count")).toHaveText(
    "10 TRANSACTIONS",
  );
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
});

test.describe("empty journal", () => {
  test.use({ journal: { transactions: [], rules: [] } });
  test("empty history explains the next step and preserves working navigation", async ({
    page,
  }) => {
    await home(page);
    await expect(page.getByTestId("overview-total")).toHaveText("₹0");
    await expect(page.getByText("A fresh page.")).toBeVisible();
    await activity(page);
    await expect(page.getByText("Nothing here just yet.")).toBeVisible();
    await page.getByRole("button", { name: "Open settings" }).click();
    await page
      .getByRole("button", { name: "Connect bank SMS", exact: true })
      .click();
    await expect(
      page.getByRole("radiogroup", { name: "SMS history period" }),
    ).toBeVisible();
  });
});
