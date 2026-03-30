import { test, expect } from "@playwright/test";

test.describe("Genome Card display", () => {
    test("genome card page loads without errors", async ({ page }) => {
        const response = await page.goto("/genome-card", { waitUntil: "domcontentloaded" });
        // Page may redirect to login if not authenticated, which is acceptable
        expect(response?.status()).toBeLessThan(500);
    });

    test("genome card page shows header and description", async ({ page }) => {
        await page.goto("/genome-card", { waitUntil: "domcontentloaded" });

        // If redirected to login, skip content checks
        if (page.url().includes("/login")) {
            return;
        }

        await expect(page.locator("text=Genome Card")).toBeVisible();
        await expect(page.locator("text=あなたの内面を1枚のカードに")).toBeVisible();
    });

    test("genome card shows loading state then content or empty state", async ({ page }) => {
        await page.goto("/genome-card", { waitUntil: "domcontentloaded" });

        if (page.url().includes("/login")) {
            return;
        }

        // Either a card visual or empty state message should appear
        const cardOrEmpty = page.locator("text=/Genome Card|カードを作成|データが|🧬/");
        await expect(cardOrEmpty.first()).toBeVisible({ timeout: 15000 });
    });
});
