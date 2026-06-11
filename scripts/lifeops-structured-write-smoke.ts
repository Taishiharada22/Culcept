#!/usr/bin/env tsx
/**
 * Life Ops — A-4-c32 Structured Source Writer Smoke（**staging only・deadline 1 件→duplicate→exact cleanup→0**）
 *
 * 役割: c31 writer contract を初めて実 staging DB に通し、RLS/CHECK/reader/normalizer/duplicate guard と
 *   噛み合うことを確認する。★c30 finding の実 DB 回帰検証=**occurrence_key が dueDate 由来・`::` なし**であること。
 *
 * 実行: LIFEOPS_STRUCTURED_WRITE_SMOKE_GO=1 LIFEOPS_REALDATA_READONLY=true LIFEOPS_STRUCTURED_SOURCE_READONLY=true \
 *   LIFEOPS_STRUCTURED_SOURCE_WRITE=true NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-structured-write-smoke.ts
 *
 * 安全: staging allowlist(hjcr…)・本番 denylist(aljav…) fatal・service_role fatal・GO 必須・
 *   before 全 0 でなければ insert せず停止・insert は writer 経由 1 件のみ（duplicate 2 回目は already_exists で 0）・
 *   cleanup は exact 条件（source_type+category_id+occurrence_key+status・対象 1 件以外は削除せず停止）・
 *   log は counts/boolean/category_id/source_type/occurrence_key/result/user 末尾 4 のみ（full row/user_id/raw 非出力）。
 */

import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import {
  buildLifeOpsStructuredInsertRow,
  isLifeOpsStructuredSourceWriteAllowed,
  type LifeOpsStructuredSourceInput,
} from "@/lib/plan/reality/lifeops/lifeops-structured-write";
import { createLifeOpsStructuredSourceWriter, type LifeOpsStructuredWriteClient } from "@/lib/plan/reality/lifeops/lifeops-structured-writer";
import {
  createLifeOpsStructuredSourceReadonlySource,
  type LifeOpsStructuredSourceReadClient,
} from "@/lib/plan/reality/lifeops/lifeops-structured-storage-readonly-source";
import { LIFEOPS_STRUCTURED_SOURCES_TABLE } from "@/lib/plan/reality/lifeops/lifeops-structured-storage";
import { structuredDeadlinesToObservations } from "@/lib/plan/reality/lifeops/lifeops-structured-source";
import { computeLifeOpsPreviewModel } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import { buildLifeOpsMainlineCardDto } from "@/lib/plan/reality/lifeops/lifeops-mainline-card";
import { PRM_LEARNING_EVENTS_TABLE } from "@/lib/plan/reality/learning/supabase-prm-learning-event-repository";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

loadDotenv({ path: ".env.local" });

function fatal(r: string): never { console.error(`\n❌ FATAL: ${r}\n`); process.exit(1); }
function log(m: string): void { console.log(m); }
function ok(c: boolean, l: string): boolean { log(`${c ? "✅" : "❌"} ${l}`); return c; }

const GO = process.env.LIFEOPS_STRUCTURED_WRITE_SMOKE_GO === "1";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PROJECT_REF = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
const EMAIL = process.env.STAGING_USER_A_EMAIL ?? "";
const PASSWORD = process.env.STAGING_USER_A_PASSWORD ?? "";

const DAY_MS = 24 * 60 * 60 * 1000;
const dueDate = new Date(Date.now() + 14 * DAY_MS).toISOString().slice(0, 10); // 14 日後（date のみ）
const SMOKE_INPUT: LifeOpsStructuredSourceInput = { sourceType: "deadline", categoryId: "tax_filing", dueDateISO: dueDate };
const EXPECTED_KEY = `tax_filing:${dueDate}`;

function preflight(): void {
  if (!GO) fatal("GO 未設定（LIFEOPS_STRUCTURED_WRITE_SMOKE_GO=1）。");
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
  log(`▶ target = staging host ${host}（A-4-c32 structured writer smoke・deadline 1 件）`);
}

