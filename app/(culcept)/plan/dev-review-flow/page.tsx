/**
 * /plan/dev-review-flow — A1-7-9 Review Flow Preview host（dev/staging 限定）
 *
 * 目的: A1-7-7/7-8 review flow（proposal→decision→ReviewDecisionRecord）を fixture で描画し、永続化前に目視検証。
 *       **製品の入口ではありません**（一般非公開・Home 非経由・real decision/DB/persistence/route なし・fixtures のみ）。
 *
 * 三重ガード（reality dev preview の共通 gate・flag/helper 再利用）:
 *   ① REALITY_CANDIDATE_ACTIONS_DEV_HOST === "true" ② supabase URL が staging ref ③ production ref を含まない → 欠ければ notFound()。
 */

import { notFound } from "next/navigation";
import { isCandidateActionsPreviewHostAllowed } from "@/lib/plan/reality/candidateActionsPreviewHost";
import { ReviewFlowPreviewClient } from "./ReviewFlowPreviewClient";

export const dynamic = "force-dynamic";

export default function DevReviewFlowPage() {
  if (
    !isCandidateActionsPreviewHostAllowed({
      hostMode: process.env.REALITY_CANDIDATE_ACTIONS_DEV_HOST,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    })
  ) {
    notFound();
  }
  return <ReviewFlowPreviewClient />;
}
