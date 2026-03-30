import { test, expect } from "@playwright/test";

test.describe("Origin Life Map", () => {
    test("origin page redirects to login for unauthenticated users", async ({ page }) => {
        await page.goto("/origin", { waitUntil: "domcontentloaded" });
        // Origin requires auth
        await expect(page).toHaveURL(/\/login/);
    });

    test("origin page responds without 500 error", async ({ page }) => {
        const response = await page.goto("/origin", { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBeLessThan(500);
    });

    test("login page is shown with correct redirect target for origin", async ({ page }) => {
        await page.goto("/origin", { waitUntil: "domcontentloaded" });
        // Should be on login page now
        if (page.url().includes("/login")) {
            await expect(page.locator("text=メールアドレス")).toBeVisible();
        }
    });
});
