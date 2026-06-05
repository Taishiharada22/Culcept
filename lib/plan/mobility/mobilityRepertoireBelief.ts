/**
 * lib/plan/mobility/mobilityRepertoireBelief.ts — L1-b: OD 条件付きレパートリー belief（pure）
 *
 * L1-a の観測ログ(mobilityObservationStore)を使い、belief を odKey × timeband × weekday で
 * 条件付け、legKey-cold な leg でも OD 一般化で surface する。
 *
 * ★CEO 確定方針(2026-06-05):
 *   ① legKey 優先・cold で odKey fallback（override しない・退行ゼロ）
 *   ② 層採用は v0 の strength 判定(deriveHabitualStrength)を流用 = moderate+ の最特定層を採用（新閾値なし）
 *   ③ OD 集約も feedback JOIN で precision 加重（v0-F と一貫・selected1/confirmation1/correction2）
 *   ④ mode の正本は selectedModeStore（observation.mode は無視＝自動的に stale 回避）
 *
 * 出力は同じ ModeBelief 型 → downstream(necessityGate/explanationCopy/mobilityGuidance/card)不変。
 * 禁則: 新 belief store なし / selectedModeStore・hypothesisFeedbackStore・observation store は READ のみ /
 *   Google API / DB / network / 素朴 time-decay / 距離→mode / placeId 同等扱い なし。
 */
import { isRouteTransportMode, type RouteTransportMode } from "@/lib/plan/map/routeMode";
import { buildMobilityHypothesis, type ModeBelief } from "./mobilityHypothesis";
import { buildWeightedModeBelief, precisionWeight } from "./beliefReadAdapter";
import {
  computeRegimeFactorFn,
  computeCombinedRegimeFactorFn,
  DEFAULT_L3_CONFIG,
  DEFAULT_L3B_CONFIG,
  type SelectiveForgettingConfig,
  type CombinedForgettingConfig,
} from "./mobilitySelectiveForgetting";
import {
  parseStore,
  SELECTED_MODE_STORE_KEY,
  type SelectedModeStore,
} from "@/lib/plan/map/selectedModeStore";
import {
  parseFeedbackStore,
  HYPOTHESIS_FEEDBACK_KEY,
  type HypothesisFeedbackStore,
} from "./hypothesisFeedbackStore";
import {
  parseObservationStore,
  MOBILITY_OBSERVATION_KEY,
  type MobilityObservationStore,
  type Timeband,
  type WeekdayBucket,
} from "./mobilityObservationStore";

/** 開いた leg の query（MapTab が observationContext から構築・L1-b-2 配線時） */
export interface RepertoireQuery {
  readonly legKey: string;
  /** normalize(originText)__normalize(destText)。sensitive/空は null → OD 一般化不可 */
  readonly odKey: string | null;
  readonly timeband: Timeband;
  readonly weekday: WeekdayBucket;
}

/** odKey 層（最特定 → 一般）。tb/wd を条件に含めるか。 */
interface OdLevel {
  readonly tb: boolean;
  readonly wd: boolean;
}
const OD_LEVELS: readonly OdLevel[] = [
  { tb: true, wd: true }, // odKey × timeband × weekday
  { tb: false, wd: true }, // odKey × weekday
  { tb: true, wd: false }, // odKey × timeband
  { tb: false, wd: false }, // odKey
];

/** v0 strength 判定を流用: belief が moderate 以上か（= surface に値する確信）。 */
function isModerateOrStrong(belief: ModeBelief): boolean {
  const s = buildMobilityHypothesis(belief, {}).habitualStrength;
  return s === "moderate" || s === "strong";
}

/** counts → ModeBelief（v0 と同じ決定的 tie-break: mode 名昇順 + 厳密 >）。legKey は query 由来。 */
function deriveBelief(
  legKey: string,
  counts: Partial<Record<RouteTransportMode, number>>,
  total: number,
): ModeBelief {
  let topMode: RouteTransportMode | null = null;
  let topCount = 0;
  for (const m of (Object.keys(counts) as RouteTransportMode[]).sort()) {
    const c = counts[m] ?? 0;
    if (c > topCount) {
      topCount = c;
      topMode = m;
    }
  }
  return { legKey, counts, total, topMode, topShare: total > 0 && topMode ? topCount / total : 0 };
}

/**
 * observation を odKey(+ 条件 tb/wd)で集約した belief（純粋）。
 * 各 observation の context(odKey/timeband/weekday)で filter し、mode は selectedStore 正本、
 * weight は feedback JOIN で precision 加重。redacted/unknown/正本欠落は除外。二重計上なし。
 */
