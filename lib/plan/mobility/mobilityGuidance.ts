// lib/plan/mobility/mobilityGuidance.ts
//
// v0-D: leg の guidance を「hypothesis surface」か「既存 recall」か 1 つに統一して決める純粋 helper。
// MapTab が loadModeBelief(★実 S1-A データ)で belief を読み、本 helper を呼んで card に渡す。本 helper は pure。
//
// 出す条件（最大ケース gate・GPT 補正込み）:
//   非readOnly(補正1) ∧ 未選択(補正2: null/undefined両対応) ∧ 非sensitive ∧ gate surface(moderate+・非split)
//   → hypothesis を出し、recall は抑止（補正3: hypothesis と recall を重複させない＝1 guidance surface）
//   それ以外 → hypothesis null・既存 recall を返す
//
// 禁則: writeback なし / weather→mode なし / mock belief なし（呼び側が loadModeBelief で実データを渡す）。

import type { RouteTransportMode } from "@/lib/plan/map/routeMode";
import { buildMobilityHypothesis, type ModeBelief, type DecisionContext } from "./mobilityHypothesis";
import { decideSurface } from "./necessityGate";
import { buildExplanationCopy, type ExplanationCopy } from "./explanationCopy";

export interface MobilityGuidanceInput {
  /** ★実 S1-A 履歴由来（loadModeBelief）。mock 禁止 */
  readonly belief: ModeBelief;
  /** 今日の選択（null/undefined = 未選択） */
  readonly selectedMode: RouteTransportMode | null | undefined;
  /** 過去(done) leg は実績の器＝hypothesis 対象外（補正1） */
  readonly readOnly: boolean;
  /** leg が sensitive（privacy blackout） */
  readonly sensitive: boolean;
  /** 既存 S2-A recall（hypothesis が出ない時の fallback） */
  readonly recallMode: RouteTransportMode | null;
  /**
   * ★A2-7: 今日の天気（任意）。屋外露出 habitual mode × 悪天候のとき contextNote（注意）を付すためだけ。
   * ★mode を変えない（既存 guardrail 保持）。不在/null → 従来通り contextNote なし（後方互換）。
   */
  readonly weather?: DecisionContext["weather"];
}

export interface MobilityGuidance {
  /** surface する hypothesis copy（出さないなら null） */
  readonly hypothesisCopy: ExplanationCopy | null;
  /** card に渡す recall（hypothesis 優先時は null＝重複させない） */
  readonly recallMode: RouteTransportMode | null;
  /** v0-E: 仮説として表示されていた mode（feedback の kind 判定用・surface 時のみ非 null） */
  readonly surfacedMode: RouteTransportMode | null;
}

/** 未選択判定（補正2: null/undefined 両対応） */
function isUnselected(mode: RouteTransportMode | null | undefined): boolean {
  return mode == null;
}

/**
 * v0-D: hypothesis を出すか recall を出すかを 1 つに統一して決める（純粋）。
 *   hypothesis surface → { hypothesisCopy, recallMode: null }（重複抑止）。
 *   それ以外           → { hypothesisCopy: null, recallMode }（既存 recall）。
 */
export function resolveMobilityGuidance(input: MobilityGuidanceInput): MobilityGuidance {
  const { belief, selectedMode, readOnly, sensitive, recallMode, weather } = input;

  // 補正1+2: readOnly / 選択済み は hypothesis 対象外（recall は呼び側の既存ロジックのまま）
  if (readOnly || !isUnselected(selectedMode)) {
    return { hypothesisCopy: null, recallMode, surfacedMode: null };
  }

  // ★A2-7: weather を渡す（屋外 mode × 悪天候の contextNote 用・mode は変えない）。不在→{}（後方互換）。
  const hypothesis = buildMobilityHypothesis(belief, weather ? { weather } : {});
  const decision = decideSurface(hypothesis, { sensitive });
  if (!decision.surface) {
    return { hypothesisCopy: null, recallMode, surfacedMode: null };
  }

  const copy = buildExplanationCopy(hypothesis, decision);
  if (!copy.surface) {
    return { hypothesisCopy: null, recallMode, surfacedMode: null }; // 防御
  }

  // 補正3: hypothesis 優先・recall 抑止（1 guidance surface）
  return { hypothesisCopy: copy, recallMode: null, surfacedMode: hypothesis.todayLikelyMode };
}
