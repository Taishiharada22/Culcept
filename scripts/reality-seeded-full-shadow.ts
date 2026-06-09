#!/usr/bin/env tsx
/**
 * Reality Control OS — 4-E-b Seeded Full Shadow（CEO 承認・**staging・real anchor read + seeded M1/M3 memory 同時 pipeline・cleanup・count 0**）
 *
 * 役割: 最小 M1/M2/M3 seed（test marker・owner・cleanup 必須）+ **実 `external_anchors` read（read-only）** を同時に通し、
 *   `assembleMemoryItems`(seeded) + `assembleWorldState`(real anchors + fixture context) → `runRealityPipeline` の
 *   **memory influence + real schedule を実データで観測**し、**必ず cleanup→M1/M2/M3 count 0**。external_anchors は **read only**。
 *
 * 実行: REALITY_SEEDED_FULL_SHADOW_GO=1 NODE_OPTIONS="--conditions=react-server" npx tsx scripts/reality-seeded-full-shadow.ts
 *
 * 安全: staging allowlist(hjcrvndumgiovyfdacwc)・本番 denylist・service_role fatal・GO 必須・write は M1/M2/M3 seed のみ・
 *   **external_anchors は read only(write 0)**・finally で必ず cleanup・cleanup 後 M1/M2/M3 marker count 0・apply 0・redacted。
 */