function buildOdBelief(
  obs: MobilityObservationStore,
  selected: SelectedModeStore,
  feedback: HypothesisFeedbackStore,
  query: RepertoireQuery,
  level: OdLevel,
  regimeFactorFn?: (day: string, legKey: string) => number, // L3
): ModeBelief {
  const counts: Partial<Record<RouteTransportMode, number>> = {};
  let total = 0;
  const odKey = query.odKey;
  if (odKey == null) return deriveBelief(query.legKey, counts, 0);
  for (const [day, legs] of Object.entries(obs.byDay)) {
    for (const [legKey, o] of Object.entries(legs)) {
      if (o.privacyClass === "redacted") continue; // sensitive は OD 集約から除外
      if (o.originKey == null || o.destKey == null) continue;
      if (`${o.originKey}__${o.destKey}` !== odKey) continue; // odKey 一致
      if (level.tb && o.timeband !== query.timeband) continue;
      if (level.wd && o.weekday !== query.weekday) continue;
      // ★mode は selectedStore 正本（observation.mode は使わない＝stale 自動回避）
      const mode = selected.byDay[day]?.[legKey];
      if (mode === undefined || !isRouteTransportMode(mode) || mode === "unknown") continue;
      const w =
        precisionWeight(feedback.byDay[day]?.[legKey], mode) * (regimeFactorFn ? regimeFactorFn(day, legKey) : 1);
      counts[mode] = (counts[mode] ?? 0) + w;
      total += w;
    }
  }
  return deriveBelief(query.legKey, counts, total);
}

/**
 * L1-b 純粋核: legKey 優先・cold で odKey fallback（override しない・退行ゼロ）。
 * 1. legKey belief(v0 weighted)が moderate+ → それを返す（v0 と完全同一）。
 * 2. legKey cold ∧ odKey あり → OD 層を最特定の moderate+ で返す（一般化）。
 * 3. どれも moderate+ でない → cold な legKey belief を返す（後段 gate が沈黙＝v0 同一）。
 * ★empty observation → 常に legKey belief（= buildWeightedModeBelief）と同一＝退行ゼロ。
 */
export function buildRepertoireBelief(
  obs: MobilityObservationStore,
  selected: SelectedModeStore,
  feedback: HypothesisFeedbackStore,
  query: RepertoireQuery,
): ModeBelief {
  const legKeyBelief = buildWeightedModeBelief(selected, feedback, query.legKey);
  if (isModerateOrStrong(legKeyBelief)) return legKeyBelief; // legKey 優先（override しない）
  if (query.odKey != null) {
    for (const level of OD_LEVELS) {
      const odBelief = buildOdBelief(obs, selected, feedback, query, level);
      if (isModerateOrStrong(odBelief)) return odBelief; // cold legKey の OD 一般化
    }
  }
  return legKeyBelief; // 床: cold legKey belief（gate が沈黙）
}

// ───────────────────────── L4-a: cold-start partial-pooling（2-level・pure・additive） ─────────────────────────

/** L4-a pooling の prior 等価観測数（pseudo-count）。★magic number でなく const。較正は L4-c（実データ後）。 */
export const DEFAULT_POOLING_KAPPA = 3;

/** legKey belief が strong か（強 legKey guard 用・v0 strength 判定を流用・raw n_leg でない）。 */
function isStrong(belief: ModeBelief): boolean {
  return buildMobilityHypothesis(belief, {}).habitualStrength === "strong";
}

/**
 * L4-a: cold-start partial-pooling（2-level: legKey ← odKey marginal・固定 κ・pure）。
 * L1-b の hard fallback を連続 blend へ。buildRepertoireBelief は温存（本関数は additive・未配線）。
 *   pooled[m] = c_leg[m] + κ · p_OD[m]（p_OD = odKey marginal の share）/ total = n_leg + κ
 * ★強 legKey guard: strength==="strong" は OD prior を混ぜず厳密 legKey(=v0)。cold〜moderate のみ pooling。
 * ★退行ゼロ: empty obs / odKey なし / κ≤0 / OD prior 空 → legKey(=v0)。
 * ★mode 正本は selectedStore・redacted/unknown 除外・OD も feedback JOIN で precision 加重（buildOdBelief 経由）。
 */
