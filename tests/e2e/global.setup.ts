const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

async function waitFor(url: string, timeoutMs = 180_000) {
    const startedAt = Date.now();
    let lastError: unknown = null;

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(url, { redirect: "manual" });
            if (response.ok || response.status === 307 || response.status === 308) {
                return;
            }
            lastError = new Error(`Unexpected status ${response.status}`);
        } catch (error) {
            lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for ${url}`);
}

export default async function globalSetup() {
    await waitFor(`${baseURL}/`);
    await waitFor(`${baseURL}/battle`);
    const seedKey = `warmup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fixtureResponse = await fetch(`${baseURL}/api/battle/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            mode: "ended",
            e2e: true,
            seedKey,
        }),
    });
    if (!fixtureResponse.ok) {
        throw new Error(`Warmup fixture failed with ${fixtureResponse.status}`);
    }
    const fixture = await fixtureResponse.json() as {
        contestId: string;
        battlePath: string;
        users: { owner: { email: string; password: string } };
    };
    await waitFor(`${baseURL}/api/battle/${fixture.contestId}`);
    await waitFor(`${baseURL}/api/battle/${fixture.contestId}/reactions`);
    await waitFor(`${baseURL}/api/battle/notifications?contestId=${fixture.contestId}&limit=1`);
    await waitFor(
        `${baseURL}/api/test/login?email=${encodeURIComponent(fixture.users.owner.email)}&password=${encodeURIComponent(fixture.users.owner.password)}&next=${encodeURIComponent(fixture.battlePath)}`
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
}
