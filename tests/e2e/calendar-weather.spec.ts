import { test, expect } from "@playwright/test";

test.describe("Calendar and weather", () => {
    test("calendar page redirects to login with next parameter", async ({ page }) => {
        await page.goto("/calendar", { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(/\/login.*next=.*calendar/);
    });

    test("calendar page responds without 500 error", async ({ page }) => {
        const response = await page.goto("/calendar", { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBeLessThan(500);
    });

    test("calendar API endpoint responds", async ({ request }) => {
        const response = await request.get("/api/calendar/day", {
            failOnStatusCode: false,
        });
        // May return 401 for unauthenticated, but should not 500
        expect(response.status()).toBeLessThan(500);
    });

    test("weather API endpoint responds", async ({ request }) => {
        const response = await request.get("/api/calendar/weather", {
            failOnStatusCode: false,
        });
        expect(response.status()).toBeLessThan(500);
    });
});
