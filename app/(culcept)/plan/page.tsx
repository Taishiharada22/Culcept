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
import AnonymousRegistrationPage from "@/components/auth/AnonymousRegistrationPage";
import { isLifeOpsMainlineAllowed } from "@/lib/plan/reality/lifeops/lifeops-mainline-gate";
import { computeLifeOpsMainlineModel } from "@/lib/plan/reality/lifeops/lifeops-mainline-model";
import { buildLifeOpsMainlineCardDto, type LifeOpsMainlineCardDto } from "@/lib/plan/reality/lifeops/lifeops-mainline-card";
import { parseLifeOpsDoneConfirmToken } from "@/lib/plan/reality/lifeops/lifeops-action-request";
import { submitLifeOpsMainlineFeedbackAction } from "./_actions/lifeops-feedback-mainline";
import type { LifeOpsMainlineResultToken } from "./LifeOpsMainlineCard";

import PlanClient from "./PlanClient";

export const dynamic = "force-dynamic";

/** A-4-c23: 本線 card の PRG token allowlist（URL 生値を表示系へ流さない）。 */
const LIFEOPS_MAINLINE_FB_TOKENS = new Set(["ok", "ok_done", "gate_off", "duplicate_cooldown", "insert_failed", "invalid", "denied"]);

export default async function PlanPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  // A-4-c23: Life Ops 本線最小 card（**LIFEOPS_MAINLINE gated・default OFF・staging first・production deny**）。
  //   gate OFF → 一切計算せず props 不渡し＝/plan は完全従来挙動（server 負荷も 0）。
  let lifeOpsCard: LifeOpsMainlineCardDto | undefined;
  let lifeOpsActionResult: LifeOpsMainlineResultToken | undefined;
  let lifeOpsPendingDone: { candidateKey: string; label: string } | undefined;
  if (
    isLifeOpsMainlineAllowed({
      mainline: PLAN_FLAGS.lifeopsMainline,
      planRouteLive: PLAN_FLAGS.planRouteLive,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    })
  ) {
    const { model } = await computeLifeOpsMainlineModel(supabase, auth.user.id, new Date());
    lifeOpsCard = buildLifeOpsMainlineCardDto(model) ?? undefined; // 候補 0 → card 自体を出さない

    const sp = await searchParams;
    const fbRaw = sp?.lifeopsFb;
    lifeOpsActionResult =
      typeof fbRaw === "string" && LIFEOPS_MAINLINE_FB_TOKENS.has(fbRaw) ? (fbRaw as LifeOpsMainlineResultToken) : undefined;
    // done 確認 token: 現在の card items に実在する時だけ確認 block（server-rendered 検証・陳腐化/偽造は invalid 表示）。
    const confirmKey = parseLifeOpsDoneConfirmToken(sp?.lifeopsConfirm);
    if (confirmKey && lifeOpsCard) {
      const hit = lifeOpsCard.items.find((i) => i.candidateKey === confirmKey);
      if (hit) lifeOpsPendingDone = { candidateKey: confirmKey, label: hit.label };
      else lifeOpsActionResult = lifeOpsActionResult ?? "invalid";
    }
  }

  // 3. Hand-off to client
  //    A-4b: compose flag は server-only（PLAN_FLAGS）。ここで読み取り prop で client に渡す
  //    （homeSwipeEnabled と同方式。client 直読みは不可）。
  return (
    <PlanClient
      composeTimelineEnabled={PLAN_FLAGS.composeTimelineEnabled}
      lifeOpsCard={lifeOpsCard}
      lifeOpsAction={lifeOpsCard ? submitLifeOpsMainlineFeedbackAction : undefined}
      lifeOpsActionResult={lifeOpsActionResult}
      lifeOpsPendingDone={lifeOpsPendingDone}
    />
  );
}
