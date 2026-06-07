/**
 * lib/plan/mobility/mobilityReasonInsight.ts — A0-1: reason → local insight（pure / readiness layer）
 *
 * A0（理由観測）で捕捉した explicitCorrection の reason を、**leg 単位で観測のみ**集約する pure 層。
 * 「自己認識の素材」を structured に束ねるだけ（UI / copy / Alter / Stargazer / DB / belief 反映は一切しない）。
 *
 * 不変原則（CEO 2026-06-08）:
 *   - 観測のみ（user の 1-tap reason のみ・捏造しない）。reason なし entry は無視。
 *   - trait / 人格診断にしない（per-leg 文脈に閉じる）。reason は mode preference(belief) を上書きしない（belief を読まない・書かない）。
 *   - sparse（1-2 件）では insight を出さない → `not_enough_signal`。最低観測数 + reason 偏り + mode 偏り（strict majority）で判定。
 *   - 「よく」「いつも」等の強い語を生成しない（copy でなく structured result・strength は enum）。生数値は internal（UI 前提で出さない）。
 *   - ★per-leg のみ（OD は本層では扱わない＝境界を曖昧にしない。OD 拡張は将来 observation-store join で別途）。
 *   - sensitive / hidden は呼び側が `excludeLegKeys` で対象外にできる（feedback store は元々 sensitive を記録しないが二重に安全側）。
 *   - pure / READ のみ / Date 不使用。
 */
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";
import type { HypothesisFeedbackStore, MobilityReason } from "./hypothesisFeedbackStore";

export interface ReasonInsightConfig {
  /** これ未満の reason 観測は not_enough_signal（sparse 保護・★1-2 件で出さない）。 */
  readonly minObservations: number;
  /** established 段階の最低観測数。 */
  readonly establishedObservations: number;
  /** established 段階の最低 share（top の比率）。 */
  readonly establishedShare: number;
}

/** 固定初期値（実データ後の較正は backlog）。 */
export const DEFAULT_REASON_INSIGHT_CONFIG: ReasonInsightConfig = {
  minObservations: 3,           // ★1-2 件では insight を出さない（CEO HARD GATE）
  establishedObservations: 5,
  establishedShare: 0.67,
};

export type ReasonInsightStrength = "emerging" | "established";

export interface ReasonInsight {
  readonly legKey: string;
  readonly status: "insight";
  /** ★internal（UI 前提の生数値でない・logic/監視用）。 */
  readonly totalReasonObservations: number;
  readonly dominantReason: MobilityReason;
  readonly dominantReasonCount: number;
  readonly dominantMode: RouteTransportMode;
  readonly dominantModeCount: number;
  /** 段階（生数値・強語でなく enum）。 */
  readonly strength: ReasonInsightStrength;
}

export interface NotEnoughReasonSignal {
  readonly legKey: string;
  readonly status: "not_enough_signal";
  /** 観測できた reason 件数（< minObservations or 偏り不足）。internal。 */
  readonly observed: number;
}

export type ReasonInsightResult = ReasonInsight | NotEnoughReasonSignal;

export interface ReasonInsightOptions {
  readonly config?: ReasonInsightConfig;
  /** sensitive / hidden 等で対象外にする legKey。 */
  readonly excludeLegKeys?: ReadonlySet<string>;
}

// ───────────────────────── helpers（pure・決定論） ─────────────────────────

/** 最頻値 + count（決定論: tie は items 出現順で先勝ち。strict-majority gate で tie は insight にならない）。 */
function topCount<T extends string>(items: readonly T[]): { value: T; count: number } | null {
  if (items.length === 0) return null;
  const counts = new Map<T, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best == null ? null : { value: best, count: bestCount };
}

/** strict majority（> 50%）か。tie(2-2 等)は false。 */
function isStrictMajority(count: number, total: number): boolean {
  return count * 2 > total;
}

