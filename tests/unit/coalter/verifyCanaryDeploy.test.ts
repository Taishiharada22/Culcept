/**
 * CoAlter AOO Phase D-1 — verify-canary-deploy invariant test
 *
 * 正本: scripts/coalter/verify-canary-deploy.ts
 *
 * test 範囲 (CEO 提示 10 acceptance criteria 全 cover):
 *   1. source=cli deploy を fail 判定できる
 *   2. gitSource.ref / gitCommitRef なしを fail 判定できる
 *   3. user alias URL を fail 判定できる
 *   4. canonical deployment URL を pass 判定できる
 *   5. expected Supabase ref が HTML にない場合 fail
 *   6. forbidden Supabase ref `hjcrvndumgiovyfdacwc` が HTML にある場合 fail
 *   7. expected ref `aljavfujeqcwnqryjmhl` を検出できる
 *   8. script は read-only
 *   9. tests PASS
 *   10. code diff は script/test/template/docs のみに限定
 */

import { describe, it, expect } from "vitest";
import {
  parseCanonicalUrl,
  parseDeployMeta,
  extractSupabaseRefs,
  evaluateGate1Url,
  evaluateGate2Meta,
  evaluateGate3SupabaseRefs,
  overallVerdict,
  parseArgs,
  validateCliArgs,
} from "../../../scripts/coalter/verify-canary-deploy";

// =============================================================================
// parseCanonicalUrl
// =============================================================================

describe("D-1 parseCanonicalUrl — URL 形状判別", () => {
  it("canonical URL: culcept-<hash>-taishis-projects-... → isCanonical true", () => {
    const r = parseCanonicalUrl("https://culcept-1h8ychlul-taishis-projects-0a8deb17.vercel.app");
    expect(r.isCanonical).toBe(true);
    expect(r.isUserAlias).toBe(false);
    expect(r.isGitBranchAlias).toBe(false);
    expect(r.deploymentHash).toBe("1h8ychlul");
    expect(r.hostType).toBe("canonical");
  });

  it("user alias: culcept-th7328aish-1775-... → isUserAlias true (CEO 必須 3)", () => {
    const r = parseCanonicalUrl("https://culcept-th7328aish-1775-taishis-projects-0a8deb17.vercel.app");
    expect(r.isCanonical).toBe(false);
    expect(r.isUserAlias).toBe(true);
    expect(r.hostType).toBe("user_alias");
  });

  it("git branch alias: culcept-git-<slug>-... → isGitBranchAlias true", () => {
    const r = parseCanonicalUrl(
      "https://culcept-git-chore-coalter-mirro-088a97-taishis-projects-0a8deb17.vercel.app",
    );
    expect(r.isGitBranchAlias).toBe(true);
    expect(r.isCanonical).toBe(false);
    expect(r.hostType).toBe("git_branch_alias");
  });

  it("unknown URL → hostType unknown", () => {
    const r = parseCanonicalUrl("https://example.com/foo");
    expect(r.isCanonical).toBe(false);
    expect(r.isUserAlias).toBe(false);
    expect(r.isGitBranchAlias).toBe(false);
    expect(r.hostType).toBe("unknown");
  });

  it("invalid URL → hostType unknown, host empty", () => {
    const r = parseCanonicalUrl("not-a-url");
    expect(r.hostType).toBe("unknown");
    expect(r.host).toBe("");
  });

  it("trailing slash でも canonical detect", () => {
    const r = parseCanonicalUrl("https://culcept-abc12345-taishis-projects-0a8deb17.vercel.app/");
    expect(r.isCanonical).toBe(true);
    expect(r.deploymentHash).toBe("abc12345");
  });
});

// =============================================================================
// parseDeployMeta
// =============================================================================

