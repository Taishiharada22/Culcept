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
import { type MobilityObservation, type MobilityObservationStore } from "./mobilityObservationStore";
import { type SelectedModeStore } from "@/lib/plan/map/selectedModeStore";
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

// ═══════════════════════ L3-b-1: OD 単位 regime-change（additive・L3-a 非破壊） ═══════════════════════
//
// legKey でなく odKey で explicitCorrection を集約 → 場所のパターン変化を OD の全 leg に波及。
// 合成は leg 優先 + OD fallback（regimeFactor は 1 つだけ・二重緩和なし）。OD は複数 leg に波及するため
// λ_od を leg(0.5)より緩く(0.7)= 保守的。L3-b-2（selected-only 持続シフト）はまだ実装しない。

/** L3-b combined config: legKey(L3-a) と OD(L3-b-1) を 1 factor に統合。 */
export interface CombinedForgettingConfig {
  /** regime-change 判定の連続数（leg/OD 共通） */
  readonly streakN: number;
  /** legKey regime の pre-change 倍率（L3-a・強い信号＝強く緩める） */
  readonly lambdaLeg: number;
  /** OD regime の pre-change 倍率（L3-b-1・複数 leg 波及＝leg より緩く＝保守的） */
  readonly lambdaOd: number;
}
/** GPT 確定 2026-06-05: N=2 / λ_leg=0.5 / λ_od=0.7。較正は L3-c（実データ後）。 */
export const DEFAULT_L3B_CONFIG: CombinedForgettingConfig = { streakN: 2, lambdaLeg: 0.5, lambdaOd: 0.7 };

/**
 * 観測の OD key（純粋）。redacted/sensitive・端点欠落は null（OD 集約に使わない＝privacy 一貫）。
 */
function odKeyOfObservation(o: MobilityObservation | undefined): string | null {
  if (!o || o.privacyClass === "redacted" || o.originKey == null || o.destKey == null) return null;
  return `${o.originKey}__${o.destKey}`;
}

/**
 * OD 単位の regime-change を検出（純粋）。
 * その odKey に属する全 leg の explicitCorrection を **日付で集約**（同日複数 leg が同一 mode → 1 signal、
 * 同日異 mode → ambiguous でその日を除外）し、日付順末尾の同一 mode 連続が streakN 以上なら OD regime-change。
 * ★redacted/sensitive 観測は除外（OD linkage 保護）。★stale 除外（selectedStore 最終 mode ≠ chosenMode）。
 * ★時間でなく「OD の矛盾の連続」が trigger（素朴 decay でない）。change-point = 連続の開始日。
 */
export function computeOdRegimeChange(
  feedback: HypothesisFeedbackStore,
  observations: MobilityObservationStore,
  selected: SelectedModeStore,
  odKey: string,
  streakN: number,
): { changePoint: string; toMode: RouteTransportMode } | null {
  if (typeof odKey !== "string" || odKey.length === 0 || streakN < 1) return null;
  // 日付ごとに OD の correction mode を集約（同日複数 leg → 一致なら 1 signal・矛盾なら conflict）
  const CONFLICT = "__conflict__";
  const byDay = new Map<string, RouteTransportMode | typeof CONFLICT>();
  for (const [day, legs] of Object.entries(feedback.byDay)) {
    for (const [legKey, e] of Object.entries(legs)) {
      if (!e || e.kind !== "explicitCorrection") continue;
      if (odKeyOfObservation(observations.byDay[day]?.[legKey]) !== odKey) continue; // OD 一致・redacted 除外
      if (selected.byDay[day]?.[legKey] !== e.chosenMode) continue; // stale 除外（最終選択と不一致）
      const prev = byDay.get(day);
      if (prev === undefined) byDay.set(day, e.chosenMode);
      else if (prev !== e.chosenMode) byDay.set(day, CONFLICT); // 同日異 mode → その日は ambiguous
    }
  }
  const corrections: { day: string; mode: RouteTransportMode }[] = [];
  for (const [day, mode] of byDay) if (mode !== CONFLICT) corrections.push({ day, mode });
  if (corrections.length < streakN) return null;
  corrections.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)); // ISO 日付=辞書順=時系列
  const lastMode = corrections[corrections.length - 1]!.mode;
  let start = corrections.length - 1;
  while (start > 0 && corrections[start - 1]!.mode === lastMode) start -= 1; // 末尾の同一 mode 連続
  if (corrections.length - start < streakN) return null;
  return { changePoint: corrections[start]!.day, toMode: lastMode };
}

/**
 * L3-a（legKey）+ L3-b-1（OD）を統合した regimeFactorFn を構築（純粋）。
 * (day, legKey) → **leg 固有 regime があれば leg を優先**（λ_leg）、無ければその leg の odKey に
 * OD regime があれば OD（λ_od）、どちらも無ければ 1。★regimeFactor は 1 つだけ（二重緩和なし）。
 * ★leg/OD どちらの regime も無ければ常に 1（退行ゼロ・L3-a/L4-b と完全同一）。
 */
export function computeCombinedRegimeFactorFn(
  feedback: HypothesisFeedbackStore,
  observations: MobilityObservationStore,
  selected: SelectedModeStore,
  config: CombinedForgettingConfig = DEFAULT_L3B_CONFIG,
): (day: string, legKey: string) => number {
  // 1) legKey regime（L3-a・leg 優先）
  const legKeys = new Set<string>();
  for (const legs of Object.values(feedback.byDay)) for (const k of Object.keys(legs)) legKeys.add(k);
  const legChangePoints = new Map<string, string>();
  for (const legKey of legKeys) {
    const rc = detectRegimeChange(feedback, legKey, config.streakN);
    if (rc) legChangePoints.set(legKey, rc.changePoint);
  }
  // 2) OD regime（L3-b-1・leg に無い leg の fallback）
  const odKeys = new Set<string>();
  for (const legs of Object.values(observations.byDay)) {
    for (const o of Object.values(legs)) {
      const od = odKeyOfObservation(o);
      if (od != null) odKeys.add(od);
    }
  }
  const odChangePoints = new Map<string, string>();
  for (const odKey of odKeys) {
    const rc = computeOdRegimeChange(feedback, observations, selected, odKey, config.streakN);
    if (rc) odChangePoints.set(odKey, rc.changePoint);
  }
  if (legChangePoints.size === 0 && odChangePoints.size === 0) return () => 1; // 退行ゼロ（identity）
  return (day: string, legKey: string): number => {
    // leg 優先: leg 固有 regime があれば OD を見ない（二重緩和なし）
    const legCp = legChangePoints.get(legKey);
    if (legCp !== undefined) return day < legCp ? config.lambdaLeg : 1;
    // OD fallback: leg regime が無い leg だけ・その leg の odKey に OD regime があれば
    const od = odKeyOfObservation(observations.byDay[day]?.[legKey]);
    if (od != null) {
      const odCp = odChangePoints.get(od);
      if (odCp !== undefined) return day < odCp ? config.lambdaOd : 1;
    }
    return 1; // どちらの regime も無い → 緩めない
  };
}
