/**
 * planClientFeatureProps — `/plan` route と Home swipe pane の PlanClient prop parity の単一真実源。
 *
 * 背景（HOME-SWIPE-PLAN-PARITY FIX・2026-06-25）:
 *   `app/(culcept)/plan/page.tsx`（/plan route）は PlanClient に alterTabEnabled / coalterPlanTabEnabled /
 *   LifeOps / Reality 等のフラグ・server 計算 props を渡していたが、`app/(culcept)/page.tsx`（Home）が
 *   HomeSwipeContainer の pane に渡すのは `<PlanClient displayMode="pane" />` のみ＝全 prop default（false）。
 *   結果、Home 横スワイプの Plan pane は 3 タブ縮退（バッテリー/CoAlter/LifeOps/Reality 非表示）になっていた。
 *   本 helper に route 側の prop 構築ロジックを集約し、route と pane が同一 source of truth を使うことで parity を確保する。
 *   **`displayMode` だけは呼び出し側が指定**（route="route" / pane="pane"）。表示制御 props は全て同一。
 *
 * 不変条件:
 *   - DB / production / migration には触れない（既存 server 計算をそのまま移設しただけ）。
 *   - `/plan` route の挙動は退化させない（page.tsx から verbatim 抽出）。
 *   - LifeOps 計算は gate（isLifeOpsMainlineAllowed）越え時のみ・候補 0 → card undefined（従来どおり）。
 */

