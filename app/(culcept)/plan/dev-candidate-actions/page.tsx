/**
 * /plan/dev-candidate-actions — staging/dev 限定 A1-6-8 Candidate Action UI **render-only preview** host（§9.14）
 *
 * 目的: candidate banner（A1-5-7-6）+ A1-6-8 accept/dismiss/later ボタンの **interactive UI を browser で目視確認**する host。
 *       **製品の入口ではありません**（一般ユーザー非公開・Home 非経由・本流非接続）。
 *
 * render-only（CEO 判断 2026-06-08）:
 *   - fixture candidate + fixture MorningPlan を local state で持ち、onCandidateAction は **REAL pure helper**
 *     applyCandidateActionResult で local plan に optimistic add（click→pending→success/error/deferred を目視）。
 *   - **real route / DB は呼ばない**（route は A1-6-6・reflection は A1-6-7 で staging 検証済）。E2E 機能 smoke は別 GO。
 *
 * 三重ガード（candidateActionsPreviewHost に委譲）:
 *   ① REALITY_CANDIDATE_ACTIONS_DEV_HOST === "true"（明示 opt-in）
 *   ② supabase URL が staging ref を含む（allowlist）／③ production ref を含まない（deny）
 *   → 欠ければ notFound()。production env では未設定で構造的に不可視。
 */

import { notFound } from "next/navigation";
import { isCandidateActionsPreviewHostAllowed } from "@/lib/plan/reality/candidateActionsPreviewHost";
import { CandidateActionsPreviewClient } from "./CandidateActionsPreviewClient";

export const dynamic = "force-dynamic";

export default function DevCandidateActionsPage() {
  // 三重ガード（明示 flag + staging allowlist + production deny）。production では notFound（構造的に不可視）。
  if (
    !isCandidateActionsPreviewHostAllowed({
      hostMode: process.env.REALITY_CANDIDATE_ACTIONS_DEV_HOST,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    })
  ) {
    notFound();
  }
  return <CandidateActionsPreviewClient />;
}
