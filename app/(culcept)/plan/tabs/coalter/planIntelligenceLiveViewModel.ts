/**
 * C6-A-1 — Plan Intelligence Live ViewModel（**pure・display-safe**）
 *
 * 役割: travel engine の display 結果（`TravelPlanDisplayResult`）を、CoAlter の Plan Intelligence
 *   パネルが描画する UI ViewModel へ写す純関数。**合意形成知性**（5 角度の提案・各案が 2 人に
 *   どう適合/衝突するか・なぜこの案か・却下した案とその理由・不確実性・確認/質問）を主役にする。
 *
 * honest（捏造ゼロ）:
 *   - 距離 / 経路座標 / 具体到着時刻は engine が持たない（solver 未実装）。VM は **物理未確定**を明示し、
 *     fixture の地図/距離を live 値として偽装しない。
 *   - private（本人 rationale）は `SharedProposalView` が型レベルで持たない＝VM も受け取れない（M5 leak 不能）。
 *   - ラベル未知の key は **そのまま表示**（誤訳より素直）。
 */

import type { ConstraintAxis, UncertaintyLevel } from "@/lib/shared/travel/core-types";
import type { FitLabel, ProposalAngle } from "@/lib/shared/travel/proposal-types";
import type { NextAction } from "@/lib/shared/travel/packet-types";
import type { TravelSlotKey } from "@/lib/shared/travel/slot-types";
import type { RejectedAngleView, SharedProposalView } from "@/lib/shared/travel/shared-proposal-view";
import type { TravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter-types";

// ─────────────────────────────────────────────────────────────────────────────
// 日本語ラベル（UI 文言・未知 key は素通し）
// ─────────────────────────────────────────────────────────────────────────────

const ANGLE_JA: Record<ProposalAngle, string> = {
  relaxed: "ゆったり",
  food_focused: "食重視",
  active: "アクティブ",
  nature: "自然",
  culture: "文化",
};

const FIT_JA: Record<FitLabel, string> = {
  fit: "合う",
  stretch: "やや負担",
  conflict: "合わない",
};

const UNCERTAINTY_JA: Record<UncertaintyLevel, string> = {
  high: "情報が少ない",
  medium: "おおよそ確か",
  low: "確度は高い",
};

const NEXT_ACTION_JA: Record<NextAction, string> = {
  propose_plan: "提案中",
  confirm: "確認待ち",
  handle_contingency: "代替を検討",
  ask_question: "聞きたいことがある",
  await_preference: "希望を待っています",
  blocked: "保留中",
};

const AXIS_JA: Record<ConstraintAxis, string> = {
  time: "時間",
  budget: "予算",
  distance: "距離",
  fatigue: "体力",
  weather: "天候",
  preference: "好み",
  crowd: "混雑",
};

const SLOT_JA: Partial<Record<TravelSlotKey, string>> = {
  destination_area: "行き先",
  date_or_range: "日程",
  time_window: "時間帯",
  budget_band: "予算",
  pace: "ペース",
  mobility_tolerance: "移動",
  red_line: "譲れない条件",
  soft_preference: "希望",
};

const SOFT_MATCH_JA: Record<string, string> = {
  calm: "落ち着き",
  relax: "リラックス",
  quiet: "静けさ",
  food: "食",
  gourmet: "グルメ",
  active: "活動的",
  sightseeing: "観光",
  nature: "自然",
  culture: "文化",
  art: "アート",
  onsen: "温泉",
  conversational: "会話しやすさ",
  local: "地元感",
};

const QUESTION_JA: Record<string, string> = {
  ask_destination: "行き先はどのあたりにしますか？",
  ask_date: "日程はいつにしますか？",
  ask_budget: "予算の目安はどのくらいですか？",
};

const PREREQ_JA: Record<string, string> = {
  destination: "行き先",
  date_or_range: "日程",
  participants: "参加者",
  session_slots: "条件",
  user_intake: "希望",
  fixture_not_allowed: "設定",
  m2_personalization: "個人傾向",
  route_weather_place: "現地情報",
};

// ─────────────────────────────────────────────────────────────────────────────
// ViewModel 型
// ─────────────────────────────────────────────────────────────────────────────

export interface CandidateVM {
  candidateId: string;
  angle: ProposalAngle;
  angleLabel: string;
  title: string;
  /** rationale.shared（なぜこの案か・private 非搭載） */
  why: string;
  area: string;
  paceFit: FitLabel;
  paceFitLabel: string;
  mobilityFit: FitLabel;
  mobilityFitLabel: string;
  /** この角度に効いた共有希望（日本語ラベル） */
  softMatchLabels: string[];
  uncertainty: UncertaintyLevel;
  uncertaintyLabel: string;
  /** まだ足りない入力（日本語ラベル） */
  missingLabels: string[];
  budgetBandLabel: string | null;
  recommended: boolean;
}

export interface RejectedVM {
  angle: ProposalAngle;
  angleLabel: string;
  /** なぜ外したか（日本語） */
  reason: string;
}

/**
 * S2 — personalization readout（**additive・optional**）。
 *   self の観測軸が proposal 順位に反映されたこと（engine 注入）＋ 2 人の噛み合わせ（説明レイヤ）。
 *   `demo` は **観測の出自**（preview の demo 軸 = true / 実データ = false）。UI が誤認防止に表示する。
 */
export interface PersonalizationReadoutVM {
  /** true = preview 用 demo 軸（実データではない）。UI にバッジ表示する。 */
  demo: boolean;
  /** viewer 本人の傾向（confidence 十分な軸のみ・空可）。 */
  selfReadout: string[];
  /** 2 人の一致 / 差（両者とも confidence 十分な軸のみ・空可）。 */
  pairReadout: string[];
}

export interface PlanIntelligenceLiveReadyVM {
  status: "ready";
  candidates: CandidateVM[];
  decision: {
    recommendedProposalId: string | null;
    /** おすすめ理由（whyThisPlan・shared） */
    why: string;
    nextActionLabel: string;
  };
  questions: { label: string }[];
  confirmations: { label: string }[];
  risks: { label: string }[];
  rejected: RejectedVM[];
  /** ★ honest: 距離/経路/到着時刻は solver 未実装＝場所確定後に算出（捏造しない） */
  physical: { resolved: false; note: string };
  /** ★ S2 additive: personalization 反映の readout（注入時のみ・absent は S1 と byte 等価）。 */
  personalization?: PersonalizationReadoutVM;
}

export type PlanIntelligenceLiveVM =
  | PlanIntelligenceLiveReadyVM
  | { status: "needs_input"; asks: { label: string }[] }
  | { status: "unavailable" };

// ─────────────────────────────────────────────────────────────────────────────
// builder
// ─────────────────────────────────────────────────────────────────────────────

const PHYSICAL_NOTE = "距離・経路・到着時刻は、行き先の場所が確定すると算出します（次フェーズ）。";

function candidateVM(p: SharedProposalView, recommendedId: string | null): CandidateVM {
  return {
    candidateId: p.candidateId,
    angle: p.angle,
    angleLabel: ANGLE_JA[p.angle],
    title: p.title,
    why: p.whyShared,
    area: p.areaPlaceholder,
    paceFit: p.paceFit,
    paceFitLabel: FIT_JA[p.paceFit],
    mobilityFit: p.mobilityFit,
    mobilityFitLabel: FIT_JA[p.mobilityFit],
    softMatchLabels: p.softMatches.map((m) => SOFT_MATCH_JA[m.descriptorValue] ?? m.descriptorValue),
    uncertainty: p.uncertainty,
    uncertaintyLabel: UNCERTAINTY_JA[p.uncertainty],
    missingLabels: p.missingInputs.map((k) => SLOT_JA[k] ?? k),
    budgetBandLabel: p.budgetBand ? `〜${p.budgetBand.hi}円` : null,
    recommended: p.candidateId === recommendedId,
  };
}

function rejectReason(view: RejectedAngleView): string {
  if (view.reasons.length === 0) return "条件と合わないため";
  const axes = Array.from(new Set(view.reasons.map((r) => AXIS_JA[r.axis] ?? r.axis)));
  return `${axes.join("・")}の条件と合わないため`;
}

/**
 * travel display 結果 → Plan Intelligence Live VM。決定論・副作用なし。
 *   ready → 候補/決定/質問/確認/リスク/却下/物理未確定。not-ready → 何を聞くか。それ以外 → unavailable。
 *   @param options.personalization S2 additive。提供時のみ ready VM に readout を載せる
 *     （absent → S1 と byte 等価・既存呼び出しは無改修で通る）。
 */
export function buildPlanIntelligenceLiveVM(
  result: TravelPlanDisplayResult,
  options?: { personalization?: PersonalizationReadoutVM },
): PlanIntelligenceLiveVM {
  if (result.status === "not_ready_missing" || result.status === "not_ready_unconfirmed") {
    return {
      status: "needs_input",
      asks: result.ask.map((a) => ({ label: PREREQ_JA[a.prerequisite] ?? a.prerequisite })),
    };
  }
  if (result.status === "unavailable" || result.status === "invalid") {
    return { status: "unavailable" };
  }

  const { projection, proposalsDisplay } = result.display;
  const display = proposalsDisplay ?? { proposals: [], rejected: [], inputError: null };
  const recommendedId = projection.answer.recommendedProposalId;

  const vm: PlanIntelligenceLiveReadyVM = {
    status: "ready",
    candidates: display.proposals.map((p) => candidateVM(p, recommendedId)),
    decision: {
      recommendedProposalId: recommendedId,
      why: projection.whyThisPlan,
      nextActionLabel: NEXT_ACTION_JA[projection.answer.nextAction] ?? projection.answer.nextAction,
    },
    questions: projection.questionsToAsk.map((q) => ({ label: QUESTION_JA[q.intent] ?? q.intent })),
    confirmations: projection.needsConfirmation.map((c) => ({ label: c.reason })),
    risks: projection.whatCouldFail.map((f) => ({ label: f.note })),
    rejected: display.rejected.map((r) => ({ angle: r.angle, angleLabel: ANGLE_JA[r.angle], reason: rejectReason(r) })),
    physical: { resolved: false, note: PHYSICAL_NOTE },
  };
  // ★ S2: personalization 提供時のみ載せる（self/pair とも空配列なら readout は省く＝中身がある時だけ）。
  const personalization = options?.personalization;
  if (personalization && (personalization.selfReadout.length > 0 || personalization.pairReadout.length > 0)) {
    vm.personalization = personalization;
  }
  return vm;
}
