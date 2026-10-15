import { test, expect, home, savedJournal } from "./fixtures";

test("a quick companion drag snaps using the release position when move events are sparse", async ({
  page,
}) => {
  await home(page);
  const avatar = page.getByTestId("floating-avatar");
  const reviewButton = avatar.getByRole("button", {
    name: "Review 2 unclear payments",
    exact: true,
  });
  await expect(reviewButton).toBeVisible();
  const original = await avatar.boundingBox();
  const handle = await reviewButton.boundingBox();
  expect(original).not.toBeNull();
  expect(handle).not.toBeNull();
  await page.mouse.move(handle!.x + 30, handle!.y + 25);
  await page.mouse.down();
  // Sparse moves preserve the full drag even when the recognizer activates
  // after the pointer has already left the original card bounds.
  await page.mouse.move(handle!.x - 100, handle!.y - 160, { steps: 3 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("kanakku-avatar-position") ?? "null"),
      ),
    )
    .toMatchObject({ version: 2, edge: "left" });
  await expect
    .poll(async () => (await avatar.boundingBox())!.y)
    .toBeCloseTo(original!.y - 185, 0);
  expect((await avatar.boundingBox())!.x).toBeLessThan(original!.x);
  await expect(page.getByTestId("review-form")).toBeHidden();
});

test("dragging the companion does not open voice review and its snapped position survives reload", async ({
  page,
}) => {
  await home(page);
  const avatar = page.getByTestId("floating-avatar");
  const original = await avatar.boundingBox();
  expect(original).not.toBeNull();
  const reviewButton = avatar.getByRole("button", {
    name: "Review 2 unclear payments",
    exact: true,
  });
  const handle = await reviewButton.boundingBox();
  expect(handle).not.toBeNull();
  await page.mouse.move(handle!.x + 30, handle!.y + 25);
  await page.mouse.down();
  await page.mouse.move(handle!.x - 100, handle!.y - 160, { steps: 15 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("kanakku-avatar-position")),
    )
    .not.toBeNull();
  await expect(page.getByTestId("review-form")).toBeHidden();
  const moved = await avatar.boundingBox();
  expect(moved!.y).toBeLessThan(original!.y - 100);
  expect(moved!.x).toBeLessThan(original!.x);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kanakku-avatar-position")!),
  );
  expect(stored).toMatchObject({ version: 2, edge: "left" });
  expect(stored.fraction).toBeGreaterThan(0);
  await page.reload();
  await expect(avatar).toBeVisible();
  await expect
    .poll(async () => (await avatar.boundingBox())!.y)
    .toBeCloseTo(moved!.y, 0);
  expect((await avatar.boundingBox())!.x).toBeCloseTo(moved!.x, 0);
  // Reset is also exposed as a custom TalkBack action in the native build.
  const resetHandle = await reviewButton.boundingBox();
  await page.mouse.move(resetHandle!.x + 30, resetHandle!.y + 25);
  await page.mouse.down();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("kanakku-avatar-position")!),
      ),
    )
    .toMatchObject({ edge: "right", fraction: 0 });
  await page.mouse.up();
  await expect(page.getByTestId("review-form")).toBeHidden();
  await page.setViewportSize({ width: 320, height: 620 });
  await expect
    .poll(async () => (await avatar.boundingBox())!.x)
    .toBeGreaterThanOrEqual(0);
  const compact = await avatar.boundingBox();
  expect(compact!.x + compact!.width).toBeLessThanOrEqual(320);
  expect(compact!.y + compact!.height).toBeLessThan(620);
});

test("invalid remembered placement recovers on screen and dismissal does not edit the ledger", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "kanakku-avatar-position",
      '{"edge":"left","fraction":"broken"}',
    ),
  );
  await home(page);
  const avatar = page.getByTestId("floating-avatar");
  await expect(avatar).toBeVisible();
  const box = await avatar.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThan(viewport.height);
  const before = await page.evaluate(() =>
    localStorage.getItem("kanakku-demo-v1"),
  );
  await avatar
    .getByRole("button", { name: "Dismiss avatar", exact: true })
    .click();
  await expect(avatar).toBeHidden();
  await expect(page.getByTestId("review-form")).toBeHidden();
  expect(
    await page.evaluate(() => localStorage.getItem("kanakku-demo-v1")),
  ).toBe(before);
  await expect(page.getByTestId("overview-total")).toHaveText("₹1,650");
});

test("the companion photo action opens the selected payment camera without changing the ledger", async ({
  page,
}) => {
  await home(page);
  const before = await savedJournal(page);
  const photo = page
    .getByTestId("floating-avatar")
    .getByRole("button", { name: "Take bill photo", exact: true });
  const bounds = await photo.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(48);
  expect(bounds!.height).toBeGreaterThanOrEqual(48);
  await photo.click();
  await expect(page.getByText("Bill photos", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/This browser preview cannot read a real photo/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close camera", exact: true }).click();
  await expect(page.getByTestId("review-form")).toBeVisible();
  expect(await savedJournal(page)).toEqual(before);
});

test("dragging the photo action moves the companion without opening the camera", async ({
  page,
}) => {
  await home(page);
  const avatar = page.getByTestId("floating-avatar");
  const photo = await avatar
    .getByRole("button", { name: "Take bill photo", exact: true })
    .boundingBox();
  await page.mouse.move(photo!.x + 24, photo!.y + 24);
  await page.mouse.down();
  await page.mouse.move(photo!.x - 80, photo!.y - 120, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("kanakku-avatar-position")),
    )
    .not.toBeNull();
  await expect(page.getByText("Bill photos", { exact: true })).toBeHidden();
  await expect(page.getByTestId("review-form")).toBeHidden();
});

test("photo deep links wait for a real selected transaction and preview links cannot invent one", async ({
  page,
}) => {
  await page.goto("/?review=preview&photo=1");
  await expect(page.getByTestId("overview-total")).toBeVisible();
  await expect(
    page.getByText(
      "That was a preview. Open a payment to photograph its bill.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByTestId("review-form")).toBeHidden();
  await page.goto("/?review=rahul&photo=1&voice=1");
  await expect(page.getByText("Bill photos", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close camera", exact: true }).click();
  await expect(page.getByTestId("review-form")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Merchant name", exact: true }),
  ).toHaveValue("Rahul S");
});
