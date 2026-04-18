/**
 * Plan Readiness Gate — Week 1 Step 6a
 *
 * 目的: 未解決拘束を抱えたまま plan_presented に進ませない。
 *
 * CEO方針 2026-04-18（4週 planner 再設計 C プラン）:
 *   「壊れた確定プランを出さない」を W1 の最優先事項とする。
 *   GPT の助言どおり、賢い再構築（W2 anchor-first）より前に、
 *   壊れた状態で確定させない安全弁を入れる。
 *
 * 固定方針:
 *   LLM は意味を掴む。ロジックが計画を組む。LLM が納得できる形で伝える。
 *
 * このファイルは「ロジックが計画を組む」の最前線。
 * LLM が出した segments を、plan_presented に進めてよいかを判定する。
 *
 * 評価ルール（いずれか該当で ready=false）:
 *   1. near_anchor_not_resolved: placeSearchHint があるのに resolvedLat/Lng が無い
 *   2. low_confidence: resolutionConfidence=low のセグメントがある
 *   3. place_search_hint_no_result: 検索したが候補 0 件（placeResolver 側で low confidence として
 *      記録されるので 2 と合流する。ここでは placeSearchHint 残存 + resolvedLat 無しで検知）
 *
 * 保守メッセージ原則（CEO 指示 2026-04-18）:
 *   「Alter が学習中です」のような曖昧文は禁止。
 *   何が未解決だから止めているかを率直に書く。
 */

import type { PlanState, PlanSegment } from "./planState";
import type { MorningPlan } from "./types";

export type GateReason =
  | "near_anchor_not_resolved"
  | "low_confidence"
  | "window_overflow";

export type GateFailure = {
  ready: false;
  reason: GateReason;
  segmentId: string;
  segmentLabel: string;
  /** ユーザーに出す率直な 1 問 sharp clarify */
  clarifyMessage: string;
  /** ログ・analytics 用の短い理由文 */
  diagnostic: string;
};

export type GateSuccess = {
  ready: true;
};

export type GateResult = GateSuccess | GateFailure;

/**
 * PlanState を評価し、plan_presented に進んでよいか判定する。
 *
 * 注: state.missingFields による transport/venue/withWhom 等の不足判定は
 *     既存の仕組みを流用する（呼び出し側で `state.missingFields.length > 0`
 *     もチェックすること）。本ゲートは place 解決の未完了に特化。
 */
export function evaluatePlanReadiness(state: PlanState): GateResult {
  for (const seg of state.segments) {
    // Rule 1: placeSearchHint が残っているのに resolvedLat/Lng が無い
    //   → near-anchor 検索が走っていない or 0 件で終わっている
    if (seg.placeSearchHint && (seg.resolvedLat === undefined || seg.resolvedLng === undefined)) {
      const hint = seg.placeSearchHint;
      const area = hint.nearAnchorLabel ?? "";
      const cat = hint.searchCategory ?? "";
      return {
        ready: false,
        reason: "near_anchor_not_resolved",
        segmentId: seg.id,
        segmentLabel: segmentLabel(seg),
        clarifyMessage: buildNearAnchorClarify(area, cat, segmentLabel(seg)),
        diagnostic: `near-anchor unresolved: area="${area}" category="${cat}" seg=${seg.id}`,
      };
    }

    // Rule 2: resolutionConfidence=low
    //   → 候補はあるが確信度が低い。確定プランにしない。
    if (seg.resolutionConfidence === "low") {
      return {
        ready: false,
        reason: "low_confidence",
        segmentId: seg.id,
        segmentLabel: segmentLabel(seg),
        clarifyMessage: buildLowConfidenceClarify(seg),
        diagnostic: `low confidence: place="${seg.place ?? ""}" seg=${seg.id}`,
      };
    }

    // Rule 3 (W2-1 2026-04-19): anchor-first planner が window.end 超過で
    //   配置できなかったセグメント。LLM の誤った時刻を信じず、plan_presented
    //   に進めない。どの hard anchor が阻んでいるかを率直に提示する。
    if (seg.placementStatus === "window_overflow") {
      return {
        ready: false,
        reason: "window_overflow",
        segmentId: seg.id,
        segmentLabel: segmentLabel(seg),
        clarifyMessage: buildWindowOverflowClarify(seg, state),
        diagnostic: `window overflow: window=${seg.timeConstraint?.type ?? "?"} seg=${seg.id}`,
      };
    }
  }

  return { ready: true };
}

/**
 * 率直な保守メッセージの原則:
 *   - 曖昧な「調整中」「学習中」は禁止
 *   - 何が未解決か明示
 *   - 1問に絞る。複数未解決があっても最初の1つだけ
 *   - ユーザーが次に何を言えばいいか選択肢を提示
 */

