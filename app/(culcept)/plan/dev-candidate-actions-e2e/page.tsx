/**
 * /plan/dev-candidate-actions-e2e — staging/dev 限定 A1-6-9 Candidate Action **E2E Functional** Preview host（§9.15）
 *
 * 目的: A1-6-8 banner + buttons を **real route（/api/reality/candidate-action）+ real staging DB** で E2E 検証する host。
 *   「テスト候補を作成 → 予定に入れる/今はいい/あとで → route POST → DB status 更新 → MorningPlan 反映」を browser で確認。
 *   **製品の入口ではありません**（一般ユーザー非公開・Home 非経由・本流非接続）。既存 render-only preview（/plan/dev-candidate-actions）は不変。
 *
 * 三重ガード（candidateActionsPreviewHost に委譲・render-only と同一）:
 *   ① REALITY_CANDIDATE_ACTIONS_DEV_HOST === "true" ② staging ref を含む ③ production ref を含まない → 欠ければ notFound。
 *   server actions（actions.ts）側も同一ガードを各 action 冒頭で再適用（直接呼び出し対策）。production は構造的に不可視。
 */

import { notFound } from "next/navigation";
import { isCandidateActionsPreviewHostAllowed } from "@/lib/plan/reality/candidateActionsPreviewHost";
import { CandidateActionsE2EClient } from "./CandidateActionsE2EClient";

export const dynamic = "force-dynamic";

export default function DevCandidateActionsE2EPage() {
  if (
    !isCandidateActionsPreviewHostAllowed({
      hostMode: process.env.REALITY_CANDIDATE_ACTIONS_DEV_HOST,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    })
  ) {
    notFound();
  }
  return <CandidateActionsE2EClient />;
}
