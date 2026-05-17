/**
 * CoAlter AOO Phase B B-5b — SleepUIToggle structural test
 *
 * 正本: components/coalter/mirror/SleepUIToggle.tsx
 *
 * vitest 環境は node (jsdom なし) のため、render 系 test は行わない。
 * 代わりにソースコード文字列を静的検査し、UI invariant を保証。
 *
 * 別途、sleepStore 経由の sleep state 更新は sleepStore.test.ts (B-5a) で検証済み。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_PATH = resolve(
  __dirname,
  "../../../../components/coalter/mirror/SleepUIToggle.tsx",
);
const SOURCE = readFileSync(SOURCE_PATH, "utf-8");

describe("B-5b SleepUIToggle — UI structural invariant (静的)", () => {
  it("source 読み込み", () => {
    expect(SOURCE.length).toBeGreaterThan(0);
  });

  it("input / form / textarea / select 一切なし (raw text input 禁止)", () => {
    expect(SOURCE).not.toMatch(/<input\b/);
    expect(SOURCE).not.toMatch(/<form\b/);
    expect(SOURCE).not.toMatch(/<textarea\b/);
    expect(SOURCE).not.toMatch(/<select\b/);
  });

  it("button は 1 個のみ (toggle)", () => {
    const buttonMatches = SOURCE.match(/<button\b/g);
    expect(buttonMatches).not.toBeNull();
    expect(buttonMatches!.length).toBe(1);
  });

  it("data-testid='mirror-sleep-toggle' を含む", () => {
    expect(SOURCE).toMatch(/data-testid=["']mirror-sleep-toggle["']/);
  });

  it("data-sleep-on 属性を含む (current state expose)", () => {
    expect(SOURCE).toMatch(/data-sleep-on=/);
  });

  it("aria-pressed を含む (a11y)", () => {
    expect(SOURCE).toMatch(/aria-pressed=/);
  });

  it("fetch / LLM / 外部 API なし", () => {
    expect(SOURCE).not.toMatch(/\bfetch\(/);
    expect(SOURCE).not.toMatch(/XMLHttpRequest/);
    expect(SOURCE).not.toMatch(/axios/);
    expect(SOURCE).not.toMatch(/openai/i);
    expect(SOURCE).not.toMatch(/anthropic/i);
    expect(SOURCE).not.toMatch(/supabase/i);
  });

  it("setTimeout / setInterval / useState / useEffect なし", () => {
    expect(SOURCE).not.toMatch(/setTimeout\(/);
    expect(SOURCE).not.toMatch(/setInterval\(/);
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
    expect(SOURCE).not.toMatch(/console\.(log|info|warn|error|debug)/);
  });
});
