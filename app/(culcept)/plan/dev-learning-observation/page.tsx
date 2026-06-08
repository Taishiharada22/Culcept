/**
 * /plan/dev-learning-observation — A1-7-28 Live Learning Observation host（dev/staging dogfood 限定）
 *
 * 目的: dogfood で蓄積した **あなたの staging `prm_learning_events`（owner-only）** を A1-7-26 reader で読み、
 *   A1-7-1 `aggregateDryRunEvents`（同日 dedup）→ A1-7-3 `projectPrmDryRun` で **tentative pattern / proposal を観測**する。
 *   **PRM 本体に保存しない・read-only**（render-only）。製品の入口ではない（一般非公開・Home 非経由）。
 *
 * 三重ガード（reality dev preview 共通 gate）: ① REALITY_CANDIDATE_ACTIONS_DEV_HOST === "true"
 *   ② supabase URL が staging ref ③ production ref を含まない → 欠ければ notFound()。production 構造的不可視。
 *   さらに auth user（owner-only RLS）。未 auth は空 report。
 */

import { notFound } from "next/navigation";
import { isCandidateActionsPreviewHostAllowed } from "@/lib/plan/reality/candidateActionsPreviewHost";
import { supabaseServer } from "@/lib/supabase/server";
import {
  createSupabasePrmLearningEventReader,
  type PrmLearningEventReadClient,
} from "@/lib/plan/reality/learning/supabase-prm-learning-event-reader";
import { aggregateDryRunEvents } from "@/lib/plan/reality/learning/dry-run-aggregation";
import { projectPrmDryRun } from "@/lib/plan/reality/learning/prm-dry-run-projection";
import type { DryRunLearningEvent } from "@/lib/plan/reality/learning/dry-run-learning-event";
import { LearningReportPreviewClient } from "../dev-learning-report/LearningReportPreviewClient";

export const dynamic = "force-dynamic";

export default async function DevLearningObservationPage() {
  if (
    !isCandidateActionsPreviewHostAllowed({
      hostMode: process.env.REALITY_CANDIDATE_ACTIONS_DEV_HOST,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    })
  ) {
    notFound();
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // owner の learning events を read（owner-only RLS・read-only）→ 同日 dedup で集約 → proposal 投影（保存しない）。
  let events: readonly DryRunLearningEvent[] = [];
  if (user) {
    const reader = createSupabasePrmLearningEventReader(supabase as unknown as PrmLearningEventReadClient, user.id);
    events = await reader.readLearningEvents();
  }
  const report = aggregateDryRunEvents(events, { dedupeSameDay: true });
  const projection = projectPrmDryRun(report);

  return <LearningReportPreviewClient report={report} projection={projection} live />;
}
