import { expect, test } from "@playwright/test";

test("daily observation stays completed after switching tabs on the same day", async ({
  page,
}) => {
  await page.goto("/stargazer?preview=1");
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("culcept_sg_")) {
        window.localStorage.removeItem(key);
      }
    }
  });
  await page.reload();

  const startButton = page.locator("button").filter({ hasText: "今日の観測を始める" }).first();
  await expect(startButton).toBeVisible();
  await startButton.click();

  await page.getByRole("button", { name: /ふつう/ }).click();
  await page.getByRole("button", { name: /穏やか/ }).click();
  await page.getByRole("button", { name: /一人/ }).click();
  await page.getByRole("button", { name: "この状態で観測を始める →" }).click();

  for (let i = 0; i < 24; i += 1) {
    if (await page.getByText("✓ TODAY OBSERVED").isVisible()) {
      break;
    }

    const optionButton = page.locator("button.w-full.text-left").first();
    await expect(optionButton).toBeVisible();
    await optionButton.click({ force: true });
    await page.getByRole("button", { name: "決定" }).click({ force: true });
  }

  await expect(page.getByText("✓ TODAY OBSERVED")).toBeVisible();
  await expect(page.getByText("次の開始は明日です。")).toBeVisible();

  await page.getByRole("button", { name: /星図/ }).click();
  await page.getByRole("button", { name: /観測/ }).click();
  await expect(page.getByText("✓ TODAY OBSERVED")).toBeVisible();
  await expect(page.locator("button").filter({ hasText: "今日の観測を始める" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("✓ TODAY OBSERVED")).toBeVisible();
  await expect(page.locator("button").filter({ hasText: "今日の観測を始める" })).toHaveCount(0);
});