export function buildPooledBelief(
  obs: MobilityObservationStore,
  selected: SelectedModeStore,
  feedback: HypothesisFeedbackStore,
  query: RepertoireQuery,
  kappa: number = DEFAULT_POOLING_KAPPA,
): ModeBelief {
  const legKeyBelief = buildWeightedModeBelief(selected, feedback, query.legKey);
  if (isStrong(legKeyBelief)) return legKeyBelief; // 強 guard: 確立習慣は OD で動かさない（厳密 v0）
  if (query.odKey == null || kappa <= 0) return legKeyBelief; // OD なし / κ 無効 → leg-only(=v0)
  // 2-level（L4-a）: odKey marginal（timeband/weekday 条件なし）を prior に
  const odBelief = buildOdBelief(obs, selected, feedback, query, { tb: false, wd: false });
  if (odBelief.total <= 0) return legKeyBelief; // 空 OD prior → v0（退行ゼロ）
  const counts: Partial<Record<RouteTransportMode, number>> = {};
  const modes = new Set<RouteTransportMode>([
    ...(Object.keys(legKeyBelief.counts) as RouteTransportMode[]),
    ...(Object.keys(odBelief.counts) as RouteTransportMode[]),
  ]);
  for (const m of modes) {
    const pOD = (odBelief.counts[m] ?? 0) / odBelief.total;
    counts[m] = (legKeyBelief.counts[m] ?? 0) + kappa * pOD; // c_leg + κ·p_OD
  }
  return deriveBelief(query.legKey, counts, legKeyBelief.total + kappa);
}

// ───────────────────────── L4-b: multi-level shrinkage + global marginal（pure・additive） ─────────────────────────

/** per-level pseudo-count（GPT 確定 2026-06-05）。global は弱い seed（effective 1）。較正は L4-c。 */
export interface PoolingKappaConfig {
  /** leg ← context */
  readonly leg: number;
  /** ctx ← wd, wd ← od */
  readonly context: number;
  /** od ← global（弱く） */
  readonly global: number;
}
export const DEFAULT_KAPPA_CONFIG: PoolingKappaConfig = { leg: 3, context: 3, global: 1 };

/** 階層 1 レベルの結果: 分布(shares)と effective sample size（prior の backing 強度）。 */
interface LevelResult {
  readonly shares: Partial<Record<RouteTransportMode, number>>;
  readonly effSize: number;
}

/** counts → shares（total>0 で normalize・空は空）。 */
function toShares(
  counts: Partial<Record<RouteTransportMode, number>>,
  total: number,
): Partial<Record<RouteTransportMode, number>> {
  if (total <= 0) return {};
  const shares: Partial<Record<RouteTransportMode, number>> = {};
  for (const m of Object.keys(counts) as RouteTransportMode[]) shares[m] = (counts[m] ?? 0) / total;
  return shares;
}

/**
 * 1 レベルの shrinkage: counts を親 prior へ縮約。
 *   ★親の寄与は min(κ, parent.effSize) で cap（弱く backing された prior は弱く寄与＝global 弱化の核）。
 *   effSize = n_level + 親寄与 → 子の backing 強度として伝播。
 */
function shrinkLevel(
  counts: Partial<Record<RouteTransportMode, number>>,
  total: number,
  parent: LevelResult,
  kappa: number,
): LevelResult {
  const contrib = Math.min(kappa, parent.effSize);
  const effSize = total + contrib;
  if (effSize <= 0) return { shares: {}, effSize: 0 };
  const shares: Partial<Record<RouteTransportMode, number>> = {};
  const modes = new Set<RouteTransportMode>([
    ...(Object.keys(counts) as RouteTransportMode[]),
    ...(Object.keys(parent.shares) as RouteTransportMode[]),
  ]);
  for (const m of modes) {
    shares[m] = ((counts[m] ?? 0) + contrib * (parent.shares[m] ?? 0)) / effSize;
  }
  return { shares, effSize };
}

/**
 * global marginal: 全観測の mode 分布（OD 非依存・ユーザー全体傾向）。
 * mode=selectedStore 正本・redacted/unknown 除外・feedback JOIN で precision 加重。
 */
function buildGlobalCounts(
  obs: MobilityObservationStore,
  selected: SelectedModeStore,
  feedback: HypothesisFeedbackStore,
  regimeFactorFn?: (day: string, legKey: string) => number, // L3
): { counts: Partial<Record<RouteTransportMode, number>>; total: number } {
  const counts: Partial<Record<RouteTransportMode, number>> = {};
  let total = 0;
  for (const [day, legs] of Object.entries(obs.byDay)) {
    for (const [legKey, o] of Object.entries(legs)) {
      if (o.privacyClass === "redacted") continue; // redacted は global 集計にも使わない
      const mode = selected.byDay[day]?.[legKey];
      if (mode === undefined || !isRouteTransportMode(mode) || mode === "unknown") continue;
      const w =
        precisionWeight(feedback.byDay[day]?.[legKey], mode) * (regimeFactorFn ? regimeFactorFn(day, legKey) : 1);
      counts[mode] = (counts[mode] ?? 0) + w;
      total += w;
    }
  }
  return { counts, total };
}

