/**
 * CoAlter AOO Phase D-2 — vercel.json ignoreCommand canary trigger logic test
 *
 * 正本: vercel.json ignoreCommand
 *
 * 目的:
 *   vercel.json の `ignoreCommand` は bash 文字列だが、本 test では同等 logic を
 *   pure TypeScript function で再現し、CEO 補正の 6 scenario すべてを invariant
 *   として永続検証する。
 *
 * 採用 logic (CEO 補正 2026-05-19、Phase D-2):
 *   - `.md` only → IBS skip (exit 0)
 *   - `.canary-trigger.json` 含む (single or multi) → IBS skipせず build 実行 (exit 1)
 *   - runtime code (`.ts/.tsx/.json/etc`) 含む → IBS skipせず build 実行 (exit 1)
 *   - 空 (no changes) → IBS skip (exit 0、defensive)
 *
 * 検証対象:
 *   1. `shouldBuild(changedFiles)` pure function が ignoreCommand の bash logic と一致
 *   2. vercel.json の ignoreCommand 文字列に必要な regex pattern が含まれる
 *   3. .canary-trigger.json file が repo root に存在
 *   4. .canary-trigger.json に secret/token/key が含まれない (PII firewall 相当)
 *
 * 不可侵境界:
 *   - runtime app code 0 diff
 *   - test 単体で完結 (script は触らない、test fixtures のみ)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// =============================================================================
// Pure TypeScript mirror of vercel.json ignoreCommand bash logic
// =============================================================================

/**
 * vercel.json の ignoreCommand と**同等な judgement**を pure TypeScript で再現。
 *
 * Bash 原本 (vercel.json):
 *   git diff --name-only HEAD^ HEAD | grep -q '^\.canary-trigger\.json$' && exit 1;
 *   [ -z "$(git diff --name-only HEAD^ HEAD | grep -v '\.md$')" ] && exit 0 || exit 1
 *
 * 戻り値:
 *   true  → Vercel build を**実行** (bash exit 1 相当)
 *   false → Vercel build を**skip** (bash exit 0 相当)
 *
 * 判定:
 *   1. `.canary-trigger.json` を含む → true (build)
 *   2. 全 `.md` のみ → false (skip)
 *   3. それ以外 (code 変更 / 混在等) → true (build)
 *   4. 空 → false (skip)
 */
export function shouldBuild(changedFiles: readonly string[]): boolean {
  if (changedFiles.length === 0) return false; // 空 → skip
  // (1) .canary-trigger.json 含む → build
  if (changedFiles.some((f) => /^\.canary-trigger\.json$/.test(f))) return true;
  // (2) .md 以外を含む → build
  if (changedFiles.some((f) => !/\.md$/.test(f))) return true;
  // (3) .md のみ → skip
  return false;
}

// =============================================================================
// Tests
// =============================================================================

describe("D-2 vercel.json ignoreCommand — shouldBuild pure logic mirror (6 scenarios)", () => {
  it("[scenario 1] .md only → skip (exit 0)", () => {
    expect(shouldBuild(["docs/foo.md"])).toBe(false);
    expect(shouldBuild(["docs/foo.md", "docs/bar.md"])).toBe(false);
    expect(shouldBuild(["README.md"])).toBe(false);
  });

  it("[scenario 2] .canary-trigger.json only → build (exit 1) — CEO 補正の core 動作", () => {
    expect(shouldBuild([".canary-trigger.json"])).toBe(true);
  });

  it("[scenario 3] .md + .canary-trigger.json → build (canary-trigger 優先)", () => {
    expect(shouldBuild(["docs/foo.md", ".canary-trigger.json"])).toBe(true);
    expect(shouldBuild([".canary-trigger.json", "docs/foo.md"])).toBe(true);
  });

  it("[scenario 4] runtime code only (.ts/.tsx) → build (既存挙動維持)", () => {
    expect(shouldBuild(["src/foo.ts"])).toBe(true);
    expect(shouldBuild(["components/Bar.tsx"])).toBe(true);
    expect(shouldBuild(["lib/coalter/baz.ts"])).toBe(true);
  });

  it("[scenario 5] .md + code → build (既存挙動維持)", () => {
    expect(shouldBuild(["docs/foo.md", "src/foo.ts"])).toBe(true);
  });

  it("[scenario 6] 空 → skip (defensive)", () => {
    expect(shouldBuild([])).toBe(false);
  });

  it("regression: 全 file が .md でも、1 つでも非-.md があれば build", () => {
    expect(shouldBuild(["a.md", "b.md", "c.md"])).toBe(false);
    expect(shouldBuild(["a.md", "b.md", "c.ts"])).toBe(true);
  });

  it("regression: 任意の code 拡張子 (.json, .yml, .sh) も build", () => {
    expect(shouldBuild(["package.json"])).toBe(true);
    expect(shouldBuild([".github/workflows/ci.yml"])).toBe(true);
    expect(shouldBuild(["scripts/foo.sh"])).toBe(true);
  });

  it("safety: .canary-trigger.json が nested path にあっても trigger (現状 root only path だが将来 expansion)", () => {
    // 現状 root のみだが test として nested は false 確認
    // bash `^\.canary-trigger\.json$` は root anchor → nested は match しない
    // → nested は code として扱われ build
    expect(shouldBuild(["subdir/.canary-trigger.json"])).toBe(true); // code として build
    expect(shouldBuild([".canary-trigger.json"])).toBe(true); // root → canary-trigger gate で build
  });
});

// =============================================================================
// vercel.json ignoreCommand 文字列の content verify (regex pattern 含有確認)
// =============================================================================

