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
  /** lens 別/全体の既定しきい値（後方互換・minLens/minGlobal 未指定時の fallback）。既定 5。 */
  readonly minObservations?: number;
  /** lens 別 preference を出す最小件数（既定 = minObservations）。 */
  readonly minLensObservations?: number;
  /** 全体 prioritizedAttributes を出す最小件数（既定 = minObservations）。 */
  readonly minGlobalObservations?: number;
  /** ★軸別 最小支持（その軸が decisiveAxes に何回出れば並び替え対象にするか）。既定 1（支持ゲートなし）。 */
  readonly minAxisSupport?: number;
  /** ★decay 後スコアの最小値（これ未満の軸は「古いだけ＝失効」として除外）。既定 0（EPS なし）。 */
  readonly minScore?: number;
  /** decay 半減期 ms（既定 30 日）。新しい観測ほど重い。 */
  readonly halfLifeMs?: number;
}

const DEFAULT_MIN_OBS = 5;
const DEFAULT_HALF_LIFE = 30 * 24 * 60 * 60 * 1000; // 30 日

/**
 * 軸を「decay 加重スコア降順」に並べた key 配列。
 *   ★gate: score >= minScore（EPS・古いだけの軸を除外）AND rawCount >= minAxisSupport（最低支持・単発で動かさない）。
 */
function rankAxes(
  scores: Map<AttributeKey, number>,
  counts: Map<AttributeKey, number>,
  minScore: number,
  minAxisSupport: number,
): AttributeKey[] {
  return [...scores.entries()]
    .filter(([k, s]) => s >= minScore && s > 0 && (counts.get(k) ?? 0) >= minAxisSupport)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

/**
 * observations → UserPlacePreference（pure・decay + lens 別 + 二段 sufficient-gate + 軸別最低支持）。
 *   - 各観測の decisiveAxes に decay 加重スコア（新しいほど重い）と raw count を与え、全体 / lens 別に集計。
 *   - **sufficient-gate**: 全体 < minGlobalObservations / lens < minLensObservations は preference を出さない（中立＝既定軸順）。
 *   - **軸別 最低支持**: その軸が decisiveAxes に minAxisSupport 回未満なら並び替え対象外（単発の選択で並びを動かさない）。
 *   - **EPS**: decay 後 score が minScore 未満の軸は失効として除外。
 *   - 出力は Phase 1 の `UserPlacePreference`。★ここでは適用しない（適用は P3-c 配線で行順だけに使う）。
 */
export function accumulatePreference(
  observations: readonly PreferenceObservation[],
  opts: AccumulateOptions,
): UserPlacePreference {
  const minObs = opts.minObservations ?? DEFAULT_MIN_OBS;
  const minLens = opts.minLensObservations ?? minObs;
  const minGlobal = opts.minGlobalObservations ?? minObs;
  const minAxisSupport = opts.minAxisSupport ?? 1;
  const minScore = opts.minScore ?? 0;
  const halfLife = opts.halfLifeMs ?? DEFAULT_HALF_LIFE;

  const globalScore = new Map<AttributeKey, number>();
  const globalCount = new Map<AttributeKey, number>();
  const perLensScore = new Map<PurposeLens, Map<AttributeKey, number>>();
  const perLensAxisCount = new Map<PurposeLens, Map<AttributeKey, number>>();
  const perLensObsCount = new Map<PurposeLens, number>();
  let total = 0;

  for (const obs of observations) {
    const ageMs = Math.max(0, opts.now - obs.at);
    const weight = Math.pow(0.5, ageMs / halfLife); // decay: 新しいほど 1 に近い
    total += 1;
    perLensObsCount.set(obs.lens, (perLensObsCount.get(obs.lens) ?? 0) + 1);
    let lensScore = perLensScore.get(obs.lens);
    let lensAxisCount = perLensAxisCount.get(obs.lens);
    if (!lensScore) { lensScore = new Map(); perLensScore.set(obs.lens, lensScore); }
    if (!lensAxisCount) { lensAxisCount = new Map(); perLensAxisCount.set(obs.lens, lensAxisCount); }
    for (const axis of obs.decisiveAxes) {
      globalScore.set(axis, (globalScore.get(axis) ?? 0) + weight);
      globalCount.set(axis, (globalCount.get(axis) ?? 0) + 1);
      lensScore.set(axis, (lensScore.get(axis) ?? 0) + weight);
      lensAxisCount.set(axis, (lensAxisCount.get(axis) ?? 0) + 1);
    }
  }

  const result: { prioritizedAttributes?: readonly AttributeKey[]; perLens?: Partial<Record<PurposeLens, readonly AttributeKey[]>> } = {};

  if (total >= minGlobal) {
    const ranked = rankAxes(globalScore, globalCount, minScore, minAxisSupport);
    if (ranked.length > 0) result.prioritizedAttributes = ranked;
  }

  const perLens: Partial<Record<PurposeLens, readonly AttributeKey[]>> = {};
  let anyPerLens = false;
  for (const [lens, count] of perLensObsCount.entries()) {
    if (count < minLens) continue; // gate: lens 別も件数を満たした時のみ
    const ranked = rankAxes(perLensScore.get(lens)!, perLensAxisCount.get(lens)!, minScore, minAxisSupport);
    if (ranked.length > 0) {
      perLens[lens] = ranked;
      anyPerLens = true;
    }
  }
  if (anyPerLens) result.perLens = perLens;

  return result;
}
