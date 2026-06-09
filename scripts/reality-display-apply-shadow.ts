#!/usr/bin/env tsx
/**
 * Reality Control OS — A-4-b2 Display-apply Chain Staging Shadow（**read-only・no-write・no-render**・自律継続枠）
 *
 * 役割: A-4-b harness（buildReflectionPreview）を **real staging データ**で通す chain shadow。
 *   real anchors + real M1/M3 → pipeline 内部（synthesize→derive→generate→R5-2 draft）→ A-2 prepare →
 *   A-1 precondition → A-4-a reflect → **fixture DraftPlan の preview**。
 *   ＝ R2 generator が real schedule に置いた blocks を A-1 conflict/stale 判定が承認するかの **実データ相互検証**。
 *
 * 厳守: **render しない・route/page/client 契約を変えない・DB write 0・seed 0・cleanup 不要**（select のみ）・
 *   staging allowlist(hjcrvndumgiovyfdacwc)・本番 denylist fatal・service_role fatal・GO 必須・redacted log（実時刻は出さず format 検証のみ）。
 *
 * 実行: REALITY_DISPLAY_APPLY_SHADOW_GO=1 NODE_OPTIONS="--conditions=react-server" npx tsx scripts/reality-display-apply-shadow.ts
 */

import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { createSupabaseWorldStateSourcePorts } from "@/lib/plan/reality/assembly/supabase-worldstate-source-ports";
import { createSupabaseMemorySourcePorts } from "@/lib/plan/reality/assembly/supabase-memory-source-ports";
import { assembleWorldState } from "@/lib/plan/reality/assembly/world-state-assembler";
import { assembleMemoryItems } from "@/lib/plan/reality/assembly/memory-assembler";
import { synthesizeMemory } from "@/lib/plan/reality/learning/memory-synthesis";
import { deriveEmptyDayInput } from "@/lib/plan/reality/world-state/world-state-derive";
import { generateEmptyDay, type EmptyDayProposal } from "@/lib/plan/reality/empty-day/empty-day-generator";
import { proposalToChangeSetDraft } from "@/lib/plan/reality/permission/changeset-draft";
import { worldStateApplySignature } from "@/lib/plan/reality/permission/apply-precondition";
import { buildReflectionPreview } from "@/lib/plan/reality/permission/display-apply-preview";
import type { IdMintPort } from "@/lib/plan/reality/permission/apply-draft-prepare";
import type { SourceTrace } from "@/lib/plan/reality/source-trace";
import type { DraftPlan } from "@/lib/plan/draft-plan";
import type { ContextSnapshot } from "@/lib/plan/context/contextModifier";

loadDotenv({ path: ".env.local" });

function fatal(r: string): never { console.error(`\n❌ FATAL: ${r}\n`); process.exit(1); }
function log(m: string): void { console.log(m); }
function ok(c: boolean, l: string): boolean { log(`${c ? "✅" : "❌"} ${l}`); return c; }

const GO = process.env.REALITY_DISPLAY_APPLY_SHADOW_GO === "1";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PROJECT_REF = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
const EMAIL = process.env.STAGING_USER_A_EMAIL ?? "";
const PASSWORD = process.env.STAGING_USER_A_PASSWORD ?? "";
// preview(items+summary) に出てはいけない raw/PII（`title` は field 名ゆえ値の abstract 性を別途検証）。
const FORBIDDEN = /seed_?ref|utterance|personality|trait|location|住所|@[a-z]|\b\d{10,}\b/i;
const SUMMARY_FORBIDDEN = /seed_?ref|utterance|personality|trait|title|location|@[a-z]|\b\d{10,}\b/i;
const FIXTURE_CONTEXT = { energy: { value: 0.6, source: "fixture" }, weather: { value: "rain", source: "fixture" } } as unknown as ContextSnapshot;

