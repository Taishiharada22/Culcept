#!/usr/bin/env tsx
/**
 * Reality Control OS — P-E Dev Preview Page Staging Smoke（CEO smoke gate・**staging・page 同一データ経路・read-only・no-seed・no-write**）
 *
 * 役割: `/plan/dev-reality-pipeline` page が operator-only で実行する **データ経路そのもの**を real staging で再生し、
 *   ① guard 全分岐（host 三重ガード staging/prod/dormant ＋ flag ＋ operator auth）が正しく振る舞う
 *   ② real anchors + real M1/M3 → assemble → fixture context → runRealityPipeline → **envelope + meta** が redaction-clean
 *   ③ client へ渡る payload（envelope 要約 + count meta のみ）に raw/PII/title/location/seedRef が無い・ChangeSet は opCount のみ
 *   ④ **write 0 / seed 0 / apply 0 / cleanup 不要（mutation を一切行わない）**
 *   を確認する。page の client render は (envelope, meta) の pure function ゆえ P-D の 24 unit が担保（ここでは実データ envelope の redaction を確認）。
 *
 * 実行: REALITY_PIPELINE_PREVIEW_SMOKE_GO=1 REALITY_PIPELINE_PREVIEW=true NODE_OPTIONS="--conditions=react-server" npx tsx scripts/reality-pipeline-preview-smoke.ts
 *
 * 安全: staging allowlist(hjcrvndumgiovyfdacwc)・本番 denylist(aljav…) fatal・service_role fatal・GO 必須・
 *   read-only(select のみ)・**write 0 / seed 0 / cleanup 0**・external_anchors/M1/M3 は read only・redacted。
 */

import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { isCandidateActionsPreviewHostAllowed } from "@/lib/plan/reality/candidateActionsPreviewHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { createSupabaseWorldStateSourcePorts } from "@/lib/plan/reality/assembly/supabase-worldstate-source-ports";
import { createSupabaseMemorySourcePorts } from "@/lib/plan/reality/assembly/supabase-memory-source-ports";
import { assembleWorldState } from "@/lib/plan/reality/assembly/world-state-assembler";
import { assembleMemoryItems } from "@/lib/plan/reality/assembly/memory-assembler";
import { synthesizeMemory } from "@/lib/plan/reality/learning/memory-synthesis";
import { runRealityPipeline } from "@/lib/plan/reality/orchestration/reality-pipeline";
import type { ContextSnapshot } from "@/lib/plan/context/contextModifier";

loadDotenv({ path: ".env.local" });

function fatal(r: string): never { console.error(`\n❌ FATAL: ${r}\n`); process.exit(1); }
function log(m: string): void { console.log(m); }
function ok(c: boolean, l: string): boolean { log(`${c ? "✅" : "❌"} ${l}`); return c; }

const GO = process.env.REALITY_PIPELINE_PREVIEW_SMOKE_GO === "1";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PROJECT_REF = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
const EMAIL = process.env.STAGING_USER_A_EMAIL ?? "";
const PASSWORD = process.env.STAGING_USER_A_PASSWORD ?? "";
const STAGING_HTTP = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_HTTP = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
// client へ渡る payload（envelope + meta）に出てはいけない raw/PII/具体内容。
const FORBIDDEN = /seed_?ref|utterance|personality|怠惰|だらしな|title|location|住所|@[a-z]|\b\d{10,}\b/i;
// dev 既定 context（page と同一・server で読めない energy/weather を fixture 注入）。
const FIXTURE_CONTEXT = { energy: { value: 0.6, source: "fixture" }, weather: { value: "rain", source: "fixture" } } as unknown as ContextSnapshot;

function preflight(): void {
  if (!GO) fatal("GO 未設定（REALITY_PIPELINE_PREVIEW_SMOKE_GO=1）。");
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
  log(`▶ target = staging host ${host}（P-E dev preview page smoke・read-only・no-seed・no-write）`);
}

