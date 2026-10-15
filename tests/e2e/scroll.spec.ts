import { test, expect, home, activity, transactions } from "./fixtures";
const largeJournal = Array.from({ length: 200 }, (_, index) => ({
  ...transactions[0],
  id: `long-${index}`,
  merchant: `Fixture shop ${String(index).padStart(3, "0")}`,
  category: "Shopping" as const,
  at: new Date(
    Date.parse("2026-10-13T18:00:00+05:30") - index * 60_000,
  ).toISOString(),
}));
test.use({ journal: { transactions: largeJournal, rules: [] } });
test("a long Activity list restores its scroll position after switching tabs", async ({
  page,
}) => {
  await home(page);
  await activity(page);
  const list = page.getByTestId("activity-list");
  await list.hover();
  await page.mouse.wheel(0, 1400);
  const offset = () =>
    list.evaluate((root) =>
      Math.max(
        root.scrollTop,
        ...Array.from(root.querySelectorAll("div")).map((el) => el.scrollTop),
      ),
    );
  await expect.poll(offset).toBeGreaterThan(800);
  for (const destination of ["Insights", "Overview", "Insights"] as const) {
    const before = await offset();
    await page.getByRole("tab", { name: destination, exact: true }).click();
    await activity(page);
    await expect.poll(offset).toBeGreaterThan(before - 60);
    await expect.poll(offset).toBeLessThan(before + 60);
    // Continue through the journal before leaving again, so each return must
    // preserve the latest position rather than one initial snapshot.
    await list.hover();
    await page.mouse.wheel(0, 300);
    await expect.poll(offset).toBeGreaterThan(before + 200);
  }
  await expect(page.getByTestId("activity-count")).toHaveText(
    "200 TRANSACTIONS",
  );
  await expect(page.getByTestId("activity-total")).toHaveText("₹20,000");
});
