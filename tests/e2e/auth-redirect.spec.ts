import { test, expect } from "@playwright/test";

test.describe("Authentication redirects", () => {
    test("unauthenticated user visiting /calendar is redirected to /login", async ({ page }) => {
        // Calendar requires auth — should redirect to login
        await page.goto("/calendar", { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(/\/login/);
    });

    test("login page preserves ?next= parameter", async ({ page }) => {
        await page.goto("/calendar", { waitUntil: "domcontentloaded" });
        // After redirect, URL should contain next=/calendar
        await expect(page).toHaveURL(/next=.*calendar/);
    });

    test("public home page is accessible without auth", async ({ page }) => {
        const response = await page.goto("/", { waitUntil: "domcontentloaded" });
        // Should not redirect to login — status 200 OK
        expect(response?.status()).toBeLessThan(400);
        await expect(page).not.toHaveURL(/\/login/);
    });

    test("legal pages are accessible without auth", async ({ page }) => {
        const legalPages = ["/legal/terms", "/legal/privacy", "/legal/commercial"];
        for (const path of legalPages) {
            const response = await page.goto(path, { waitUntil: "domcontentloaded" });
            expect(response?.status()).toBeLessThan(400);
            await expect(page).not.toHaveURL(/\/login/);
        }
    });

    test("login page renders form elements", async ({ page }) => {
        await page.goto("/login", { waitUntil: "domcontentloaded" });
        // Should show email and password fields
        await expect(page.locator("text=メールアドレス")).toBeVisible();
        await expect(page.locator("text=パスワード")).toBeVisible();
        await expect(page.getByRole("button", { name: /ログイン/ })).toBeVisible();
    });
});
