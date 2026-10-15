import { test, expect, home } from "./fixtures";

for (const motion of ["reduce", "no-preference"] as const) {
  test.describe(`launch with ${motion} motion`, () => {
    test.use({ reducedMotion: motion });
    test("brand splash hands over to the overview without blocking it", async ({
      page,
    }) => {
      const started = Date.now();
      await page.goto("/");
      await expect(page.getByTestId("launch-splash")).toHaveCount(0, {
        timeout: 4_000,
      });
      // Brand moment plus loading never exceeds the 2.5s hold and its exit.
      expect(Date.now() - started).toBeLessThan(4_000);
      await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
      await expect(
        page.getByRole("tab", { name: "Overview", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
    });
  });
}

test("floating tab bar names every tab and labels only the selected one", async ({
  page,
}) => {
  await home(page);
  const tabs = page.getByRole("tablist");
  for (const name of ["Overview", "Activity", "Insights"])
    await expect(tabs.getByRole("tab", { name, exact: true })).toBeVisible();
  await expect(tabs).toHaveText("Overview");
  await tabs.getByRole("tab", { name: "Insights", exact: true }).click();
  await expect(
    tabs.getByRole("tab", { name: "Insights", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    tabs.getByRole("tab", { name: "Overview", exact: true }),
  ).toHaveAttribute("aria-selected", "false");
  await expect(tabs).toHaveText("Insights");
});

test("unknown links explain themselves and return to the overview", async ({
  page,
}) => {
  await page.goto("/no-such-page");
  await expect(page.getByText("This page isn't here.")).toBeVisible();
  await page.getByRole("button", { name: "Go to overview" }).click();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
});
