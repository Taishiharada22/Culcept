/**
 * Reality Control OS — LSAT (Latest Safe Action Time) core
 *
 * 「間に合う最終出発限界」を移動時間の *分布* から動的に算出する純関数群。
 * 親設計: docs/aneurasync-live-plan-controller-adaptive-trigger-matrix.md §1
 *
 * 思想（CEO + 文献監査で確定）:
 *   - 平均ではなく上側 percentile で予算する（travel time reliability）。
 *   - percentile は重要度由来の *初期 decision policy*（固定真理でない）。
 *     critical-fractile  p* = Cu/(Cu+Co)  で導出し、PRM で学習更新。
 *   - Safety Floor（INV-3）: 学習が catastrophic を危険側に下げない。
 *   - confidence（INV-8）: 低 confidence は σ を膨らませ保守化する。
 *
 * 制約: 純関数のみ。I/O・Date・DB・乱数なし（additive / reversible / test-first）。
 *       時刻は「基準時刻からの分」で扱い、実時刻への写像は上位層で行う。
 *
 * 実装段階: Phase 0 限定実装（型 + 純関数 + テストのみ。本番接続なし）。
 */

/** 予定の重要度ティア（UX 便宜。内部は連続スカラーから p* を計算可） */
export type ImportanceTier =
  | "catastrophic" // 飛行機/試験/面接など不可逆 step コスト
  | "important" // 商談/相手が待つ
  | "normal" // 定例/作業
  | "optional" // ドロップイン/寄り道
  | "recovery"; // 休憩/回復（早すぎを罰しない）

/** ティア → 初期 percentile（= Policy default。PRM で上書きされうる） */
export const TIER_DEFAULT_PERCENTILE: Record<ImportanceTier, number> = {
  catastrophic: 0.98,
  important: 0.9,
  normal: 0.8, // Small(1982) の実測 ≈ 80%ile
  optional: 0.6,
  recovery: 0.5,
};

/**
 * Safety Floor（INV-3）。学習・override が *これより危険側（低い percentile）* に
 * 下げてはならない下限。catastrophic は fat tail を取りこぼさないため高く固定。
 * recovery は過剰 buffer を避けるため下限を置かない（0）。
 */
export const TIER_SAFETY_FLOOR: Record<ImportanceTier, number> = {
  catastrophic: 0.98,
  important: 0.8,
  normal: 0.6,
  optional: 0.5,
  recovery: 0.0,
};

export const PERCENTILE_MIN = 0.5;
export const PERCENTILE_MAX = 0.995;

/** percentile を有効域 [0.5, 0.995] に丸める */
export function clampPercentile(p: number): number {
  if (!Number.isFinite(p)) return PERCENTILE_MIN;
  return Math.min(PERCENTILE_MAX, Math.max(PERCENTILE_MIN, p));
}

/**
 * critical-fractile: p* = Cu / (Cu + Co)
 *   Cu = 遅刻コスト（underage）, Co = 早すぎ/余白浪費コスト（overage）
 */
export function criticalFractile(cu: number, co: number): number {
  if (!Number.isFinite(cu) || !Number.isFinite(co)) return PERCENTILE_MIN;
  const denom = cu + co;
  if (denom <= 0) return PERCENTILE_MIN;
  return clampPercentile(cu / denom);
}

/**
 * 遅刻回避比 λ（= Cu/Co）から percentile を導く。
 *   λ=1 → 0.5 / λ=4 → 0.8 / λ=9 → 0.9 / λ=49 → 0.98
 */
export function latenessAversionToPercentile(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return PERCENTILE_MIN;
  return clampPercentile(ratio / (ratio + 1));
}

/** percentile 解決の入力（§1.8 の 4 層: Event > PRM > Policy、Safety Floor は常に優先） */
export interface PercentileResolveInput {
  readonly tier: ImportanceTier;
  /** PRM 学習由来の遅刻回避比 λ（= Cu/Co）。未学習なら undefined */
  readonly learnedLatenessRatio?: number;
  /** この予定固有の override percentile（ユーザー明示等）。未指定なら undefined */
  readonly eventOverridePercentile?: number;
}

