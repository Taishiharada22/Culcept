/**
 * lib/plan/mobility/personalPaceRatio.ts — A1-4: personal pace ratio（pure layer）
 *
 * ★目的: 実移動イベント(MovementEvent 由来の actualDurationMin) と route estimate から、
 *   その (od/leg × mode) で「estimate より長くかかる傾向 / 短い傾向」を honest に集約する。
 *
 * ★★前提を疑った設計（最重要・誠実性）:
 *   actualDurationMin は detector の geofence(150m)→geofence(150m) 間時間で、
 *   estimate は door-to-door。よって actual は真の移動時間より **系統的に短く** 出る
 *   （両端で半径分を取りこぼす。バイアス ≈ 2×半径/速度）。素朴な ratio はこの低バイアスで
 *   偽の「速い」を量産する。対策:
 *   1. ★短い leg（estimate < minEstimateMinForRatio）は ratio から除外（バイアス支配）。
 *   2. ★閾値を非対称に: tends_shorter は ratio ≤ 0.70（系統低バイアスを跨ぐまで「速い」と言わない）。
 *      tends_longer は ratio ≥ 1.15。
 *   3. median（外れ値耐性）+ outlier 除外 + low-confidence 除外。
 *
 * ★安全境界（CEO 方針）:
 *   - 観測が少なければ **絶対に personal pace 扱いしない**（not_enough_signal / unknown を明示）。
 *   - mode / leg / context を **混線させない**（group key に od/leg と mode を含める）。
 *   - sensitive は除外（防御的・store gate で既に除外済の二重化）。
 *   - raw GPS を扱わない（入力は derived な分・所要のみ）。
 *   - 「速い人/遅い人」と **人格化しない**（per-(od/leg)×mode の傾向であって trait ではない）。
 *   - medianRatio は A1-5 adapter 用の internal 値。UI に raw 数値を出さない（tendency/strength を使う）。
 *   - pure / DB・network・Date.now 不使用。
 */
import { isRouteTransportMode, type RouteTransportMode } from "@/lib/plan/map/routeMode";
import type { MovementConfidence } from "@/lib/plan/mobility/movementEventDetector";

export type PersonalPaceStatus = "ready" | "not_enough_signal" | "unknown";
/** ★per-(od/leg)×mode の傾向。人格 trait ではない。 */
export type PersonalPaceTendency = "tends_longer" | "tends_as_estimated" | "tends_shorter";
export type PersonalPaceStrength = "emerging" | "established";

/** A1-4 の入力 1 件（caller が MovementEvent + route estimate を join して作る）。 */
export interface PaceObservation {
  readonly legKey: string;
  /** 反復する単位（home→office 等）。あれば od×mode で集約（蓄積する単位）。 */
  readonly odKey?: string;
  readonly mode: RouteTransportMode;
  /** route の見積（door-to-door・分）。null/0 以下は欠落扱い。 */
  readonly estimateMin: number | null;
  /** MovementEvent 由来（geofence→geofence・分）。null は欠落扱い。 */
  readonly actualDurationMin: number | null;
  readonly confidence: MovementConfidence;
  /** ★防御的: sensitive は除外（store gate で既に除外済のはずだが二重化）。 */
  readonly sensitive?: boolean;
}

export interface PersonalPaceRatioResult {
  readonly groupKey: string;
  readonly odKey?: string;
  /** od が無い時の代表 leg。 */
  readonly legKey?: string;
  readonly mode: RouteTransportMode;
  readonly status: PersonalPaceStatus;
  /** ★ready のみ。internal（A1-5 adapter 用）。UI に raw 表示しない。 */
  readonly medianRatio?: number;
  readonly tendency?: PersonalPaceTendency;
  readonly strength?: PersonalPaceStrength;
  /** valid 観測数。 */
  readonly n?: number;
}

export interface PersonalPaceRatioConfig {
  readonly minObservations: number;
  readonly establishedObservations: number;
  readonly tendencyLongerThreshold: number;
  readonly tendencyShorterThreshold: number;
  readonly minEstimateMinForRatio: number;
  readonly outlierLowRatio: number;
  readonly outlierHighRatio: number;
  readonly excludeLowConfidence: boolean;
}

export const DEFAULT_PERSONAL_PACE_RATIO_CONFIG: PersonalPaceRatioConfig = {
  minObservations: 3,
  establishedObservations: 5,
  tendencyLongerThreshold: 1.15,
  tendencyShorterThreshold: 0.7, // ★非対称（geofence 低バイアス対策）
  minEstimateMinForRatio: 5, // ★短い leg は geofence バイアス支配 → 除外
  outlierLowRatio: 0.25,
  outlierHighRatio: 4.0,
  excludeLowConfidence: true,
};

