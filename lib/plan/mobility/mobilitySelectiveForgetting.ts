/**
 * lib/plan/mobility/mobilitySelectiveForgetting.ts — L3: selective forgetting（regime-change 緩和）
 *
 * パターンが変わった時だけ古い確信を precision で少し弱める。★素朴な time-decay は使わない
 * （時間が経っただけでは緩めない）。belief を消さず重みだけ下げる（削除でない）。
 *
 * 検出: leg の explicitCorrection 連続（末尾が同一 mode Y への連続訂正・長さ≥streakN）→ regime-change to Y。
 *   change-point = その連続の開始日。change-point より古い観測の重みを ×λ。regime-change なし → ×1（退行ゼロ）。
 *
 * L4 との関係: L3 は per-observation 重みの adapter（regimeFactorFn）を作るだけ。L4-b の builder が
 *   precisionWeight × regimeFactor で集計・pool。順序固定 L3→L4・二重緩和なし。
 * 不変: pure / 3 store READ のみ / Date.now 不使用（change-point は観測日=plan 日付） / 新 store なし / 削除しない。
 */
import { type HypothesisFeedbackStore } from "./hypothesisFeedbackStore";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

export interface SelectiveForgettingConfig {
  /** regime-change 判定に要する連続 correction 数 */
  readonly streakN: number;
  /** pre-change 観測の重み倍率（<1・削除でない＝0 でない・少し弱める） */
  readonly lambda: number;
}
/** GPT 確定 2026-06-05: N=2 / λ=0.5。較正は L3-c（実データ後）。 */
export const DEFAULT_L3_CONFIG: SelectiveForgettingConfig = { streakN: 2, lambda: 0.5 };

/**
 * leg の regime-change を検出（純粋）。
 * leg の explicitCorrection を日付順に並べ、末尾の「同一 mode への連続」が streakN 以上なら
 * regime-change（その mode へ）。change-point = その連続の開始日。
 * ★時間でなく「矛盾の連続」が trigger（素朴 decay でない）。
 */
export function detectRegimeChange(
  feedback: HypothesisFeedbackStore,
  legKey: string,
  streakN: number,
): { changePoint: string; toMode: RouteTransportMode } | null {
  if (typeof legKey !== "string" || legKey.length === 0 || streakN < 1) return null;
  const corrections: { day: string; mode: RouteTransportMode }[] = [];
  for (const [day, legs] of Object.entries(feedback.byDay)) {
    const e = legs[legKey];
    if (e && e.kind === "explicitCorrection") corrections.push({ day, mode: e.chosenMode });
  }
  if (corrections.length < streakN) return null;
  corrections.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)); // ISO 日付=辞書順=時系列
  const lastMode = corrections[corrections.length - 1]!.mode;
  let start = corrections.length - 1;
  while (start > 0 && corrections[start - 1]!.mode === lastMode) start -= 1; // 末尾の同一 mode 連続
  if (corrections.length - start < streakN) return null; // 連続長 < N → regime-change なし
  return { changePoint: corrections[start]!.day, toMode: lastMode };
}

/**
 * 全 leg の regime-change から regimeFactorFn を構築（純粋）。
 * (day, legKey) → change-point より古いなら λ / 以降なら 1 / regime-change なしなら 1。
 * ★regime-change が 1 つも無ければ常に 1（= 退行ゼロ・L4-b と完全同一）。belief は消さず重みのみ低下。
 */
export function computeRegimeFactorFn(
  feedback: HypothesisFeedbackStore,
  config: SelectiveForgettingConfig = DEFAULT_L3_CONFIG,
): (day: string, legKey: string) => number {
  const legKeys = new Set<string>();
  for (const legs of Object.values(feedback.byDay)) for (const k of Object.keys(legs)) legKeys.add(k);
  const changePoints = new Map<string, string>(); // legKey → change-point
  for (const legKey of legKeys) {
    const rc = detectRegimeChange(feedback, legKey, config.streakN);
    if (rc) changePoints.set(legKey, rc.changePoint);
  }
  if (changePoints.size === 0) return () => 1; // 退行ゼロ（identity）
  return (day: string, legKey: string): number => {
    const cp = changePoints.get(legKey);
    if (cp === undefined) return 1; // regime-change のない leg は緩めない
    return day < cp ? config.lambda : 1; // change-point より古い観測のみ ×λ（削除でない）
  };
}
