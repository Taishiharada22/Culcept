/**
 * SR A4-3 — SourceMismatchWarning render contract
 *
 * banner（safe-copy・soft）の表示固定。warning UI のテスト可能単位として presentational 抽出。
 * ※ ShiftReviewGrid 内の発火は非同期 canvas hook 由来で、vitest=node 環境（renderToStaticMarkup・
 *   effect 非実行）では dormant。よって positive banner は本 component test で固定する。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  SourceMismatchWarning,
  SOURCE_MISMATCH_WARNING_COPY,
} from "@/app/(culcept)/plan/components/SourceMismatchWarning";

describe("SourceMismatchWarning render contract", () => {
  it("days あり → warning banner + testid + data-days（昇順 dedup）", () => {
    const html = renderToStaticMarkup(<SourceMismatchWarning days={[4, 2, 4]} />);
    expect(html).toContain('data-testid="shift-review-source-mismatch-warning"');
    expect(html).toContain('data-source-mismatch-days="2,4"');
  });

  it("warning 文言が safe-copy（確定文言を表示）", () => {
    const html = renderToStaticMarkup(<SourceMismatchWarning days={[3]} />);
    expect(html).toContain("原稿セルに記載がある可能性があります");
    expect(html).toContain("該当日を原稿と照合してください");
    expect(SOURCE_MISMATCH_WARNING_COPY).toBe(
      "原稿セルに記載がある可能性があります。該当日を原稿と照合してください。"
    );
  });

  it("safe-copy: 避ける語を含まない（誤/間違/失敗/エラー）", () => {
    const html = renderToStaticMarkup(<SourceMismatchWarning days={[1, 2]} />);
    expect(html).not.toMatch(/誤|間違|失敗|エラー/);
    expect(SOURCE_MISMATCH_WARNING_COPY).not.toMatch(/誤|間違|失敗|エラー/);
  });

  it("days 空 → 何も描画しない（dormant 時は表示なし）", () => {
    expect(renderToStaticMarkup(<SourceMismatchWarning days={[]} />)).toBe("");
  });

  it("raw 画像/base64 を含まない（structured な day 番号のみ）", () => {
    const html = renderToStaticMarkup(<SourceMismatchWarning days={[5]} />);
    expect(html).not.toMatch(/data:image|base64|blob:/i);
  });
});
