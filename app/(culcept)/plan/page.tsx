/**
 * /plan — Alter Plan View (W1-5 本実装)
 *
 * Server Component: feature flag + auth gate のみ。実 data fetch は client 側
 * （cookie auth + GET /api/plan/anchors の RLS-aware path）。
 *
 * 設計書: docs/alter-plan-w15-ui-mini-design.md
 *
 * Flow:
 *   1. PLAN_FLAGS.planRouteLive === false → notFound（本番 default）
 *   2. auth 未認証 → /login?next=/plan
 *   3. anonymous user → AnonymousRegistrationPage で誘導
 *   4. それ以外 → PlanClient（client root）に委譲
 *
 * 範囲外:
 *   - Home / MAIN_NAV 変更
 *   - baseline 強制（Alter Plan は baseline 不要、固定予定は baseline 前にも持ちうる）
 *   - DraftPlan generator
 *   - W1-6 passive drift logging
 *   - W1-8 Home 導線
 */

import { notFound, redirect } from "next/navigation";

import { supabaseServer } from "@/lib/supabase/server";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { resolveShiftDraftVlmInputMode } from "@/lib/plan/shift/shiftDraftVlmInputMode";
import AnonymousRegistrationPage from "@/components/auth/AnonymousRegistrationPage";

import PlanClient from "./PlanClient";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  // 1. Feature flag gate (W1-2 から継承)
  if (!PLAN_FLAGS.planRouteLive) {
    notFound();
  }

  // 2. Auth gate (W1-5 で追加)
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    redirect("/login?next=/plan");
  }

  if (auth.user.is_anonymous) {
    return <AnonymousRegistrationPage featureName="Plan" />;
  }

  // 3. Hand-off to client
  //    A-4b: compose flag は server-only（PLAN_FLAGS）。ここで読み取り prop で client に渡す
  //    （homeSwipeEnabled と同方式。client 直読みは不可）。
  //    S3A-2-2-1: shiftDraftLiveEnabled も同方式（server-only flag → boolean prop）。
  //    S-save-2: shiftImportSaveEnabled（= PLAN_SHIFT_IMPORT_SAVE）も同方式。server で読み prop で渡す
  //    （client 直読み禁止）。OFF（本番既定）で保存 dormant＝確認画面の保存ボタン無効・action 未呼出。
  return (
    <PlanClient
      composeTimelineEnabled={PLAN_FLAGS.composeTimelineEnabled}
      draftLiveEnabled={PLAN_FLAGS.shiftDraftLiveEnabled}
      shiftDraftVlmInputMode={resolveShiftDraftVlmInputMode(
        process.env.PLAN_SHIFT_VLM_INPUT_MODE
      )}
      shiftImportSaveEnabled={PLAN_FLAGS.shiftImportSave}
    />
  );
}
