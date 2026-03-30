import { expect, type APIRequestContext, type Page } from "@playwright/test";

type FixtureActor = {
    id: string;
    email: string;
    password: string;
    displayName: string;
    avatarUrl: string | null;
};

export type BattleFixture = {
    success: true;
    contestId: string;
    battlePath: string;
    resultPath: string;
    entries: {
        ownerEntryId: string;
        rivalEntryId: string;
        guestEntryId: string;
    };
    users: {
        owner: FixtureActor;
        rival: FixtureActor;
        guest: FixtureActor;
        spectator: FixtureActor;
    };
};

function uniqueSeed(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createBattleFixture(
    request: APIRequestContext,
    mode: "open_for_entry" | "voting" | "ended",
    prefix: string
) {
    let lastResponse: Awaited<ReturnType<APIRequestContext["post"]>> | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await request.post("/api/battle/setup", {
            data: {
                mode,
                e2e: true,
                seedKey: uniqueSeed(prefix),
            },
        });
        if (response.ok()) {
            return await response.json() as BattleFixture;
        }
        lastResponse = response;
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }

    expect(lastResponse?.ok()).toBeTruthy();
    return await lastResponse!.json() as BattleFixture;
}

export async function loginAs(page: Page, email: string, password: string, nextPath: string) {
    const response = await page.context().request.get(
        `/api/test/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&next=${encodeURIComponent(nextPath)}`,
        {
            failOnStatusCode: false,
            maxRedirects: 0,
        }
    );
    expect(response.ok() || [302, 303, 307].includes(response.status())).toBeTruthy();
    await page.goto(nextPath, {
        waitUntil: "domcontentloaded",
    });
}

export async function gotoBattleDetailLoaded(page: Page, battlePath: string) {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
        await page.goto(battlePath, { waitUntil: "domcontentloaded" });
        try {
            await page.getByTestId("battle-detail-page").waitFor({ state: "visible", timeout: 15_000 });
            await page.getByTestId("battle-total-votes").waitFor({ state: "visible", timeout: 20_000 });
            return;
        } catch (error) {
            lastError = error;
            await page.waitForTimeout(1000 * (attempt + 1));
        }
    }

    throw lastError ?? new Error("Failed to stabilize battle detail page");
}

export async function pageJsonRequest(
    page: Page,
    url: string,
    init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
    return await page.evaluate(
        async ({ inputUrl, inputInit }) => {
            const requestInit: RequestInit = {
                method: inputInit.method ?? "GET",
                headers: inputInit.headers ?? {},
            };
            if (typeof inputInit.body !== "undefined") {
                requestInit.body = JSON.stringify(inputInit.body);
                requestInit.headers = {
                    "Content-Type": "application/json",
                    ...(requestInit.headers ?? {}),
                };
            }

            const response = await fetch(inputUrl, requestInit);
            const text = await response.text();
            let body: unknown = null;
            try {
                body = text ? JSON.parse(text) : null;
            } catch {
                body = text;
            }
            return {
                ok: response.ok,
                status: response.status,
                body,
            };
        },
        {
            inputUrl: url,
            inputInit: init,
        }
    );
}

export async function readTotalVotes(page: Page) {
    const text = await page.getByTestId("battle-total-votes").innerText();
    const match = text.match(/(\d+)/);
    return Number(match?.[1] ?? 0);
}
