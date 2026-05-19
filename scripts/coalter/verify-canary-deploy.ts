/**
 * CoAlter AOO Phase D-1 — Canary Deploy Verification Guard
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-d0-canary-deploy-route-design.md §4-§5 + Appendix B
 *   - 永続 canon: docs/coalter-aoo-canary-deploy-anti-patterns.md §3-§4
 *
 * 役割 (D-1 段階):
 *   canary deploy が production-equivalent CoAlter smoke の前提を満たすか **read-only**
 *   で機械検証する。C-4 BLOCKED で確立した failure mode を pre-flight で検出する。
 *
 * 3 つの fail-closed gate (順次評価):
 *   Gate 1: URL canonical-ness (user alias / git branch alias 禁止)
 *   Gate 2: Deploy meta git attribution (source=cli / git ref None → FAIL)
 *   Gate 3: HTML bundle Supabase ref (expected あり / forbidden なし)
 *
 * No-Effect Contract (read-only):
 *   - env 変更なし (vercel env add/rm 一切使わない)
 *   - deploy 作成なし (vercel deploy / redeploy 一切使わない)
 *   - I/O は HTTP GET (Vercel API / HTML bundle) のみ
 *   - Production / Preview / Development 全 scope に副作用ゼロ
 *
 * CLI 使用例:
 *   npx tsx scripts/coalter/verify-canary-deploy.ts \
 *     --deployment-url=https://culcept-<hash>-taishis-projects-0a8deb17.vercel.app \
 *     --deployment-id=dpl_<id> \
 *     --expected-branch=chore/coalter-mirror-c<N>-canary \
 *     --expected-supabase=aljavfujeqcwnqryjmhl \
 *     --forbidden-supabase=hjcrvndumgiovyfdacwc
 *
 *   exit 0: 3 gates 全 PASS (smoke 開始可能)
 *   exit 1: いずれか FAIL (smoke 中止)
 *   exit 2: CLI argument error
 *
 * Vercel API token 解決順 (env var 優先):
 *   1. process.env.VERCEL_TOKEN
 *   2. ~/Library/Application Support/com.vercel.cli/auth.json (macOS)
 *   3. ~/.config/vercel/auth.json (Linux)
 *
 * 不可侵境界:
 *   - presence / observer / chat / Mirror UI / hook code 0 diff
 *   - app/lib/components/hooks runtime 変更なし (本 script は scripts/ 内のみ)
 *   - package.json 0 diff (Node built-ins + tsx のみ使用)
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// =============================================================================
// Constants
// =============================================================================

/** Canonical deployment URL host pattern: culcept-<8-9 char hash>-taishis-projects-0a8deb17.vercel.app */
const CANONICAL_HOST_PATTERN = /^culcept-([a-z0-9]{8,})-(taishis-projects-[a-z0-9]+)\.vercel\.app$/;

/** User alias pattern (smoke 本命 URL として使わない): culcept-<username>-... */
const USER_ALIAS_HOST_PATTERN = /^culcept-(th7328aish|.+-[0-9]+)-taishis-projects-[a-z0-9]+\.vercel\.app$/;

/** Git branch alias pattern (補助用途、smoke 本命としては canonical を使う): culcept-git-<branch-slug>-... */
const GIT_BRANCH_ALIAS_HOST_PATTERN = /^culcept-git-(.+?)-taishis-projects-[a-z0-9]+\.vercel\.app$/;

/** HTML bundle 内 Supabase URL extraction regex */
const SUPABASE_URL_REGEX = /https:\/\/([a-z0-9]+)\.supabase\.co/g;

/** Vercel team id (read-only constant). 変更は別 PR で。*/
const VERCEL_TEAM_ID = "team_wS0pdrzKkPjZAf5K5QJuqy5h";

// =============================================================================
// Types
// =============================================================================

export interface CanonicalUrlResult {
  readonly isCanonical: boolean;
  readonly isUserAlias: boolean;
  readonly isGitBranchAlias: boolean;
  readonly deploymentHash: string | null;
  readonly hostType: "canonical" | "user_alias" | "git_branch_alias" | "unknown";
  readonly host: string;
}

export interface DeployMeta {
  readonly source: string | null;
  readonly gitSourceRef: string | null;
  readonly gitCommitRef: string | null;
  readonly gitCommitSha: string | null;
}

export interface DeployMetaParseResult {
  readonly meta: DeployMeta;
  readonly isGitAttributed: boolean;
}

export interface GateResult {
  readonly gate: 1 | 2 | 3;
  readonly name: string;
  readonly pass: boolean;
  readonly reason: string;
  readonly evidence: Readonly<Record<string, string | string[] | null | boolean>>;
}

