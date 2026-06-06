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
 * leg(L3-a) + OD(L3-b-1) の changePoint マップを計算（純粋・L3-b-1/L3-b-2 共通の抽出）。
 * ★computeCombinedRegimeFactorFn の inline 計算を抽出しただけ（挙動不変・32 L3-b-1 test で検証）。
 */
function computeLegOdRegimes(
  feedback: HypothesisFeedbackStore,
  observations: MobilityObservationStore,
  selected: SelectedModeStore,
  streakN: number,
): { legChangePoints: Map<string, string>; odChangePoints: Map<string, string> } {
  // 1) legKey regime（L3-a）
  const legKeys = new Set<string>();
  for (const legs of Object.values(feedback.byDay)) for (const k of Object.keys(legs)) legKeys.add(k);
  const legChangePoints = new Map<string, string>();
  for (const legKey of legKeys) {
    const rc = detectRegimeChange(feedback, legKey, streakN);
    if (rc) legChangePoints.set(legKey, rc.changePoint);
  }
  // 2) OD regime（L3-b-1）
  const odKeys = new Set<string>();
  for (const legs of Object.values(observations.byDay)) {
    for (const o of Object.values(legs)) {
      const od = odKeyOfObservation(o);
      if (od != null) odKeys.add(od);
    }
  }
  const odChangePoints = new Map<string, string>();
  for (const odKey of odKeys) {
    const rc = computeOdRegimeChange(feedback, observations, selected, odKey, streakN);
    if (rc) odChangePoints.set(odKey, rc.changePoint);
  }
  return { legChangePoints, odChangePoints };
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
  const { legChangePoints, odChangePoints } = computeLegOdRegimes(feedback, observations, selected, config.streakN);
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

// ═══════════════════════ L3-b-2: selected-only 持続シフト検出（additive・最弱信号・最も慎重） ═══════════════════════
//
// explicitCorrection でなく **selected の持続シフト**を拾う＝「明示的に仮説へ逆らった証拠」がない最弱信号。
// 雑にやると正しい習慣まで弱める「勝手に忘れる地図」になる。ゆえに最も厳しい発火条件：
//   ・recent K=4 が全一致で別 mode Y / ・historical baseline が強い(not split) / ・Y≠baseline topMode
//   ・SELECTED のみ読む（explicitCorrection/confirmation は L3-a/L3-b-1 の信号・二重に使わない・stale 無関係）
//   ・時間経過だけでは絶対に発火しない / ・観測は削除せず λ_silent で弱めるだけ（最も緩い relaxation）
//   ・legKey 限定（OD selected-only 波及は危険ゆえ deferred）

/** L3-b-2 config: selected-only 持続シフト。 */
export interface SilentShiftConfig {
  /** recent の全一致連続数（K・3/4 等の曖昧は不発火） */
  readonly streakK: number;
  /** pre-change 倍率（最弱信号ゆえ λ_leg/λ_od より緩い＝1 に近い） */
  readonly lambdaSilent: number;
  /** baseline の最小 total（履歴が十分強い時だけ判定） */
  readonly baselineMinTotal: number;
  /** baseline topMode の最小 share（< なら split/contested で不発火） */
  readonly baselineMinShare: number;
}
/** GPT 確定 2026-06-06: K=4 / λ_silent=0.8 / baseline total≥4 ∧ topShare≥0.6(not split)。較正は L3-c。 */
export const DEFAULT_SILENT_CONFIG: SilentShiftConfig = { streakK: 4, lambdaSilent: 0.8, baselineMinTotal: 4, baselineMinShare: 0.6 };

/**
 * legKey の selected-only 持続シフトを検出（純粋・SELECTED のみ読む）。
 * legKey の selected を日付順に並べ、末尾が同一 mode Y で K 連続（全一致）∧ それ以前(baseline)が
 * 強い(total≥min ∧ topShare≥minShare=not split) ∧ baseline topMode≠Y のときだけ silent shift。
 * change-point = recent streak の開始日。★feedback を読まない＝correction/confirmation/stale と無関係。
 * ★時間でなく「recent が baseline と持続的に矛盾」が trigger（素朴 decay でない）。
 */
export function computeSilentShiftRegimeChange(
  selected: SelectedModeStore,
  legKey: string,
  config: SilentShiftConfig = DEFAULT_SILENT_CONFIG,
): { changePoint: string; toMode: RouteTransportMode } | null {
  if (typeof legKey !== "string" || legKey.length === 0 || config.streakK < 1) return null;
  const entries: { day: string; mode: RouteTransportMode }[] = [];
  for (const [day, legs] of Object.entries(selected.byDay)) {
    const m = legs[legKey];
    if (m) entries.push({ day, mode: m });
  }
  if (entries.length < config.streakK + config.baselineMinTotal) return null; // recent + baseline に不足
  entries.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)); // ISO 日付=辞書順=時系列
  // recent unanimous streak（末尾の同一 mode 連続）
  const recentMode = entries[entries.length - 1]!.mode;
  let start = entries.length - 1;
  while (start > 0 && entries[start - 1]!.mode === recentMode) start -= 1;
  if (entries.length - start < config.streakK) return null; // recent が K 未満（3/4 等の曖昧含む）→ 不発火
  // baseline = recent streak より前
  const baseline = entries.slice(0, start);
  if (baseline.length < config.baselineMinTotal) return null; // 履歴不足 → 不発火
  const counts = new Map<RouteTransportMode, number>();
  for (const e of baseline) counts.set(e.mode, (counts.get(e.mode) ?? 0) + 1);
  let topMode: RouteTransportMode | null = null;
  let topCount = 0;
  for (const [m, c] of counts) if (c > topCount) ((topMode = m), (topCount = c));
  if (topCount / baseline.length < config.baselineMinShare) return null; // split/contested → 不発火
  if (topMode === recentMode) return null; // 別 mode でない（シフトでない）→ 不発火
  return { changePoint: entries[start]!.day, toMode: recentMode };
}