describe("D-2 vercel.json — ignoreCommand 文字列 content invariant", () => {
  const repoRoot = join(__dirname, "..", "..", "..");
  const vercelJsonPath = join(repoRoot, "vercel.json");

  it("vercel.json file は repo root に存在", () => {
    const content = readFileSync(vercelJsonPath, "utf8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("ignoreCommand に '.canary-trigger.json' regex pattern を含む (escaped form)", () => {
    const json = JSON.parse(readFileSync(vercelJsonPath, "utf8")) as {
      ignoreCommand?: string;
    };
    expect(json.ignoreCommand).toBeDefined();
    // bash regex `\.canary-trigger\.json$` の literal substring。JSON.parse 後は \\ → \
    expect(json.ignoreCommand).toContain("canary-trigger");
    // root-anchor + .json extension
    expect(json.ignoreCommand).toMatch(/\^\\\.canary-trigger\\\.json\$/);
  });

  it("ignoreCommand に '.md$' regex pattern (既存挙動維持) を含む (escaped form)", () => {
    const json = JSON.parse(readFileSync(vercelJsonPath, "utf8")) as {
      ignoreCommand?: string;
    };
    expect(json.ignoreCommand).toContain("md");
    // grep -v '\.md$' literal pattern
    expect(json.ignoreCommand).toMatch(/grep\s+-v\s+'\\\.md\$'/);
  });

  it("ignoreCommand に exit 0 / exit 1 両方を含む (skip / build の両経路)", () => {
    const json = JSON.parse(readFileSync(vercelJsonPath, "utf8")) as {
      ignoreCommand?: string;
    };
    expect(json.ignoreCommand).toContain("exit 0");
    expect(json.ignoreCommand).toContain("exit 1");
  });

  it("ignoreCommand に canary-trigger gate (grep -q 経路) と md-only gate (grep -v 経路) 両方を含む", () => {
    const json = JSON.parse(readFileSync(vercelJsonPath, "utf8")) as {
      ignoreCommand?: string;
    };
    // canary-trigger gate: grep -q '^\.canary-trigger\.json$' && exit 1
    expect(json.ignoreCommand).toMatch(/grep\s+-q\s+['"]\^?\\\.canary-trigger\\\.json/);
    // md-only gate: grep -v '\.md$'
    expect(json.ignoreCommand).toMatch(/grep\s+-v\s+['"]\\\.md/);
  });
});

// =============================================================================
// .canary-trigger.json file content invariant (PII firewall / secret-free)
// =============================================================================

describe("D-2 .canary-trigger.json — metadata invariant + secret-free", () => {
  const repoRoot = join(__dirname, "..", "..", "..");
  const triggerPath = join(repoRoot, ".canary-trigger.json");

  it(".canary-trigger.json file は repo root に存在", () => {
    const content = readFileSync(triggerPath, "utf8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("valid JSON", () => {
    const json = JSON.parse(readFileSync(triggerPath, "utf8")) as Record<string, unknown>;
    expect(json).toBeTypeOf("object");
  });

  it("metadata field 期待値 (phase / canary_branch / expected/forbidden Supabase ref)", () => {
    const json = JSON.parse(readFileSync(triggerPath, "utf8")) as Record<string, unknown>;
    expect(json.phase).toBeTypeOf("string");
    expect(json.canary_branch).toBeTypeOf("string");
    expect(json.expected_supabase_ref).toBe("aljavfujeqcwnqryjmhl");
    expect(json.forbidden_supabase_ref).toBe("hjcrvndumgiovyfdacwc");
  });

  it("secret / token / key が含まれない (file 全体 grep)", () => {
    const content = readFileSync(triggerPath, "utf8");
    // JWT pattern (eyJ で始まる 3 segment) なし
    expect(content).not.toMatch(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\./);
    // Secret/Token/Key keyword 値 (URL以外で actual value を持たない)
    expect(content).not.toMatch(/"[a-z_]*secret[a-z_]*"\s*:\s*"[^"]{10,}"/i);
    expect(content).not.toMatch(/"[a-z_]*token[a-z_]*"\s*:\s*"[^"]{10,}"/i);
    expect(content).not.toMatch(/"[a-z_]*api[a-z_]*key[a-z_]*"\s*:\s*"[^"]{10,}"/i);
    expect(content).not.toMatch(/"[a-z_]*private[a-z_]*key[a-z_]*"\s*:\s*"[^"]{10,}"/i);
    // PII pattern (email)
    expect(content).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  });

  it("trigger metadata に増分用 field (trigger_count, trigger_at) を持つ", () => {
    const json = JSON.parse(readFileSync(triggerPath, "utf8")) as Record<string, unknown>;
    expect(json.trigger_count).toBeTypeOf("number");
    expect(json.trigger_at).toBeTypeOf("string");
  });
});

// =============================================================================
// Integrated: D-2 → D-1 script との関係 (purpose declaration)
// =============================================================================

describe("D-2 → D-1 hand-off integrity", () => {
  it("anti-patterns doc に D-2 build route + D-1 script との関係が明記されている", () => {
    const docPath = join(__dirname, "..", "..", "..", "docs", "coalter-aoo-canary-deploy-anti-patterns.md");
    const content = readFileSync(docPath, "utf8");
    // D-1 script reference
    expect(content).toContain("scripts/coalter/verify-canary-deploy.ts");
    // D-2 build route 言及 (本 PR で追記される、merge 後 main で確認)
    // 注: D-2 自身の PR 内では追記済、本 test は anti-patterns doc が D-1+D-2 両方参照する invariant を担保
    expect(content).toMatch(/canary-trigger\.json|D-2/);
  });
});