export interface CliArgs {
  readonly deploymentUrl: string;
  readonly deploymentId: string;
  readonly expectedBranch: string;
  readonly expectedSupabaseRef: string;
  readonly forbiddenSupabaseRef: string;
  readonly vercelToken?: string;
}

// =============================================================================
// Pure helpers (testable, no I/O)
// =============================================================================

/**
 * URL を parse して canonical / user alias / git branch alias を判別する。
 *
 * @param url - 検査対象 URL (e.g., "https://culcept-abc12345-taishis-projects-0a8deb17.vercel.app")
 * @returns CanonicalUrlResult
 *
 * 判定優先順:
 *   1. user alias pattern match → user_alias (canonical: false)
 *   2. git branch alias pattern match → git_branch_alias (canonical: false)
 *   3. canonical pattern match → canonical (canonical: true)
 *   4. その他 → unknown (canonical: false)
 */
export function parseCanonicalUrl(url: string): CanonicalUrlResult {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return {
      isCanonical: false,
      isUserAlias: false,
      isGitBranchAlias: false,
      deploymentHash: null,
      hostType: "unknown",
      host: "",
    };
  }

  // Order matters: user alias / git branch alias を canonical pattern より先に判定
  // (user alias は culcept-th7328aish-1775-... で英数字 + ハイフン構造を持つため
  //  canonical pattern にも match する可能性。先に除外する)
  if (USER_ALIAS_HOST_PATTERN.test(host)) {
    return {
      isCanonical: false,
      isUserAlias: true,
      isGitBranchAlias: false,
      deploymentHash: null,
      hostType: "user_alias",
      host,
    };
  }
  if (GIT_BRANCH_ALIAS_HOST_PATTERN.test(host)) {
    return {
      isCanonical: false,
      isUserAlias: false,
      isGitBranchAlias: true,
      deploymentHash: null,
      hostType: "git_branch_alias",
      host,
    };
  }
  const canonicalMatch = host.match(CANONICAL_HOST_PATTERN);
  if (canonicalMatch) {
    return {
      isCanonical: true,
      isUserAlias: false,
      isGitBranchAlias: false,
      deploymentHash: canonicalMatch[1],
      hostType: "canonical",
      host,
    };
  }
  return {
    isCanonical: false,
    isUserAlias: false,
    isGitBranchAlias: false,
    deploymentHash: null,
    hostType: "unknown",
    host,
  };
}

/**
 * Vercel API response から deploy meta を抽出。
 *
 * @param apiResponse - Vercel API v13 deployment response の任意 JSON
 * @returns DeployMetaParseResult
 *
 * isGitAttributed の判定条件 (全て true):
 *   - source === "github" (NOT "cli")
 *   - gitSource.ref が non-null
 *   - meta.githubCommitRef が non-null
 */
export function parseDeployMeta(apiResponse: unknown): DeployMetaParseResult {
  // unknown を defensively narrow
  const obj = (apiResponse ?? {}) as Record<string, unknown>;
  const meta = (obj.meta ?? {}) as Record<string, unknown>;
  const gitSource = (obj.gitSource ?? {}) as Record<string, unknown>;

  const source = typeof obj.source === "string" ? obj.source : null;
  const gitSourceRef = typeof gitSource.ref === "string" ? gitSource.ref : null;
  const gitCommitRef =
    typeof meta.githubCommitRef === "string"
      ? meta.githubCommitRef
      : typeof meta.gitlabCommitRef === "string"
        ? (meta.gitlabCommitRef as string)
        : null;
  const gitCommitSha =
    typeof meta.githubCommitSha === "string"
      ? meta.githubCommitSha
      : typeof meta.gitlabCommitSha === "string"
        ? (meta.gitlabCommitSha as string)
        : null;

  const isGitAttributed = source === "github" && gitSourceRef !== null && gitCommitRef !== null;

  return {
    meta: { source, gitSourceRef, gitCommitRef, gitCommitSha },
    isGitAttributed,
  };
}

/**
 * HTML bundle (text) から Supabase URL の project ref を抽出 (unique)。
 *
 * @param html - HTML bundle content
 * @returns project ref string[] (sorted unique)
 */
export function extractSupabaseRefs(html: string): readonly string[] {
  const refs = new Set<string>();
  const matches = html.matchAll(SUPABASE_URL_REGEX);
  for (const m of matches) {
    if (m[1]) refs.add(m[1]);
  }
  return Array.from(refs).sort();
}

