import { test, expect } from "@playwright/test";

test.describe("My Style / wardrobe page", () => {
    test("my-style page loads without errors", async ({ page }) => {
        const response = await page.goto("/my-style", { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBeLessThan(500);
    });

    test("my-style page renders client components", async ({ page }) => {
        await page.goto("/my-style", { waitUntil: "domcontentloaded" });

        // If not redirected to login, check for tab/content structure
        if (!page.url().includes("/login")) {
            // Wait for client-side rendering
            await page.waitForTimeout(2000);
            // Should have some interactive elements (tabs, buttons, etc.)
            const interactiveElements = page.locator("button, a[href]");
            const count = await interactiveElements.count();
            expect(count).toBeGreaterThan(0);
        }
    });

    test("my-style page does not produce console errors", async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => {
            errors.push(error.message);
        });

        await page.goto("/my-style", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        const criticalErrors = errors.filter(
            (e) =>
                !e.includes("ResizeObserver") &&
                !e.includes("NetworkError") &&
                !e.includes("AbortError") &&
                !e.includes("hydration")
        );
        expect(criticalErrors).toHaveLength(0);
    });
});
