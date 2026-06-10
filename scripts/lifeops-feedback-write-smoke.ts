#!/usr/bin/env tsx
/**
 * Life Ops — A-4-c12 1-row Staging Write Smoke（**insert 1 行のみ→read-after-write→cleanup→0**・production 0）
 *
 * 役割: A-4-c9 writer を **初めて実 staging DB に 1 件だけ**通し、A-4-c8 reader chain で read-after-write
 *   （lifeops_prefix=1 / observations=1 / parse OK）を確認し、**当該 1 行だけ**を cleanup して 0 に戻す。
 *   row = `lifeops:beauty_salon:cut` / action=accept / signal=adoption / source_kind=lifeops
 *   （done でない理由は c9 doc §9: writer contract が accept|dismiss|later・c8 は done を drop する lock 済み）。
 *
 * 実行: LIFEOPS_FEEDBACK_WRITE_SMOKE_GO=1 LIFEOPS_REALDATA_READONLY=true LIFEOPS_FEEDBACK_WRITE=true \
 *   LIFEOPS_FEEDBACK_READONLY=true NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-feedback-write-smoke.ts
 *
 * 安全: staging allowlist(hjcr…)・本番 denylist(aljav…) fatal・service_role fatal・GO 必須・
 *   before lifeops_prefix=0 でなければ insert せず停止・**insert は writer 経由 1 件のみ**・
 *   cleanup は handle+source_kind+action の 3 条件 eq（owner-RLS 内・既存 seed/correction 行に構造的不接触）・
 *   log は counts/boolean/stage のみ（full row/user_id/id/raw を出さない）。
 */

import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { createLifeOpsFeedbackWriter, type LifeOpsFeedbackWriteClient } from "@/lib/plan/reality/lifeops/lifeops-feedback-writer";
import { isLifeOpsFeedbackWriteAllowed } from "@/lib/plan/reality/lifeops/lifeops-feedback-write";
import { createLifeOpsFeedbackReadonlySource } from "@/lib/plan/reality/lifeops/lifeops-feedback-readonly-source";
import type { PrmLearningEventReadClient } from "@/lib/plan/reality/learning/supabase-prm-learning-event-reader";
import { PRM_LEARNING_EVENTS_TABLE } from "@/lib/plan/reality/learning/supabase-prm-learning-event-repository";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

loadDotenv({ path: ".env.local" });

function fatal(r: string): never { console.error(`\n❌ FATAL: ${r}\n`); process.exit(1); }
function log(m: string): void { console.log(m); }
function ok(c: boolean, l: string): boolean { log(`${c ? "✅" : "❌"} ${l}`); return c; }

const GO = process.env.LIFEOPS_FEEDBACK_WRITE_SMOKE_GO === "1";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PROJECT_REF = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
const EMAIL = process.env.STAGING_USER_A_EMAIL ?? "";
const PASSWORD = process.env.STAGING_USER_A_PASSWORD ?? "";
const SMOKE_HANDLE = "lifeops:beauty_salon:cut";

function preflight(): void {
  if (!GO) fatal("GO 未設定（LIFEOPS_FEEDBACK_WRITE_SMOKE_GO=1）。");
  if (process.env.NODE_ENV === "production") fatal("NODE_ENV=production 不可。");
  for (const [k, v] of [["URL", SB_URL], ["ANON", SB_ANON], ["REF", PROJECT_REF], ["EMAIL", EMAIL], ["PW", PASSWORD]]) if (!v) fatal(`Missing ${k}`);
  if (/service_role/i.test(SB_ANON)) fatal("anon key に service_role 混入。");
  if (PROJECT_REF === PRODUCTION_PROJECT_REF) fatal("PRODUCTION GUARD: ref 本番。");
  if (PROJECT_REF !== STAGING_PROJECT_REF) fatal(`STAGING GUARD: ref が ${STAGING_PROJECT_REF} でない。`);
  let host = "";
  try { host = new URL(SB_URL).host.toLowerCase(); } catch { fatal("URL 不正。"); }
  const ref = host.match(/^([a-z0-9]+)\.supabase\.(co|in)$/)?.[1];
  if (ref === PRODUCTION_PROJECT_REF) fatal("PRODUCTION GUARD: host 本番。");
  if (ref !== STAGING_PROJECT_REF) fatal("STAGING GUARD: host ref 不一致。");
  log(`▶ target = staging host ${host}（A-4-c12 1-row write smoke）`);
}

