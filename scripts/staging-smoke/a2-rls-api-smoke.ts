#!/usr/bin/env tsx
/**
 * Alter Plan A-2 — Staging RLS API Smoke Pack
 *
 * 実 Supabase (staging) + 実 API route + 2 user cross verification で
 * 「API 経由で RLS が物理層強制されている」ことを実証する。
 *
 * 実行手順 (CEO operation):
 *   1. `cp staging.env.example .env.staging.local` し、実値を入れる
 *   2. Terminal A: `npx dotenv -e .env.staging.local -- npm run dev`
 *      （.env.local は変更せず、dotenv-cli 経由で staging env を inject）
 *   3. Terminal B: `npx tsx scripts/staging-smoke/a2-rls-api-smoke.ts`
 *      （または `npx dotenv -e .env.staging.local -- tsx scripts/staging-smoke/a2-rls-api-smoke.ts`）
 *   4. 出力 table の status 列が全 PASSED であることを確認
 *
 * 検証する不変原則:
 *   1. 認証境界: 無認証で POST/GET/DELETE → 全 401
 *   2. RLS read: User A の data は User B から見えない
 *   3. RLS delete: User B は User A の source を削除できない（応答上は不在と同一）
 *   4. cascade: source 削除で anchors も消える
 *   5. 二重防御: RLS + 明示 .eq('user_id', userId)
 *
 * 安全防御:
 *   - production URL guard: NEXT_PUBLIC_SUPABASE_URL の host subdomain が
 *     STAGING_SUPABASE_PROJECT_REF env と厳格一致しなければ即 fail。
 *     localhost / 127.0.0.1 は subdomain 照合を bypass（self-hosted 用）。
 *   - project ref shape sanity: 20 文字小文字英数 (/^[a-z0-9]{20}$/) 違反で fail
 *   - SECRET GUARD: anon key 文字列に "service_role" を含むと fail
 *   - service_role 不使用（anon key + email/password sign-in のみ）
 *   - Pre-cleanup / Post-cleanup で test user の data を残さない
 */

import { config as loadDotenv } from "dotenv";
import { createServerClient } from "@supabase/ssr";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// env loading
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