/** L3-b-2 full config: leg+OD(L3-a/L3-b-1) + silent(L3-b-2)。 */
export interface FullForgettingConfig {
  readonly combined: CombinedForgettingConfig;
  readonly silent: SilentShiftConfig;
}
/** GPT 確定 2026-06-06。 */
export const DEFAULT_L3B2_CONFIG: FullForgettingConfig = { combined: DEFAULT_L3B_CONFIG, silent: DEFAULT_SILENT_CONFIG };

/**
 * leg(L3-a) + OD(L3-b-1) + silent(L3-b-2) を統合した regimeFactorFn を構築（純粋）。
 * 優先順位 **leg > OD > silent**（強い信号ほど優先・regimeFactor は 1 つ・二重緩和なし）。
 * silent は leg/OD regime を持たない legKey だけに効く最弱 fallback（λ_silent）。
 * ★silent shift も無ければ computeCombinedRegimeFactorFn と完全同一（退行ゼロ）。
 */
export function computeFullRegimeFactorFn(
  feedback: HypothesisFeedbackStore,
  observations: MobilityObservationStore,
  selected: SelectedModeStore,
  config: FullForgettingConfig = DEFAULT_L3B2_CONFIG,
): (day: string, legKey: string) => number {
  const { legChangePoints, odChangePoints } = computeLegOdRegimes(feedback, observations, selected, config.combined.streakN);
  // legKey → その OD 群（observations から）。OD regime を持つ legKey は silent 対象外にする用。
  const legKeyOds = new Map<string, Set<string>>();
  for (const legs of Object.values(observations.byDay)) {
    for (const [legKey, o] of Object.entries(legs)) {
      const od = odKeyOfObservation(o);
      if (od == null) continue;
      let s = legKeyOds.get(legKey);
      if (!s) {
        s = new Set();
        legKeyOds.set(legKey, s);
      }
      s.add(od);
    }
  }
  const legHasOdRegime = (legKey: string): boolean => {
    const ods = legKeyOds.get(legKey);
    if (!ods) return false;
    for (const od of ods) if (odChangePoints.has(od)) return true;
    return false;
  };
  // silent shift: leg regime も OD regime も持たない legKey だけ（leg/OD 優先・二重に使わない）
  const silentChangePoints = new Map<string, string>();
  const legKeys = new Set<string>();
  for (const legs of Object.values(selected.byDay)) for (const k of Object.keys(legs)) legKeys.add(k);
  for (const legKey of legKeys) {
    if (legChangePoints.has(legKey) || legHasOdRegime(legKey)) continue; // leg/OD regime あり → silent は見ない
    const rc = computeSilentShiftRegimeChange(selected, legKey, config.silent);
    if (rc) silentChangePoints.set(legKey, rc.changePoint);
  }
  if (legChangePoints.size === 0 && odChangePoints.size === 0 && silentChangePoints.size === 0) return () => 1; // 退行ゼロ
  return (day: string, legKey: string): number => {
    // leg 優先
    const legCp = legChangePoints.get(legKey);
    if (legCp !== undefined) return day < legCp ? config.combined.lambdaLeg : 1;
    // OD fallback（leg regime が無い leg だけ）
    const od = odKeyOfObservation(observations.byDay[day]?.[legKey]);
    if (od != null) {
      const odCp = odChangePoints.get(od);
      if (odCp !== undefined) return day < odCp ? config.combined.lambdaOd : 1;
    }
    // silent fallback（leg/OD regime が無い leg だけ・最弱信号）
    const silentCp = silentChangePoints.get(legKey);
    if (silentCp !== undefined) return day < silentCp ? config.silent.lambdaSilent : 1;
    return 1; // どの regime も無い → 緩めない
  };
}