async function structuredCount(sb: ReturnType<typeof createClient>): Promise<number> {
  const res = await sb.from(LIFEOPS_STRUCTURED_SOURCES_TABLE).select("source_type", { count: "exact", head: true });
  if (res.error) fatal(`structured count 失敗: ${res.error.message}`);
  return res.count ?? 0;
}
async function feedbackCount(sb: ReturnType<typeof createClient>): Promise<number> {
  const res = await sb.from(PRM_LEARNING_EVENTS_TABLE).select("handle", { count: "exact", head: true });
  if (res.error) fatal(`feedback count 失敗: ${res.error.message}`);
  return res.count ?? 0;
}

/** card 検証用の固定 world（test と同形・pure compute のみ＝追加 DB read なし）。 */
function fixtureWorld(): WorldState {
  return {
    date: new Date().toISOString().slice(0, 10), nowMinute: 800, todaySchedule: [],
    availableWindows: [
      { startMinute: 600, endMinute: 660, meaning: null },
      { startMinute: 780, endMinute: 960, meaning: null },
    ],
    context: null, mobility: null, permissionLevel: 2,
  } as WorldState;
}

async function main(): Promise<void> {
  preflight();
  let pass = true;

  // ── pure preflight: gate matrix + occurrence 実出力（DB 接触前）──
  const writeEnv = { master: PLAN_FLAGS.lifeopsRealdataReadonly, write: PLAN_FLAGS.lifeopsStructuredSourceWrite, supabaseUrl: SB_URL };
  pass = ok(isLifeOpsStructuredSourceWriteAllowed(writeEnv) === true, "gate: master∧write∧staging → 開（smoke 限定 flag ON）") && pass;
  pass = ok(isLifeOpsStructuredSourceWriteAllowed({ ...writeEnv, supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co` }) === false, "gate: production URL → 常に閉") && pass;
  const built = buildLifeOpsStructuredInsertRow(SMOKE_INPUT);
  if (!built.ok) fatal(`builder invalid: ${built.reason}`);
  log(`▶ occurrence_key（builder 実出力）= ${built.row.occurrence_key}（期待 ${EXPECTED_KEY}）`);
  pass = ok(built.row.occurrence_key === EXPECTED_KEY, "★occurrence: dueDate 由来・deterministic") && pass;
  pass = ok(!built.row.occurrence_key.includes("::"), "★occurrence: menu なしでも double colon なし（c32 補正の実証）") && pass;

  const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: e } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (e || !auth.user) fatal(`sign-in 失敗: ${e?.message ?? "no user"}`);
  const userId = auth.user.id;
  log(`▶ signed in（dedicated test user・id 末尾4=…${userId.slice(-4)}）`);

  const readEnv = { master: PLAN_FLAGS.lifeopsRealdataReadonly, structured: PLAN_FLAGS.lifeopsStructuredSourceReadonly, supabaseUrl: SB_URL };
  const reader = createLifeOpsStructuredSourceReadonlySource(sb as unknown as LifeOpsStructuredSourceReadClient, userId, readEnv);

  // ── A. before（全 0 でなければ insert せず停止）──
  const beforeStructured = await structuredCount(sb);
  const beforeFeedback = await feedbackCount(sb);
  const beforeSplit = await reader.readSources();
  log(`▶ before: structured=${beforeStructured} feedback=${beforeFeedback} reader_deadlines=${beforeSplit.deadlines.length} normalized=${structuredDeadlinesToObservations(beforeSplit.deadlines).length}`);
  if (beforeStructured !== 0 || beforeFeedback !== 0) fatal("before counts ≠ 0 → insert せず停止（CEO 判断へ）。");

  // ── B. writer insert（1 件のみ・user_id は auth 注入）──
  const writer = createLifeOpsStructuredSourceWriter(sb as unknown as LifeOpsStructuredWriteClient, userId, writeEnv);
  const w1 = await writer.writeSource(SMOKE_INPUT, { existing: [] }); // before=0 確認済み（A で fatal gate）
  log(`▶ write#1: written=${w1.written} reason=${w1.reason}`);
  if (!w1.written) fatal(`writer 失敗（reason=${w1.reason}）→ row 未作成・停止。`);

  // ── C. read-after-write（reader→normalizer→（pure）card chain）──
  const afterCount = await structuredCount(sb);
  pass = ok(afterCount === 1, `read-after-write: structured count=1（実測 ${afterCount}）`) && pass;
  const split = await reader.readSources();
  pass = ok(split.deadlines.length === 1, `c29 reader: deadlines=1（実測 ${split.deadlines.length}）`) && pass;
  if (split.deadlines.length === 1) {
    pass = ok(split.deadlines[0].occurrenceKey === EXPECTED_KEY, `★実 DB roundtrip: occurrence_key=${split.deadlines[0].occurrenceKey}（c30 回帰なし）`) && pass;
  }
  const normalized = structuredDeadlinesToObservations(split.deadlines);
  pass = ok(normalized.length === 1, `c26 normalizer: deadline=1（実測 ${normalized.length}）`) && pass;
  const model = computeLifeOpsPreviewModel({ world: fixtureWorld(), date: fixtureWorld().date, nowMinute: 800, nowMs: Date.now(), inputs: {}, structuredDeadlines: normalized });
  const card = buildLifeOpsMainlineCardDto(model, "real_only");
  pass = ok(card !== null && card.items.some((i) => i.label === "確定申告"), "★card chain: 実 row → reader → normalizer → real_only card に「確定申告」") && pass;

  // ── D. duplicate guard（同 input 2 回目 → already_exists・insert 0）──
  const w2 = await writer.writeSource(SMOKE_INPUT, { existing: split.deadlines.length === 1 ? [{
    source_type: "deadline", category_id: "tax_filing", menu: null, due_at: dueDate,
    last_completed_at: null, typical_interval_days: null, occurrence_key: EXPECTED_KEY,
    confidence: "high", status: "active",
  }] : [] });
  log(`▶ write#2（同 input）: written=${w2.written} reason=${w2.reason}`);
  pass = ok(!w2.written && w2.reason === "already_exists", "duplicate guard: already_exists・insert 0") && pass;
  const afterDup = await structuredCount(sb);
  pass = ok(afterDup === 1, `duplicate 後も count=1（実測 ${afterDup}・2 件作らない）`) && pass;

  // ── E. exact cleanup（対象 1 件以外は削除せず停止）──
  const matchRes = await sb
    .from(LIFEOPS_STRUCTURED_SOURCES_TABLE)
    .select("occurrence_key", { count: "exact", head: true })
    .eq("source_type", "deadline")
    .eq("category_id", "tax_filing")
    .eq("occurrence_key", EXPECTED_KEY)
    .eq("status", "active");
  const matched = matchRes.count ?? 0;
  log(`▶ cleanup 対象（exact 条件）: ${matched} 件`);
  if (matched !== 1) fatal(`cleanup 対象が ${matched} 件（期待 1）→ 削除せず停止。`);
  const del = await sb
    .from(LIFEOPS_STRUCTURED_SOURCES_TABLE)
    .delete()
    .eq("source_type", "deadline")
    .eq("category_id", "tax_filing")
    .eq("occurrence_key", EXPECTED_KEY)
    .eq("status", "active");
  if (del.error) fatal(`cleanup 失敗: ${del.error.message}`);

  // ── F. after ──
  const finalStructured = await structuredCount(sb);
  const finalFeedback = await feedbackCount(sb);
  const finalSplit = await reader.readSources();
  pass = ok(finalStructured === 0, `after: structured=0（実測 ${finalStructured}）`) && pass;
  pass = ok(finalSplit.deadlines.length === 0, "after: reader deadlines=0") && pass;
  pass = ok(finalFeedback === 0 && finalFeedback === beforeFeedback, `feedback 不干渉: ${finalFeedback}（before と同値）`) && pass;

  log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — A-4-c32 structured writer smoke（insert 1→duplicate 0→cleanup→0・production 0・PII log 0）`);
  await sb.auth.signOut();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => fatal(`unexpected: ${err instanceof Error ? err.message : String(err)}`));
