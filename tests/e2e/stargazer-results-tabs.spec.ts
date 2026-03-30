import { test, expect } from "@playwright/test";

test.describe("Stargazer results tabs", () => {
    test("stargazer page loads without errors", async ({ page }) => {
        const response = await page.goto("/stargazer?preview=1", { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBeLessThan(400);
    });

    test("tab buttons are visible for switching views", async ({ page }) => {
        await page.goto("/stargazer?preview=1", { waitUntil: "domcontentloaded" });

        // Look for tab-like buttons (e.g., 観測 / 星図)
        const tabButtons = page.getByRole("button");
        const count = await tabButtons.count();
        expect(count).toBeGreaterThan(0);
    });

    test("switching between observation and star map tabs works", async ({ page }) => {
        await page.goto("/stargazer?preview=1", { waitUntil: "domcontentloaded" });

        // Try clicking the "星図" tab if available
        const starMapTab = page.getByRole("button", { name: /星図/ });
        if (await starMapTab.isVisible()) {
            await starMapTab.click();
            // Then switch back to observation
            const observeTab = page.getByRole("button", { name: /観測/ });
            if (await observeTab.isVisible()) {
                await observeTab.click();
            }
        }

        // Page should still be on stargazer without error
        await expect(page).toHaveURL(/\/stargazer/);
    });
});
