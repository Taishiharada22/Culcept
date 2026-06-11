#!/usr/bin/env tsx
/**
 * Life Ops — A-4-c33b Structured Source Dogfood Cleanup（**check→confirm 二段・exact 条件・広範囲 DELETE 禁止**）
 *
 * 役割: CEO operator smoke（UI 登録入口）で作られた structured source 行を exact 条件で削除して 0 に戻す。
 *   既定は **check-only**（削除しない・counts/occurrence_key[辞書+日付=非 PII] のみ表示）。
 *   実削除は LIFEOPS_STRUCTURED_CLEANUP_CONFIRM=1 の時だけ。
 *
 * exact 条件: owner-RLS（dedicated test user）∧ source_type=対象（既定 deadline）∧ category_id=対象（既定 tax_filing）
 *   ∧ status='active'。一致が 1〜MAX_DELETE（既定 2）件のときのみ削除。0 件=冪等 PASS・超過=削除せず停止（CEO 判断へ）。
 *
 * 実行（check）: LIFEOPS_STRUCTURED_CLEANUP_GO=1 NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-structured-dogfood-cleanup.ts
 * 実行（delete）: 上記 + LIFEOPS_STRUCTURED_CLEANUP_CONFIRM=1
 * 任意: LIFEOPS_STRUCTURED_CLEANUP_CATEGORY=tax_filing（既定）/ LIFEOPS_STRUCTURED_CLEANUP_MAX=2（既定）
 *
 * 安全: staging allowlist(hjcr…)・本番 denylist(aljav…) fatal・service_role fatal・GO 必須・
 *   log は counts/occurrence_key/boolean のみ（full row/user_id/id/raw 非出力）。
 */

import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { LIFEOPS_STRUCTURED_SOURCES_TABLE } from "@/lib/plan/reality/lifeops/lifeops-structured-storage";

loadDotenv({ path: ".env.local" });

function fatal(r: string): never { console.error(`\n❌ FATAL: ${r}\n`); process.exit(1); }
function log(m: string): void { console.log(m); }
function ok(c: boolean, l: string): boolean { log(`${c ? "✅" : "❌"} ${l}`); return c; }

const GO = process.env.LIFEOPS_STRUCTURED_CLEANUP_GO === "1";
const CONFIRM = process.env.LIFEOPS_STRUCTURED_CLEANUP_CONFIRM === "1";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PROJECT_REF = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
const EMAIL = process.env.STAGING_USER_A_EMAIL ?? "";
const PASSWORD = process.env.STAGING_USER_A_PASSWORD ?? "";
const CATEGORY = process.env.LIFEOPS_STRUCTURED_CLEANUP_CATEGORY ?? "tax_filing";
const SOURCE_TYPE = process.env.LIFEOPS_STRUCTURED_CLEANUP_TYPE ?? "deadline"; // A-4-c34: deadline|cadence
const MAX_DELETE = Number(process.env.LIFEOPS_STRUCTURED_CLEANUP_MAX ?? "2");