/** 純粋 median（昇順ソート→中央 / 偶数は中央 2 値平均）。空は NaN。 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function groupKeyFor(obs: PaceObservation): string {
  return obs.odKey ? `od:${obs.odKey}|${obs.mode}` : `leg:${obs.legKey}|${obs.mode}`;
}

function tendencyFor(ratio: number, config: PersonalPaceRatioConfig): PersonalPaceTendency {
  if (ratio >= config.tendencyLongerThreshold) return "tends_longer";
  if (ratio <= config.tendencyShorterThreshold) return "tends_shorter";
  return "tends_as_estimated";
}

interface GroupAccum {
  mode: RouteTransportMode;
  odKey?: string;
  legKey?: string;
  validRatios: number[];
  completeCount: number; // estimate & actual の両方が在った観測数（too_short/outlier/low_conf 含む）
}

/**
 * 観測群 → (od/leg×mode) ごとの pace ratio 結果（pure）。
 * - status: ready（valid ≥ min）/ not_enough_signal（complete はあるが valid < min）/ unknown（complete 0＝estimate or actual 欠落）。
 * - valid = estimate & actual 在り ∧ 非短すぎ ∧ 非 low-confidence ∧ 非 outlier。
 * - sensitive / unknown mode / 無効 mode は集計に入れない。
 */
export function buildPersonalPaceRatios(
  observations: readonly PaceObservation[],
  config: PersonalPaceRatioConfig = DEFAULT_PERSONAL_PACE_RATIO_CONFIG,
): PersonalPaceRatioResult[] {
  const groups = new Map<string, GroupAccum>();

  for (const obs of observations) {
    if (obs.sensitive === true) continue; // ★sensitive 除外
    if (!isRouteTransportMode(obs.mode) || obs.mode === "unknown") continue; // mode 混線/不明を除外

    const key = groupKeyFor(obs);
    let g = groups.get(key);
    if (!g) {
      g = { mode: obs.mode, odKey: obs.odKey, legKey: obs.legKey, validRatios: [], completeCount: 0 };
      groups.set(key, g);
    }

    const hasEstimate = obs.estimateMin != null && obs.estimateMin > 0;
    const hasActual = obs.actualDurationMin != null && obs.actualDurationMin > 0;
    if (!hasEstimate || !hasActual) continue; // incomplete（unknown 要因）

    g.completeCount += 1;

    const estimateMin = obs.estimateMin as number;
    const actualMin = obs.actualDurationMin as number;
    if (estimateMin < config.minEstimateMinForRatio) continue; // ★短すぎ → ratio から除外
    if (config.excludeLowConfidence && obs.confidence === "low") continue; // low-confidence 除外
    const ratio = actualMin / estimateMin;
    if (ratio < config.outlierLowRatio || ratio > config.outlierHighRatio) continue; // outlier 除外
    g.validRatios.push(ratio);
  }

  const results: PersonalPaceRatioResult[] = [];
  for (const [groupKey, g] of groups) {
    const base = { groupKey, odKey: g.odKey, legKey: g.odKey ? undefined : g.legKey, mode: g.mode };
    const n = g.validRatios.length;
    if (n >= config.minObservations) {
      const medianRatio = median(g.validRatios);
      results.push({
        ...base,
        status: "ready",
        medianRatio,
        tendency: tendencyFor(medianRatio, config),
        strength: n >= config.establishedObservations ? "established" : "emerging",
        n,
      });
    } else if (g.completeCount > 0) {
      results.push({ ...base, status: "not_enough_signal", n });
    } else {
      results.push({ ...base, status: "unknown" });
    }
  }
  return results;
}

/**
 * 特定 (odKey/legKey, mode) の結果を引く（A1-5 adapter 用）。
 * odKey 一致を優先、無ければ legKey 一致。mode は必須一致。見つからなければ null。
 */
export function findPersonalPaceRatio(
  results: readonly PersonalPaceRatioResult[],
  query: { odKey?: string; legKey?: string; mode: RouteTransportMode },
): PersonalPaceRatioResult | null {
  if (query.odKey) {
    const byOd = results.find((r) => r.odKey === query.odKey && r.mode === query.mode);
    if (byOd) return byOd;
  }
  if (query.legKey) {
    const byLeg = results.find((r) => r.legKey === query.legKey && r.mode === query.mode);
    if (byLeg) return byLeg;
  }
  return null;
}