describe("D-1 parseDeployMeta — Vercel API response parser", () => {
  it("source=github + ref set → isGitAttributed true", () => {
    const r = parseDeployMeta({
      source: "github",
      gitSource: { ref: "chore/coalter-mirror-c4-canary", type: "github" },
      meta: {
        githubCommitRef: "chore/coalter-mirror-c4-canary",
        githubCommitSha: "b58f50bebed30afc0aa3baaf4e40392dfa4d45c8",
      },
    });
    expect(r.isGitAttributed).toBe(true);
    expect(r.meta.source).toBe("github");
    expect(r.meta.gitSourceRef).toBe("chore/coalter-mirror-c4-canary");
    expect(r.meta.gitCommitRef).toBe("chore/coalter-mirror-c4-canary");
    expect(r.meta.gitCommitSha).toBe("b58f50bebed30afc0aa3baaf4e40392dfa4d45c8");
  });

  it("source=cli → isGitAttributed false (CEO 必須 1、C-4 BLOCKED root cause)", () => {
    const r = parseDeployMeta({
      source: "cli",
      gitSource: null,
      meta: {},
    });
    expect(r.isGitAttributed).toBe(false);
    expect(r.meta.source).toBe("cli");
    expect(r.meta.gitSourceRef).toBeNull();
    expect(r.meta.gitCommitRef).toBeNull();
  });

  it("gitSource.type 欠落 → isGitAttributed false (D-3-β 修正、provider 識別必須)", () => {
    const r = parseDeployMeta({
      source: "github",
      gitSource: { ref: "chore/foo" }, // no type field
      meta: { githubCommitRef: "chore/foo" },
    });
    expect(r.isGitAttributed).toBe(false);
    expect(r.meta.gitSourceType).toBeNull();
  });

  it("gitSource.ref null + meta.githubCommitRef 存在 + type=github → isGitAttributed true (D-3-β CEO criterion 6 緩和、片方 ref で attribution 成立)", () => {
    const r = parseDeployMeta({
      source: "github",
      gitSource: { ref: null, type: "github" },
      meta: { githubCommitRef: "chore/foo" },
    });
    expect(r.isGitAttributed).toBe(true);
    expect(r.meta.gitSourceType).toBe("github");
    expect(r.meta.gitSourceRef).toBeNull();
    expect(r.meta.gitCommitRef).toBe("chore/foo");
  });

  it("meta.githubCommitRef null + gitSource.ref 存在 + type=github → isGitAttributed true (D-3-β CEO criterion 6 緩和)", () => {
    const r = parseDeployMeta({
      source: "github",
      gitSource: { ref: "chore/foo", type: "github" },
      meta: {},
    });
    expect(r.isGitAttributed).toBe(true);
    expect(r.meta.gitSourceType).toBe("github");
    expect(r.meta.gitSourceRef).toBe("chore/foo");
    expect(r.meta.gitCommitRef).toBeNull();
  });

  it("gitSource.ref null + meta.githubCommitRef null + type=github → isGitAttributed false (D-3-β CEO criterion 6、両方欠落 FAIL)", () => {
    const r = parseDeployMeta({
      source: "github",
      gitSource: { type: "github" },
      meta: {},
    });
    expect(r.isGitAttributed).toBe(false);
    expect(r.meta.gitSourceType).toBe("github");
    expect(r.meta.gitSourceRef).toBeNull();
    expect(r.meta.gitCommitRef).toBeNull();
  });

  it("source=git + gitSource.type=github + ref 存在 → isGitAttributed true (D-3-β 実機 case)", () => {
    const r = parseDeployMeta({
      source: "git",
      gitSource: {
        ref: "chore/coalter-mirror-d3b-canary",
        type: "github",
        sha: "ae3faaee36b456328a08577dc6ccb0ade665b2f9",
      },
      meta: {
        githubCommitRef: "chore/coalter-mirror-d3b-canary",
        githubCommitSha: "ae3faaee36b456328a08577dc6ccb0ade665b2f9",
      },
    });
    expect(r.isGitAttributed).toBe(true);
    expect(r.meta.source).toBe("git");
    expect(r.meta.gitSourceType).toBe("github");
    expect(r.meta.gitSourceRef).toBe("chore/coalter-mirror-d3b-canary");
    expect(r.meta.gitSourceSha).toBe("ae3faaee36b456328a08577dc6ccb0ade665b2f9");
  });

  it("gitSource.type=gitlab → isGitAttributed false (D-3-β、github 以外 provider 不可)", () => {
    const r = parseDeployMeta({
      source: "git",
      gitSource: { ref: "chore/foo", type: "gitlab" },
      meta: { gitlabCommitRef: "chore/foo" },
    });
    expect(r.isGitAttributed).toBe(false);
    expect(r.meta.gitSourceType).toBe("gitlab");
  });

  it("empty / undefined input → defensive null", () => {
    const r1 = parseDeployMeta(undefined);
    expect(r1.meta.source).toBeNull();
    expect(r1.isGitAttributed).toBe(false);
    const r2 = parseDeployMeta(null);
    expect(r2.meta.source).toBeNull();
    expect(r2.isGitAttributed).toBe(false);
    const r3 = parseDeployMeta({});
    expect(r3.meta.source).toBeNull();
    expect(r3.isGitAttributed).toBe(false);
  });

  it("gitlab source (alternative) も parse", () => {
    const r = parseDeployMeta({
      source: "github",
      gitSource: { ref: "chore/foo" },
      meta: {
        gitlabCommitRef: "chore/foo",
        gitlabCommitSha: "abc1234567890",
      },
    });
    expect(r.meta.gitCommitRef).toBe("chore/foo");
    expect(r.meta.gitCommitSha).toBe("abc1234567890");
  });
});

