#!/usr/bin/env tsx
/**
 * Life Ops — A-4-c17b Operator Dogfood Exact Cleanup（**check→confirm 二段・1 行限定・広範囲 DELETE 禁止**）
 *
 * 役割: CEO operator dogfood（UI から accept|later|dismiss を 1 回）で書かれた **lifeops 行 1 件だけ**を
 *   exact 条件で削除して 0 に戻す。既定は **check-only**（削除しない・counts/handle のみ表示）。
 *   実削除は LIFEOPS_DOGFOOD_CLEANUP_CONFIRM=1 を追加した時だけ。
 *
 * exact 条件（GPT c17b 指定の最小集合 + 実測 handle の完全一致）:
 *   owner-RLS（dedicated test user で sign-in）∧ handle LIKE 'lifeops:%' ∧ source_kind='lifeops'
 *   ∧ action=対象 action（accept|later|dismiss・**done は拒否**）∧ acted_at >= 窓開始（既定 now-6h）
 *   → 一致 1 件のときのみ、その実測 handle に **eq 完全一致**で DELETE。0 件=何もしない（冪等 PASS）。
 *   2 件以上=**削除せず停止**（CEO 判断へ）。
 *
 * 実行（check）: LIFEOPS_DOGFOOD_CLEANUP_GO=1 NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-feedback-dogfood-cleanup.ts
 * 実行（delete）: 上記 + LIFEOPS_DOGFOOD_CLEANUP_CONFIRM=1
 * 任意: LIFEOPS_DOGFOOD_ACTION=later（既定）| accept | dismiss / LIFEOPS_DOGFOOD_SINCE_ISO=<ISO>（既定 now-6h）
 *
 * 安全: staging allowlist(hjcr…)・本番 denylist(aljav…) fatal・service_role fatal・GO 必須・
 *   log は counts/handle（辞書 enum のみ＝非 PII）/boolean のみ（full row/user_id/raw 非出力）。
 */

import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { PRM_LEARNING_EVENTS_TABLE } from "@/lib/plan/reality/learning/supabase-prm-learning-event-repository";

loadDotenv({ path: ".env.local" });

function fatal(r: string): never { console.error(`\n❌ FATAL: ${r}\n`); process.exit(1); }
function log(m: string): void { console.log(m); }
function ok(c: boolean, l: string): boolean { log(`${c ? "✅" : "❌"} ${l}`); return c; }

const GO = process.env.LIFEOPS_DOGFOOD_CLEANUP_GO === "1";
const CONFIRM = process.env.LIFEOPS_DOGFOOD_CLEANUP_CONFIRM === "1";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PROJECT_REF = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
const EMAIL = process.env.STAGING_USER_A_EMAIL ?? "";
const PASSWORD = process.env.STAGING_USER_A_PASSWORD ?? "";
const ACTION = process.env.LIFEOPS_DOGFOOD_ACTION ?? "later";
const SINCE_ISO = process.env.LIFEOPS_DOGFOOD_SINCE_ISO ?? new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

function preflight(): void {
  if (!GO) fatal("GO 未設定（LIFEOPS_DOGFOOD_CLEANUP_GO=1）。");
  if (process.env.NODE_ENV === "production") fatal("NODE_ENV=production 不可。");
  if (!["accept", "later", "dismiss"].includes(ACTION)) fatal(`action='${ACTION}' は対象外（accept|later|dismiss のみ・done は c17b 対象外）。`);
  if (Number.isNaN(Date.parse(SINCE_ISO))) fatal("LIFEOPS_DOGFOOD_SINCE_ISO が不正 ISO。");
  for (const [k, v] of [["URL", SB_URL], ["ANON", SB_ANON], ["REF", PROJECT_REF], ["EMAIL", EMAIL], ["PW", PASSWORD]]) if (!v) fatal(`Missing ${k}`);
  if (/service_role/i.test(SB_ANON)) fatal("anon key に service_role 混入。");
  if (PROJECT_REF === PRODUCTION_PROJECT_REF) fatal("PRODUCTION GUARD: ref 本番。");
  if (PROJECT_REF !== STAGING_PROJECT_REF) fatal(`STAGING GUARD: ref が ${STAGING_PROJECT_REF} でない。`);
  let host = "";
  try { host = new URL(SB_URL).host.toLowerCase(); } catch { fatal("URL 不正。"); }
  const ref = host.match(/^([a-z0-9]+)\.supabase\.(co|in)$/)?.[1];
  if (ref === PRODUCTION_PROJECT_REF) fatal("PRODUCTION GUARD: host 本番。");
  if (ref !== STAGING_PROJECT_REF) fatal("STAGING GUARD: host ref 不一致。");
  log(`▶ target = staging host ${host}（c17b dogfood cleanup・action=${ACTION}・since=${SINCE_ISO}・mode=${CONFIRM ? "DELETE" : "check-only"}）`);
}