/** leg を prior(LevelResult)へ blend して ModeBelief 化。prior 寄与は min(κ_leg, prior.effSize) で cap。 */
function blendLeg(
  legKeyBelief: ModeBelief,
  prior: LevelResult,
  kappaLeg: number,
  legKey: string,
): ModeBelief {
  const contrib = Math.min(kappaLeg, prior.effSize);
  if (contrib <= 0) return legKeyBelief; // prior backing ゼロ → v0（厳密退行ゼロ）
  const counts: Partial<Record<RouteTransportMode, number>> = {};
  const modes = new Set<RouteTransportMode>([
    ...(Object.keys(legKeyBelief.counts) as RouteTransportMode[]),
    ...(Object.keys(prior.shares) as RouteTransportMode[]),
  ]);
  for (const m of modes) {
    counts[m] = (legKeyBelief.counts[m] ?? 0) + contrib * (prior.shares[m] ?? 0);
  }
  return deriveBelief(legKey, counts, legKeyBelief.total + contrib);
}

/**
 * L4-b: multi-level partial-pooling（pure・additive・未配線）。
 * chain: leg ← odKey×tb×wd ← odKey×wd ← odKey ← global marginal（relax は timeband 先・単一 chain）。
 * ★global は弱い seed（effSize≤κ_global）→ global-only は過剰 surface しない。
 * ★強 legKey guard / 退行ゼロ（empty→v0・root 空・uniform seed なし）/ redacted・unknown 除外 / selectedStore 正本。
 * L4-a buildPooledBelief・L1-b buildRepertoireBelief・v0 は温存（本関数は additive）。
 */
export function buildPooledBeliefMultiLevel(
  obs: MobilityObservationStore,
  selected: SelectedModeStore,
  feedback: HypothesisFeedbackStore,
  query: RepertoireQuery,
  kappa: PoolingKappaConfig = DEFAULT_KAPPA_CONFIG,
  regimeFactorFn?: (day: string, legKey: string) => number, // L3: regime-change で古い観測を ×λ（省略=identity）
): ModeBelief {
  const legKeyBelief = buildWeightedModeBelief(selected, feedback, query.legKey, regimeFactorFn);
  if (isStrong(legKeyBelief)) return legKeyBelief; // 強 guard: 厳密 v0（L3 調整後の belief で判定）
  // global（root・OD 非依存・弱い seed: effSize≤κ_global）
  const g = buildGlobalCounts(obs, selected, feedback, regimeFactorFn);
  const pGlobal: LevelResult = {
    shares: toShares(g.counts, g.total),
    effSize: Math.min(kappa.global, g.total), // ★global は弱く（過剰 surface 抑制）
  };
  if (query.odKey == null) return blendLeg(legKeyBelief, pGlobal, kappa.leg, query.legKey); // odKey なし → global only
  // chain（od←global は κ_global で弱く・以降は κ_context）
  const od = buildOdBelief(obs, selected, feedback, query, { tb: false, wd: false }, regimeFactorFn);
  const pOd = shrinkLevel(od.counts, od.total, pGlobal, kappa.global);
  const wd = buildOdBelief(obs, selected, feedback, query, { tb: false, wd: true }, regimeFactorFn);
  const pWd = shrinkLevel(wd.counts, wd.total, pOd, kappa.context);
  const ctx = buildOdBelief(obs, selected, feedback, query, { tb: true, wd: true }, regimeFactorFn);
  const pCtx = shrinkLevel(ctx.counts, ctx.total, pWd, kappa.context);
  return blendLeg(legKeyBelief, pCtx, kappa.leg, query.legKey);
}

// ───────────────────────── localStorage loaders (fail-open) ─────────────────────────

function loadSelected(): SelectedModeStore {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return parseStore(ls ? ls.getItem(SELECTED_MODE_STORE_KEY) : null);
  } catch {
    return parseStore(null);
  }
}
function loadFeedback(): HypothesisFeedbackStore {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return parseFeedbackStore(ls ? ls.getItem(HYPOTHESIS_FEEDBACK_KEY) : null);
  } catch {
    return parseFeedbackStore(null);
  }
}
function loadObservations(): MobilityObservationStore {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return parseObservationStore(ls ? ls.getItem(MOBILITY_OBSERVATION_KEY) : null);
  } catch {
    return parseObservationStore(null);
  }
}

