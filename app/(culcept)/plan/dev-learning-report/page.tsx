/**
 * /plan/dev-learning-report — A1-7-2 Shadow Learning Preview host（dev/staging 限定）
 *
 * 目的: A1-7-1 `aggregateDryRunEvents` の tentative pattern report を fixture から描画し、PRM 永続化前に学習品質を目視検証。
 *       **製品の入口ではありません**（一般非公開・Home 非経由・real event/DB/persistence/route なし・fixtures のみ）。
 *
 * 三重ガード（reality dev preview の共通 gate・flag/helper 再利用）:
 *   ① REALITY_CANDIDATE_ACTIONS_DEV_HOST === "true" ② supabase URL が staging ref ③ production ref を含まない
 *   → 欠ければ notFound()。production env では未設定で構造的に不可視。
 */

import { notFound } from "next/navigation";
import { isCandidateActionsPreviewHostAllowed } from "@/lib/plan/reality/candidateActionsPreviewHost";
import { LearningReportPreviewClient } from "./LearningReportPreviewClient";

export const dynamic = "force-dynamic";

export default function DevLearningReportPage() {
  if (
    !isCandidateActionsPreviewHostAllowed({
      hostMode: process.env.REALITY_CANDIDATE_ACTIONS_DEV_HOST,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    })
  ) {
    notFound();
  }
  return <LearningReportPreviewClient />;
}
