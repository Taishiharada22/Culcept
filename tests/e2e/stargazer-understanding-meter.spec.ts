import { test, expect } from "@playwright/test";

test.describe("Stargazer understanding meter", () => {
    test("stargazer page displays observation-related indicators", async ({ page }) => {
        await page.goto("/stargazer?preview=1", { waitUntil: "domcontentloaded" });

        // The page should contain some kind of progress/meter element
        // This could be percentage text, phase label, or observation count
        const hasProgress = await page.locator("text=/%|回|PHASE|LEVEL|レベル|phase/i").count();
        const hasObservationUI = await page.locator("text=/観測|observation/i").count();
        // At minimum, the page should have observation-related UI
        expect(hasProgress + hasObservationUI).toBeGreaterThan(0);
    });

    test("page renders without JavaScript errors", async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => {
            errors.push(error.message);
        });

        await page.goto("/stargazer?preview=1", { waitUntil: "domcontentloaded" });
        // Wait a moment for client-side rendering
        await page.waitForTimeout(2000);

        // Filter out non-critical errors (e.g., network failures for external resources)
        const criticalErrors = errors.filter(
            (e) => !e.includes("ResizeObserver") && !e.includes("NetworkError")
        );
        expect(criticalErrors).toHaveLength(0);
    });
});
