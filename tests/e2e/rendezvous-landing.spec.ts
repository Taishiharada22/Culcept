import { test, expect } from "@playwright/test";

test.describe("Rendezvous landing page", () => {
    test("rendezvous page redirects unauthenticated users to login", async ({ page }) => {
        await page.goto("/rendezvous", { waitUntil: "domcontentloaded" });
        // Rendezvous requires auth
        await expect(page).toHaveURL(/\/login/);
    });

    test("rendezvous page responds without 500 error", async ({ page }) => {
        const response = await page.goto("/rendezvous", { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBeLessThan(500);
    });

    test("rendezvous onboarding page also requires auth", async ({ page }) => {
        await page.goto("/rendezvous/onboarding", { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(/\/login/);
    });
});