async function countLifeops(sb: ReturnType<typeof createClient>): Promise<number> {
  const res = await sb.from(PRM_LEARNING_EVENTS_TABLE).select("handle", { count: "exact", head: true }).like("handle", "lifeops:%");
  if (res.error) fatal(`count 失敗: ${res.error.message}`);
  return res.count ?? 0;
}

async function main(): Promise<void> {
  preflight();

  const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: e } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (e || !auth.user) fatal(`sign-in 失敗: ${e?.message ?? "no user"}`);
  log(`▶ signed in（dedicated test user・id 末尾4=…${auth.user.id.slice(-4)}）`);

  const beforeLifeops = await countLifeops(sb);
  log(`▶ before: lifeops_prefix=${beforeLifeops}`);

  // 対象行の特定（exact 条件・owner-RLS 内・handle は辞書 enum のみ＝非 PII で表示可）
  const sel = await sb
    .from(PRM_LEARNING_EVENTS_TABLE)
    .select("handle, acted_at")
    .like("handle", "lifeops:%")
    .eq("source_kind", "lifeops")
    .eq("action", ACTION)
    .gte("acted_at", SINCE_ISO);
  if (sel.error) fatal(`select 失敗: ${sel.error.message}`);
  const rows = (sel.data ?? []) as { handle: string }[];
  log(`▶ matched（lifeops:% ∧ source_kind=lifeops ∧ action=${ACTION} ∧ acted_at≥since）: ${rows.length} 件 ${rows.map((r) => r.handle).join(", ")}`);

  if (rows.length === 0) {
    log("\n✅ PASS — 対象 0 件（cleanup 不要・冪等）。");
    await sb.auth.signOut();
    process.exit(0);
  }
  if (rows.length > 1) {
    fatal(`対象が ${rows.length} 件（期待 1）→ 広範囲 DELETE 禁止につき**削除せず停止**。CEO 判断へ。`);
  }

  const handle = rows[0].handle;
  if (!CONFIRM) {
    log(`\n✅ CHECK PASS — 対象 1 件（handle=${handle}）。削除するには LIFEOPS_DOGFOOD_CLEANUP_CONFIRM=1 を付けて再実行。`);
    await sb.auth.signOut();
    process.exit(0);
  }

  // DELETE（実測 handle 完全一致 + 全条件・owner-RLS 内・1 件限定確認済み）
  const del = await sb
    .from(PRM_LEARNING_EVENTS_TABLE)
    .delete()
    .eq("handle", handle)
    .eq("source_kind", "lifeops")
    .eq("action", ACTION)
    .gte("acted_at", SINCE_ISO);
  if (del.error) fatal(`delete 失敗: ${del.error.message}（残存条件: handle='${handle}' ∧ source_kind='lifeops' ∧ action='${ACTION}'）`);

  const afterLifeops = await countLifeops(sb);
  let pass = true;
  pass = ok(afterLifeops === 0, `after: lifeops_prefix=0（実測 ${afterLifeops}）`) && pass;
  pass = ok(beforeLifeops - afterLifeops === 1, `削除は 1 件のみ（before ${beforeLifeops} → after ${afterLifeops}）`) && pass;
  log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — c17b dogfood cleanup（exact 1 行・production 0・PII log 0）`);
  await sb.auth.signOut();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => fatal(`unexpected: ${err instanceof Error ? err.message : String(err)}`));