async function countWhere(sb: ReturnType<typeof createClient>, like: string | null): Promise<number> {
  let q = sb.from(PRM_LEARNING_EVENTS_TABLE).select("handle", { count: "exact", head: true });
  if (like) q = q.like("handle", like);
  const res = await q;
  if (res.error) fatal(`count 失敗: ${res.error.message}`);
  return res.count ?? 0;
}

async function main(): Promise<void> {
  preflight();
  let pass = true;

  // gate（write は staging+flags でのみ開く・production は常に閉）
  const env = { master: PLAN_FLAGS.lifeopsRealdataReadonly, write: PLAN_FLAGS.lifeopsFeedbackWrite, supabaseUrl: SB_URL };
  pass = ok(isLifeOpsFeedbackWriteAllowed(env) === true, "gate: master∧write∧staging → 開（smoke 限定 flag ON）") && pass;
  pass = ok(isLifeOpsFeedbackWriteAllowed({ ...env, supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co` }) === false, "gate: production URL → 常に閉") && pass;

  const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: e } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (e || !auth.user) fatal(`sign-in 失敗: ${e?.message ?? "no user"}`);
  const userId = auth.user.id;
  log(`▶ signed in（dedicated test user・id 末尾4=…${userId.slice(-4)}）`);

  // before counts（owner-RLS scope）
  const beforeTotal = await countWhere(sb, null);
  const beforeLifeops = await countWhere(sb, "lifeops:%");
  log(`▶ before: total=${beforeTotal} lifeops_prefix=${beforeLifeops}`);
  if (beforeLifeops !== 0) fatal("before lifeops_prefix ≠ 0 → insert せず停止（CEO 判断へ）。");

  // ── 1 row insert（c9 writer 経由・action=accept/signal=adoption/source_kind=lifeops）──
  const writer = createLifeOpsFeedbackWriter(sb as unknown as LifeOpsFeedbackWriteClient, userId, env);
  const result = await writer.writeFeedback({ categoryId: "beauty_salon", menu: "cut", action: "accept", actedAtISO: new Date().toISOString() });
  log(`▶ write: written=${result.written} reason=${result.reason}`);
  if (!result.written) {
    // CHECK 未拡張なら insert_failed（row 未作成＝cleanup 不要）。機能的証明の失敗として停止。
    fatal(`writer 失敗（reason=${result.reason}）→ row 未作成のため cleanup 不要・停止。`);
  }
  pass = ok(result.reason === "ok", "insert: writer 経由で 1 行のみ（CHECK 拡張の機能的証明=lifeops 受理）") && pass;

  // ── read-after-write ──
  const afterInsertLifeops = await countWhere(sb, "lifeops:%");
  pass = ok(afterInsertLifeops === 1, `read-after-write: lifeops_prefix=1（実測 ${afterInsertLifeops}）`) && pass;
  const source = createLifeOpsFeedbackReadonlySource(sb as unknown as PrmLearningEventReadClient, userId, { master: env.master, feedback: PLAN_FLAGS.lifeopsFeedbackReadonly, supabaseUrl: SB_URL });
  const obs = await source.readObservations();
  pass = ok(obs.length === 1, `c8 adapter: observations=1（実測 ${obs.length}）`) && pass;
  if (obs.length === 1) {
    pass = ok(obs[0].categoryId === "beauty_salon" && obs[0].menu === "cut" && obs[0].action === "accept", "parse: category/menu/action が roundtrip 一致") && pass;
  }

  // ── cleanup（exact row のみ: handle+source_kind+action の 3 条件・owner-RLS 内）──
  const del = await sb
    .from(PRM_LEARNING_EVENTS_TABLE)
    .delete()
    .eq("handle", SMOKE_HANDLE)
    .eq("source_kind", "lifeops")
    .eq("action", "accept");
  if (del.error) {
    fatal(`cleanup 失敗: ${del.error.message} → 残存条件: handle='${SMOKE_HANDLE}' AND source_kind='lifeops' AND action='accept'（CEO 判断へ・広範囲 DELETE はしない）。`);
  }
  const afterTotal = await countWhere(sb, null);
  const afterLifeops = await countWhere(sb, "lifeops:%");
  pass = ok(afterLifeops === 0, `cleanup: lifeops_prefix=0（実測 ${afterLifeops}）`) && pass;
  pass = ok(afterTotal === beforeTotal, `既存 M1 不干渉: total after=${afterTotal} == before=${beforeTotal}`) && pass;

  log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — A-4-c12 1-row write smoke（insert 1→read 1→cleanup 0・production 0・PII log 0）`);
  await sb.auth.signOut();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => fatal(`unexpected: ${err instanceof Error ? err.message : String(err)}`));
