/**
 * lib/plan/candidateLens/candidateLensPreferenceObs.ts
 *   — Candidate Lens / Phase 3-a: Preference **観測ロジックのみ（pure）**
 *
 * ★スコープ厳守（CEO 2026-06-16）: P3-a は **pure 観測ロジックだけ**。
 *   - store / localStorage / shadow 記録 / onSelect 配線 / resolver 供給 / flag / UI 変更は **一切しない**（P3-b/c は別 GO）。
 *   - ここは「選択文脈 → PreferenceObservation」「observations → UserPlacePreference」の **型と純粋関数** のみ。
 * ★honesty: 観測（確かな選択行動）だけを根拠にする。値の無い軸を decisive にしない＝推定で水増ししない。
 * ★pure: Date.now / Math.random / network / store なし。時刻 `at` と集計の `now` は **呼び側が渡す**（決定性 / test 容易）。
 */
import type { AttributeKey } from "@/lib/plan/candidateLens/placeAttributeModel";
import type { PurposeLens } from "@/lib/plan/candidateLens/purposeLens";
import type { LensCandidateView, LensComparisonView } from "@/lib/plan/candidateLens/candidateLensUi";
import type { UserPlacePreference } from "@/lib/plan/candidateLens/userPlacePreference";

/** 候補をどの画面状態から確定したか。 */
export type ChoiceContext = "browse" | "detail" | "compare";

/** 選好シグナル（CEO の「駅近 / 余白重視 / 再選」に対応）。 */
export interface PreferenceSignals {
  /** 徒歩（近さ）が効いた。 */
  readonly proximityWeighted: boolean;
  /** 予定接続 / 余白が効いた（gap 配線時のみ true になりうる）。 */
  readonly marginWeighted: boolean;
  /** 相性（＝過去に訪れている観測あり）の候補を選んだ＝再選的。 */
  readonly reselectedKnown: boolean;
}

/** 1 回の「候補を選んだ」観測（★PII/raw 名を持たない・key は呼び側で normalize 済）。 */
export interface PreferenceObservation {
  readonly lens: PurposeLens;
  readonly selectedPlaceKey: string;
  readonly decisiveAxes: readonly AttributeKey[];
  readonly choiceContext: ChoiceContext;
  readonly comparedAgainstKey?: string | null;
  readonly signals: PreferenceSignals;
  /** epoch ms（呼び側が stamp・pure 層は受け取るだけ）。 */
  readonly at: number;
}

/** observation 構築の入力（呼び側が選択直前の文脈から渡す）。 */
export interface BuildObservationInput {
  readonly lens: PurposeLens;
  /** normalizeLocationText 済の選択候補 key（raw 名/住所/座標でない）。 */
  readonly selectedKey: string;
  readonly selectedView: LensCandidateView;
  readonly choiceContext: ChoiceContext;
  readonly at: number;
  /** compare 経路のみ: 比較 view と、選択した側・相手候補 key。 */
  readonly comparison?: LensComparisonView | null;
  readonly selectedSide?: "left" | "right";
  readonly comparedAgainstKey?: string | null;
}

/** browse/detail（対立候補なし）で「選好を最も示す」honest 軸（値のある軸のみ・最大 2）。 */
function soloDecisiveAxes(view: LensCandidateView): AttributeKey[] {
  const axes: AttributeKey[] = [];
  if (view.attrs.walk_estimate.value != null) axes.push("walk_estimate");
  if (view.affinityBadge != null) axes.push("affinity_reason");
  if (view.attrs.schedule_fit.value != null) axes.push("schedule_fit");
  if (view.attrs.margin_impact.value != null) axes.push("margin_impact");
  return axes.slice(0, 2);
}

/**
 * 選択文脈 → PreferenceObservation（pure・捏造しない）。
 *   - compare: 比較表で**選択側 cell が優位(isBest)だった軸**を decisive に（見える差で勝った軸＝効いた軸）。
 *   - browse/detail: 候補の最強 honest シグナル（徒歩 / 相性 / 予定接続・余白）。値の無い軸は採らない。
 */