/** ★L1-b-2 配線で MapTab が使う。実データ由来の repertoire belief（mock でない）。両 store fail-open。 */
export function loadRepertoireBelief(query: RepertoireQuery): ModeBelief {
  return buildRepertoireBelief(loadObservations(), loadSelected(), loadFeedback(), query);
}

/** ★L4 配線用（GO 後・現状未配線）。実データ由来の pooled belief（mock でない）。両 store fail-open。 */
export function loadPooledBelief(
  query: RepertoireQuery,
  kappa: number = DEFAULT_POOLING_KAPPA,
): ModeBelief {
  return buildPooledBelief(loadObservations(), loadSelected(), loadFeedback(), query, kappa);
}

/** ★L4 配線用（GO 後・現状未配線）。multi-level pooled belief（mock でない）。両 store fail-open。 */
export function loadPooledBeliefMultiLevel(
  query: RepertoireQuery,
  kappa: PoolingKappaConfig = DEFAULT_KAPPA_CONFIG,
): ModeBelief {
  return buildPooledBeliefMultiLevel(loadObservations(), loadSelected(), loadFeedback(), query, kappa);
}

// ───────────────────────── L3: selective forgetting 適用版（pure・additive・未配線） ─────────────────────────

/**
 * L3-aware multi-level pooled belief（pure）。
 * feedback から regimeFactorFn を作り、L4-b の buildPooledBeliefMultiLevel に注入。
 * ★regime-change なし → regimeFactorFn 恒等 → L4-b と完全同一（退行ゼロ）。古い観測は削除されず ×λ のみ。
 */
export function buildL3PooledBeliefMultiLevel(
  obs: MobilityObservationStore,
  selected: SelectedModeStore,
  feedback: HypothesisFeedbackStore,
  query: RepertoireQuery,
  config: SelectiveForgettingConfig = DEFAULT_L3_CONFIG,
  kappa: PoolingKappaConfig = DEFAULT_KAPPA_CONFIG,
): ModeBelief {
  const regimeFactorFn = computeRegimeFactorFn(feedback, config);
  return buildPooledBeliefMultiLevel(obs, selected, feedback, query, kappa, regimeFactorFn);
}

/** ★L3 配線用（GO 後・現状未配線）。L3-aware multi-level pooled belief。両 store fail-open。 */
export function loadL3PooledBeliefMultiLevel(
  query: RepertoireQuery,
  config: SelectiveForgettingConfig = DEFAULT_L3_CONFIG,
  kappa: PoolingKappaConfig = DEFAULT_KAPPA_CONFIG,
): ModeBelief {
  return buildL3PooledBeliefMultiLevel(loadObservations(), loadSelected(), loadFeedback(), query, config, kappa);
}

// ───────────────────────── L3-b-1: OD 単位 regime 統合版（pure・additive・未配線） ─────────────────────────

/**
 * L3-b-1 belief（pure）。L3-a(legKey) + L3-b-1(OD 単位 regime) を統合した combined regimeFactorFn を
 * L4-b の buildPooledBeliefMultiLevel に注入。leg 優先 + OD fallback（二重緩和なし）。
 * ★leg/OD どちらの regime も無ければ恒等 → L3-a/L4-b と完全同一（退行ゼロ）。古い観測は削除されず ×λ のみ。
 */
export function buildL3bPooledBeliefMultiLevel(
  obs: MobilityObservationStore,
  selected: SelectedModeStore,
  feedback: HypothesisFeedbackStore,
  query: RepertoireQuery,
  config: CombinedForgettingConfig = DEFAULT_L3B_CONFIG,
  kappa: PoolingKappaConfig = DEFAULT_KAPPA_CONFIG,
): ModeBelief {
  const regimeFactorFn = computeCombinedRegimeFactorFn(feedback, obs, selected, config);
  return buildPooledBeliefMultiLevel(obs, selected, feedback, query, kappa, regimeFactorFn);
}

/** ★L3-b-1 配線用（GO 後・現状未配線）。OD 単位 regime 込みの multi-level pooled belief。store fail-open。 */
export function loadL3bPooledBeliefMultiLevel(
  query: RepertoireQuery,
  config: CombinedForgettingConfig = DEFAULT_L3B_CONFIG,
  kappa: PoolingKappaConfig = DEFAULT_KAPPA_CONFIG,
): ModeBelief {
  return buildL3bPooledBeliefMultiLevel(loadObservations(), loadSelected(), loadFeedback(), query, config, kappa);
}
