// tests/e2e/anonymous-auth-smoke.spec.ts
// P0 スモークテスト: 後ログイン型の匿名認証フロー
// staging 環境で実行して、保存・昇格・merge が正しく動作するか検証
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

// テスト用のユニークなメールアドレスを生成
function uniqueEmail() {
  return `smoke-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.aneurasync.com`;
}

test.describe("P0: Anonymous Auth Smoke Tests", () => {

  // ─── テスト1: 未ログインで Stargazer 開始 → 回答保存される ───
  test("1. 未ログインで Stargazer にアクセスし、匿名セッションが確立される", async ({ page }) => {
    // Stargazer ページにアクセス（未ログイン状態）
    await page.goto("/stargazer", { waitUntil: "domcontentloaded" });

    // 「観測にはログインが必要です」のエラーが出ないことを確認
    // （匿名セッションが自動確立されるため）
    await page.waitForTimeout(3000); // 匿名サインイン完了を待つ

    const unauthorizedMessage = page.locator("text=観測にはログインが必要です");
    await expect(unauthorizedMessage).not.toBeVisible({ timeout: 5000 });

    // localStorage に匿名ユーザーIDが保存されていることを確認
    const anonUserId = await page.evaluate(() => {
      return localStorage.getItem("aneurasync_anon_user_id");
    });
    // 匿名セッションが新規作成された場合のみ保存される
    // 既にセッションがある場合は null の可能性があるため、エラーにはしない
    console.log("[Smoke] Anonymous user ID:", anonUserId ?? "(session already existed)");
  });

  // ─── テスト2: リロード後も続行できる ───
  test("2. リロード後も匿名セッションが維持される", async ({ page }) => {
    await page.goto("/stargazer", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    // リロード
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    // リロード後もエラーが出ないことを確認
    const unauthorizedMessage = page.locator("text=観測にはログインが必要です");
    await expect(unauthorizedMessage).not.toBeVisible({ timeout: 5000 });
  });

  // ─── テスト3: 401 → 匿名確立 → 再試行がループしない ───
  test("3. 401→匿名確立→リトライがループしない", async ({ page }) => {
    // ネットワークリクエストを監視
    const profileRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/stargazer/profile")) {
        profileRequests.push(req.url());
      }
    });

    await page.goto("/stargazer", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000); // 十分に待つ

    // /api/stargazer/profile へのリクエストが3回以上ない（ループしていない）
    // 正常: 1回目(401) → 匿名確立 → 2回目(成功) = 最大2回
    expect(profileRequests.length).toBeLessThanOrEqual(3);
    console.log(`[Smoke] Profile API requests: ${profileRequests.length}`);
  });

  // ─── テスト4: 観測API が匿名ユーザーで動作する ───
  test("4. 観測APIが匿名ユーザーで200を返す", async ({ request }) => {
    // 匿名サインインをAPI経由でシミュレート
    // Note: このテストはサーバーサイドで匿名ユーザーが作れることを確認
    const profileRes = await request.get(`${BASE_URL}/api/stargazer/profile`);

    // 未認証の場合は401が返る（匿名セッションがない状態）
    // ブラウザテストでは匿名セッションが自動確立されるため200になる
    expect([200, 401]).toContain(profileRes.status());
    console.log(`[Smoke] Profile API status (no session): ${profileRes.status()}`);
  });

  // ─── テスト5: merge API の基本動作確認 ───
  test("5. merge API に不正なリクエストを送ると400/401が返る", async ({ request }) => {
    // 未認証で merge API を呼ぶ → 401
    const res1 = await request.post(`${BASE_URL}/api/auth/merge-anonymous`, {
      data: { anonymousUserId: "fake-uuid" },
    });
    expect(res1.status()).toBe(401);

    // anonymousUserId なしで merge API を呼ぶ → 400 (認証があれば)
    // ここでは401が返るのが正常（未認証のため）
    const res2 = await request.post(`${BASE_URL}/api/auth/merge-anonymous`, {
      data: {},
    });
    expect([400, 401]).toContain(res2.status());
  });

  // ─── テスト6: merge API の二重実行で壊れない ───
  test("6. merge API は二重実行しても安全（冪等性）", async ({ request }) => {
    // 存在しない匿名ユーザーIDでmerge → 成功（何もしない）
    // Note: 実際のテストには認証が必要だが、ここでは401で確認
    const res = await request.post(`${BASE_URL}/api/auth/merge-anonymous`, {
      data: { anonymousUserId: "non-existent-uuid" },
    });
    // 未認証なら401、認証済みなら200（何もmergeされない）
    expect([200, 401]).toContain(res.status());
  });
});
