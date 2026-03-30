import { test, expect } from "@playwright/test";

test.describe("Presence profile page", () => {
    test("presence page loads without errors", async ({ page }) => {
        // Presence page with demo mode
        const response = await page.goto("/sns/profile?demo=1", { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBeLessThan(500);
    });

    test("presence page shows tab navigation", async ({ page }) => {
        await page.goto("/sns/profile?demo=1", { waitUntil: "domcontentloaded" });

        // Should have tab buttons for different views
        const buttons = page.getByRole("button");
        const buttonCount = await buttons.count();
        expect(buttonCount).toBeGreaterThan(0);
    });

    test("presence page renders without console errors", async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => {
            errors.push(error.message);
        });

        await page.goto("/sns/profile?demo=1", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        const criticalErrors = errors.filter(
            (e) => !e.includes("ResizeObserver") && !e.includes("NetworkError") && !e.includes("AbortError")
        );
        expect(criticalErrors).toHaveLength(0);
    });
});