export function buildPreferenceObservation(input: BuildObservationInput): PreferenceObservation {
  let decisiveAxes: AttributeKey[];
  if (input.choiceContext === "compare" && input.comparison && input.selectedSide) {
    const side = input.selectedSide;
    decisiveAxes = input.comparison.mainRows
      .filter((r) => r[side].isBest)
      .map((r) => r.key);
  } else {
    decisiveAxes = soloDecisiveAxes(input.selectedView);
  }
  const signals: PreferenceSignals = {
    proximityWeighted: decisiveAxes.includes("walk_estimate"),
    marginWeighted: decisiveAxes.some((k) => k === "schedule_fit" || k === "margin_impact"),
    reselectedKnown: input.selectedView.affinityBadge != null,
  };
  return {
    lens: input.lens,
    selectedPlaceKey: input.selectedKey,
    decisiveAxes,
    choiceContext: input.choiceContext,
    comparedAgainstKey: input.comparedAgainstKey ?? null,
    signals,
    at: input.at,
  };
}

export interface AccumulateOptions {
  /** 集計時刻（decay 基準・呼び側が stamp）。 */
  readonly now: number;
  /** この件数未満の lens / 全体は preference を出さない（少数の偏りで断定しない）。既定 5。 */
  readonly minObservations?: number;
  /** decay 半減期 ms（既定 30 日）。新しい観測ほど重い。 */
  readonly halfLifeMs?: number;
}

const DEFAULT_MIN_OBS = 5;
const DEFAULT_HALF_LIFE = 30 * 24 * 60 * 60 * 1000; // 30 日

/** 軸スコア（decay 加重）を降順に並べた key 配列（score>0 のみ）。 */
function rankAxes(scores: Map<AttributeKey, number>): AttributeKey[] {
  return [...scores.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

/**
 * observations → UserPlacePreference（pure・decay + lens 別 + sufficient-gate）。
 *   - 各観測の decisiveAxes に decay 加重スコアを与え、全体 / lens 別に集計。
 *   - **sufficient-gate**: 件数 < minObservations の全体 / lens は preference を出さない（中立＝既定軸順のまま）。
 *   - 出力は Phase 1 の `UserPlacePreference`（`applyPreferenceToAxes` が消費）。★ここでは適用しない（P3-c 別 GO）。
 */
export function accumulatePreference(
  observations: readonly PreferenceObservation[],
  opts: AccumulateOptions,
): UserPlacePreference {
  const minObs = opts.minObservations ?? DEFAULT_MIN_OBS;
  const halfLife = opts.halfLifeMs ?? DEFAULT_HALF_LIFE;

  const global = new Map<AttributeKey, number>();
  const perLensScores = new Map<PurposeLens, Map<AttributeKey, number>>();
  const perLensCount = new Map<PurposeLens, number>();
  let total = 0;

  for (const obs of observations) {
    const ageMs = Math.max(0, opts.now - obs.at);
    const weight = Math.pow(0.5, ageMs / halfLife); // decay: 新しいほど 1 に近い
    total += 1;
    perLensCount.set(obs.lens, (perLensCount.get(obs.lens) ?? 0) + 1);
    let lensMap = perLensScores.get(obs.lens);
    if (!lensMap) {
      lensMap = new Map();
      perLensScores.set(obs.lens, lensMap);
    }
    for (const axis of obs.decisiveAxes) {
      global.set(axis, (global.get(axis) ?? 0) + weight);
      lensMap.set(axis, (lensMap.get(axis) ?? 0) + weight);
    }
  }

  const result: { prioritizedAttributes?: readonly AttributeKey[]; perLens?: Partial<Record<PurposeLens, readonly AttributeKey[]>> } = {};

  if (total >= minObs) {
    const ranked = rankAxes(global);
    if (ranked.length > 0) result.prioritizedAttributes = ranked;
  }

  const perLens: Partial<Record<PurposeLens, readonly AttributeKey[]>> = {};
  let anyPerLens = false;
  for (const [lens, count] of perLensCount.entries()) {
    if (count < minObs) continue; // gate: lens 別も件数を満たした時のみ
    const ranked = rankAxes(perLensScores.get(lens)!);
    if (ranked.length > 0) {
      perLens[lens] = ranked;
      anyPerLens = true;
    }
  }
  if (anyPerLens) result.perLens = perLens;

  return result;
}
