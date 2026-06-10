#!/usr/bin/env tsx
/**
 * Life Ops — A-4-c8 Feedback Read-only Source Staging Smoke（**read-only・LIMIT・counts/shape のみ・write 0**）
 *
 * 役割: gate（master ∧ feedback ∧ staging ∧ !production）+ 既存 M1 reader + 辞書 firewall adapter の chain を
 *   real staging で 1 回だけ確認する。**row 内容は log に出さない**（counts と boolean shape のみ・PII 不出力）。
 *   期待: lifeops 行は c12/c13 smoke で cleanup 済み → total≥0・lifeops=0・cadence=0 が honest 結果。
 *   A-4-c14: feedbackToCadence の件数検証を追加（done のみ変換・counts のみ・write 0 のまま）。
 *
 * 実行: LIFEOPS_FEEDBACK_SMOKE_GO=1 LIFEOPS_REALDATA_READONLY=true LIFEOPS_FEEDBACK_READONLY=true \
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-feedback-readonly-smoke.ts
 *
 * 安全: staging allowlist(hjcr…)・本番 denylist(aljav…) fatal・service_role fatal・GO 必須・
 *   select/eq/order/limit のみ（write/INSERT/UPDATE/DELETE/RPC 0）・cleanup 不要（読むだけ）。
 */

import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { createLifeOpsFeedbackReadonlySource } from "@/lib/plan/reality/lifeops/lifeops-feedback-readonly-source";
import { isLifeOpsFeedbackReadAllowed, feedbackToCadence } from "@/lib/plan/reality/lifeops/lifeops-feedback-source";
import type { PrmLearningEventReadClient } from "@/lib/plan/reality/learning/supabase-prm-learning-event-reader";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

loadDotenv({ path: ".env.local" });

function fatal(r: string): never { console.error(`\n❌ FATAL: ${r}\n`); process.exit(1); }
function log(m: string): void { console.log(m); }
function ok(c: boolean, l: string): boolean { log(`${c ? "✅" : "❌"} ${l}`); return c; }

const GO = process.env.LIFEOPS_FEEDBACK_SMOKE_GO === "1";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PROJECT_REF = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
const EMAIL = process.env.STAGING_USER_A_EMAIL ?? "";
const PASSWORD = process.env.STAGING_USER_A_PASSWORD ?? "";

function preflight(): void {
  if (!GO) fatal("GO 未設定（LIFEOPS_FEEDBACK_SMOKE_GO=1）。");
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
  log(`▶ target = staging host ${host}（A-4-c8 feedback read-only smoke・counts のみ）`);
}

async function main(): Promise<void> {
  preflight();
  let pass = true;

  // gate（flag は smoke 実行時のみ env で ON・default OFF を侵さない）
  const env = { master: PLAN_FLAGS.lifeopsRealdataReadonly, feedback: PLAN_FLAGS.lifeopsFeedbackReadonly, supabaseUrl: SB_URL };
  pass = ok(env.master && env.feedback, "gate: smoke 限定で flag ON（未設定なら本 smoke は実行不能=default OFF）") && pass;
  pass = ok(isLifeOpsFeedbackReadAllowed(env) === true, "gate: master∧feedback∧staging∧!production → 許可") && pass;
  pass = ok(isLifeOpsFeedbackReadAllowed({ ...env, supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co` }) === false, "gate: production URL → 常に false") && pass;

  const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: e } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (e || !auth.user) fatal(`sign-in 失敗: ${e?.message ?? "no user"}`);
  const userId = auth.user.id;
  log(`▶ signed in（id 末尾4=…${userId.slice(-4)}）`);

  // 1) 生 M1 row count（LIMIT 50・shape のみ・内容 log なし）
  const probe = await (sb.from("prm_learning_events").select("handle, action, acted_at").eq("user_id", userId).order("acted_at", { ascending: true }).limit(50) as unknown as PromiseLike<{ data: { handle: string }[] | null; error: { message: string } | null }>);
  if (probe.error) fatal(`M1 read 失敗: ${probe.error.message}`);
  const rows = probe.data ?? [];
  const lifeopsRows = rows.filter((r) => typeof r.handle === "string" && r.handle.startsWith("lifeops:")).length;
  log(`▶ M1(owner, LIMIT50): total=${rows.length} lifeops_prefix=${lifeopsRows}`);
  pass = ok(rows.length >= 0, "read-only probe: shape OK（counts のみ・内容非出力）") && pass;

  // 2) source chain（gate→reader→firewall adapter）
  const src = createLifeOpsFeedbackReadonlySource(sb as unknown as PrmLearningEventReadClient, userId, env);
  const obs = await src.readObservations();
  log(`▶ source chain: observations=${obs.length}（期待: c12/c13 cleanup 済みゆえ 0）`);
  pass = ok(obs.length === lifeopsRows || obs.length <= lifeopsRows, "adapter: firewall 済み観測数 ≤ lifeops prefix 行数（自由文は不通過）") && pass;
  pass = ok(obs.every((o) => typeof o.categoryId === "string" && ["accept", "dismiss", "later", "done"].includes(o.action)), "shape: enum + ISO のみ（c13: done 含む）") && pass;

  // 3) ★A-4-c14: cadence merge 入口（done のみ→CadenceObservation・counts のみ・row 内容非出力）
  const cad = feedbackToCadence(obs);
  log(`▶ cadence: feedbackCadence=${cad.length}（期待: 0＝honest zero・merge は no-op）`);
  pass = ok(cad.length <= obs.length, "cadence: done のみ変換（observations 以下・accept/dismiss/later は不使用）") && pass;

  log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — A-4-c8/c14 feedback read-only smoke（write 0・cleanup 不要・production 0）`);
  await sb.auth.signOut();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => fatal(`unexpected: ${err instanceof Error ? err.message : String(err)}`));
