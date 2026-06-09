#!/usr/bin/env tsx
/**
 * Reality Control OS — Live Reader Step 3: Seeded Memory Shadow（CEO 承認・**staging・controlled seed→shadow→cleanup→count 0**）
 *
 * 役割: 最小 test seed（M1×3 / M2×3 / M3×3・test marker・owner user 限定）を入れ、実 M1/M3 を read して
 *   `assembleMemoryItems`→`synthesizeMemory`→`fakeWorldState`→`runRealityPipeline` の **memory influence を観測**し、
 *   **必ず cleanup→count 0** を確認する。**production 0 / apply 0 / route 0 / service_role 不使用**。
 *
 * 実行: REALITY_SEEDED_SHADOW_GO=1 NODE_OPTIONS="--conditions=react-server" npx tsx scripts/reality-seeded-memory-shadow.ts
 *
 * 安全: staging ref(hjcrvndumgiovyfdacwc) allowlist・本番(aljav…) denylist・service_role 検出 fatal・GO 必須・
 *   write は **controlled seed のみ**・**finally で必ず cleanup**・cleanup 後 M1/M2/M3 の marker/id count 0 を確認・
 *   raw/seedRef/utterance/personality/trait/fixed_preference を **入れない**・envelope redacted。
 */

import { config as loadDotenv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { createSupabaseMemorySourcePorts } from "@/lib/plan/reality/assembly/supabase-memory-source-ports";
import { assembleMemoryItems } from "@/lib/plan/reality/assembly/memory-assembler";
import { synthesizeMemory } from "@/lib/plan/reality/learning/memory-synthesis";
import { fakeWorldState } from "@/lib/plan/reality/assembly/fixture-assembler";
import { runRealityPipeline } from "@/lib/plan/reality/orchestration/reality-pipeline";

loadDotenv({ path: ".env.local" });

function fatal(r: string): never { console.error(`\n❌ FATAL: ${r}\n`); process.exit(1); }
function log(m: string): void { console.log(m); }
function ok(c: boolean, l: string): boolean { log(`${c ? "✅" : "❌"} ${l}`); return c; }

const GO = process.env.REALITY_SEEDED_SHADOW_GO === "1";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PROJECT_REF = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
const EMAIL = process.env.STAGING_USER_A_EMAIL ?? "";
const PASSWORD = process.env.STAGING_USER_A_PASSWORD ?? "";
const FORBIDDEN = /seed_?ref|utterance|personality|怠惰|だらしな|@[a-z]|\b\d{10,}\b/i;

function preflight(): void {
  if (!GO) fatal("GO 未設定（REALITY_SEEDED_SHADOW_GO=1）。");
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
  log(`▶ target = staging host ${host}（seeded memory shadow）`);
}

const M1 = "prm_learning_events", M2 = "prm_review_decisions", M3 = "prm_model_entries";

async function main(): Promise<void> {
  preflight();
  const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: e } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (e || !auth.user) fatal(`sign-in 失敗: ${e?.message ?? "no user"}`);
  const userId = auth.user.id;
  const client = sb as unknown as SupabaseClient;
  const epoch = Date.now();
  const marker = `step3_${epoch}`;
  const ts = new Date(epoch).toISOString();
  log(`▶ signed in（id 末尾4=…${userId.slice(-4)}・marker=${marker}）`);

  const m2Ids: string[] = [];
  const m3Ids: string[] = [];
  let pass = true;

  try {
    // ── seed M1×3（accept/dismiss/later = adoption/non_adoption/deferral・band evening）──
    const m1Rows = [
      { user_id: userId, handle: `${marker}_e1`, action: "accept", signal: "adoption", desired_date: "2026-06-05", band: "evening", confidence_band: "medium", duration_min: 60, source_kind: "seed_explicit", acted_at: ts },
      { user_id: userId, handle: `${marker}_e2`, action: "dismiss", signal: "non_adoption", desired_date: "2026-06-05", band: "evening", confidence_band: "medium", duration_min: 60, source_kind: "seed_explicit", acted_at: ts },
      { user_id: userId, handle: `${marker}_e3`, action: "later", signal: "deferral", desired_date: "2026-06-05", band: "evening", confidence_band: "medium", duration_min: 60, source_kind: "seed_explicit", acted_at: ts },
    ];
    if ((await client.from(M1).insert(m1Rows)).error) fatal("seed M1 失敗");

    // ── seed M2×3（operator approve・FK 用・source_value=marker）──
    for (let n = 0; n < 3; n++) {
      const r = await client.from(M2).insert([{ user_id: userId, proposal_fingerprint: `band:${marker}:dismiss`, decision: "approve", reviewer: "operator", source_dimension: "band", source_value: `${marker}_${n}`, dominant_action: "dismiss", favored_hypothesis: "not_now", still_possible: ["not_selected"], evidence_count: 6, counter_count: 0, certainty: "tentative", reviewed_at: ts }]).select("id");
      if (r.error || !r.data?.[0]?.id) fatal(`seed M2#${n} 失敗: ${r.error?.message ?? "no id"}`);
      m2Ids.push(r.data[0].id as string);
    }

    // ── seed M3×3: #1 evening non_adoption(ready usable)・#2 morning adoption(retracted→reader 除外)・#3 afternoon adoption(rejected→mapper 除外)──
    const m3Rows = [
      { user_id: userId, context_dimension: "band", context_value: "evening", tendency_direction: "non_adoption", favored_hypothesis: "not_now", still_possible: ["not_selected"], evidence_count: 6, counter_count: 0, certainty: "tentative", review_decision_id: m2Ids[0], user_visible: true, user_correction: null, retracted_at: null },
      { user_id: userId, context_dimension: "band", context_value: "morning", tendency_direction: "adoption", favored_hypothesis: "now", still_possible: [], evidence_count: 6, counter_count: 0, certainty: "tentative", review_decision_id: m2Ids[1], user_visible: true, user_correction: null, retracted_at: ts },
      { user_id: userId, context_dimension: "band", context_value: "afternoon", tendency_direction: "adoption", favored_hypothesis: "now", still_possible: [], evidence_count: 6, counter_count: 0, certainty: "tentative", review_decision_id: m2Ids[2], user_visible: true, user_correction: "rejected", retracted_at: null },
    ];
    const m3res = await client.from(M3).insert(m3Rows).select("id");
    if (m3res.error || (m3res.data?.length ?? 0) !== 3) fatal(`seed M3 失敗: ${m3res.error?.message ?? "count"}`);
    for (const r of m3res.data!) m3Ids.push(r.id as string);
    log(`▶ seeded: M1=3 / M2=3 / M3=3`);

    // ── 実 read → assemble → synthesize → pipeline ──
    const ports = createSupabaseMemorySourcePorts(sb, userId);
    const eventRows = (await ports.readEventRows()).filter((r) => String(r.handle).startsWith(marker)); // 本 run の seed のみ
    const tendencies = await ports.readSecondSelfTendencies();
    const memory = await assembleMemoryItems({ readEventRows: async () => eventRows, readSecondSelfTendencies: async () => tendencies });
    const synthesis = synthesizeMemory(memory, epoch);
    const world = fakeWorldState({ date: "shadow", nowMinute: 540, gaps: [{ startTime: "09:00", endTime: "11:00" }, { startTime: "13:00", endTime: "16:00" }, { startTime: "18:00", endTime: "20:00" }], context: null });
    const env = runRealityPipeline({ memoryItems: memory, worldState: world, permissionLevel: 2, nowMs: epoch });
    const baseline = runRealityPipeline({ memoryItems: [], worldState: world, permissionLevel: 2, nowMs: epoch }); // memory なし比較

    log(`▶ read: M1(seed)=${eventRows.length} / M3 tendencies=${tendencies.length}(retracted #2 除外後)`);
    log(`▶ MemoryItem=${memory.length} / usableContexts=${synthesis.usableContexts.length} leaning=${synthesis.usableContexts[0]?.leaning ?? "none"}`);
    log(`▶ envelope(seeded): readiness=${env.worldReadiness} recommended=${env.recommended?.tier} confidence=${env.reasoning?.confidence} permission=${env.permission.verdict} draft.opCount=${env.changeSetDraft?.opCount}`);
    log(`▶ envelope(baseline 無 memory): confidence=${baseline.reasoning?.confidence}`);

    // ── assert ──
    pass = ok(eventRows.length === 3, "M1 seed 3 件が read される(episodic source)") && pass;
    pass = ok(tendencies.length === 2, "M3 read=2(retracted #2 が reader で除外)") && pass;
    pass = ok(synthesis.usableContexts.length >= 1, "usableContexts ≥1(evening ready)") && pass;
    pass = ok(synthesis.usableContexts.some((c) => c.context.value === "evening"), "usableContext に evening(M3 #1 由来)") && pass;
    pass = ok(memory.every((m) => m.context.value !== "afternoon"), "rejected #3(afternoon) は MemoryItem に変換されない(mapper 除外)") && pass;
    pass = ok(env.reasoning?.confidence === "tentative" && baseline.reasoning?.confidence === "low", "memory influence: confidence low→tentative") && pass;
    pass = ok(env.recommended != null && env.surfacedTrigger != null, "envelope に recommended / trigger が出る") && pass;
    pass = ok(!FORBIDDEN.test(JSON.stringify({ memory, env })), "redaction: raw/seedRef/PII/personality なし") && pass;
    pass = ok(env.changeSetDraft != null && Object.keys(env.changeSetDraft).join(",") === "id,opCount", "ChangeSet draft summary のみ・apply 0") && pass;
  } finally {
    // ── cleanup（必ず・成功失敗どちらでも）──
    if (m3Ids.length) await client.from(M3).delete().in("id", m3Ids);
    await client.from(M2).delete().like("source_value", `${marker}%`);
    await client.from(M1).delete().like("handle", `${marker}%`);
    // ── cleanup 後 count 0 確認 ──
    const leftM1 = (await client.from(M1).select("id").like("handle", `${marker}%`)).data?.length ?? -1;
    const leftM2 = (await client.from(M2).select("id").like("source_value", `${marker}%`)).data?.length ?? -1;
    const leftM3 = m3Ids.length ? (await client.from(M3).select("id").in("id", m3Ids)).data?.length ?? -1 : 0;
    log(`▶ cleanup 後 残: M1=${leftM1} / M2=${leftM2} / M3=${leftM3}`);
    pass = ok(leftM1 === 0 && leftM2 === 0 && leftM3 === 0, "cleanup 完了: M1/M2/M3 marker/id count 0(痕跡なし)") && pass;
    await sb.auth.signOut();
  }

  log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — seeded memory shadow（controlled seed→shadow→cleanup→count 0・apply 0・production 0）`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => fatal(`unexpected: ${e instanceof Error ? e.message : String(e)}`));
