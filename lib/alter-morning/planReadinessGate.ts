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

export type GateReason =
  | "near_anchor_not_resolved"
  | "low_confidence";

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