import type { supabaseServer } from "@/lib/supabase/server";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { buildRealityOsSurfaceFixtureDisplay } from "@/lib/plan/realityPipeline/realityOsSurfaceFixture";
import { resolveHeroCanarySurface } from "@/lib/plan/realityPipeline/heroCanaryResolver";
import { resolveShiftDraftVlmInputMode } from "@/lib/plan/shift/shiftDraftVlmInputMode";
import { isShiftImportSaveUiEnabled } from "@/lib/plan/shift/shiftImportSaveGuard";
import { isShiftDraftLiveUiAllowed } from "@/lib/plan/shift/shiftDraftLiveGuard";
import {
  STAGING_PROJECT_REF,
  CLEAN_PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";
import { isLifeOpsMainlineAllowed } from "@/lib/plan/reality/lifeops/lifeops-mainline-gate";
import { computeLifeOpsMainlineModel } from "@/lib/plan/reality/lifeops/lifeops-mainline-model";
import { buildLifeOpsMainlineCardDto, type LifeOpsMainlineCardDto } from "@/lib/plan/reality/lifeops/lifeops-mainline-card";
import { parseLifeOpsDoneConfirmToken } from "@/lib/plan/reality/lifeops/lifeops-action-request";
import { submitLifeOpsMainlineFeedbackAction } from "./_actions/lifeops-feedback-mainline";
import { submitLifeOpsStructuredSourceAction } from "./_actions/lifeops-structured-input";
import { listLifeOpsDeadlineInputCategories, listLifeOpsCadenceInputOptions } from "@/lib/plan/reality/lifeops/lifeops-structured-write";
import type { LifeOpsMainlineResultToken } from "./LifeOpsMainlineCard";
import type { LifeOpsSourceInputResultToken, LifeOpsSourceInputSourceType } from "./LifeOpsSourceInputCard";

type SupabaseServerClient = Awaited<ReturnType<typeof supabaseServer>>;

/** A-4-c23: 本線 card の PRG token allowlist（URL 生値を表示系へ流さない）。 */
const LIFEOPS_MAINLINE_FB_TOKENS = new Set(["ok", "ok_done", "gate_off", "duplicate_cooldown", "insert_failed", "invalid", "denied"]);
/** A-4-c33: 登録入口（structured source input）の token allowlist。 */
const LIFEOPS_SRC_TOKENS = new Set(["ok", "already_exists", "invalid", "gate_off", "denied"]);

/**
 * PlanClient の表示制御 props（displayMode を除く全て）を構築する。
 * route / pane の両方がこれを使い、`<PlanClient displayMode=... {...props} />` で展開する。
 *
 * @param supabase server supabase client（auth 済み）
 * @param userId   非匿名ユーザー id
 * @param searchParams PRG token 解決用の searchParams（pane は通常 undefined＝feedback toast なし・card は出る）
 */
export async function buildPlanClientFeatureProps(
  supabase: SupabaseServerClient,
  userId: string,
  searchParams?: Record<string, string | string[] | undefined>,
) {
  // ── LifeOps 本線 card（**LIFEOPS_MAINLINE gated・default OFF・staging first・production deny**）──
  //   gate OFF → 一切計算せず undefined＝従来挙動。candidate 0 → card undefined。
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
    const { model, sourceMode } = await computeLifeOpsMainlineModel(supabase, userId, new Date());
    lifeOpsCard = buildLifeOpsMainlineCardDto(model, sourceMode) ?? undefined;

    // A-4-c39: Moment read-only surface（「今の一枚」）。surfaced=null なら沈黙。
    if (PLAN_FLAGS.lifeopsMainlineMoment && model.dto.moment.surfaced) {
      lifeOpsMoment = { phrase: model.dto.moment.surfaced.phrase, cautions: model.dto.moment.surfaced.cautions };
    }

    const sp = searchParams;
    const fbRaw = sp?.lifeopsFb;
    lifeOpsActionResult =
      typeof fbRaw === "string" && LIFEOPS_MAINLINE_FB_TOKENS.has(fbRaw) ? (fbRaw as LifeOpsMainlineResultToken) : undefined;
    // done 確認 token: 現在の card items に実在する時だけ確認 block（陳腐化/偽造は invalid）。
    const confirmKey = parseLifeOpsDoneConfirmToken(sp?.lifeopsConfirm);
    if (confirmKey && lifeOpsCard) {
      const hit = lifeOpsCard.items.find((i) => i.candidateKey === confirmKey);
      if (hit) lifeOpsPendingDone = { candidateKey: confirmKey, label: hit.label };
      else lifeOpsActionResult = lifeOpsActionResult ?? "invalid";
    }

    // A-4-c33: 登録入口（候補 card と独立・**source 0 件でも出る**＝bootstrap）。write flag ON 時だけ。
    if (PLAN_FLAGS.lifeopsStructuredSourceWrite) {
      lifeOpsInputCategories = listLifeOpsDeadlineInputCategories();
      lifeOpsCadenceOptions = listLifeOpsCadenceInputOptions();
      const srcRaw = sp?.lifeopsSrc;
      lifeOpsInputResult =
        typeof srcRaw === "string" && LIFEOPS_SRC_TOKENS.has(srcRaw) ? (srcRaw as LifeOpsSourceInputResultToken) : undefined;
      lifeOpsInputResultType = sp?.lifeopsSrcType === "cadence" ? "cadence" : "deadline";
    }
  }

  // P3-9-wire: Reality OS dormant seam。flag ON 時のみ fixture-backed redacted 表示 VM。default OFF → undefined。
  const realityOsSurface = PLAN_FLAGS.realityOsSurfaceProd ? buildRealityOsSurfaceFixtureDisplay() : undefined;

  // E1: hero canary 実 read。triple gate(flag ∧ canary user ∧ read接続先guard)通過時のみ
  //   column-restricted な実 anchor を read して成立判定+理由を組む。flag OFF / 非canary / 非staging → undefined。
  const realityHeroCanary = await resolveHeroCanarySurface(
    supabase,
    userId,
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  );

  return {
    composeTimelineEnabled: PLAN_FLAGS.composeTimelineEnabled,
    lifeOpsCard,
    lifeOpsAction: lifeOpsCard ? submitLifeOpsMainlineFeedbackAction : undefined,
    lifeOpsActionResult,
    lifeOpsPendingDone,
    lifeOpsInputCategories,
    lifeOpsCadenceOptions,
    lifeOpsInputAction: lifeOpsInputCategories ? submitLifeOpsStructuredSourceAction : undefined,
    lifeOpsInputResult,
    lifeOpsInputResultType,
    lifeOpsMoment,
    // P15-B: live VLM 経路（ShiftDraftInApp）の UI 表示を **canary user 限定**にする。
    //   flag 直渡しだと flag ON 時に全ユーザーに live UI が見えてしまう（fixture fallback の意義消失）。
    //   gate = flag ∧ auth ∧ (staging ∨ clean-prod-canary)。fail-closed default で
    //     非 canary / 未認証 / 不明 host → 従来の fixture fallback modal（saveEnabled=false 固定）。
    //   保存は別 gate（shiftImportSaveEnabled）が更に通過しないと不可＝二重防御。
    draftLiveEnabled: isShiftDraftLiveUiAllowed({
      flagEnabled: PLAN_FLAGS.shiftDraftLiveEnabled,
      connection: {
        supabaseUrl:
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
        stagingRef: STAGING_PROJECT_REF,
        productionRef: CLEAN_PRODUCTION_PROJECT_REF,
      },
      userId,
      canaryUserIds: PLAN_FLAGS.shiftImportSaveCanaryUserIds,
    }),
    shiftDraftVlmInputMode: resolveShiftDraftVlmInputMode(process.env.PLAN_SHIFT_VLM_INPUT_MODE),
    // P14-B: 保存 CTA の UI active を **server lane の gate と一致**させる（flag ∧ auth ∧ (staging ∨ prod-canary)）。
    //   flag 直渡しだと flag ON 時に非 canary でも CTA が active になり「押せるのに server で disabled」＝
    //   偽の保存可能表示になる。canary 合成判定で UI active ⟺ server 受理を保証する（fail-closed）。
    //   ★ 本 prop は live 経路（ShiftDraftInApp）にのみ素通る。fixture fallback は別途 false 固定（デモ保存防止）。
    shiftImportSaveEnabled: isShiftImportSaveUiEnabled({
      flagEnabled: PLAN_FLAGS.shiftImportSave,
      connection: {
        supabaseUrl:
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
        stagingRef: STAGING_PROJECT_REF,
        // P14-B fix: UI active も server lane（importShiftRoster）と同じ clean prod 基準で判定。
        productionRef: CLEAN_PRODUCTION_PROJECT_REF,
      },
      userId,
      canaryUserIds: PLAN_FLAGS.shiftImportSaveCanaryUserIds,
    }),
    alterTabEnabled: PLAN_FLAGS.alterTabEnabled,
    dayStateStorageEnabled: PLAN_FLAGS.dayStateStorageEnabled,
    coalterPlanTabEnabled: PLAN_FLAGS.coalterPlanTabEnabled,
    viewerUserId: userId,
    realityOsSurface,
    realityHeroCanary,
  };
}
