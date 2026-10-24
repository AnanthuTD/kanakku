import { test, expect, home, activity, setSwitch } from "./fixtures";

test("getting started guide covers the core workflows and links into setup", async ({ page }) => {
  await home(page);
  await page.getByRole("button", { name: "Open getting started guide" }).click();
  await expect(page.getByText("Your journal, made simple")).toBeVisible();
  for (const topic of [
    "Bring in bank alerts",
    "Fill gaps with email alerts",
    "Add a bill or receipt",
    "Use voice and category suggestions",
    "Meet the floating helper",
    "Understand unclear payments",
    "Mark a self transfer",
    "Track money lent",
  ]) await expect(page.getByText(topic, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Set up bank alerts" }).first().click();
  await expect(page).toHaveURL(/settings\?section=bank/);
  await expect(page.getByTestId("settings-screen")).toBeVisible();
});

test("dark/light choice survives reload and system follows the browser theme", async ({
  page,
}) => {
  await home(page);
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: /Appearance/ }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Back to settings" }).click();
  await page.getByRole("button", { name: "Back to overview" }).click();
  await expect(
    page.getByRole("button", { name: "Switch to dark theme" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: /Appearance/ }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("button", { name: "System", exact: true }).click();
  await page.getByRole("button", { name: "Back to settings" }).click();
  await page.getByRole("button", { name: "Back to overview" }).click();
  await expect(
    page.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
});

test("settings opened directly can return to the overview after reload", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(
    page.getByTestId("settings-screen").getByText("Settings", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Back to overview" }).click();
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
});

test("settings menu opens a dedicated page and back returns to the menu", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(page.getByTestId("settings-menu")).toBeVisible();
  await page.getByRole("button", { name: /Appearance/ }).click();
  await expect(page.getByTestId("settings-menu")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Dark", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to settings" }).click();
  await expect(page.getByTestId("settings-menu")).toBeVisible();
});

test("Drive backup clearly explains encryption and stays unavailable in web preview", async ({
  page,
}) => {
  await page.goto("/settings?section=backup");
  const backup = page.getByTestId("drive-backup");
  await expect(backup).toBeInViewport();
  await expect(
    backup.getByText("Keep a recovery copy in Google Drive"),
  ).toBeVisible();
  await expect(
    backup.getByText(
      /journal is encrypted on this phone before it is saved to Drive/,
    ),
  ).toBeVisible();
  await backup.getByRole("button", { name: "What gets saved?" }).click();
  await expect(
    backup.getByText(/Google stores only the encrypted file/),
  ).toBeVisible();
  await expect(
    backup.getByRole("button", { name: /Back up to Google Drive/ }),
  ).toBeDisabled();
  await expect(
    backup.getByRole("button", { name: /Restore from Google Drive/ }),
  ).toBeDisabled();
});

test("shared sheets keep focused inputs accessible on a short screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("/");
  await activity(page);
  await page.getByRole("button", { name: "Open transaction filters" }).click();
  const startDate = page.getByRole("textbox", { name: "Start date" });
  await startDate.focus();
  // Simulate the smaller viewport available above an on-screen keyboard.
  await page.setViewportSize({ width: 390, height: 420 });
  await expect(startDate).toBeVisible();
  await expect(startDate).toBeInViewport();
});

test("custom categories can be created and survive reload", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /Categories & extra tools/ }).click();
  await page.getByRole("textbox", { name: "New category name" }).fill("Pets");
  const petIcon = page.getByRole("button", { name: "Pets category icon" });
  await petIcon.click();
  await expect(petIcon).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Pets", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Pets", { exact: true })).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kanakku-demo-v1") || "{}"),
  );
  expect(saved.metadata.categoryIcons.Pets).toBe("PawPrint");
  await page.goto("/");
  await activity(page);
  await page.getByRole("button", { name: "Open transaction filters" }).click();
  await expect(
    page
      .getByTestId("filters-sheet")
      .getByRole("button", { name: "Pets", exact: true }),
  ).toBeVisible();
});

