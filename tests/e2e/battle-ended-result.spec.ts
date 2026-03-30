import { expect, test } from "@playwright/test";
import { createBattleFixture } from "./battle-helpers";

test("ended battle detail routes to finalized result page", async ({ page, request }) => {
    const fixture = await createBattleFixture(request, "ended", "ended-result");
    await page.goto(fixture.battlePath, { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("battle-detail-page")).toBeVisible();
    await expect(page.getByTestId("battle-total-votes")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("battle-result-ready")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: "結果を見る" })).toBeVisible({ timeout: 60_000 });

    const resultResponse = await request.get(`/api/battle/${fixture.contestId}/result`);
    expect(resultResponse.ok()).toBeTruthy();
    const resultData = await resultResponse.json();
    const winner = resultData.battle.entries.find((entry: { rank: number }) => entry.rank === 1);

    await page.getByRole("link", { name: "結果を見る" }).click();
    await expect(page).toHaveURL(new RegExp(`/battle/${fixture.contestId}/result$`));
    await expect(page.getByTestId("battle-result-page")).toBeVisible();
    await expect(page.getByTestId("battle-result-total-votes")).toContainText(String(resultData.battle.totalVotes));
    await expect(page.getByTestId("battle-result-winner")).toContainText(String(winner?.user?.name ?? ""));
    await expect(page.locator('[data-testid^="battle-result-entry-"]')).toHaveCount(resultData.battle.entries.length);
    await expect(page.getByRole("link", { name: "一覧へ戻る" })).toBeVisible();
});

test("voting battle does not show the finalized result CTA", async ({ page, request }) => {
    const fixture = await createBattleFixture(request, "voting", "voting-no-result");
    await page.goto(fixture.battlePath, { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("battle-detail-page")).toBeVisible();
    await expect(page.getByTestId("battle-total-votes")).toBeVisible();
    await expect(page.getByTestId("battle-result-ready")).toHaveCount(0);
});