/**
 * Gate 1: URL canonical-ness 判定
 *
 *   PASS: canonical URL のみ
 *   FAIL: user alias / git branch alias / unknown
 */
export function evaluateGate1Url(url: string): GateResult {
  const r = parseCanonicalUrl(url);
  if (r.isCanonical) {
    return {
      gate: 1,
      name: "URL canonical-ness",
      pass: true,
      reason: `canonical deployment URL (hash=${r.deploymentHash})`,
      evidence: { host: r.host, hostType: r.hostType, deploymentHash: r.deploymentHash },
    };
  }
  if (r.isUserAlias) {
    return {
      gate: 1,
      name: "URL canonical-ness",
      pass: false,
      reason: "user alias URL は smoke 本命にしない (Phase D-0 §5.2、複数 user-attributed deploy 間で奪い合い)",
      evidence: { host: r.host, hostType: r.hostType },
    };
  }
  if (r.isGitBranchAlias) {
    return {
      gate: 1,
      name: "URL canonical-ness",
      pass: false,
      reason: "git branch alias URL は補助用途、smoke 本命としては canonical を使う (Phase D-0 §5.2)",
      evidence: { host: r.host, hostType: r.hostType },
    };
  }
  return {
    gate: 1,
    name: "URL canonical-ness",
    pass: false,
    reason: "unknown URL pattern (canonical / user alias / git branch alias のいずれにも該当せず)",
    evidence: { host: r.host, hostType: r.hostType },
  };
}

/**
 * Gate 2: Deploy meta git attribution 判定
 *
 *   PASS: source=github + gitSource.ref === expectedBranch + meta.githubCommitRef === expectedBranch
 *   FAIL: いずれかが不適 (特に source=cli の場合 C-4 BLOCKED の root cause パターン)
 */
export function evaluateGate2Meta(apiResponse: unknown, expectedBranch: string): GateResult {
  const r = parseDeployMeta(apiResponse);
  const evidence = {
    source: r.meta.source,
    gitSourceRef: r.meta.gitSourceRef,
    gitCommitRef: r.meta.gitCommitRef,
    gitCommitSha: r.meta.gitCommitSha ? r.meta.gitCommitSha.slice(0, 12) : null,
    isGitAttributed: r.isGitAttributed,
  };

  if (r.meta.source === "cli") {
    return {
      gate: 2,
      name: "Deploy meta git attribution",
      pass: false,
      reason:
        "source=cli は git attribution を inject しない (C-4 BLOCKED の root cause)。" +
        "branch-scoped Preview env が build に到達しないため smoke 中止。" +
        "Phase D-0 §4.3 git-attributed deploy 経路 (.ts/.tsx 最小 trigger commit) で再 deploy。",
      evidence,
    };
  }
  if (r.meta.source !== "github") {
    return {
      gate: 2,
      name: "Deploy meta git attribution",
      pass: false,
      reason: `source は "github" であるべき (実際: ${r.meta.source ?? "null"})`,
      evidence,
    };
  }
  if (r.meta.gitSourceRef === null) {
    return {
      gate: 2,
      name: "Deploy meta git attribution",
      pass: false,
      reason: "gitSource.ref が null (git attribution 欠落、C-4 BLOCKED と同型)",
      evidence,
    };
  }
  if (r.meta.gitSourceRef !== expectedBranch) {
    return {
      gate: 2,
      name: "Deploy meta git attribution",
      pass: false,
      reason: `gitSource.ref mismatch — expected ${expectedBranch}, got ${r.meta.gitSourceRef}`,
      evidence,
    };
  }
  if (r.meta.gitCommitRef === null) {
    return {
      gate: 2,
      name: "Deploy meta git attribution",
      pass: false,
      reason: "meta.githubCommitRef が null (git attribution 欠落)",
      evidence,
    };
  }
  if (r.meta.gitCommitRef !== expectedBranch) {
    return {
      gate: 2,
      name: "Deploy meta git attribution",
      pass: false,
      reason: `meta.githubCommitRef mismatch — expected ${expectedBranch}, got ${r.meta.gitCommitRef}`,
      evidence,
    };
  }
  return {
    gate: 2,
    name: "Deploy meta git attribution",
    pass: true,
    reason: `git-attributed deploy (source=github, ref=${expectedBranch})`,
    evidence,
  };
}

/**
 * Gate 3: HTML bundle Supabase ref 判定
 *
 *   PASS: expectedRef 含有 + forbiddenRef 不在
 *   FAIL: いずれかが不適
 */