/** leg ごとに reason-bearing entry の reason[] / chosenMode[] を集約（reason なしは無視・day 順安定）。 */
function aggregateByLeg(
  store: HypothesisFeedbackStore,
  exclude: ReadonlySet<string>,
): Map<string, { reasons: MobilityReason[]; modes: RouteTransportMode[] }> {
  const byLeg = new Map<string, { reasons: MobilityReason[]; modes: RouteTransportMode[] }>();
  const days = Object.keys(store.byDay).sort(); // 決定論
  for (const day of days) {
    const legs = store.byDay[day];
    for (const legKey of Object.keys(legs)) {
      if (exclude.has(legKey)) continue;
      const entry = legs[legKey];
      if (entry.reason == null) continue; // ★reason なし entry は無視
      const acc = byLeg.get(legKey) ?? { reasons: [], modes: [] };
      acc.reasons.push(entry.reason);
      acc.modes.push(entry.chosenMode); // 訂正で選んだ mode
      byLeg.set(legKey, acc);
    }
  }
  return byLeg;
}

/** 集約結果から 1 leg の insight を判定（純粋）。readiness 未満は not_enough_signal。 */
function judge(
  legKey: string,
  reasons: readonly MobilityReason[],
  modes: readonly RouteTransportMode[],
  c: ReasonInsightConfig,
): ReasonInsightResult {
  const total = reasons.length;
  const topReason = topCount(reasons);
  const topMode = topCount(modes);

  // sparse / 偏り不足 → not_enough_signal（★1-2 件・ambiguous は insight を出さない）
  if (
    total < c.minObservations ||
    topReason == null ||
    topMode == null ||
    !isStrictMajority(topReason.count, total) ||
    !isStrictMajority(topMode.count, modes.length)
  ) {
    return { legKey, status: "not_enough_signal", observed: total };
  }

  const reasonShare = topReason.count / total;
  const modeShare = topMode.count / modes.length;
  const established =
    total >= c.establishedObservations && reasonShare >= c.establishedShare && modeShare >= c.establishedShare;

  return {
    legKey,
    status: "insight",
    totalReasonObservations: total,
    dominantReason: topReason.value,
    dominantReasonCount: topReason.count,
    dominantMode: topMode.value,
    dominantModeCount: topMode.count,
    strength: established ? "established" : "emerging",
  };
}

// ───────────────────────── public（pure） ─────────────────────────

/**
 * 全 leg の reason insight（reason 観測が 1 件以上ある leg のみ・insight or not_enough_signal）。
 * legKey 昇順で安定。reason データが 0 の leg は結果に含めない（対象外）。
 */
export function buildReasonInsights(
  store: HypothesisFeedbackStore,
  opts: ReasonInsightOptions = {},
): readonly ReasonInsightResult[] {
  const config = opts.config ?? DEFAULT_REASON_INSIGHT_CONFIG;
  const exclude = opts.excludeLegKeys ?? new Set<string>();
  const byLeg = aggregateByLeg(store, exclude);
  return [...byLeg.keys()]
    .sort()
    .map((legKey) => {
      const acc = byLeg.get(legKey)!;
      return judge(legKey, acc.reasons, acc.modes, config);
    });
}

/**
 * 単一 leg の reason insight（将来の per-leg UI 参照用）。reason 観測が 0 件の leg は null。
 */
export function buildReasonInsightForLeg(
  store: HypothesisFeedbackStore,
  legKey: string,
  opts: ReasonInsightOptions = {},
): ReasonInsightResult | null {
  const config = opts.config ?? DEFAULT_REASON_INSIGHT_CONFIG;
  const exclude = opts.excludeLegKeys ?? new Set<string>();
  if (exclude.has(legKey)) return null;
  const byLeg = aggregateByLeg(store, exclude);
  const acc = byLeg.get(legKey);
  if (!acc) return null; // reason データなし
  return judge(legKey, acc.reasons, acc.modes, config);
}