function buildNearAnchorClarify(area: string, cat: string, segLabel: string): string {
  // area と cat のどちらが有るかで文面を変える
  if (area && cat) {
    return `${segLabel}の場所、${area}の近くで${cat}を探してみたけど、ちょうどいい候補が見つからなかった。エリアを広げてみる？それとも別の場所を指定する？`;
  }
  if (area && !cat) {
    return `${segLabel}の場所を${area}近辺で探したいんだけど、業種（カフェ、レストラン、など）も教えてくれる？`;
  }
  if (!area && cat) {
    return `${segLabel}の${cat}、どのエリアで探せばいい？`;
  }
  // area も cat も無い（想定しにくいが安全策）
  return `${segLabel}の場所が決めきれなかった。もう少しヒントくれる？`;
}

function buildLowConfidenceClarify(seg: PlanSegment): string {
  const label = segmentLabel(seg);
  const placeName = seg.place ?? seg.resolvedPlaceName;
  if (placeName) {
    return `${label}の場所、「${placeName}」で探したんだけど候補が絞り込めなかった。もう少し具体的に教えてくれる？`;
  }
  return `${label}の場所がまだ決めきれてない。具体的な店名か、エリアだけでも教えてくれる？`;
}

/**
 * W2-1 2026-04-19: anchor-first planner が window.end 超過で配置できなかった場合。
 * 「LLM の嘘の時刻」を信じない代わりに、何が阻んでいるかを率直に伝える。
 */
function buildWindowOverflowClarify(seg: PlanSegment, state: PlanState): string {
  const label = segmentLabel(seg);
  const windowName = windowTypeToLabel(seg.timeConstraint?.type);
  // 同じ window / 直後に重なる hard anchor を抜き出す
  const blockers = state.segments
    .filter(s =>
      s.id !== seg.id &&
      s.startTime &&
      s.timeConstraint?.type &&
      (s.timeConstraint.type === "fixed_start" ||
        s.timeConstraint.type === "fixed_departure" ||
        s.timeConstraint.type === "fixed_arrival"),
    )
    .map(s => `${segmentLabel(s)}(${s.startTime})`);
  const blockerList = blockers.length > 0 ? blockers.join("・") : "";
  if (windowName && blockerList) {
    return `${label}を${windowName}に置こうとしたけど、${blockerList}で枠が埋まってる。${label}を別の時間帯にする？それともどれかをずらす？`;
  }
  if (windowName) {
    return `${label}が${windowName}の枠に収まらなかった。時間帯を変えるか、他の予定をずらすか、どっちがいい？`;
  }
  return `${label}の時刻が他の予定とぶつかって入れられなかった。どれをずらすか教えてくれる？`;
}

function windowTypeToLabel(type?: string): string {
  switch (type) {
    case "window_morning":   return "朝（6〜12時）";
    case "window_noon":      return "昼（11〜14時）";
    case "window_afternoon": return "午後（13〜18時）";
    case "window_evening":   return "夕方（17〜21時）";
    case "window_night":     return "夜（20〜24時）";
    default: return "";
  }
}

/**
 * W2-1 2026-04-19: anchor-first planner が PlanItem に立てた cannotFitWindow フラグを
 * PlanSegment の placementStatus に反映する。ID 一致でのみ伝播（user 由来 item だけ）。
 *
 * 返り値は新しい PlanState（ミューテーション禁止）。
 */
export function applyPlacementStatusFromPlan(
  state: PlanState,
  plan: { items: MorningPlan["items"] },
): PlanState {
  // id → cannotFit マップ
  const cannotFitIds = new Set<string>();
  for (const it of plan.items) {
    if (it.cannotFitWindow && it.id) {
      cannotFitIds.add(it.id);
    }
  }
  // 既に placementStatus が立っている segment は reset（毎回 plan build で再評価される）
  const segments = state.segments.map(seg => {
    const next: PlanSegment = { ...seg };
    if (cannotFitIds.has(seg.id)) {
      next.placementStatus = "window_overflow";
    } else if (seg.placementStatus === "window_overflow") {
      // 前回 overflow だったが今回 fit した → reset
      next.placementStatus = undefined;
    }
    return next;
  });
  return { ...state, segments };
}

function segmentLabel(seg: PlanSegment): string {
  return seg.activityCanonical ?? seg.activity ?? "その予定";
}

/**
 * plan_presented に進んでよいかの統合判定。
 *
 * 既存の missingFields チェックと本ゲートを合流させる。
 * 呼び出し側では:
 *   const gate = evaluatePlanReadiness(state);
 *   const shouldPresent = state.missingFields.length === 0 && gate.ready;
 * というパターンを使う。
 *
 * 本関数はヘルパー（呼び出し側を短くするため）。
 */
export function isPlanReadyForPresent(state: PlanState): boolean {
  if (state.missingFields.length > 0) return false;
  const gate = evaluatePlanReadiness(state);
  return gate.ready;
}
