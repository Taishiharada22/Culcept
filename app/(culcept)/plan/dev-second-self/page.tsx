/**
 * /plan/dev-second-self — A1-7-34 Second Self Read-only Surface Preview（**operator-only / dev-preview / read-only**）
 *
 * 目的: M3 `prm_model_entries`（review 済 tendency）が **人間にどう見えるべきか** を検証する表示面。
 *   **本格 user-facing 公開ではない**（operator-only・read-only・correction write なし・Alter 連結なし・Home/Stargazer 本線なし）。
 *   非断定・観察・共同編集トーンで「自分って、そういう人間だったのか」を尊厳を持って提示する検証。
 *
 * 三重ガード（dev preview 共通）: ① REALITY_CANDIDATE_ACTIONS_DEV_HOST ② staging ref ③ 非 production → notFound。
 *   さらに auth user（owner-only RLS）+ flag REALITY_SECOND_SELF_SURFACE（OFF なら read 0・空表示）。
 */

import { notFound } from "next/navigation";
import { isCandidateActionsPreviewHostAllowed } from "@/lib/plan/reality/candidateActionsPreviewHost";
import { supabaseServer } from "@/lib/supabase/server";
import {
  createSupabasePrmModelEntryReader,
  type PrmModelEntryReadClient,
} from "@/lib/plan/reality/learning/supabase-prm-model-entry-reader";
import { presentSecondSelf } from "@/lib/plan/reality/learning/second-self-presenter";
import type { SecondSelfTendency } from "@/lib/plan/reality/learning/prm-model-entry-read";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { SecondSelfPreviewClient } from "./SecondSelfPreviewClient";

export const dynamic = "force-dynamic";

export default async function DevSecondSelfPage() {
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

  // flag ON ∧ auth のときだけ owner の M3 tendency を read（owner-RLS・read-only）。flag OFF → 空。
  let tendencies: readonly SecondSelfTendency[] = [];
  if (user && PLAN_FLAGS.realitySecondSelfSurface) {
    const reader = createSupabasePrmModelEntryReader(supabase as unknown as PrmModelEntryReadClient, user.id);
    tendencies = await reader.readSecondSelfTendencies();
  }

  const view = presentSecondSelf(tendencies);
  // A1-7-35: confirm/correct/reject の実 write UI は別 flag（UI flag ∧ surface flag が両方 ON のときだけ操作可）。
  const feedbackEnabled = PLAN_FLAGS.realityTendencyFeedbackUi && PLAN_FLAGS.realitySecondSelfSurface;
  return <SecondSelfPreviewClient view={view} enabled={PLAN_FLAGS.realitySecondSelfSurface} feedbackEnabled={feedbackEnabled} />;
}