// =============================================================================
// extractSupabaseRefs
// =============================================================================

describe("D-1 extractSupabaseRefs — HTML bundle grep", () => {
  it("Production Supabase ref のみ含む HTML → expected 1 件", () => {
    const html = `<html>...const url = "https://aljavfujeqcwnqryjmhl.supabase.co";...</html>`;
    expect(extractSupabaseRefs(html)).toEqual(["aljavfujeqcwnqryjmhl"]);
  });

  it("staging Supabase ref のみ含む (C-4 BLOCKED 状態) → forbidden 1 件", () => {
    const html = `<html>...const url = "https://hjcrvndumgiovyfdacwc.supabase.co";...</html>`;
    expect(extractSupabaseRefs(html)).toEqual(["hjcrvndumgiovyfdacwc"]);
  });

  it("両方含む (transition 状態) → 2 件 sorted", () => {
    const html = `https://hjcrvndumgiovyfdacwc.supabase.co ... https://aljavfujeqcwnqryjmhl.supabase.co`;
    expect(extractSupabaseRefs(html)).toEqual([
      "aljavfujeqcwnqryjmhl",
      "hjcrvndumgiovyfdacwc",
    ]);
  });

  it("重複 → 1 件にまとめる", () => {
    const html = `https://aljavfujeqcwnqryjmhl.supabase.co...https://aljavfujeqcwnqryjmhl.supabase.co`;
    expect(extractSupabaseRefs(html)).toEqual(["aljavfujeqcwnqryjmhl"]);
  });

  it("Supabase URL 不在 → 空", () => {
    expect(extractSupabaseRefs("<html>foo bar</html>")).toEqual([]);
  });
});

// =============================================================================
// Gate 1: URL canonical-ness
// =============================================================================

