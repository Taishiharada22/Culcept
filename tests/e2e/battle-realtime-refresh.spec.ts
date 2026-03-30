import { expect, test } from "@playwright/test";
import { createBattleFixture, readTotalVotes } from "./battle-helpers";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

test("viewer detail auto-refreshes after another user votes", async ({ browser, request }) => {
    const fixture = await createBattleFixture(request, "voting", "battle-realtime");
    const viewerContext = await browser.newContext({ baseURL });
    const viewerPage = await viewerContext.newPage();
    const voterContext = await browser.newContext({ baseURL });

    await viewerPage.goto(fixture.battlePath, { waitUntil: "domcontentloaded" });
    const voterLoginResponse = await voterContext.request.get(
        `/api/test/login?email=${encodeURIComponent(fixture.users.spectator.email)}&password=${encodeURIComponent(fixture.users.spectator.password)}&next=${encodeURIComponent(fixture.battlePath)}`,
        {
            failOnStatusCode: false,
            maxRedirects: 0,
        }
    );
    expect(voterLoginResponse.ok() || [302, 303, 307].includes(voterLoginResponse.status())).toBeTruthy();
    await expect(viewerPage.getByTestId("battle-detail-page")).toBeVisible();
    try {
        await expect(viewerPage.getByTestId("battle-total-votes")).toBeVisible({ timeout: 30_000 });
    } catch {
        await viewerPage.reload({ waitUntil: "domcontentloaded" });
        await expect(viewerPage.getByTestId("battle-total-votes")).toBeVisible({ timeout: 60_000 });
    }

    const beforeVotes = await readTotalVotes(viewerPage);
    const voteResponse = await voterContext.request.post(`/api/battle/${fixture.contestId}/vote`, {
        data: {
            entryId: fixture.entries.ownerEntryId,
        },
        failOnStatusCode: false,
    });
    expect(voteResponse.ok()).toBeTruthy();

    await expect(viewerPage.getByTestId("battle-total-votes")).toContainText(String(beforeVotes + 1), {
        timeout: 20_000,
    });

    await viewerContext.close();
    await voterContext.close();
});
