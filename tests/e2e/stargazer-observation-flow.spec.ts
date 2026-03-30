import { test, expect } from "@playwright/test";

test.describe("Stargazer observation flow", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/stargazer?preview=1", { waitUntil: "domcontentloaded" });
        // Clear previous state to start fresh
        await page.evaluate(() => {
            for (const key of Object.keys(window.localStorage)) {
                if (key.startsWith("culcept_sg_")) {
                    window.localStorage.removeItem(key);
                }
            }
        });
        await page.reload({ waitUntil: "domcontentloaded" });
    });

    test("observation question shows selectable options after starting", async ({ page }) => {
        // Start observation flow
        const startButton = page.locator("button").filter({ hasText: "今日の観測を始める" }).first();
        await startButton.click();

        // Answer context questions
        await page.getByRole("button", { name: /ふつう/ }).click();
        await page.getByRole("button", { name: /穏やか/ }).click();
        await page.getByRole("button", { name: /一人/ }).click();
        await page.getByRole("button", { name: "この状態で観測を始める →" }).click();

        // Observation question should now display with option buttons
        const optionButton = page.locator("button.w-full.text-left").first();
        await expect(optionButton).toBeVisible();
    });

    test("selecting an option enables the submit/confirm button", async ({ page }) => {
        const startButton = page.locator("button").filter({ hasText: "今日の観測を始める" }).first();
        await startButton.click();

        await page.getByRole("button", { name: /ふつう/ }).click();
        await page.getByRole("button", { name: /穏やか/ }).click();
        await page.getByRole("button", { name: /一人/ }).click();
        await page.getByRole("button", { name: "この状態で観測を始める →" }).click();

        // Click the first option
        const optionButton = page.locator("button.w-full.text-left").first();
        await optionButton.click({ force: true });

        // A confirm/submit button should be visible
        const confirmButton = page.getByRole("button", { name: "決定" });
        await expect(confirmButton).toBeVisible();
    });

    test("completing all questions shows completion marker", async ({ page }) => {
        const startButton = page.locator("button").filter({ hasText: "今日の観測を始める" }).first();
        await startButton.click();

        await page.getByRole("button", { name: /ふつう/ }).click();
        await page.getByRole("button", { name: /穏やか/ }).click();
        await page.getByRole("button", { name: /一人/ }).click();
        await page.getByRole("button", { name: "この状態で観測を始める →" }).click();

        // Answer up to 24 questions
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
    });
});
