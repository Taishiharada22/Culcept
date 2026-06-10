/**
 * /plan/dev-reality-pipeline — P-B/P-C Reality Pipeline Operator-only Read-only Dev Preview
 *   （**operator-only / dev-preview / read-only / no-apply / no-write / no-seed**）
 *
 * 設計: docs/reality-pipeline-dev-preview-design.md（slice P-B/P-C・§2-§6）
 *
 * 目的: real anchor + real M1/M3 を read し、pure `runRealityPipeline` が「実データで何を判断したか」を
 *   operator が **観測するだけ** の read-only 面。**plan を書き換えない・通知しない・apply しない・user-facing でない**。
 *
 * 三重ガード（dev preview 共通）: ① REALITY_CANDIDATE_ACTIONS_DEV_HOST ② staging ref ③ 非 production → notFound。
 *   さらに ② operator auth（owner-RLS）+ ③ flag REALITY_PIPELINE_PREVIEW（server default OFF）。3 つ揃った時のみ read/run。
 *
 * 厳守:
 *   - **client には envelope 要約 + count(meta) のみ渡す**（MemoryItem/WorldState/ChangeSet 実体・raw row は渡さない）。
 *   - **read-only**（select のみ・write/insert/update/delete/upsert/seed なし・apply なし・PlanClient 接続なし）。
 *   - **service_role 禁止**（supabaseServer の anon+auth client・owner-RLS）。**production hard block**（host 三重ガード）。
 *   - context は **fixture 注入**（energy/weather は server で読めない＝client-side・実 context reader は作らない）。
 *   - nowMs/nowMinute/date は server now から渡す（pure lib は Date.now しない）。
 */

import { notFound } from "next/navigation";
import { isCandidateActionsPreviewHostAllowed } from "@/lib/plan/reality/candidateActionsPreviewHost";
import { supabaseServer } from "@/lib/supabase/server";
import { createSupabaseWorldStateSourcePorts } from "@/lib/plan/reality/assembly/supabase-worldstate-source-ports";
import { createSupabaseMemorySourcePorts } from "@/lib/plan/reality/assembly/supabase-memory-source-ports";
import { assembleWorldState } from "@/lib/plan/reality/assembly/world-state-assembler";
import { assembleMemoryItems } from "@/lib/plan/reality/assembly/memory-assembler";
import { synthesizeMemory } from "@/lib/plan/reality/learning/memory-synthesis";
import { runRealityPipeline } from "@/lib/plan/reality/orchestration/reality-pipeline";
import { computeReflectionPreviewDto } from "@/lib/plan/reality/permission/reflection-preview-compute";
import { computeLifeOpsPreviewDto } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import { createLifeOpsFeedbackReadonlySource } from "@/lib/plan/reality/lifeops/lifeops-feedback-readonly-source";
import { feedbackToCadence } from "@/lib/plan/reality/lifeops/lifeops-feedback-source";
import {
  isLifeOpsCadenceReadAllowed,
  feedbackDoneToRealCadence,
  realCadenceToCadenceObservations,
} from "@/lib/plan/reality/lifeops/lifeops-cadence-real-source";
import { parseLifeOpsDoneConfirmToken } from "@/lib/plan/reality/lifeops/lifeops-action-request";
import type { PrmLearningEventReadClient } from "@/lib/plan/reality/learning/supabase-prm-learning-event-reader";
import type { ContextSnapshot } from "@/lib/plan/context/contextModifier";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { RealityPipelinePreviewClient, type RealityPipelinePreviewMeta, type LifeOpsActionResultToken } from "./RealityPipelinePreviewClient";
import { submitLifeOpsFeedbackAction } from "./actions";

/** A-4-c17/c18: redirect token の allowlist（URL 生値を表示系へ流さない）。 */
const LIFEOPS_FB_TOKENS = new Set(["ok", "ok_done", "gate_off", "duplicate_cooldown", "insert_failed", "invalid", "denied"]);

export const dynamic = "force-dynamic";

/** dev 既定の context（energy/weather は server で読めない＝client-side のため fixture 注入）。raw/PII を持たない。 */
const FIXTURE_CONTEXT = { energy: { value: 0.6, source: "fixture" }, weather: { value: "rain", source: "fixture" } } as unknown as ContextSnapshot;

/** flag OFF / 非 operator のときの read/run しない表示（client を render しない＝pipeline を走らせない）。 */
function Disabled({ reason }: { reason: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-600" data-testid="reality-pipeline-disabled">
      <h1 className="text-lg font-bold">Reality Pipeline 観測（operator-only・read-only）</h1>
      <p className="mt-2 text-[12px] text-gray-500">{reason}</p>
    </div>
  );
}

