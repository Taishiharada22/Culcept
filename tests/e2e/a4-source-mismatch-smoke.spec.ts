/**
 * SR A4 visual smoke V-2 — dev-a4-smoke route の Playwright 検証 spec
 *
 * 目的: node 環境で静的再現できない A4-3 の positive runtime（warning 表示 / cell amber / 保存 CTA dormant）を
 *   実ブラウザで確認する。合成 fixture（DevA4SmokeClient）で source mismatch を発火させる。**VLM/保存/DB 非接触**。
 *
 * 実行（V-3・別 GO）:
 *   route は flag 前提（無しなら notFound=404）。dev server に flag を継承させて実行する:
 *     PLAN_SHIFT_A4_VISUAL_SMOKE_PREVIEW=true npx playwright test tests/e2e/a4-source-mismatch-smoke.spec.ts
 *   （Playwright webServer = `npm run dev` は親 process env を継承するため、この 1 行で flag が dev に渡る）
 *
 * draw==read: 合成画像の色ブロックは `a4SmokeContentRegion()`（= hook が day3 を読む region）に一致させてあるので、
 *   実機で canvas readout（debounce 250ms + async）が走れば day3 に P1 が発火する。
 */
import { test, expect } from "@playwright/test";

test.describe("A4 source-mismatch visual smoke (dev-a4-smoke)", () => {
  // flag なしでは /plan/dev-a4-smoke が notFound(404) になるため、通常の e2e 実行を壊さないよう
  // **明示 skip guard**: flag なし = skip / flag あり = 実行。
  test.skip(
    process.env.PLAN_SHIFT_A4_VISUAL_SMOKE_PREVIEW !== "true",
    "A4 visual smoke requires PLAN_SHIFT_A4_VISUAL_SMOKE_PREVIEW=true"
  );

  test("空欄セル(day3)に原稿 content → warning + cell amber、保存 CTA は dormant", async ({ page }) => {
    const res = await page.goto("/plan/dev-a4-smoke", { waitUntil: "domcontentloaded" });
    // flag 前提: route 到達（notFound でない）。404 なら flag 未設定。
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByTestId("a4-smoke-preview")).toBeVisible();

    // canvas readout（image load + draw + getImageData + debounce 250ms）→ warning 出現を条件待ち
    const warning = page.getByTestId("shift-review-source-mismatch-warning");
    await expect(warning).toBeVisible({ timeout: 15_000 });

    // ① warning 文言が safe-copy
    await expect(warning).toContainText("原稿セルに記載がある可能性があります");
    // ② 対象 day（3）が data-source-mismatch-days に出る
    await expect(warning).toHaveAttribute("data-source-mismatch-days", /(^|,)3(,|$)/);

    // ③ 該当セル(day3)が要確認（data-source-mismatch="true"）
    const cell3 = page.getByTestId("shift-review-cell-3");
    await expect(cell3).toHaveAttribute("data-source-mismatch", "true");
    // 非対象セル(day1)は false（過剰着色しない）
    await expect(page.getByTestId("shift-review-cell-1")).toHaveAttribute(
      "data-source-mismatch",
      "false"
    );

    // ④ 保存 CTA は dormant（saveEnabled=false → hard block でなく、そもそも保存導線が出ない）
    await expect(page.getByText("反映（次段で有効化）")).toBeVisible();
    await expect(page.getByText("この内容で保存")).toHaveCount(0);
  });

  // ⑤ fail-open variant（設計のみ・実装は V-2.1 別 GO）:
  //   imageSrc を壊れた Blob / cross-origin に差し替える `?broken=1` を DevA4SmokeClient に足し、
  //   その状態で warning が出ない（fail-open）・console error が出ないことを確認する。
  //   現 fixture は常に成功するため、本 variant は client の broken-mode 追加（V-2.1）後に有効化する。
  test.skip("fail-open: 壊れた画像 → warning なし（V-2.1 で broken-mode 追加後に有効化）", async () => {
    // placeholder（V-2.1 client broken-mode 後）:
    // await page.goto("/plan/dev-a4-smoke?broken=1");
    // await expect(page.getByTestId("shift-review-source-mismatch-warning")).toHaveCount(0);
  });
});
