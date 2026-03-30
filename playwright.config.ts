import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: false,
    retries: 2,
    timeout: 120_000,
    expect: {
        timeout: 30_000,
    },
    reporter: [["list"], ["html", { open: "never" }]],
    globalSetup: "./tests/e2e/global.setup.ts",
    use: {
        baseURL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    webServer: {
        command: "npm run dev -- --port 3000",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
    },
});
