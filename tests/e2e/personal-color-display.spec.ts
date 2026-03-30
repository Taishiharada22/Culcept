import { test, expect } from "@playwright/test";

test.describe("Personal color / body color page", () => {
    test("body-color avatar page loads without errors", async ({ page }) => {
        const response = await page.goto("/body-color/avatar", { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBeLessThan(500);
    });

    test("body-color avatar page renders content or redirects to login", async ({ page }) => {
        await page.goto("/body-color/avatar", { waitUntil: "domcontentloaded" });

        // Either shows content or redirected to login
        const isOnPage = !page.url().includes("/login");
        if (isOnPage) {
            // Should have some visible content related to personal color
            const content = page.locator("text=/パーソナルカラー|骨格|body|color|診断/i");
            const contentCount = await content.count();
            expect(contentCount).toBeGreaterThan(0);
        }
    });

    test("body-color avatar page responds", async ({ page }) => {
        const response = await page.goto("/body-color/avatar", { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBeLessThan(500);
    });
});