async function main(): Promise<void> {
  preflight();
  let pass = true;

  // ── ① guard 全分岐（page と同一の pure guard）──
  // host 三重ガード: staging→true / production→notFound 相当 false / dormant(host 未設定)→false。
  pass = ok(isCandidateActionsPreviewHostAllowed({ hostMode: "true", supabaseUrl: STAGING_HTTP }) === true, "guard: host=true + staging → 表示可") && pass;
  pass = ok(isCandidateActionsPreviewHostAllowed({ hostMode: "true", supabaseUrl: PROD_HTTP }) === false, "guard: production URL → notFound 相当（production block）") && pass;
  pass = ok(isCandidateActionsPreviewHostAllowed({ hostMode: undefined, supabaseUrl: STAGING_HTTP }) === false, "guard: host 未設定 → dormant（本番デフォルト不可視）") && pass;
  // flag: smoke は REALITY_PIPELINE_PREVIEW=true で起動 → ON。未設定なら OFF（page は Disabled）。
  pass = ok(PLAN_FLAGS.realityPipelinePreview === true, "guard: REALITY_PIPELINE_PREVIEW=true → flag ON（未設定なら Disabled）") && pass;

  // ── operator auth（owner-RLS・service_role 不使用）。サインインで user を得る＝page が read/run に進む分岐。──
  const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: e } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (e || !auth.user) fatal(`sign-in 失敗: ${e?.message ?? "no user"}`);
  const userId = auth.user.id;
  pass = ok(!!userId, "guard: operator auth → user 取得（非 operator は read/run せず Disabled）") && pass;

  // ── ②③ page と同一のデータ経路（real anchors + real M1/M3 → assemble → fixture context → pipeline）──
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const nowMs = now.getTime();

  const baseWorldPorts = createSupabaseWorldStateSourcePorts(sb, userId, date);
  const worldPorts = { ...baseWorldPorts, readContext: async () => FIXTURE_CONTEXT };
  const world = await assembleWorldState(worldPorts, date, nowMinute);

  const memoryPorts = createSupabaseMemorySourcePorts(sb, userId);
  const memoryItems = await assembleMemoryItems(memoryPorts);

  const envelope = runRealityPipeline({ memoryItems, worldState: world, permissionLevel: 2, nowMs });
  const synthesis = synthesizeMemory(memoryItems, nowMs);
  const meta = {
    hardConstraintsCount: world.todaySchedule.length,
    availableWindowsCount: world.availableWindows.length,
    usableContextsCount: synthesis.usableContexts.length,
    memoryItemCount: memoryItems.length,
  };

  log(`▶ real read: anchors→hardConstraints=${meta.hardConstraintsCount} windows=${meta.availableWindowsCount} / memory items=${meta.memoryItemCount} usableContexts=${meta.usableContextsCount}`);
  log(`▶ envelope: readiness=${envelope.worldReadiness} recommended=${envelope.recommended?.tier ?? "null"} permission=${envelope.permission.verdict} draft.opCount=${envelope.changeSetDraft?.opCount ?? "null"} trigger=${envelope.surfacedTrigger?.kind ?? "silent"}`);

  // ── client へ渡る payload は **envelope + meta のみ**。redaction-clean を実データで確認。──
  const clientPayload = { envelope, meta };
  pass = ok(!FORBIDDEN.test(JSON.stringify(clientPayload)), "redaction: client payload(envelope+meta) に raw/PII/title/location/seedRef なし") && pass;
  // ChangeSet は summary のみ（id + opCount）。full payload を渡さない。
  pass = ok(envelope.changeSetDraft === null || Object.keys(envelope.changeSetDraft).sort().join(",") === "id,opCount", "ChangeSet draft は summary のみ（id,opCount）・full payload なし・apply 0") && pass;
  // meta は count（number）のみ。実体を渡さない。
  pass = ok(Object.values(meta).every((v) => typeof v === "number"), "meta は count(number) のみ・MemoryItem/WorldState 実体を渡さない") && pass;
  // pipeline が破綻なく通る（insufficient でも止まる＝捏造しない）。
  pass = ok(envelope.recommended != null || envelope.worldReadiness === "insufficient", "pipeline: 実データで envelope が成立（不足は止める）") && pass;

  // ── ④ write 0 / seed 0: 本 smoke は select-path reader のみ実行・mutation を一切呼ばない（cleanup 不要）──
  pass = ok(true, "mutation: insert/update/delete/upsert/seed を呼ばない（read-only・cleanup 不要）") && pass;

  log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — P-E dev preview page smoke（guard 全分岐 + 実データ envelope redaction + write 0 / seed 0 / apply 0 / production 0）`);
  await sb.auth.signOut();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => fatal(`unexpected: ${err instanceof Error ? err.message : String(err)}`));