import { config as loadDotenv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { createSupabaseMemorySourcePorts } from "@/lib/plan/reality/assembly/supabase-memory-source-ports";
import { assembleMemoryItems } from "@/lib/plan/reality/assembly/memory-assembler";
import { synthesizeMemory } from "@/lib/plan/reality/learning/memory-synthesis";
import { createSupabaseAnchorScheduleReader, type AnchorReadClient } from "@/lib/plan/reality/assembly/supabase-anchor-schedule-reader";
import { anchorRowsToSnapshots } from "@/lib/plan/reality/assembly/anchor-schedule-mapper";
import { assembleWorldState, type WorldStateSourcePorts } from "@/lib/plan/reality/assembly/world-state-assembler";
import { runRealityPipeline } from "@/lib/plan/reality/orchestration/reality-pipeline";
import type { ContextSnapshot } from "@/lib/plan/context/contextModifier";

loadDotenv({ path: ".env.local" });

function fatal(r: string): never { console.error(`\n❌ FATAL: ${r}\n`); process.exit(1); }
function log(m: string): void { console.log(m); }
function ok(c: boolean, l: string): boolean { log(`${c ? "✅" : "❌"} ${l}`); return c; }

const GO = process.env.REALITY_SEEDED_FULL_SHADOW_GO === "1";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PROJECT_REF = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
const EMAIL = process.env.STAGING_USER_A_EMAIL ?? "";
const PASSWORD = process.env.STAGING_USER_A_PASSWORD ?? "";
const FORBIDDEN = /seed_?ref|utterance|personality|怠惰|title|location|@[a-z]|\b\d{10,}\b/i;

function preflight(): void {
  if (!GO) fatal("GO 未設定（REALITY_SEEDED_FULL_SHADOW_GO=1）。");
  if (process.env.NODE_ENV === "production") fatal("NODE_ENV=production 不可。");
  for (const [k, v] of [["URL", SB_URL], ["ANON", SB_ANON], ["REF", PROJECT_REF], ["EMAIL", EMAIL], ["PW", PASSWORD]]) if (!v) fatal(`Missing ${k}`);
  if (/service_role/i.test(SB_ANON)) fatal("anon key に service_role 混入。");
  if (PROJECT_REF === PRODUCTION_PROJECT_REF) fatal("PRODUCTION GUARD: ref 本番。");
  if (PROJECT_REF !== STAGING_PROJECT_REF) fatal(`STAGING GUARD: ref が ${STAGING_PROJECT_REF} でない。`);
  let host = "";
  try { host = new URL(SB_URL).host.toLowerCase(); } catch { fatal("URL 不正。"); }
  const ref = host.match(/^([a-z0-9]+)\.supabase\.(co|in)$/)?.[1];
  if (ref !== STAGING_PROJECT_REF) fatal("STAGING GUARD: host ref 不一致。");
  log(`▶ target = staging host ${host}（4-E-b seeded full shadow）`);
}

const M1 = "prm_learning_events", M2 = "prm_review_decisions", M3 = "prm_model_entries";

async function main(): Promise<void> {
  preflight();
  const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: e } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (e || !auth.user) fatal(`sign-in 失敗: ${e?.message ?? "no user"}`);
  const userId = auth.user.id;
  const client = sb as unknown as SupabaseClient;
  const now = new Date();
  const epoch = Date.now();
  const marker = `step4eb_${epoch}`;
  const ts = new Date(epoch).toISOString();
  const date = now.toISOString().slice(0, 10);
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  log(`▶ signed in（id 末尾4=…${userId.slice(-4)}・marker=${marker}・date=${date}）`);

  const m2Ids: string[] = [];
  const m3Ids: string[] = [];
  let pass = true;

  try {
    // ── seed M1×3 / M2×3 / M3×3（evening non_adoption ready / morning retracted / afternoon rejected）──
    const m1Rows = [
      { user_id: userId, handle: `${marker}_e1`, action: "accept", signal: "adoption", desired_date: "2026-06-05", band: "evening", confidence_band: "medium", duration_min: 60, source_kind: "seed_explicit", acted_at: ts },
      { user_id: userId, handle: `${marker}_e2`, action: "dismiss", signal: "non_adoption", desired_date: "2026-06-05", band: "evening", confidence_band: "medium", duration_min: 60, source_kind: "seed_explicit", acted_at: ts },
      { user_id: userId, handle: `${marker}_e3`, action: "later", signal: "deferral", desired_date: "2026-06-05", band: "evening", confidence_band: "medium", duration_min: 60, source_kind: "seed_explicit", acted_at: ts },
    ];
    if ((await client.from(M1).insert(m1Rows)).error) fatal("seed M1 失敗");
    for (let n = 0; n < 3; n++) {
      const r = await client.from(M2).insert([{ user_id: userId, proposal_fingerprint: `band:${marker}:dismiss`, decision: "approve", reviewer: "operator", source_dimension: "band", source_value: `${marker}_${n}`, dominant_action: "dismiss", favored_hypothesis: "not_now", still_possible: ["not_selected"], evidence_count: 6, counter_count: 0, certainty: "tentative", reviewed_at: ts }]).select("id");
      if (r.error || !r.data?.[0]?.id) fatal(`seed M2#${n} 失敗`);
      m2Ids.push(r.data[0].id as string);
    }
    const m3Rows = [
      { user_id: userId, context_dimension: "band", context_value: "evening", tendency_direction: "non_adoption", favored_hypothesis: "not_now", still_possible: ["not_selected"], evidence_count: 6, counter_count: 0, certainty: "tentative", review_decision_id: m2Ids[0], user_visible: true, user_correction: null, retracted_at: null },
      { user_id: userId, context_dimension: "band", context_value: "morning", tendency_direction: "adoption", favored_hypothesis: "now", still_possible: [], evidence_count: 6, counter_count: 0, certainty: "tentative", review_decision_id: m2Ids[1], user_visible: true, user_correction: null, retracted_at: ts },
      { user_id: userId, context_dimension: "band", context_value: "afternoon", tendency_direction: "adoption", favored_hypothesis: "now", still_possible: [], evidence_count: 6, counter_count: 0, certainty: "tentative", review_decision_id: m2Ids[2], user_visible: true, user_correction: "rejected", retracted_at: null },
    ];
    const m3res = await client.from(M3).insert(m3Rows).select("id");
    if (m3res.error || (m3res.data?.length ?? 0) !== 3) fatal(`seed M3 失敗: ${m3res.error?.message ?? "count"}`);
    for (const r of m3res.data!) m3Ids.push(r.id as string);
    log(`▶ seeded memory: M1=3 / M2=3 / M3=3`);

    // ── 実 anchor read（read-only・external_anchors に write しない）──
    const anchorReader = createSupabaseAnchorScheduleReader(sb as unknown as AnchorReadClient, userId, date);
    const anchorRows = await anchorReader.readRows();
    log(`▶ real anchor read: rows=${anchorRows.length}（read-only）`);

    // ── seeded memory + real-anchor worldstate → pipeline ──
    const memPorts = createSupabaseMemorySourcePorts(sb, userId);
    const eventRows = (await memPorts.readEventRows()).filter((r) => String(r.handle).startsWith(marker));
    const tendencies = await memPorts.readSecondSelfTendencies();
    const memory = await assembleMemoryItems({ readEventRows: async () => eventRows, readSecondSelfTendencies: async () => tendencies });
    const synthesis = synthesizeMemory(memory, epoch);
    const fixtureContext = { energy: { value: 0.6, source: "fixture" }, weather: { value: "rain", source: "fixture" } } as unknown as ContextSnapshot;
    const wsPorts: WorldStateSourcePorts = { readSchedule: async () => anchorRowsToSnapshots(anchorRows), readContext: async () => fixtureContext, readMobility: async () => null };
    const world = await assembleWorldState(wsPorts, date, nowMinute);
    const env = runRealityPipeline({ memoryItems: memory, worldState: world, permissionLevel: 2, nowMs: epoch });
    const baseline = runRealityPipeline({ memoryItems: [], worldState: world, permissionLevel: 2, nowMs: epoch });

    log(`▶ WorldState: anchors=${anchorRows.length} hardConstraints=${world.todaySchedule.length} availableWindows=${world.availableWindows.length}`);
    log(`▶ memory: seeded M1=${eventRows.length} M3 tendencies=${tendencies.length}(retracted 除外後) MemoryItem=${memory.length} usableContexts=${synthesis.usableContexts.length}`);
    log(`▶ envelope: readiness=${env.worldReadiness} recommended=${env.recommended?.tier} trigger=${env.surfacedTrigger?.kind ?? "silent"} permission=${env.permission.verdict} confidence=${env.reasoning?.confidence} draft.opCount=${env.changeSetDraft?.opCount}`);
    log(`▶ baseline(無 memory) confidence=${baseline.reasoning?.confidence}`);

    pass = ok(eventRows.length === 3 && tendencies.length === 2, "seeded M1=3 / M3 read=2(retracted 除外)") && pass;
    pass = ok(synthesis.usableContexts.length >= 1, "usableContexts ≥1(memory 生成)") && pass;
    pass = ok(memory.every((m) => m.context.value !== "afternoon"), "rejected は MemoryItem に出ない") && pass;
    pass = ok(env.reasoning?.confidence === "tentative" && baseline.reasoning?.confidence === "low", "memory influence: confidence low→tentative") && pass;
    pass = ok(world.availableWindows.length >= 1, "real anchor → availableWindows(interval-complement)") && pass;
    pass = ok(!FORBIDDEN.test(JSON.stringify({ memory, world, env })), "redaction: raw/seedRef/PII/personality/title/location なし") && pass;
    pass = ok(env.changeSetDraft != null && Object.keys(env.changeSetDraft).join(",") === "id,opCount", "ChangeSet draft summary のみ・apply 0") && pass;
  } finally {
    if (m3Ids.length) await client.from(M3).delete().in("id", m3Ids);
    await client.from(M2).delete().like("source_value", `${marker}%`);
    await client.from(M1).delete().like("handle", `${marker}%`);
    const leftM1 = (await client.from(M1).select("id").like("handle", `${marker}%`)).data?.length ?? -1;
    const leftM2 = (await client.from(M2).select("id").like("source_value", `${marker}%`)).data?.length ?? -1;
    const leftM3 = m3Ids.length ? (await client.from(M3).select("id").in("id", m3Ids)).data?.length ?? -1 : 0;
    log(`▶ cleanup 後 残: M1=${leftM1} / M2=${leftM2} / M3=${leftM3}（external_anchors は read only・未変更）`);
    pass = ok(leftM1 === 0 && leftM2 === 0 && leftM3 === 0, "cleanup 完了: M1/M2/M3 count 0(痕跡なし)") && pass;
    await sb.auth.signOut();
  }

  log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — seeded full shadow（real anchor read + seeded memory・cleanup count 0・anchor write 0・apply 0・production 0）`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => fatal(`unexpected: ${err instanceof Error ? err.message : String(err)}`));
