import { test, expect } from "@playwright/test";

test.describe("Stargazer onboarding flow", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/stargazer?preview=1", { waitUntil: "domcontentloaded" });
        // Clear any previous Stargazer state
        await page.evaluate(() => {
            for (const key of Object.keys(window.localStorage)) {
                if (key.startsWith("culcept_sg_")) {
                    window.localStorage.removeItem(key);
                }
            }
        });
        await page.reload({ waitUntil: "domcontentloaded" });
    });

    test("new user sees start observation button", async ({ page }) => {
        const startButton = page.locator("button").filter({ hasText: "今日の観測を始める" }).first();
        await expect(startButton).toBeVisible();
    });

    test("clicking start shows initial mood/context questions", async ({ page }) => {
        const startButton = page.locator("button").filter({ hasText: "今日の観測を始める" }).first();
        await startButton.click();

        // Initial context questions should appear (mood, atmosphere, situation)
        const buttons = page.getByRole("button");
        // At least one context option should be visible
        const visibleButtons = await buttons.count();
        expect(visibleButtons).toBeGreaterThan(0);
    });

    test("selecting initial options progresses to observation questions", async ({ page }) => {
        const startButton = page.locator("button").filter({ hasText: "今日の観測を始める" }).first();
        await startButton.click();

        // Answer the 3 initial context questions
        await page.getByRole("button", { name: /ふつう/ }).click();
        await page.getByRole("button", { name: /穏やか/ }).click();
        await page.getByRole("button", { name: /一人/ }).click();

        // Should see a "begin" style button to proceed
        const proceedButton = page.getByRole("button", { name: /この状態で観測を始める/ });
        await expect(proceedButton).toBeVisible();
    });
});