export function evaluateGate3SupabaseRefs(
  html: string,
  expectedRef: string,
  forbiddenRef: string,
): GateResult {
  const refs = extractSupabaseRefs(html);
  const evidence = { foundRefs: refs as string[], expectedRef, forbiddenRef };

  if (refs.length === 0) {
    return {
      gate: 3,
      name: "HTML bundle Supabase ref",
      pass: false,
      reason: "HTML bundle に Supabase URL が見つからない (env 未投入 / build 失敗 / fetch error)",
      evidence,
    };
  }
  if (refs.includes(forbiddenRef)) {
    return {
      gate: 3,
      name: "HTML bundle Supabase ref",
      pass: false,
      reason:
        `forbidden Supabase ref "${forbiddenRef}" が baked-in (C-4 BLOCKED の症状)。` +
        "all-preview env が resolve された可能性、smoke 中止。Phase D-0 §4 + §5 audit。",
      evidence,
    };
  }
  if (!refs.includes(expectedRef)) {
    return {
      gate: 3,
      name: "HTML bundle Supabase ref",
      pass: false,
      reason: `expected Supabase ref "${expectedRef}" が baked-in されていない (found: ${refs.join(", ")})`,
      evidence,
    };
  }
  return {
    gate: 3,
    name: "HTML bundle Supabase ref",
    pass: true,
    reason: `expected Supabase ref "${expectedRef}" detected、forbidden "${forbiddenRef}" absent`,
    evidence,
  };
}

/**
 * Gate 結果の human-readable text format。
 */
export function formatGateResult(g: GateResult): string {
  const icon = g.pass ? "✅" : "🔴";
  const status = g.pass ? "PASS" : "FAIL";
  const evJson = JSON.stringify(g.evidence, null, 2)
    .split("\n")
    .map((l) => "    " + l)
    .join("\n");
  return `${icon} Gate ${g.gate} [${status}] — ${g.name}\n  reason: ${g.reason}\n  evidence:\n${evJson}`;
}

/**
 * 全 gate 結果の verdict (1 つでも FAIL なら overall FAIL)
 */
export function overallVerdict(gates: readonly GateResult[]): { pass: boolean; failedGates: number[] } {
  const failed = gates.filter((g) => !g.pass).map((g) => g.gate);
  return { pass: failed.length === 0, failedGates: failed };
}

// =============================================================================
// CLI arg parsing
// =============================================================================

/**
 * `--key=value` 形式の argv を Record にする (pure)
 */
