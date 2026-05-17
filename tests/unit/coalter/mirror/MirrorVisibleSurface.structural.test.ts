/**
 * CoAlter AOO Phase B B-5b — MirrorVisibleSurface structural test
 *
 * 正本: components/coalter/mirror/MirrorVisibleSurface.tsx
 *
 * vitest 環境は node (jsdom なし) のため、render 系 test は行わない。
 * 代わりに**ソースコード文字列を静的検査**し、UI structural invariant を保証:
 *   - Question / Proposal / Suggestion affordance がコードに**存在しない**
 *   - input / form / select / textarea 一切なし
 *   - aria-live="polite" + data-testid 存在
 *   - 控えめな retreat affordance (閉じる / 黙ってもらう) のみ
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_PATH = resolve(
  __dirname,
  "../../../../components/coalter/mirror/MirrorVisibleSurface.tsx",
);
const SOURCE = readFileSync(SOURCE_PATH, "utf-8");

describe("B-5b MirrorVisibleSurface — UI structural invariant (静的)", () => {
  it("source 読み込み", () => {
    expect(SOURCE.length).toBeGreaterThan(0);
  });

  it("input 要素なし (text 入力 affordance 禁止)", () => {
    expect(SOURCE).not.toMatch(/<input\b/);
  });

  it("form 要素なし (submit affordance 禁止)", () => {
    expect(SOURCE).not.toMatch(/<form\b/);
  });

  it("textarea 要素なし", () => {
    expect(SOURCE).not.toMatch(/<textarea\b/);
  });

  it("select 要素なし", () => {
    expect(SOURCE).not.toMatch(/<select\b/);
  });

  it("aria-live='polite' を含む", () => {
    expect(SOURCE).toMatch(/aria-live=["']polite["']/);
  });

  it("data-testid='mirror-visible-surface' を含む", () => {
    expect(SOURCE).toMatch(/data-testid=["']mirror-visible-surface["']/);
  });

  it("data-testid='mirror-visible-close' を含む (閉じる button)", () => {
    expect(SOURCE).toMatch(/data-testid=["']mirror-visible-close["']/);
  });

  it("data-testid='mirror-visible-sleep' を含む (sleep button)", () => {
    expect(SOURCE).toMatch(/data-testid=["']mirror-visible-sleep["']/);
  });

  it("Question / Proposal / Suggestion affordance label 含まない (Phase B 北極星)", () => {
    // "No-Effect Contract" 等の技術用語は許可するため、"No\b" 単体は check しない
    // 「Yes」も日本語 UI には現れない、念のため check
    expect(SOURCE).not.toMatch(/\bYes\b/);
    expect(SOURCE).not.toMatch(/同意/);
    expect(SOURCE).not.toMatch(/承諾/);
    expect(SOURCE).not.toMatch(/決定/);
    expect(SOURCE).not.toMatch(/次へ/);
    expect(SOURCE).not.toMatch(/送信/);
    // 「閉じる」「黙ってもらう」は許可
  });

  it("fetch / LLM / 外部 API call なし (logic 禁止)", () => {
    expect(SOURCE).not.toMatch(/\bfetch\(/);
    expect(SOURCE).not.toMatch(/XMLHttpRequest/);
    expect(SOURCE).not.toMatch(/axios/);
    expect(SOURCE).not.toMatch(/openai/i);
    expect(SOURCE).not.toMatch(/anthropic/i);
    expect(SOURCE).not.toMatch(/supabase/i);
  });

  it("setTimeout / setInterval / setState 直接呼び出しなし", () => {
    expect(SOURCE).not.toMatch(/setTimeout\(/);
    expect(SOURCE).not.toMatch(/setInterval\(/);
    // setState の React useState はあえて使わない (props のみ)
    expect(SOURCE).not.toMatch(/useState\(/);
    expect(SOURCE).not.toMatch(/useEffect\(/);
  });

  it("localStorage / sessionStorage / cookie / IndexedDB 一切なし", () => {
    expect(SOURCE).not.toMatch(/localStorage/);
    expect(SOURCE).not.toMatch(/sessionStorage/);
    expect(SOURCE).not.toMatch(/document\.cookie/);
    expect(SOURCE).not.toMatch(/indexedDB/i);
  });

  it("console output 一切なし", () => {
    // import statement や string literal の中ではなく、actual console call をチェック
    // (ここは粗い文字列 match で十分)
    expect(SOURCE).not.toMatch(/console\.(log|info|warn|error|debug)/);
  });
});
