import { test, expect } from "@playwright/test";

test.describe("Home page sections and navigation", () => {
    test("home page loads with all 4 sections visible", async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" });

        // 4 main sections should exist
        await expect(page.locator('section[aria-label="今日のあなた"]')).toBeAttached();
        await expect(page.locator('section[aria-label="深層観測"]')).toBeAttached();
        await expect(page.locator('section[aria-label="つながり"]')).toBeAttached();
        await expect(page.locator('section[aria-label="もっと深める"]')).toBeAttached();
    });

    test("section nav buttons are visible and have correct labels", async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" });

        const sectionNav = page.locator('nav[aria-label="セクションナビゲーション"]');
        await expect(sectionNav).toBeVisible();

        // 4 section nav buttons
        await expect(sectionNav.getByRole("button", { name: /今日/ })).toBeVisible();
        await expect(sectionNav.getByRole("button", { name: /観測/ })).toBeVisible();
        await expect(sectionNav.getByRole("button", { name: /つながり/ })).toBeVisible();
        await expect(sectionNav.getByRole("button", { name: /深める/ })).toBeVisible();
    });

    test("clicking section nav scrolls page to corresponding section", async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" });

        const sectionNav = page.locator('nav[aria-label="セクションナビゲーション"]');

        // Click "観測" nav button and verify the deep observation section scrolls into view
        await sectionNav.getByRole("button", { name: /観測/ }).click();
        await expect(page.locator("#section-star")).toBeInViewport({ timeout: 5000 });

        // Click "つながり" nav button
        await sectionNav.getByRole("button", { name: /つながり/ }).click();
        await expect(page.locator("#section-connect")).toBeInViewport({ timeout: 5000 });
    });
});