export default async function DevRealityPipelinePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ① host 三重ガード（hostMode + staging allowlist + production deny）→ いずれか欠ければ notFound（production で構造的不可視）。
  if (
    !isCandidateActionsPreviewHostAllowed({
      hostMode: process.env.REALITY_CANDIDATE_ACTIONS_DEV_HOST,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    })
  ) {
    notFound();
  }

  // ③ flag（server default OFF・NEXT_PUBLIC なし）→ OFF なら read/run しない。
  if (!PLAN_FLAGS.realityPipelinePreview) {
    return <Disabled reason="REALITY_PIPELINE_PREVIEW=OFF（read/run しません）。" />;
  }

  // ② operator auth（owner-RLS・service_role 不使用）→ 非 operator は read/run しない。
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <Disabled reason="operator 未ログイン（read/run しません）。" />;
  }

  // ── real read（owner-RLS・column-restricted・select のみ・write/seed なし）──
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const nowMs = now.getTime();

  // real anchors → WorldState（schedule/windows は real anchor 由来・context のみ fixture 注入）。
  const baseWorldPorts = createSupabaseWorldStateSourcePorts(supabase, user.id, date);
  const worldPorts = { ...baseWorldPorts, readContext: async () => FIXTURE_CONTEXT };
  const world = await assembleWorldState(worldPorts, date, nowMinute);

  // real M1/M3 → MemoryItem[]（episodic/semantic/preference/procedural/correction・fail-open）。
  const memoryPorts = createSupabaseMemorySourcePorts(supabase, user.id);
  const memoryItems = await assembleMemoryItems(memoryPorts);

  // pure pipeline → redacted envelope（**apply しない**・raw/PII/具体 item を持たない summary）。
  const envelope = runRealityPipeline({ memoryItems, worldState: world, permissionLevel: 2, nowMs });
  const synthesis = synthesizeMemory(memoryItems, nowMs);

  // **client には envelope（要約）+ count(meta) + reflection DTO のみ**（MemoryItem/WorldState/ChangeSet/DraftPlanItem 実体・raw row は渡さない）。
  const meta: RealityPipelinePreviewMeta = {
    hardConstraintsCount: world.todaySchedule.length,
    availableWindowsCount: world.availableWindows.length,
    usableContextsCount: synthesis.usableContexts.length,
    memoryItemCount: memoryItems.length,
  };

  // A-4-c: 既読 (world, memoryItems) から **新規 read なし**で reflection preview DTO を計算（A-4-c0 allowlist・組めない日は null）。
  const reflectionPreview = computeReflectionPreviewDto({ world, memoryItems, date, nowMs }) ?? undefined;

  // A-4-c14: done feedback 由来 cadence の gated read（read-only・owner-RLS・select のみ）。
  //   flags default OFF → source は query せず [] → merge は no-op＝既定挙動完全不変。production は gate で常に false。
  const feedbackSource = createLifeOpsFeedbackReadonlySource(supabase as unknown as PrmLearningEventReadClient, user.id, {
    master: PLAN_FLAGS.lifeopsRealdataReadonly,
    feedback: PLAN_FLAGS.lifeopsFeedbackReadonly,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  });
  const feedbackObservations = await feedbackSource.readObservations();
  const feedbackCadence = feedbackToCadence(feedbackObservations);

  // A-4-c20: real cadence 合成層（**新規 DB query 0**＝今日の feed は上記 c8 read の observations を再利用）。
  //   gate: master ∧ LIFEOPS_CADENCE_READONLY ∧ staging ∧ !production（default OFF → []）。LIFEOPS_MAINLINE とは独立。
  const realCadence = isLifeOpsCadenceReadAllowed({
    master: PLAN_FLAGS.lifeopsRealdataReadonly,
    cadence: PLAN_FLAGS.lifeopsCadenceReadonly,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  })
    ? realCadenceToCadenceObservations(feedbackDoneToRealCadence(feedbackObservations, now.toISOString()))
    : [];

  // Life Ops preview 統合: **fixture 入力**（実データ源未接続）+ 既読 world から briefing/moment DTO（allowlist）。
  //   c14: done feedback 由来 cadence / c20: real cadence 合成層を raw cap 前で merge（counts は integrationMeta）。
  //   c22: 同じ gated read の observations を deadline completion suppression にも注入（新規 query/flag なし）。
  const lifeOpsPreview = computeLifeOpsPreviewDto({ world, date, nowMinute, nowMs, feedbackCadence, realCadence, doneFeedback: feedbackObservations });

  // A-4-c17: 直前の action 結果 token（allowlist 検証・URL 生値を表示へ流さない）→ client は固定辞書で 1 行表示。
  const sp = await searchParams;
  const fbRaw = sp?.lifeopsFb;
  let lifeOpsActionResult = typeof fbRaw === "string" && LIFEOPS_FB_TOKENS.has(fbRaw) ? (fbRaw as LifeOpsActionResultToken) : undefined;

  // A-4-c18: done 確認 token（stage-1 redirect 由来）。parse → **現在の DTO rail に実在する時だけ** pendingDone を注入
  //   （server-rendered 検証・実在しない=陳腐化/偽造 → 確認 block を出さず invalid 表示）。
  const confirmKey = parseLifeOpsDoneConfirmToken(sp?.lifeopsConfirm);
  let pendingDone: { candidateKey: string; label: string } | undefined;
  if (confirmKey) {
    const hit = lifeOpsPreview.briefing.tiers.flatMap((t) => t.highlights).find((h) => h.candidateKey === confirmKey);
    if (hit) pendingDone = { candidateKey: confirmKey, label: hit.label };
    else lifeOpsActionResult = lifeOpsActionResult ?? "invalid";
  }

  return (
    <RealityPipelinePreviewClient
      envelope={envelope}
      meta={meta}
      reflectionPreview={reflectionPreview}
      lifeOpsPreview={lifeOpsPreview}
      feedbackAction={submitLifeOpsFeedbackAction}
      lifeOpsActionResult={lifeOpsActionResult}
      pendingDone={pendingDone}
    />
  );
}
