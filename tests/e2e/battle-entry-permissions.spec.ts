import { expect, test } from "@playwright/test";
import { createBattleFixture, gotoBattleDetailLoaded, loginAs, pageJsonRequest } from "./battle-helpers";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

test("entry owner can edit and withdraw during open_for_entry", async ({ browser, request }) => {
    const fixture = await createBattleFixture(request, "open_for_entry", "entry-owner");
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();

    await loginAs(page, fixture.users.owner.email, fixture.users.owner.password, fixture.battlePath);
    await gotoBattleDetailLoaded(page, fixture.battlePath);
    await expect(page.getByRole("link", { name: "編集" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "取り下げ" }).first()).toBeVisible();

    await context.close();
});

test("spectator cannot edit or withdraw another user's entry", async ({ browser, request }) => {
    const fixture = await createBattleFixture(request, "open_for_entry", "entry-spectator");
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();

    await loginAs(page, fixture.users.spectator.email, fixture.users.spectator.password, fixture.battlePath);
    await expect(page.getByRole("link", { name: "編集" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "取り下げ" })).toHaveCount(0);

    const patchResponse = await pageJsonRequest(page, `/api/battle/entries/${fixture.entries.ownerEntryId}`, {
        method: "PATCH",
        body: {
            comment: "spectator overwrite",
        },
    });
    expect(patchResponse.status).toBe(403);

    const deleteResponse = await pageJsonRequest(page, `/api/battle/entries/${fixture.entries.ownerEntryId}`, {
        method: "DELETE",
    });
    expect(deleteResponse.status).toBe(403);

    await context.close();
});

test("owner api is rejected after the contest is no longer open_for_entry", async ({ browser, request }) => {
    const fixture = await createBattleFixture(request, "ended", "entry-closed");
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();

    await loginAs(page, fixture.users.owner.email, fixture.users.owner.password, fixture.battlePath);

    const patchResponse = await pageJsonRequest(page, `/api/battle/entries/${fixture.entries.ownerEntryId}`, {
        method: "PATCH",
        body: {
            comment: "closed overwrite",
        },
    });
    expect(patchResponse.status).toBe(409);

    const deleteResponse = await pageJsonRequest(page, `/api/battle/entries/${fixture.entries.ownerEntryId}`, {
        method: "DELETE",
    });
    expect(deleteResponse.status).toBe(409);

    await context.close();
});
