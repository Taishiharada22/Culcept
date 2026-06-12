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
import { submitLifeOpsStructuredSourceAction } from "./_actions/lifeops-structured-input";
import { listLifeOpsDeadlineInputCategories, listLifeOpsCadenceInputOptions } from "@/lib/plan/reality/lifeops/lifeops-structured-write";
import type { LifeOpsMainlineResultToken } from "./LifeOpsMainlineCard";
import type { LifeOpsSourceInputResultToken, LifeOpsSourceInputSourceType } from "./LifeOpsSourceInputCard";

import PlanClient from "./PlanClient";

export const dynamic = "force-dynamic";

/** A-4-c23: 本線 card の PRG token allowlist（URL 生値を表示系へ流さない）。 */
const LIFEOPS_MAINLINE_FB_TOKENS = new Set(["ok", "ok_done", "gate_off", "duplicate_cooldown", "insert_failed", "invalid", "denied"]);
/** A-4-c33: 登録入口（structured source input）の token allowlist。 */
const LIFEOPS_SRC_TOKENS = new Set(["ok", "already_exists", "invalid", "gate_off", "denied"]);

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
  let lifeOpsInputCategories: readonly { id: string; label: string }[] | undefined;
  let lifeOpsCadenceOptions: readonly { value: string; label: string }[] | undefined;
  let lifeOpsInputResult: LifeOpsSourceInputResultToken | undefined;
  let lifeOpsInputResultType: LifeOpsSourceInputSourceType | undefined;
  let lifeOpsMoment: { phrase: string; cautions: readonly string[] } | undefined;
  if (
    isLifeOpsMainlineAllowed({
      mainline: PLAN_FLAGS.lifeopsMainline,
      planRouteLive: PLAN_FLAGS.planRouteLive,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    })
  ) {
    const { model, sourceMode } = await computeLifeOpsMainlineModel(supabase, auth.user.id, new Date());
    // c26: mode を渡す（real_only では sparse fallback 最大 1 件が有効・fixture_allowed は従来どおり）。候補 0 → card なし。
    lifeOpsCard = buildLifeOpsMainlineCardDto(model, sourceMode) ?? undefined;

    // A-4-c39: Moment read-only surface（「今の一枚」）。**mainline gate ∧ MOMENT flag ∧ surfaced 非 null** の時だけ props 渡し。
    //   moment は既に compute 済み（model.dto.moment）。focus/recovery 沈黙・重複制御・cap1 は VM 側で処理済み＝surfaced=null なら沈黙。
    //   表示は phrase + cautions のみ（kind/suppression/silencedCount は搬出しない）。
    if (PLAN_FLAGS.lifeopsMainlineMoment && model.dto.moment.surfaced) {
      lifeOpsMoment = { phrase: model.dto.moment.surfaced.phrase, cautions: model.dto.moment.surfaced.cautions };
    }

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

    // A-4-c33: 登録入口（候補 card と独立・**source 0 件でも出る**＝bootstrap）。write flag も ON の時だけ。
    if (PLAN_FLAGS.lifeopsStructuredSourceWrite) {
      lifeOpsInputCategories = listLifeOpsDeadlineInputCategories();
      lifeOpsCadenceOptions = listLifeOpsCadenceInputOptions(); // A-4-c34: L-2 spec 実在 5 組のみ
      const srcRaw = sp?.lifeopsSrc;
      lifeOpsInputResult =
        typeof srcRaw === "string" && LIFEOPS_SRC_TOKENS.has(srcRaw) ? (srcRaw as LifeOpsSourceInputResultToken) : undefined;
      // A-4-c34: type も allowlist 検証（文言の出し分けのみに使用・既定 deadline）。
      lifeOpsInputResultType = sp?.lifeopsSrcType === "cadence" ? "cadence" : "deadline";
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
      lifeOpsInputCategories={lifeOpsInputCategories}
      lifeOpsCadenceOptions={lifeOpsCadenceOptions}
      lifeOpsInputAction={lifeOpsInputCategories ? submitLifeOpsStructuredSourceAction : undefined}
      lifeOpsInputResult={lifeOpsInputResult}
      lifeOpsInputResultType={lifeOpsInputResultType}
      lifeOpsMoment={lifeOpsMoment}
      // C-1: 認証 self の userId を read-only prop で渡す（CoAlter relation binding が self を
      //   推論せず server 値から取るため。client に auth ロジックを増やさない）。
      viewerUserId={auth.user.id}
    />
  );
}