export function parseArgs(argv: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([a-z][a-z0-9-]*)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/**
 * Parsed argv → CliArgs validation (throws on missing required)
 */
export function validateCliArgs(parsed: Record<string, string>): CliArgs {
  const required = [
    "deployment-url",
    "deployment-id",
    "expected-branch",
    "expected-supabase",
    "forbidden-supabase",
  ];
  const missing = required.filter((k) => !parsed[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required args: ${missing.map((k) => `--${k}`).join(", ")}`);
  }
  return {
    deploymentUrl: parsed["deployment-url"],
    deploymentId: parsed["deployment-id"],
    expectedBranch: parsed["expected-branch"],
    expectedSupabaseRef: parsed["expected-supabase"],
    forbiddenSupabaseRef: parsed["forbidden-supabase"],
    vercelToken: parsed["vercel-token"],
  };
}

// =============================================================================
// Token resolution (effectful but no network)
// =============================================================================

/**
 * Vercel auth token 解決 (env var > macOS path > Linux path)
 * 値はメモリ外に出さない (return のみ、ログ出力しない)
 */
export function resolveVercelToken(envToken?: string): string | null {
  if (envToken) return envToken;
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;

  // macOS
  const macPath = join(homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json");
  if (existsSync(macPath)) {
    try {
      const json = JSON.parse(readFileSync(macPath, "utf8")) as { token?: string };
      if (typeof json.token === "string") return json.token;
    } catch {
      /* ignore */
    }
  }

  // Linux
  const linuxPath = join(homedir(), ".config", "vercel", "auth.json");
  if (existsSync(linuxPath)) {
    try {
      const json = JSON.parse(readFileSync(linuxPath, "utf8")) as { token?: string };
      if (typeof json.token === "string") return json.token;
    } catch {
      /* ignore */
    }
  }

  return null;
}

// =============================================================================
// Effectful I/O (HTTP GET only, no env / no deploy)
// =============================================================================

/**
 * Vercel API v13 deployment metadata fetch (read-only HTTP GET)
 */
async function fetchDeployMeta(deploymentId: string, token: string): Promise<unknown> {
  const url = `https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}?teamId=${VERCEL_TEAM_ID}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Vercel API fetch failed: HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Deployment HTML root fetch (read-only HTTP GET、follow redirects)
 */
async function fetchHtmlBundle(deploymentUrl: string): Promise<string> {
  const res = await fetch(deploymentUrl, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTML fetch failed: HTTP ${res.status}`);
  }
  return res.text();
}

// =============================================================================
// Main runner (effectful)
// =============================================================================

export async function runVerification(args: CliArgs): Promise<number> {
  const token = resolveVercelToken(args.vercelToken);

  console.log("===========================================================");
  console.log("  CoAlter D-1 Canary Deploy Verification");
  console.log("===========================================================");
  console.log(`  deployment URL    : ${args.deploymentUrl}`);
  console.log(`  deployment ID     : ${args.deploymentId}`);
  console.log(`  expected branch   : ${args.expectedBranch}`);
  console.log(`  expected Supabase : ${args.expectedSupabaseRef}`);
  console.log(`  forbidden Supabase: ${args.forbiddenSupabaseRef}`);
  console.log("===========================================================\n");

  // Gate 1
  const g1 = evaluateGate1Url(args.deploymentUrl);
  console.log(formatGateResult(g1));
  console.log("");
  if (!g1.pass) {
    console.log("🔴 Gate 1 FAIL — 後続 gate skip、smoke 中止");
    return 1;
  }

  // Gate 2
  if (!token) {
    console.log("🔴 Vercel token が解決できない (--vercel-token / VERCEL_TOKEN env / ~/.config/vercel/auth.json いずれもなし)");
    return 1;
  }
  let g2: GateResult;
  try {
    const apiJson = await fetchDeployMeta(args.deploymentId, token);
    g2 = evaluateGate2Meta(apiJson, args.expectedBranch);
  } catch (e) {
    g2 = {
      gate: 2,
      name: "Deploy meta git attribution",
      pass: false,
      reason: `Vercel API fetch error: ${(e as Error).message}`,
      evidence: { error: (e as Error).message },
    };
  }
  console.log(formatGateResult(g2));
  console.log("");
  if (!g2.pass) {
    console.log("🔴 Gate 2 FAIL — Gate 3 skip、smoke 中止");
    return 1;
  }

  // Gate 3
  let g3: GateResult;
  try {
    const html = await fetchHtmlBundle(args.deploymentUrl);
    g3 = evaluateGate3SupabaseRefs(html, args.expectedSupabaseRef, args.forbiddenSupabaseRef);
  } catch (e) {
    g3 = {
      gate: 3,
      name: "HTML bundle Supabase ref",
      pass: false,
      reason: `HTML fetch error: ${(e as Error).message}`,
      evidence: { error: (e as Error).message },
    };
  }
  console.log(formatGateResult(g3));
  console.log("");

  const verdict = overallVerdict([g1, g2, g3]);
  console.log("===========================================================");
  if (verdict.pass) {
    console.log("🟢 ALL GATES PASS — smoke 開始可能");
    console.log(`   canonical URL: ${args.deploymentUrl}`);
    console.log("===========================================================");
    return 0;
  }
  console.log(`🔴 OVERALL FAIL — failed gates: ${verdict.failedGates.join(", ")}`);
  console.log("   smoke 中止。Phase D-0 §4 + §5 audit 実施。");
  console.log("===========================================================");
  return 1;
}

// =============================================================================
// CLI entry (only when invoked directly)
// =============================================================================

// process.argv[1] is the script path when invoked via `npx tsx scripts/.../foo.ts`
// or `node --import tsx/esm scripts/.../foo.ts`
const isDirectInvocation =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("verify-canary-deploy.ts") ||
    process.argv[1].endsWith("verify-canary-deploy.mjs"));

if (isDirectInvocation) {
  void (async () => {
    try {
      const parsed = parseArgs(process.argv.slice(2));
      const args = validateCliArgs(parsed);
      const exitCode = await runVerification(args);
      process.exit(exitCode);
    } catch (e) {
      console.error(`CLI error: ${(e as Error).message}`);
      console.error("");
      console.error("Usage:");
      console.error("  npx tsx scripts/coalter/verify-canary-deploy.ts \\");
      console.error("    --deployment-url=https://culcept-<hash>-taishis-projects-0a8deb17.vercel.app \\");
      console.error("    --deployment-id=dpl_<id> \\");
      console.error("    --expected-branch=chore/coalter-mirror-c<N>-canary \\");
      console.error("    --expected-supabase=aljavfujeqcwnqryjmhl \\");
      console.error("    --forbidden-supabase=hjcrvndumgiovyfdacwc");
      process.exit(2);
    }
  })();
}