describe("D-1 evaluateGate1Url — canonical URL gate (CEO 必須 3, 4)", () => {
  it("canonical URL → PASS", () => {
    const r = evaluateGate1Url("https://culcept-1h8ychlul-taishis-projects-0a8deb17.vercel.app");
    expect(r.pass).toBe(true);
    expect(r.gate).toBe(1);
  });

  it("user alias URL → FAIL (CEO 必須 3)", () => {
    const r = evaluateGate1Url(
      "https://culcept-th7328aish-1775-taishis-projects-0a8deb17.vercel.app",
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("user alias");
  });

  it("git branch alias URL → FAIL (補助用途、smoke 本命としては canonical)", () => {
    const r = evaluateGate1Url(
      "https://culcept-git-chore-coalter-mirro-088a97-taishis-projects-0a8deb17.vercel.app",
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("git branch alias");
  });

  it("unknown URL → FAIL", () => {
    const r = evaluateGate1Url("https://example.com");
    expect(r.pass).toBe(false);
  });
});

// =============================================================================
// Gate 2: Deploy meta git attribution
// =============================================================================

describe("D-1 evaluateGate2Meta — git attribution gate (CEO 補正 2026-05-19 D-3-β 10 criteria)", () => {
  const expected = "chore/coalter-mirror-c4-canary";

  // ── Criterion 1 + 10: source=cli は必ず FAIL (C-4 BLOCKED root cause) ──
  it("[criterion 1] source=cli → FAIL with C-4 root cause message", () => {
    const r = evaluateGate2Meta(
      { source: "cli", gitSource: null, meta: {} },
      expected,
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("source=cli");
    expect(r.reason).toContain("C-4 BLOCKED");
  });

  it("[criterion 10] C-4 同型 (source=cli / gitSource=null / refs 全欠落) → FAIL 確実", () => {
    const r = evaluateGate2Meta(
      { source: "cli", gitSource: null, meta: {} },
      expected,
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("source=cli");
  });

  // ── Criterion 2: gitSource.type === "github" 必須 ──
  it("[criterion 2] gitSource.type が undefined → FAIL", () => {
    const r = evaluateGate2Meta(
      {
        source: "github",
        gitSource: { ref: expected },
        meta: { githubCommitRef: expected },
      },
      expected,
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('gitSource.type は "github" であるべき');
  });

  it("[criterion 2] gitSource.type が gitlab → FAIL (github 以外は不可)", () => {
    const r = evaluateGate2Meta(
      {
        source: "git",
        gitSource: { ref: expected, type: "gitlab" },
        meta: { gitlabCommitRef: expected },
      },
      expected,
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('gitSource.type は "github" であるべき');
  });

  it("[criterion 2] gitSource そのものが null → FAIL (type 取得不可)", () => {
    const r = evaluateGate2Meta(
      { source: "git", gitSource: null, meta: { githubCommitRef: expected } },
      expected,
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('gitSource.type は "github" であるべき');
  });

  // ── Criterion 3 + 7: gitSource.ref がある場合、expectedBranch と一致必須 ──
  it("[criterion 3 + 7] gitSource.ref mismatch (別 branch) → FAIL", () => {
    const r = evaluateGate2Meta(
      {
        source: "github",
        gitSource: { ref: "feat/another-branch", type: "github" },
        meta: { githubCommitRef: "feat/another-branch" },
      },
      expected,
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("gitSource.ref mismatch");
  });

  // ── Criterion 4 + 7: meta.githubCommitRef がある場合、expectedBranch と一致必須 ──
  it("[criterion 4 + 7] meta.githubCommitRef mismatch → FAIL", () => {
    const r = evaluateGate2Meta(
      {
        source: "github",
        gitSource: { ref: expected, type: "github" },
        meta: { githubCommitRef: "feat/another-branch" },
      },
      expected,
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("meta.githubCommitRef mismatch");
  });

  // ── Criterion 5: gitSource.sha と meta.githubCommitSha が両方ある場合、一致必須 ──
  it("[criterion 5] gitSource.sha と meta.githubCommitSha 不一致 → FAIL", () => {
    const r = evaluateGate2Meta(
      {
        source: "github",
        gitSource: { ref: expected, type: "github", sha: "abc1234567890" },
        meta: { githubCommitRef: expected, githubCommitSha: "def4567890abc" },
      },
      expected,
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("gitSource.sha");
    expect(r.reason).toContain("meta.githubCommitSha 不一致");
  });

  it("[criterion 5] gitSource.sha + meta.githubCommitSha 一致 → PASS", () => {
    const sha = "abc1234567890abcdef0123456789abcdef01234";
    const r = evaluateGate2Meta(
      {
        source: "github",
        gitSource: { ref: expected, type: "github", sha },
        meta: { githubCommitRef: expected, githubCommitSha: sha },
      },
      expected,
    );
    expect(r.pass).toBe(true);
  });

  it("[criterion 5] gitSource.sha 存在 + meta.githubCommitSha null → PASS (片方欠落は許容)", () => {
    const r = evaluateGate2Meta(
      {
        source: "github",
        gitSource: { ref: expected, type: "github", sha: "abc1234567890" },
        meta: { githubCommitRef: expected },
      },
      expected,
    );
    expect(r.pass).toBe(true);
  });

  it("[criterion 5] gitSource.sha null + meta.githubCommitSha 存在 → PASS (片方欠落は許容)", () => {
    const r = evaluateGate2Meta(
      {
        source: "github",
        gitSource: { ref: expected, type: "github" },
        meta: { githubCommitRef: expected, githubCommitSha: "abc1234567890" },
      },
      expected,
    );
    expect(r.pass).toBe(true);
  });

  // ── Criterion 6: gitSource.ref と meta.githubCommitRef 両方欠落 → FAIL ──
  it("[criterion 6] gitSource.ref / meta.githubCommitRef 両方欠落 → FAIL", () => {
    const r = evaluateGate2Meta(
      {
        source: "github",
        gitSource: { type: "github" },
        meta: {},
      },
      expected,
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("両方欠落");
  });

  // ── Criterion 8 (主要追加): source=git + gitSource.type=github + 一致 → PASS (D-3-β 実機 case) ──
  it("[criterion 8] source=git + gitSource.type=github + matching ref → PASS (D-3-β 実機 case)", () => {
    const r = evaluateGate2Meta(
      {
        source: "git",
        gitSource: { ref: expected, type: "github", sha: "ae3faaee36b4" },
        meta: { githubCommitRef: expected, githubCommitSha: "ae3faaee36b4" },
      },
      expected,
    );
    expect(r.pass).toBe(true);
    expect(r.gate).toBe(2);
    expect(r.reason).toContain("git-attributed deploy");
    expect(r.reason).toContain("source=git");
    expect(r.reason).toContain("gitSource.type=github");
  });

  // ── 既存 PASS テスト: source=github + matching ref → PASS (古い Vercel API 互換) ──
  it("[backward compat] source=github + gitSource.type=github + matching ref → PASS", () => {
    const r = evaluateGate2Meta(
      {
        source: "github",
        gitSource: { ref: expected, type: "github" },
        meta: { githubCommitRef: expected, githubCommitSha: "abc12345abc12345abc12345" },
      },
      expected,
    );
    expect(r.pass).toBe(true);
    expect(r.gate).toBe(2);
  });

  // ── Criterion 4 緩和: meta.githubCommitRef null + gitSource.ref 一致 → PASS ──
  it("[criterion 4 緩和] gitSource.ref 一致 + meta.githubCommitRef null → PASS (片方の ref で attribution 成立)", () => {
    const r = evaluateGate2Meta(
      {
        source: "github",
        gitSource: { ref: expected, type: "github" },
        meta: {},
      },
      expected,
    );
    expect(r.pass).toBe(true);
  });

  // ── Criterion 3 緩和: gitSource.ref null + meta.githubCommitRef 一致 → PASS ──
  it("[criterion 3 緩和] gitSource.ref null + meta.githubCommitRef 一致 → PASS (片方の ref で attribution 成立)", () => {
    const r = evaluateGate2Meta(
      {
        source: "github",
        gitSource: { type: "github" },
        meta: { githubCommitRef: expected },
      },
      expected,
    );
    expect(r.pass).toBe(true);
  });

  // ── Criterion 9: source=github でも branch 情報欠落なら FAIL ──
  it("[criterion 9] source=github でも refs 両方欠落 → FAIL (criterion 6 で gate)", () => {
    const r = evaluateGate2Meta(
      { source: "github", gitSource: { type: "github" }, meta: {} },
      expected,
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("両方欠落");
  });

  // ── 任意 source (import 等) でも gitSource.type で gate ──
  it("source=import + gitSource.type=github + matching ref → PASS (source 種別に依存しない)", () => {
    const r = evaluateGate2Meta(
      {
        source: "import",
        gitSource: { ref: expected, type: "github" },
        meta: { githubCommitRef: expected },
      },
      expected,
    );
    expect(r.pass).toBe(true);
  });

  it("source=import + gitSource.type 欠落 → FAIL", () => {
    const r = evaluateGate2Meta(
      { source: "import", gitSource: { ref: expected }, meta: { githubCommitRef: expected } },
      expected,
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('gitSource.type は "github" であるべき');
  });
});

// =============================================================================
// Gate 3: HTML bundle Supabase ref
// =============================================================================

describe("D-1 evaluateGate3SupabaseRefs — Supabase ref gate (CEO 必須 5, 6, 7)", () => {
  const expected = "aljavfujeqcwnqryjmhl"; // Production
  const forbidden = "hjcrvndumgiovyfdacwc"; // Alter staging

  it("expected ref 含有 + forbidden 不在 → PASS (CEO 必須 7)", () => {
    const html = `const url = "https://${expected}.supabase.co";`;
    const r = evaluateGate3SupabaseRefs(html, expected, forbidden);
    expect(r.pass).toBe(true);
    expect(r.gate).toBe(3);
  });

  it("forbidden ref 含有 → FAIL with C-4 BLOCKED 警告 (CEO 必須 6)", () => {
    const html = `const url = "https://${forbidden}.supabase.co";`;
    const r = evaluateGate3SupabaseRefs(html, expected, forbidden);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain(`forbidden Supabase ref "${forbidden}"`);
    expect(r.reason).toContain("C-4 BLOCKED");
  });

  it("両方含有 (transition) → FAIL (forbidden 優先で fail)", () => {
    const html = `https://${expected}.supabase.co ... https://${forbidden}.supabase.co`;
    const r = evaluateGate3SupabaseRefs(html, expected, forbidden);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("forbidden");
  });

  it("expected ref 不在 → FAIL (CEO 必須 5)", () => {
    const html = `const url = "https://otherproject.supabase.co";`;
    const r = evaluateGate3SupabaseRefs(html, expected, forbidden);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain(`expected Supabase ref "${expected}" が baked-in されていない`);
  });

  it("HTML に Supabase URL なし → FAIL", () => {
    const r = evaluateGate3SupabaseRefs("<html>no supabase</html>", expected, forbidden);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("見つからない");
  });
});

// =============================================================================
// overallVerdict
// =============================================================================

describe("D-1 overallVerdict — 全 gate 結果統合", () => {
  it("全 PASS → pass true", () => {
    const v = overallVerdict([
      { gate: 1, name: "x", pass: true, reason: "", evidence: {} },
      { gate: 2, name: "x", pass: true, reason: "", evidence: {} },
      { gate: 3, name: "x", pass: true, reason: "", evidence: {} },
    ]);
    expect(v.pass).toBe(true);
    expect(v.failedGates).toEqual([]);
  });

  it("Gate 2 FAIL → pass false, failedGates [2]", () => {
    const v = overallVerdict([
      { gate: 1, name: "x", pass: true, reason: "", evidence: {} },
      { gate: 2, name: "x", pass: false, reason: "", evidence: {} },
      { gate: 3, name: "x", pass: true, reason: "", evidence: {} },
    ]);
    expect(v.pass).toBe(false);
    expect(v.failedGates).toEqual([2]);
  });

  it("Gate 2 + 3 FAIL → pass false, failedGates [2, 3]", () => {
    const v = overallVerdict([
      { gate: 1, name: "x", pass: true, reason: "", evidence: {} },
      { gate: 2, name: "x", pass: false, reason: "", evidence: {} },
      { gate: 3, name: "x", pass: false, reason: "", evidence: {} },
    ]);
    expect(v.failedGates).toEqual([2, 3]);
  });
});

// =============================================================================
// CLI parser
// =============================================================================

describe("D-1 parseArgs / validateCliArgs", () => {
  it("--key=value 形式を Record にする", () => {
    const r = parseArgs([
      "--deployment-url=https://example.com",
      "--expected-branch=chore/foo",
    ]);
    expect(r["deployment-url"]).toBe("https://example.com");
    expect(r["expected-branch"]).toBe("chore/foo");
  });

  it("validateCliArgs 必須 5 件すべて指定で OK", () => {
    const args = validateCliArgs({
      "deployment-url": "https://culcept-x.vercel.app",
      "deployment-id": "dpl_xxx",
      "expected-branch": "chore/c4",
      "expected-supabase": "aljavfujeqcwnqryjmhl",
      "forbidden-supabase": "hjcrvndumgiovyfdacwc",
    });
    expect(args.deploymentUrl).toBe("https://culcept-x.vercel.app");
    expect(args.deploymentId).toBe("dpl_xxx");
    expect(args.expectedSupabaseRef).toBe("aljavfujeqcwnqryjmhl");
    expect(args.forbiddenSupabaseRef).toBe("hjcrvndumgiovyfdacwc");
  });

  it("validateCliArgs 必須欠落 → throws", () => {
    expect(() =>
      validateCliArgs({
        "deployment-url": "x",
      }),
    ).toThrow(/Missing required args/);
  });

  it("vercel-token は optional", () => {
    const args = validateCliArgs({
      "deployment-url": "x",
      "deployment-id": "y",
      "expected-branch": "z",
      "expected-supabase": "a",
      "forbidden-supabase": "b",
    });
    expect(args.vercelToken).toBeUndefined();
  });
});

// =============================================================================
// Integrated scenario: C-4 BLOCKED reproduction (regression guard)
// =============================================================================

describe("D-1 Integrated — C-4 BLOCKED reproduction (本 script が C-4 を fail 判定すること)", () => {
  it("C-4 BLOCKED 状態 (source=cli + staging Supabase baked) → Gate 2/3 で fail", () => {
    // Gate 1: user alias 形式の URL を CEO が踏んだ場合 → fail
    const g1User = evaluateGate1Url(
      "https://culcept-th7328aish-1775-taishis-projects-0a8deb17.vercel.app",
    );
    expect(g1User.pass).toBe(false);

    // Gate 1: canonical URL なら pass
    const g1Canon = evaluateGate1Url(
      "https://culcept-1h8ychlul-taishis-projects-0a8deb17.vercel.app",
    );
    expect(g1Canon.pass).toBe(true);

    // Gate 2: source=cli (C-4 BLOCKED 実例) → fail
    const g2 = evaluateGate2Meta(
      { source: "cli", gitSource: null, meta: {} },
      "chore/coalter-mirror-c4-canary",
    );
    expect(g2.pass).toBe(false);

    // Gate 3: staging Supabase が baked (C-4 BLOCKED 実例) → fail
    const g3 = evaluateGate3SupabaseRefs(
      `<html>const u = "https://hjcrvndumgiovyfdacwc.supabase.co";</html>`,
      "aljavfujeqcwnqryjmhl",
      "hjcrvndumgiovyfdacwc",
    );
    expect(g3.pass).toBe(false);

    // overall verdict: gates 2 + 3 fail
    const verdict = overallVerdict([g1Canon, g2, g3]);
    expect(verdict.pass).toBe(false);
    expect(verdict.failedGates).toEqual([2, 3]);
  });

  it("修正後の理想形 (source=github + Production Supabase) → 3 gates PASS", () => {
    const g1 = evaluateGate1Url("https://culcept-fixed567-taishis-projects-0a8deb17.vercel.app");
    const g2 = evaluateGate2Meta(
      {
        source: "github",
        gitSource: { ref: "chore/coalter-mirror-c4-canary", type: "github" },
        meta: {
          githubCommitRef: "chore/coalter-mirror-c4-canary",
          githubCommitSha: "deadbeef" + "0".repeat(32),
        },
      },
      "chore/coalter-mirror-c4-canary",
    );
    const g3 = evaluateGate3SupabaseRefs(
      `<html>const u = "https://aljavfujeqcwnqryjmhl.supabase.co";</html>`,
      "aljavfujeqcwnqryjmhl",
      "hjcrvndumgiovyfdacwc",
    );
    expect(g1.pass).toBe(true);
    expect(g2.pass).toBe(true);
    expect(g3.pass).toBe(true);
    expect(overallVerdict([g1, g2, g3]).pass).toBe(true);
  });
});