test("quiet hours and reminder time validate, persist and can be disabled", async ({
  page,
}) => {
  await home(page);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: /Reminders & helper/ }).click();
  await setSwitch(
    page.getByRole("switch", { name: "Quiet hours", exact: true }),
    true,
  );
  await setSwitch(
    page.getByRole("switch", { name: "Daily review reminder", exact: true }),
    true,
  );
  await page.getByRole("textbox", { name: "Quiet hours start" }).fill("23:00");
  await page.getByRole("textbox", { name: "Quiet hours end" }).fill("23:00");
  await page.getByRole("button", { name: "Save review preferences" }).click();
  await expect(
    page
      .getByTestId("settings-screen")
      .getByText(/Quiet-hour start and end must differ/),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Quiet hours end" }).fill("07:00");
  await page
    .getByRole("textbox", { name: "Daily reminder time" })
    .fill("18:30");
  await page.getByRole("button", { name: "Save review preferences" }).click();
  await expect(
    page
      .getByTestId("settings-screen")
      .getByText(
        "Preview preferences saved. Notifications need the Android app.",
      ),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Quiet hours", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("textbox", { name: "Quiet hours start" }),
  ).toHaveValue("23:00");
  await expect(
    page.getByRole("textbox", { name: "Quiet hours end" }),
  ).toHaveValue("07:00");
  await expect(
    page.getByRole("textbox", { name: "Daily reminder time" }),
  ).toHaveValue("18:30");
  await setSwitch(
    page.getByRole("switch", { name: "Quiet hours", exact: true }),
    false,
  );
  await setSwitch(
    page.getByRole("switch", { name: "Daily review reminder", exact: true }),
    false,
  );
  await page.getByRole("button", { name: "Save review preferences" }).click();
  await expect(
    page
      .getByTestId("settings-screen")
      .getByText(
        "Preview preferences saved. Notifications need the Android app.",
      ),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Quiet hours", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("switch", { name: "Daily review reminder", exact: true }),
  ).not.toBeChecked();
});

test("SMS setup offers the chosen calendar window, recent-first processing, skip and cancel", async ({
  page,
}) => {
  await home(page);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: /Bank alerts & import/ }).click();
  await page
    .getByRole("button", { name: "Connect bank SMS", exact: true })
    .click();
  const group = page.getByRole("radiogroup", { name: "SMS history period" });
  await expect(group.getByRole("radio")).toHaveCount(7);
  await group.getByRole("radio", { name: "4 months", exact: true }).click();
  await expect(
    group.getByRole("radio", { name: "4 months", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByTestId("settings-screen").getByText(/14 Jun 2026.*14 Oct 2026/),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("settings-screen")
      .getByText(/The most recent 7 days appear first/),
  ).toBeVisible();
  await group.getByRole("radio", { name: "Skip for now", exact: true }).click();
  await expect(
    page
      .getByTestId("settings-screen")
      .getByText(/Only new alerts will be captured/),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("settings-screen")
      .getByText(/The most recent 7 days appear first/),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(group).toHaveCount(0);
});

test("browser cannot pretend to connect SMS, enable an overlay or reset the device journal", async ({
  page,
}) => {
  await home(page);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: /Privacy & device/ }).click();
  await expect(
    page.getByRole("button", { name: "Reset device journal" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Back to settings" }).click();
  await page.getByRole("button", { name: /Bank alerts & import/ }).click();
  await page
    .getByRole("button", { name: "Connect bank SMS", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue with Android permissions" })
    .click();
  await expect(
    page.getByTestId("settings-screen").getByText(/This is the web preview/),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("settings-screen")
      .getByText("Connected on this device", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Back to settings" }).click();
  await page.getByRole("button", { name: /Reminders & helper/ }).click();
  await page.getByRole("switch", { name: "Enable floating avatar" }).click();
  await expect(
    page
      .getByTestId("settings-screen")
      .getByText("Floating over other apps requires the Android build."),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Enable floating avatar" }),
  ).not.toBeChecked();
});

test("floating prompt preview explains it needs the Android build", async ({
  page,
}) => {
  await page.goto("/settings?section=companion");
  await page.getByRole("button", { name: "Try the floating prompt" }).click();
  await expect(
    page.getByText("Floating over other apps requires the Android build."),
  ).toBeVisible();
});
