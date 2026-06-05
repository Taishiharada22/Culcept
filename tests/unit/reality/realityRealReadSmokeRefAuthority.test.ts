import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";

/**
 * A1-5-ref-fix — reality-real-read-smoke.ts の production denylist 反転バグ回帰防止。
 *   ref authority（canonical）: aljavfujeqcwnqryjmhl=production / hjcrvndumgiovyfdacwc=culcept-staging。
 *   旧バグ: PROD_REF_DENYLIST=["hjcrvndumgiovyfdacwc"]（staging を本番扱い・実本番 aljav を素通し）。
 */
const PRODUCTION_REF = "aljavfujeqcwnqryjmhl";
const STAGING_REF = "hjcrvndumgiovyfdacwc";

const SRC = readFileSync(join(process.cwd(), "scripts/reality-real-read-smoke.ts"), "utf8");
// comment を除去した executable code（comment 内の ref 言及を誤検出しない）
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-ref-fix — canonical ref authority（devFixtureHost）", () => {
  it("aljavfujeqcwnqryjmhl は production", () => {
    expect(PRODUCTION_PROJECT_REF).toBe(PRODUCTION_REF);
  });
  it("hjcrvndumgiovyfdacwc は culcept-staging", () => {
    expect(STAGING_PROJECT_REF).toBe(STAGING_REF);
  });
  it("production と staging は別 ref", () => {
    expect(PRODUCTION_PROJECT_REF).not.toBe(STAGING_PROJECT_REF);
  });
});

describe("A1-5-ref-fix — reality-real-read-smoke.ts denylist 反転バグ修正", () => {
  it("canonical 定数を devFixtureHost から import している", () => {
    expect(CODE).toMatch(/import\s*\{[^}]*PRODUCTION_PROJECT_REF[^}]*\}\s*from\s*"@\/lib\/plan\/shift\/devFixtureHost"/);
    expect(CODE).toContain("STAGING_PROJECT_REF");
  });
  it("PROD_REF_DENYLIST は canonical PRODUCTION_PROJECT_REF を参照（aljav が denylist）", () => {
    expect(CODE).toMatch(/PROD_REF_DENYLIST\s*=\s*\[\s*PRODUCTION_PROJECT_REF\s*\]/);
  });
  it("staging expected ref は canonical STAGING_PROJECT_REF（hjcr が allowlist）", () => {
    expect(CODE).toMatch(/STAGING_REF_ALLOWLIST\s*=\s*\[\s*STAGING_PROJECT_REF\s*\]/);
  });
  it("executable code に ref を hard-code しない（再反転・drift 防止・canonical 単一ソース）", () => {
    // production / staging いずれの ref も executable code 上に literal で現れない（定数経由のみ）
    expect(CODE).not.toContain(`"${STAGING_REF}"`);
    expect(CODE).not.toContain(`"${PRODUCTION_REF}"`);
  });
  it("hjcr（staging）を production denylist 扱いする反転が無い", () => {
    // 旧バグ形 PROD_REF_DENYLIST=["hjcr..."] が executable code に存在しない
    expect(CODE).not.toMatch(/PROD_REF_DENYLIST\s*=\s*\[\s*"hjcrvndumgiovyfdacwc"\s*\]/);
  });
  it("staging allowlist による positive guard が存在する", () => {
    expect(CODE).toMatch(/!STAGING_REF_ALLOWLIST\.includes\(/);
  });
});
