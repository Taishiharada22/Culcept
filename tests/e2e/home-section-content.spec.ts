import { test, expect } from "@playwright/test";

test.describe("Home page section content", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" });
    });

    test("today section shows TODAY'S YOU heading", async ({ page }) => {
        const todaySection = page.locator('section[aria-label="今日のあなた"]');
        await expect(todaySection).toBeAttached();
        await expect(todaySection.locator("text=TODAY'S YOU")).toBeVisible();
        await expect(todaySection.locator("text=今日のあなた")).toBeVisible();
    });

    test("deep observation section shows Stargazer content", async ({ page }) => {
        const starSection = page.locator('section[aria-label="深層観測"]');
        await expect(starSection).toBeAttached();
        // Section should contain observation-related content or Stargazer link
        const hasStargazerLink = await starSection.locator('a[href*="stargazer"]').count();
        const hasObservationContent = await starSection.locator("text=/観測|Stargazer|OBSERVATION/").count();
        expect(hasStargazerLink + hasObservationContent).toBeGreaterThan(0);
    });

    test("connections section renders", async ({ page }) => {
        const connectSection = page.locator('section[aria-label="つながり"]');
        await expect(connectSection).toBeAttached();
        await expect(connectSection.locator("text=つながり")).toBeVisible();
    });

    test("deepen section shows feature grid", async ({ page }) => {
        const deepenSection = page.locator('section[aria-label="もっと深める"]');
        await expect(deepenSection).toBeAttached();
        // Should contain links to various identity features
        const links = deepenSection.locator("a[href]");
        const count = await links.count();
        expect(count).toBeGreaterThan(0);
    });
});