function preflight(): void {
  if (!GO) fatal("GO 未設定（LIFEOPS_STRUCTURED_CLEANUP_GO=1）。");
  if (process.env.NODE_ENV === "production") fatal("NODE_ENV=production 不可。");
  if (!/^[a-z_]+$/.test(CATEGORY)) fatal("CATEGORY 不正（辞書 id 形式のみ）。");
  if (!["deadline", "cadence"].includes(SOURCE_TYPE)) fatal("TYPE 不正（deadline|cadence）。");
  if (!Number.isInteger(MAX_DELETE) || MAX_DELETE < 1 || MAX_DELETE > 5) fatal("MAX 不正（1..5）。");
  for (const [k, v] of [["URL", SB_URL], ["ANON", SB_ANON], ["REF", PROJECT_REF], ["EMAIL", EMAIL], ["PW", PASSWORD]]) if (!v) fatal(`Missing ${k}`);
  if (/service_role/i.test(SB_ANON)) fatal("anon key に service_role 混入。");
  if (PROJECT_REF === PRODUCTION_PROJECT_REF) fatal("PRODUCTION GUARD: ref 本番。");
  if (PROJECT_REF !== STAGING_PROJECT_REF) fatal(`STAGING GUARD: ref が ${STAGING_PROJECT_REF} でない。`);
  let host = "";
  try { host = new URL(SB_URL).host.toLowerCase(); } catch { fatal("URL 不正。"); }
  const ref = host.match(/^([a-z0-9]+)\.supabase\.(co|in)$/)?.[1];
  if (ref === PRODUCTION_PROJECT_REF) fatal("PRODUCTION GUARD: host 本番。");
  if (ref !== STAGING_PROJECT_REF) fatal("STAGING GUARD: host ref 不一致。");
  log(`▶ target = staging host ${host}（c33b structured cleanup・type=${SOURCE_TYPE}・category=${CATEGORY}・mode=${CONFIRM ? "DELETE" : "check-only"}・max=${MAX_DELETE}）`);
}

async function main(): Promise<void> {
  preflight();
  const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: e } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (e || !auth.user) fatal(`sign-in 失敗: ${e?.message ?? "no user"}`);
  log(`▶ signed in（dedicated test user・id 末尾4=…${auth.user.id.slice(-4)}）`);

  const totalRes = await sb.from(LIFEOPS_STRUCTURED_SOURCES_TABLE).select("source_type", { count: "exact", head: true });
  if (totalRes.error) fatal(`count 失敗: ${totalRes.error.message}`);
  log(`▶ before: structured_total=${totalRes.count ?? 0}`);

  const sel = await sb
    .from(LIFEOPS_STRUCTURED_SOURCES_TABLE)
    .select("occurrence_key")
    .eq("source_type", SOURCE_TYPE)
    .eq("category_id", CATEGORY)
    .eq("status", "active");
  if (sel.error) fatal(`select 失敗: ${sel.error.message}`);
  const rows = (sel.data ?? []) as { occurrence_key: string | null }[];
  log(`▶ matched（${SOURCE_TYPE} ∧ ${CATEGORY} ∧ active）: ${rows.length} 件 ${rows.map((r) => r.occurrence_key ?? "(null)").join(", ")}`);

  if (rows.length === 0) {
    log("\n✅ PASS — 対象 0 件（cleanup 不要・冪等）。");
    await sb.auth.signOut();
    process.exit(0);
  }
  if (rows.length > MAX_DELETE) fatal(`対象が ${rows.length} 件（上限 ${MAX_DELETE}）→ 削除せず停止（CEO 判断へ）。`);
  if (!CONFIRM) {
    log(`\n✅ CHECK PASS — 対象 ${rows.length} 件。削除するには LIFEOPS_STRUCTURED_CLEANUP_CONFIRM=1 を付けて再実行。`);
    await sb.auth.signOut();
    process.exit(0);
  }

  const del = await sb
    .from(LIFEOPS_STRUCTURED_SOURCES_TABLE)
    .delete()
    .eq("source_type", SOURCE_TYPE)
    .eq("category_id", CATEGORY)
    .eq("status", "active");
  if (del.error) fatal(`delete 失敗: ${del.error.message}`);

  const afterRes = await sb.from(LIFEOPS_STRUCTURED_SOURCES_TABLE).select("source_type", { count: "exact", head: true });
  const after = afterRes.count ?? 0;
  let pass = true;
  pass = ok(after === (totalRes.count ?? 0) - rows.length, `削除は ${rows.length} 件のみ（total ${totalRes.count} → ${after}）`) && pass;
  log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — c33b structured cleanup（exact・production 0・PII log 0）`);
  await sb.auth.signOut();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => fatal(`unexpected: ${err instanceof Error ? err.message : String(err)}`));
