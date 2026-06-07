/**
 * /plan/dev-reflected-item — A1-6-12（#3）reflected item の **MorningPlanCard 描画検証** preview host（dev/staging 限定）
 *
 * 目的: reflected consumed item（A1-6-7 + A1-6-12 sharpness）が **実 MorningPlanCard** で label を捨てず描画されるか目視/screenshot 検証。
 *       **製品の入口ではありません**（一般非公開・Home 非経由・real route/DB 不使用・fixture のみ）。
 *
 * 三重ガード（candidate preview と**同一 flag/helper を再利用**＝reality dev preview の共通 gate）:
 *   ① REALITY_CANDIDATE_ACTIONS_DEV_HOST === "true"（明示 opt-in）
 *   ② supabase URL が staging ref を含む／③ production ref を含まない
 *   → 欠ければ notFound()。production env では未設定で構造的に不可視。
 */

import { notFound } from "next/navigation";
import { isCandidateActionsPreviewHostAllowed } from "@/lib/plan/reality/candidateActionsPreviewHost";
import { ReflectedItemPreviewClient } from "./ReflectedItemPreviewClient";

export const dynamic = "force-dynamic";

export default function DevReflectedItemPage() {
  // 三重ガード（明示 flag + staging allowlist + production deny）。production では notFound（構造的に不可視）。
  if (
    !isCandidateActionsPreviewHostAllowed({
      hostMode: process.env.REALITY_CANDIDATE_ACTIONS_DEV_HOST,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    })
  ) {
    notFound();
  }
  return <ReflectedItemPreviewClient />;
}
