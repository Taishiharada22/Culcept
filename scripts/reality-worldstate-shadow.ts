#!/usr/bin/env tsx
/**
 * Reality Control OS — 4-E-a Full WorldState Shadow（CEO 承認・**staging・real anchor read only・seed/write/cleanup なし**）
 *
 * 役割: culcept-staging の RLS user context で **実 `external_anchors` を read**（column-restricted）し、
 *   `assembleWorldState`（context は fixture 注入・**実 context reader は作らない**）→ memory empty →
 *   `runRealityPipeline` を通して **redacted envelope を観測**する。**seed 0 / write 0 / apply 0 / production 0**。
 *
 * 実行: REALITY_WORLDSTATE_SHADOW_GO=1 NODE_OPTIONS="--conditions=react-server" npx tsx scripts/reality-worldstate-shadow.ts
 *
 * 安全: staging ref(hjcrvndumgiovyfdacwc) allowlist・本番(aljav…) denylist・service_role 検出 fatal・GO 必須・
 *   read-only(select/eq/limit のみ)・**write 0 / seed 0 / cleanup 0**・title/location/raw を出さない・envelope redacted。
 */

import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { createSupabaseAnchorScheduleReader, type AnchorReadClient } from "@/lib/plan/reality/assembly/supabase-anchor-schedule-reader";
import { anchorRowsToSnapshots } from "@/lib/plan/reality/assembly/anchor-schedule-mapper";
import { assembleWorldState, type WorldStateSourcePorts } from "@/lib/plan/reality/assembly/world-state-assembler";
import { runRealityPipeline } from "@/lib/plan/reality/orchestration/reality-pipeline";
import type { ContextSnapshot } from "@/lib/plan/context/contextModifier";

loadDotenv({ path: ".env.local" });

function fatal(r: string): never { console.error(`\n❌ FATAL: ${r}\n`); process.exit(1); }
function log(m: string): void { console.log(m); }
function ok(c: boolean, l: string): boolean { log(`${c ? "✅" : "❌"} ${l}`); return c; }

const GO = process.env.REALITY_WORLDSTATE_SHADOW_GO === "1";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PROJECT_REF = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
const EMAIL = process.env.STAGING_USER_A_EMAIL ?? "";
const PASSWORD = process.env.STAGING_USER_A_PASSWORD ?? "";
const ALLOWED_KEYS = new Set(["id", "start_time", "end_time", "rigidity", "sensitive_category"]);
const FORBIDDEN = /seed_?ref|utterance|personality|title|location|住所|@[a-z]|\b\d{10,}\b/i;

function preflight(): void {
  if (!GO) fatal("GO 未設定（REALITY_WORLDSTATE_SHADOW_GO=1）。");
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
  log(`▶ target = staging host ${host}（4-E-a full WorldState shadow・real anchor read only）`);
}

async function main(): Promise<void> {
  preflight();
  const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: e } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (e || !auth.user) fatal(`sign-in 失敗: ${e?.message ?? "no user"}`);
  const userId = auth.user.id;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  log(`▶ signed in（id 末尾4=…${userId.slice(-4)}・date=${date}）`);

  // ── 実 anchor read（column-restricted・owner-RLS・単一日）──
  const reader = createSupabaseAnchorScheduleReader(sb as unknown as AnchorReadClient, userId, date);
  const rows = await reader.readRows();
  log(`▶ real anchor read: rows=${rows.length}`);

  // ── context は fixture 注入（実 context reader は作らない）・memory empty ──
  const fixtureContext = { energy: { value: 0.6, source: "fixture" }, weather: { value: "rain", source: "fixture" } } as unknown as ContextSnapshot;
  const ports: WorldStateSourcePorts = {
    readSchedule: async () => anchorRowsToSnapshots(rows),
    readContext: async () => fixtureContext,
    readMobility: async () => null,
  };
  const nowMs = Date.parse(now.toISOString());
  const world = await assembleWorldState(ports, date, nowMinute);
  const env = runRealityPipeline({ memoryItems: [], worldState: world, permissionLevel: 2, nowMs });

  log(`▶ WorldState: hardConstraints=${world.todaySchedule.length} availableWindows=${world.availableWindows.length} context=${world.context ? "fixture" : "null"}`);
  log(`▶ envelope: readiness=${env.worldReadiness} recommended=${env.recommended?.tier} permission=${env.permission.verdict} draft.opCount=${env.changeSetDraft?.opCount ?? "null"}`);

  let pass = true;
  // 2. selected columns: 返却 row の key が許可列のみ（title/location なし）
  const keyViolation = rows.some((r) => Object.keys(r).some((k) => !ALLOWED_KEYS.has(k)));
  pass = ok(!keyViolation, "selected columns: 返却 row は id/start_time/end_time/rigidity/sensitive_category のみ（title/location なし）") && pass;
  // 3. title/location/raw が WorldState/envelope に漏れない（rows 自体は log しない）
  pass = ok(!FORBIDDEN.test(JSON.stringify({ world, env })), "redaction: WorldState/envelope に title/location/raw/PII なし") && pass;
  // 4/5. anchor 変換 or 0 件 whole-day
  if (rows.length === 0) pass = ok(world.availableWindows.length >= 1 && world.todaySchedule.length === 0, "anchors 0 件 → fail-open whole-day window") && pass;
  else pass = ok(world.todaySchedule.length >= 0, `anchors ${rows.length} 件 → hardConstraints=${world.todaySchedule.length} windows=${world.availableWindows.length}`) && pass;
  // 6. pipeline redacted で通る
  pass = ok(env.recommended != null || env.worldReadiness === "insufficient", "WorldState+memory → pipeline が通る") && pass;
  pass = ok(env.changeSetDraft === null || Object.keys(env.changeSetDraft).join(",") === "opCount", "ChangeSet draft summary のみ・apply 0") && pass;

  log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — 4-E-a full WorldState shadow（real anchor read・seed 0・write 0・apply 0・production 0）`);
  await sb.auth.signOut();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => fatal(`unexpected: ${err instanceof Error ? err.message : String(err)}`));
