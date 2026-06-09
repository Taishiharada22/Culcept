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
import type { ContextSnapshot } from "@/lib/plan/context/contextModifier";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { RealityPipelinePreviewClient, type RealityPipelinePreviewMeta } from "./RealityPipelinePreviewClient";

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

export default async function DevRealityPipelinePage() {
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

  // **client には envelope（要約）+ count(meta) のみ**（MemoryItem/WorldState/ChangeSet 実体・raw row は渡さない）。
  const meta: RealityPipelinePreviewMeta = {
    hardConstraintsCount: world.todaySchedule.length,
    availableWindowsCount: world.availableWindows.length,
    usableContextsCount: synthesis.usableContexts.length,
    memoryItemCount: memoryItems.length,
  };

  return <RealityPipelinePreviewClient envelope={envelope} meta={meta} />;
}
