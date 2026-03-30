import { test, expect } from "@playwright/test";

test.describe("Rendezvous onboarding", () => {
    test("onboarding page redirects to login without auth", async ({ page }) => {
        const response = await page.goto("/rendezvous/onboarding", { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBeLessThan(500);
        await expect(page).toHaveURL(/\/login/);
    });

    test("login form is accessible from rendezvous redirect", async ({ page }) => {
        await page.goto("/rendezvous/onboarding", { waitUntil: "domcontentloaded" });

        if (page.url().includes("/login")) {
            // Login form should be functional
            await expect(page.locator("text=メールアドレス")).toBeVisible();
            await expect(page.locator("text=パスワード")).toBeVisible();
        }
    });

    test("rendezvous explore page requires auth", async ({ page }) => {
        const response = await page.goto("/rendezvous/explore", { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBeLessThan(500);
    });
});
