import { test, expect, home, savedJournal } from "./fixtures";

test("optional model downloads explain size and privacy without pretending the browser can download", async ({
  page,
}) => {
  await home(page);
  const before = await savedJournal(page);
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  const models = page.getByTestId("optional-models");
  await expect(
    models.getByText("English voice · 57.0 MiB", { exact: true }),
  ).toBeVisible();
  await expect(
    models.getByText("Smart category suggestions · 22.0 MiB", { exact: true }),
  ).toBeVisible();
  await expect(
    models.getByText(
      /SMS import, merchant rules and manual review work without/,
    ),
  ).toBeVisible();
  await expect(
    models.getByText(/This browser preview does not download or run models/),
  ).toBeVisible();
  await expect(
    models.getByRole("button", { name: "Download English voice", exact: true }),
  ).toBeDisabled();
  await expect(
    models.getByRole("button", {
      name: "Download Smart category suggestions",
      exact: true,
    }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId("model-voice-status")).toHaveText(
    "Not downloaded",
  );
  expect(await savedJournal(page)).toEqual(before);
});