/**
 * percentile を 4 層で解決する（§1.8）。
 * 解決順: Event override > PRM(learnedLatenessRatio) > Policy(tier default)。
 * 最後に Safety Floor を適用（INV-3。学習結果が catastrophic を危険側に割らせない）。
 */
export function resolvePercentile(input: PercentileResolveInput): number {
  const { tier, learnedLatenessRatio, eventOverridePercentile } = input;
  let p: number;
  if (typeof eventOverridePercentile === "number") {
    p = clampPercentile(eventOverridePercentile);
  } else if (typeof learnedLatenessRatio === "number") {
    p = latenessAversionToPercentile(learnedLatenessRatio);
  } else {
    p = TIER_DEFAULT_PERCENTILE[tier];
  }
  // Safety Floor は危険側（低 percentile）にのみ作用する片側下限。
  return Math.max(p, TIER_SAFETY_FLOOR[tier]);
}

/**
 * 標準正規分位 Φ⁻¹(p)（Acklam の有理近似、絶対誤差 ~1e-9）。
 * buffer = mean + z·sd の z を与える。
 */
export function invNormalCdf(p: number): number {
  if (!Number.isFinite(p) || p <= 0 || p >= 1) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    return NaN;
  }
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

/** 移動時間分布の記述（平均 ± SD、分） */
export interface TravelTimeStats {
  readonly meanMin: number;
  readonly sdMin: number;
}

export interface LsatInput {
  /** 必要到着時刻（基準時刻からの分）。= イベント開始 − 館内/準備等の不可視マージン */
  readonly arrivalDeadlineMin: number;
  readonly travel: TravelTimeStats;
  /** 準備・egress など可動前マージン（分） */
  readonly prepMin: number;
  /** 採用する percentile（resolvePercentile の出力を想定） */
  readonly percentile: number;
  /** 0..1。低いほど不確実 → σ を膨らませ保守化（INV-8） */
  readonly confidence: number;
}

export interface LsatResult {
  /** 出発限界（基準時刻からの分）。これを過ぎると percentile を満たして到着できない */
  readonly departByMin: number;
  /** 採用 buffer（分）= 膨張 σ 込み */
  readonly bufferMin: number;
  readonly percentile: number;
  readonly confidence: number;
}

/** confidence による σ 膨張係数（confidence 1 → ×1.0、0 → ×1.5） */
export function uncertaintyInflation(confidence: number): number {
  const c = Math.min(1, Math.max(0, Number.isFinite(confidence) ? confidence : 0));
  return 1 + 0.5 * (1 - c);
}

/**
 * LSAT を計算する（純関数）。
 *   buffer = mean + z(p)·(sd × 膨張)   → 高 percentile/低 confidence ほど buffer 大
 *   departByMin = arrivalDeadlineMin − buffer − prepMin
 */
export function computeLsat(input: LsatInput): LsatResult {
  const { arrivalDeadlineMin, travel, prepMin, percentile, confidence } = input;
  const p = clampPercentile(percentile);
  const z = invNormalCdf(p);
  const meanMin = Math.max(0, Number.isFinite(travel.meanMin) ? travel.meanMin : 0);
  const sdMin = Math.max(0, Number.isFinite(travel.sdMin) ? travel.sdMin : 0);
  const effectiveSd = sdMin * uncertaintyInflation(confidence);
  const bufferMin = meanMin + z * effectiveSd;
  const prep = Math.max(0, Number.isFinite(prepMin) ? prepMin : 0);
  const departByMin = arrivalDeadlineMin - bufferMin - prep;
  return {
    departByMin,
    bufferMin,
    percentile: p,
    confidence: Math.min(1, Math.max(0, Number.isFinite(confidence) ? confidence : 0)),
  };
}
