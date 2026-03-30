import { test, expect } from "@playwright/test";

test.describe("API health checks", () => {
    test("recommendations API responds without 500", async ({ request }) => {
        const response = await request.get("/api/recommendations", {
            failOnStatusCode: false,
        });
        expect(response.status()).toBeLessThan(500);
    });

    test("stargazer observations API responds without 500", async ({ request }) => {
        const response = await request.get("/api/stargazer/observations", {
            failOnStatusCode: false,
        });
        expect(response.status()).toBeLessThan(500);
    });

    test("calendar day API responds without 500", async ({ request }) => {
        const response = await request.get("/api/calendar/day", {
            failOnStatusCode: false,
        });
        expect(response.status()).toBeLessThan(500);
    });

    test("battle list API responds without 500", async ({ request }) => {
        const response = await request.get("/api/battle/list", {
            failOnStatusCode: false,
        });
        expect(response.status()).toBeLessThan(500);
    });

    test("stargazer profile API responds without 500", async ({ request }) => {
        const response = await request.get("/api/stargazer/profile", {
            failOnStatusCode: false,
        });
        expect(response.status()).toBeLessThan(500);
    });
});