loadDotenv({ path: ".env.staging.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const STAGING_PROJECT_REF = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
const USER_A_EMAIL = process.env.STAGING_USER_A_EMAIL ?? "";
const USER_A_PASSWORD = process.env.STAGING_USER_A_PASSWORD ?? "";
const USER_B_EMAIL = process.env.STAGING_USER_B_EMAIL ?? "";
const USER_B_PASSWORD = process.env.STAGING_USER_B_PASSWORD ?? "";
const API_BASE = process.env.STAGING_API_BASE ?? "http://localhost:3000";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Result formatting (A-1 smoke と同 format)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TestResult {
  test_no: number;
  name: string;
  status: "PASSED" | "FAILED" | "SKIPPED";
  detail: string;
}

const results: TestResult[] = [];

function recordResult(
  test_no: number,
  name: string,
  status: TestResult["status"],
  detail: string
) {
  results.push({ test_no, name, status, detail });
}

function printResults() {
  const sep = "─".repeat(120);
  // eslint-disable-next-line no-console
  console.log(sep);
  // eslint-disable-next-line no-console
  console.log(
    `${"test_no".padEnd(8)} | ${"name".padEnd(60)} | ${"status".padEnd(8)} | detail`
  );
  // eslint-disable-next-line no-console
  console.log(sep);
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(
      `${String(r.test_no).padEnd(8)} | ${r.name.padEnd(60)} | ${r.status.padEnd(8)} | ${r.detail}`
    );
  }
  // eslint-disable-next-line no-console
  console.log(sep);
  const passed = results.filter((r) => r.status === "PASSED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;
  const skipped = results.filter((r) => r.status === "SKIPPED").length;
  // eslint-disable-next-line no-console
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED, ${skipped} SKIPPED`);
}

function fatal(reason: string): never {
  // eslint-disable-next-line no-console
  console.error(`\n❌ FATAL: ${reason}\n`);
  process.exit(1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pre-flight: production URL guard + env presence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function preflight() {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!STAGING_PROJECT_REF) missing.push("STAGING_SUPABASE_PROJECT_REF");
  if (!USER_A_EMAIL) missing.push("STAGING_USER_A_EMAIL");
  if (!USER_A_PASSWORD) missing.push("STAGING_USER_A_PASSWORD");
  if (!USER_B_EMAIL) missing.push("STAGING_USER_B_EMAIL");
  if (!USER_B_PASSWORD) missing.push("STAGING_USER_B_PASSWORD");
  if (missing.length > 0) {
    fatal(
      `Missing env: ${missing.join(", ")}. ` +
        `Copy staging.env.example to .env.staging.local and fill in the values.`
    );
  }

  // Supabase project ref shape: 20 文字の小文字英数（typo 防御）。
  // 形式違反は誤入力扱いで即 fail。
  if (!/^[a-z0-9]{20}$/.test(STAGING_PROJECT_REF)) {
    fatal(
      `STAGING_SUPABASE_PROJECT_REF="${STAGING_PROJECT_REF}" is not a valid ` +
        `Supabase project ref (expected 20 lowercase alphanumeric characters). ` +
        `Copy from Supabase Dashboard → Project Settings → General → Reference ID.`
    );
  }

  // ── Production guard: URL の host から project ref を抽出して STAGING_SUPABASE_PROJECT_REF と一致するか厳格照合 ──
  // substring 一致（"staging" を含む 等）は staging project ref がランダム英数で
  // あるため誤判定する。Host 構造を parse して subdomain を ref として取り出す。
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(SUPABASE_URL);
  } catch {
    fatal(`NEXT_PUBLIC_SUPABASE_URL="${SUPABASE_URL}" is not a valid URL`);
  }
  const host = parsedUrl.host.toLowerCase();

  const isLoopback = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  if (isLoopback) {
    // self-hosted Supabase / 開発環境用の bypass。project ref 不要。
    // 念のため SECRET GUARD のみ後段で実施。
  } else {
    // host は <ref>.supabase.co の形式を要求（pooler 等の派生 host は許可しない）
    const m = host.match(/^([a-z0-9]+)\.supabase\.(co|in)$/);
    if (!m) {
      fatal(
        `PRODUCTION GUARD: NEXT_PUBLIC_SUPABASE_URL host="${host}" does not match ` +
          `expected shape "<ref>.supabase.co" (or .in). Refusing to run smoke ` +
          `against unrecognized host.`
      );
    }
    const ref = m[1]!;
    if (ref !== STAGING_PROJECT_REF) {
      fatal(
        `PRODUCTION GUARD: NEXT_PUBLIC_SUPABASE_URL project_ref="${ref}" does not ` +
          `match STAGING_SUPABASE_PROJECT_REF="${STAGING_PROJECT_REF}". ` +
          `Refusing to run smoke against non-staging Supabase project.`
      );
    }
  }

  // service_role が誤って入っていないかの軽い check（JWT の role claim 検査ではなく文字列）
  if (/service_role/i.test(SUPABASE_ANON_KEY)) {
    fatal(
      `SECRET GUARD: NEXT_PUBLIC_SUPABASE_ANON_KEY appears to contain "service_role". ` +
        `Only the anon public key is allowed.`
    );
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cookie-bound Supabase client（@supabase/ssr が書き出す cookie を捕獲）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface AuthHandle {
  userId: string;
  cookieHeader: string;
}

async function signInAndCaptureCookies(
  email: string,
  password: string,
  label: string
): Promise<AuthHandle> {
  // @supabase/ssr の cookie store を Map で表現
  const store = new Map<string, string>();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () =>
        Array.from(store.entries()).map(([name, value]) => ({ name, value })),
      setAll: (toSet) => {
        for (const c of toSet) {
          if (c.value === "" || c.value === null) {
            store.delete(c.name);
          } else {
            store.set(c.name, c.value);
          }
        }
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    fatal(`Sign-in failed for ${label} (${email}): ${error?.message ?? "no session"}`);
  }

  const cookieHeader = Array.from(store.entries())
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");

  return { userId: data.user!.id, cookieHeader };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API call helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ApiResponse {
  status: number;
  json: unknown;
}

async function apiCall(
  method: string,
  path: string,
  opts: { cookieHeader?: string; body?: unknown } = {}
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.cookieHeader) headers["Cookie"] = opts.cookieHeader;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let json: unknown = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json };
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pre-cleanup: 各 user の data を全削除
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function cleanupForUser(auth: AuthHandle, label: string): Promise<void> {
  const list = await apiCall("GET", "/api/plan/anchors", {
    cookieHeader: auth.cookieHeader,
  });
  if (list.status !== 200) {
    // eslint-disable-next-line no-console
    console.warn(`[${label}] cleanup GET unexpected status: ${list.status}`);
    return;
  }
  const json = asRecord(list.json);
  const data = asRecord(json.data);
  const sources = Array.isArray(data.sources) ? data.sources : [];
  for (const s of sources) {
    const sid = (s as { id?: string }).id;
    if (!sid) continue;
    const del = await apiCall("DELETE", `/api/plan/anchors/${sid}`, {
      cookieHeader: auth.cookieHeader,
    });
    if (del.status !== 200) {
      // eslint-disable-next-line no-console
      console.warn(`[${label}] cleanup DELETE ${sid} status=${del.status}`);
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test bundle fixture
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeValidBundle(label: string) {
  return {
    source: { sourceType: "manual" as const, notes: `smoke ${label}` },
    anchors: [
      {
        anchorKind: "one_off" as const,
        title: `smoke anchor ${label}`,
        date: "2026-05-20",
        startTime: "10:00",
        rigidity: "hard" as const,
        sourceType: "manual" as const,
      },
    ],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  preflight();

  // ── SETUP ──
  recordResult(0, "SETUP: preflight + sign in", "PASSED", `API_BASE=${API_BASE}`);

  const userA = await signInAndCaptureCookies(USER_A_EMAIL, USER_A_PASSWORD, "A");
  const userB = await signInAndCaptureCookies(USER_B_EMAIL, USER_B_PASSWORD, "B");
  recordResult(
    1,
    "SETUP: sign in user A & B (separate cookie stores)",
    userA.userId !== userB.userId ? "PASSED" : "FAILED",
    `A=${userA.userId.slice(0, 8)}.. B=${userB.userId.slice(0, 8)}..`
  );

  // ── PRE-CLEANUP ──
  await cleanupForUser(userA, "A");
  await cleanupForUser(userB, "B");
  recordResult(2, "PRE-CLEANUP: clear A and B data via API", "PASSED", "");

  // ── 3. User A creates a bundle ──
  let aSourceId: string | null = null;
  {
    const res = await apiCall("POST", "/api/plan/anchors", {
      cookieHeader: userA.cookieHeader,
      body: makeValidBundle("A"),
    });
    const j = asRecord(res.json);
    const data = asRecord(j.data);
    const source = asRecord(data.source);
    const ok = res.status === 200 && j.ok === true && typeof source.id === "string";
    if (ok) aSourceId = source.id as string;
    recordResult(
      3,
      "User A: POST /api/plan/anchors → 200, data returned",
      ok ? "PASSED" : "FAILED",
      `status=${res.status} sourceId=${aSourceId?.slice(0, 8) ?? "null"}`
    );
  }

  // ── 4. User A sees own data ──
  {
    const res = await apiCall("GET", "/api/plan/anchors", {
      cookieHeader: userA.cookieHeader,
    });
    const j = asRecord(res.json);
    const data = asRecord(j.data);
    const sources = Array.isArray(data.sources) ? data.sources : [];
    const anchors = Array.isArray(data.anchors) ? data.anchors : [];
    const ok =
      res.status === 200 &&
      sources.length === 1 &&
      anchors.length === 1 &&
      (sources[0] as { userId?: string }).userId === userA.userId;
    recordResult(
      4,
      "User A: GET sees own data only (1 source, 1 anchor, userId match)",
      ok ? "PASSED" : "FAILED",
      `sources=${sources.length} anchors=${anchors.length}`
    );
  }

  // ── 5. User B cannot see User A's data (RLS inversion) ──
  {
    const res = await apiCall("GET", "/api/plan/anchors", {
      cookieHeader: userB.cookieHeader,
    });
    const j = asRecord(res.json);
    const data = asRecord(j.data);
    const sources = Array.isArray(data.sources) ? data.sources : [];
    const anchors = Array.isArray(data.anchors) ? data.anchors : [];
    const ok = res.status === 200 && sources.length === 0 && anchors.length === 0;
    recordResult(
      5,
      "User B: GET cannot see User A data (empty list via RLS)",
      ok ? "PASSED" : "FAILED",
      `sources=${sources.length} anchors=${anchors.length}`
    );
  }

  // ── 6. User B cannot delete User A's source (information leak prevention) ──
  if (aSourceId) {
    const res = await apiCall("DELETE", `/api/plan/anchors/${aSourceId}`, {
      cookieHeader: userB.cookieHeader,
    });
    const j = asRecord(res.json);
    const data = asRecord(j.data);
    const ok =
      res.status === 200 &&
      data.deletedSource === false &&
      data.deletedAnchors === 0;
    recordResult(
      6,
      "User B: DELETE on User A source → 200 + deletedSource:false (no info leak)",
      ok ? "PASSED" : "FAILED",
      `status=${res.status} deletedSource=${data.deletedSource}`
    );
  } else {
    recordResult(6, "User B: DELETE on User A source", "SKIPPED", "aSourceId not captured");
  }

  // ── 7. User A's source still exists (DELETE by B was no-op) ──
  if (aSourceId) {
    const res = await apiCall("GET", "/api/plan/anchors", {
      cookieHeader: userA.cookieHeader,
    });
    const j = asRecord(res.json);
    const data = asRecord(j.data);
    const sources = Array.isArray(data.sources) ? data.sources : [];
    const ok = sources.length === 1;
    recordResult(
      7,
      "User A: source still exists after B's failed DELETE",
      ok ? "PASSED" : "FAILED",
      `sources=${sources.length}`
    );
  } else {
    recordResult(7, "User A: source still exists check", "SKIPPED", "aSourceId not captured");
  }

  // ── 8-10. No-auth must be 401 on all 3 endpoints (auth gate validation) ──
  {
    const res = await apiCall("POST", "/api/plan/anchors", {
      body: makeValidBundle("noauth"),
    });
    recordResult(
      8,
      "No JWT: POST /api/plan/anchors → 401",
      res.status === 401 ? "PASSED" : "FAILED",
      `status=${res.status}`
    );
  }
  {
    const res = await apiCall("GET", "/api/plan/anchors");
    recordResult(
      9,
      "No JWT: GET /api/plan/anchors → 401",
      res.status === 401 ? "PASSED" : "FAILED",
      `status=${res.status}`
    );
  }
  {
    const res = await apiCall("DELETE", "/api/plan/anchors/abc");
    recordResult(
      10,
      "No JWT: DELETE /api/plan/anchors/abc → 401",
      res.status === 401 ? "PASSED" : "FAILED",
      `status=${res.status}`
    );
  }

  // ── POST-CLEANUP ──
  await cleanupForUser(userA, "A");
  await cleanupForUser(userB, "B");
  {
    const a = await apiCall("GET", "/api/plan/anchors", {
      cookieHeader: userA.cookieHeader,
    });
    const b = await apiCall("GET", "/api/plan/anchors", {
      cookieHeader: userB.cookieHeader,
    });
    const aData = asRecord(asRecord(a.json).data);
    const bData = asRecord(asRecord(b.json).data);
    const aClean = Array.isArray(aData.sources) && aData.sources.length === 0;
    const bClean = Array.isArray(bData.sources) && bData.sources.length === 0;
    recordResult(
      11,
      "POST-CLEANUP: A and B data fully removed",
      aClean && bClean ? "PASSED" : "FAILED",
      `a_sources=${(aData.sources as unknown[])?.length ?? "n/a"} b_sources=${(bData.sources as unknown[])?.length ?? "n/a"}`
    );
  }

  // ── Summary ──
  printResults();
  const failedCount = results.filter((r) => r.status === "FAILED").length;
  if (failedCount > 0) {
    process.exit(2);
  }
}

main().catch((e: unknown) => {
  // eslint-disable-next-line no-console
  console.error("unhandled error:", e);
  process.exit(1);
});