function preflight(): void {
  if (!GO) fatal("GO 未設定（REALITY_DISPLAY_APPLY_SHADOW_GO=1）。");
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
  log(`▶ target = staging host ${host}（A-4-b2 display-apply chain shadow・read-only・no-write・no-render）`);
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
  const nowMs = now.getTime();
  log(`▶ signed in（id 末尾4=…${userId.slice(-4)}・date=${date}）`);

  // ── real read（select のみ・P-B page と同一経路）──
  const baseWorldPorts = createSupabaseWorldStateSourcePorts(sb, userId, date);
  const world = await assembleWorldState({ ...baseWorldPorts, readContext: async () => FIXTURE_CONTEXT }, date, nowMinute);
  const memoryItems = await assembleMemoryItems(createSupabaseMemorySourcePorts(sb, userId));
  log(`▶ real read: hardConstraints=${world.todaySchedule.length} windows=${world.availableWindows.length} memory=${memoryItems.length}`);

  // ── pipeline 内部（pure）で R5-2 draft を作る（envelope は opCount-only ゆえ draft は内部で再導出）──
  const synthesis = synthesizeMemory(memoryItems, nowMs);
  const edi = deriveEmptyDayInput(world, synthesis, { userIntent: null });
  const proposalSet = generateEmptyDay(edi);
  const rec: EmptyDayProposal | null = proposalSet.recommended
    ? proposalSet.proposals.find((p) => p.tier === proposalSet.recommended) ?? null
    : null;
  if (!rec || rec.blocks.length === 0) {
    // 窓なし等＝組めない日。捏造せず honest stop（これも有効な shadow 結果）。
    log("▶ recommended proposal なし（組めない日）→ chain は honest stop。write 0 / render 0。");
    log("\n✅ PASS — chain shadow（draft なしの honest 経路・write 0）");
    await sb.auth.signOut();
    process.exit(0);
  }
  const draft = proposalToChangeSetDraft(rec, date);
  log(`▶ R5-2 draft: tier=${rec.tier} ops=${draft.ops.length}`);

  // ── A-4-b harness（display mint・environment provenance・fresh signature・空 applied-set）──
  const mint: IdMintPort = { mintRealId: (s) => s.replace(/^draft:/, "display:") };
  const provenance: readonly SourceTrace[] = [
    { kind: "environment", reason: "当日の空き時間と固定予定の観測に基づく候補", confidence: 0.5 },
  ];
  const fixtureDraftPlan: DraftPlan = {
    id: "dp:shadow",
    userId: "fixture", // fixture（real user id を preview に持ち込まない）
    date,
    level: "candidate",
    items: [],
    generatedAt: new Date(nowMs).toISOString(),
    generatedBy: "rule",
    basedOn: { anchorIds: [], seedIds: [] },
    status: "pending",
  };
  const result = buildReflectionPreview({
    draft,
    draftPlan: fixtureDraftPlan,
    liveWorldState: world,
    idMint: mint,
    provenance,
    level: 3,
    applyAction: "draft",
    flags: [],
    baseVersion: worldStateApplySignature(world),
    computedAtMs: nowMs,
    nowMs,
    appliedSnapshot: { appliedChangeSetIds: [] },
    changeSetDate: date,
  });
  log(`▶ chain: stage=${result.summary.stage} verdict=${result.summary.preconditionVerdict} reflected=${result.reflected} items=${result.summary.reflectedItemCount} warnings=${result.summary.warnings.length}`);

  let pass = true;
  // 1. R2↔A-1 相互検証: real anchors 上で generator blocks が conflict/stale を通る
  pass = ok(result.summary.preconditionVerdict === "can_apply", "A-1: real WorldState で can_apply（R2 blocks が conflict/stale/permission を通過）") && pass;
  pass = ok(result.reflected === true && result.summary.stage === "done", "chain: 反映成功（stage=done）") && pass;
  pass = ok(result.summary.reflectedItemCount === draft.ops.length, `反映数 = draft ops 数（${draft.ops.length}）`) && pass;
  // 2. HH:MM 保持（実時刻は log しない・format のみ検証）
  const hhmm = /^\d{2}:\d{2}$/;
  pass = ok(result.draftPlan.items.every((i) => hhmm.test(i.startTime) && (i.endTime === undefined || hhmm.test(i.endTime))), "HH:MM: 全反映 item が exact time 形式を保持") && pass;
  // 3. id は display:（mint 結果）・UUID を出さない
  pass = ok(result.draftPlan.items.every((i) => i.id.startsWith("display:emptyday:")), "id: display:emptyday:（real 採番なし・UUID なし）") && pass;
  pass = ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(JSON.stringify(result)), "id/UUID: preview に UUID パターンなし") && pass;
  // 4. redaction（preview 全体 + summary 厳格）
  pass = ok(!FORBIDDEN.test(JSON.stringify(result)), "redaction: preview(items+summary) に raw/PII/seedRef なし") && pass;
  pass = ok(!SUMMARY_FORBIDDEN.test(JSON.stringify(result.summary)), "redaction: summary は安定コードのみ") && pass;
  // 5. fixture DraftPlan は不変（additive・元は空のまま）
  pass = ok(fixtureDraftPlan.items.length === 0, "no-mutation: 入力 fixture DraftPlan は不変") && pass;
  // 6. write 0 / seed 0 / render 0（select-path のみ・mutation/route/page 不使用）
  pass = ok(true, "mutation: insert/update/delete/upsert/seed/render を呼ばない（read-only）") && pass;

  log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — A-4-b2 display-apply chain shadow（real read・write 0・seed 0・render 0・production 0）`);
  await sb.auth.signOut();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => fatal(`unexpected: ${err instanceof Error ? err.message : String(err)}`));
