// lib/stargazer/expansionDiscovery.ts
// P4: 拡張軸の発見条件判定・初期値算出・文言管理
// archetype には一切影響しない。補助的な理解の深まりとして扱う

import {
  TRAIT_AXES,
  EXPANSION_AXIS_KEYS,
  isExpansionAxis,
  type TraitAxisKey,
} from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 解放条件の判定結果ログ */
export interface ExpansionEligibilityLog {
  userId: string;
  timestamp: string;
  precisionSaturation: {
    /** precision τ > 30 の軸数 */
    current: number;
    threshold: 20;
    met: boolean;
  };
  contradictionAccumulation: {
    /** 同一軸ペアの最大矛盾検出回数 */
    maxPairCount: number;
    threshold: 3;
    met: boolean;
    /** 最も矛盾の多い軸ペア */
    topPair?: [string, string];
  };
  observationDepth: {
    totalObservations: number;
    daysSinceFirst: number;
    /** Phase >= maturity */
    phaseMet: boolean;
    met: boolean;
  };
  /** 成立した条件数 (0-3) */
  conditionsMet: number;
  /** conditionsMet >= 2 で解放 */
  released: boolean;
  /** 今回解放された軸ID */
  releasedAxes: string[];
}

/** 拡張軸の発見状態 */
export interface ExpansionAxisState {
  axisId: TraitAxisKey;
  /** 発見済みか */
  discovered: boolean;
  /** 発見日時 */
  discoveredAt?: string;
  /** 初回表示済みか（ResultsSequence の発見カード） */
  shownInResults: boolean;
  /** 現在のスコア (μ) */
  score: number;
  /** 現在の precision (τ) */
  precision: number;
  /** confidence (cap 0.45) */
  confidence: number;
}

/** 拡張軸の発見条件判定の入力 */
export interface DiscoveryInput {
  userId: string;
  /** 各軸の precision (τ) */
  axisPrecisions: Partial<Record<TraitAxisKey, number>>;
  /** 矛盾検出回数（軸ペアごと） */
  contradictionCounts: Map<string, number>;
  /** 総観測数 */
  totalObservations: number;
  /** 初回観測からの日数 */
  daysSinceFirst: number;
  /** 現在のフェーズ */
  phase: "surface" | "awakening" | "maturity" | "deep";
  /** 既に発見済みの拡張軸 */
  discoveredAxes: Set<TraitAxisKey>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 拡張軸の confidence 上限 */
export const EXPANSION_CONFIDENCE_CAP = 0.45;

/** 拡張軸の precision 上限 */
export const EXPANSION_PRECISION_MAX = 40;

/** 拡張軸の推論 confidence 上限 */
export const EXPANSION_INFERENCE_CONFIDENCE_CAP = 0.25;

/** 拡張軸の初期 precision */
const INITIAL_PRECISION = 0.3;

/** 精度飽和の閾値 */
const SATURATION_THRESHOLD = 20;
const SATURATION_PRECISION = 30;

/** 矛盾蓄積の閾値 */
const CONTRADICTION_THRESHOLD = 3;

/** 観測深度の閾値 */
const OBSERVATION_THRESHOLD = 100;
const MATURITY_PHASES = new Set(["maturity", "deep"]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Discovery Logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 拡張軸の解放条件を判定する
 * 3条件のうち2つ以上が成立した場合に、未発見の拡張軸を解放する
 */
export function evaluateExpansionEligibility(
  input: DiscoveryInput
): ExpansionEligibilityLog {
  const now = new Date().toISOString();

  // 条件1: 精度飽和 — core軸のうち τ > 30 が20軸以上
  const saturatedCount = Object.entries(input.axisPrecisions).filter(
    ([key, tau]) =>
      !isExpansionAxis(key as TraitAxisKey) && (tau ?? 0) > SATURATION_PRECISION
  ).length;
  const precisionMet = saturatedCount >= SATURATION_THRESHOLD;

  // 条件2: 矛盾蓄積 — 同一軸ペアで3回以上の矛盾
  let maxPairCount = 0;
  let topPair: [string, string] | undefined;
  for (const [pairKey, count] of input.contradictionCounts) {
    if (count > maxPairCount) {
      maxPairCount = count;
      const parts = pairKey.split(":");
      topPair = [parts[0], parts[1]] as [string, string];
    }
  }
  const contradictionMet = maxPairCount >= CONTRADICTION_THRESHOLD;

  // 条件3: 観測深度 — 100観測以上 かつ Phase >= maturity
  const phaseMet = MATURITY_PHASES.has(input.phase);
  const observationMet =
    input.totalObservations >= OBSERVATION_THRESHOLD &&
    phaseMet;

  // 判定: 2つ以上成立で解放
  const conditionsMet = [precisionMet, contradictionMet, observationMet].filter(
    Boolean
  ).length;
  const released = conditionsMet >= 2;

  // 解放対象: 未発見の拡張軸すべて
  const releasedAxes: string[] = [];
  if (released) {
    for (const key of EXPANSION_AXIS_KEYS) {
      if (!input.discoveredAxes.has(key)) {
        releasedAxes.push(key);
      }
    }
  }

  return {
    userId: input.userId,
    timestamp: now,
    precisionSaturation: {
      current: saturatedCount,
      threshold: SATURATION_THRESHOLD,
      met: precisionMet,
    },
    contradictionAccumulation: {
      maxPairCount,
      threshold: CONTRADICTION_THRESHOLD,
      met: contradictionMet,
      topPair,
    },
    observationDepth: {
      totalObservations: input.totalObservations,
      daysSinceFirst: input.daysSinceFirst,
      phaseMet,
      met: observationMet,
    },
    conditionsMet,
    released,
    releasedAxes,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Initial Score Computation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 拡張軸の初期スコアを親軸から算出する
 * 等重み加重平均 + 低い初期 precision
 */
export function computeInitialExpansionScore(
  axisId: TraitAxisKey,
  coreScores: Partial<Record<TraitAxisKey, number>>
): { score: number; precision: number } {
  const def = TRAIT_AXES.find((a) => a.id === axisId);
  if (!def?.parentAxes || def.parentAxes.length === 0) {
    return { score: 0, precision: INITIAL_PRECISION };
  }

  const parentScores = def.parentAxes
    .map((p) => coreScores[p])
    .filter((s): s is number => s !== undefined);

  if (parentScores.length === 0) {
    return { score: 0, precision: INITIAL_PRECISION };
  }

  const avg =
    parentScores.reduce((sum, s) => sum + s, 0) / parentScores.length;

  return {
    score: Math.max(-1, Math.min(1, avg)),
    precision: INITIAL_PRECISION,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Confidence → Wording (CEO条件2: 文言上限)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ExpansionConfidenceTier =
  | "hidden"
  | "emerging"
  | "forming"
  | "visible";

/**
 * 拡張軸の confidence から表示ティアと文言プレフィックスを返す
 * UIコンポーネントはこの関数を通じて文言を取得し、直接 confidence を判定しない
 */
export function getExpansionDisplayTier(confidence: number): {
  tier: ExpansionConfidenceTier;
  /** UI表示用のプレフィックス文言 */
  prefix: string;
  /** 表示してよいか */
  visible: boolean;
} {
  if (confidence < 0.15) {
    return { tier: "hidden", prefix: "", visible: false };
  }
  if (confidence < 0.25) {
    return {
      tier: "emerging",
      prefix: "見え始めています",
      visible: true,
    };
  }
  if (confidence < 0.35) {
    return {
      tier: "forming",
      prefix: "輪郭が出てきました",
      visible: true,
    };
  }
  return {
    tier: "visible",
    prefix: "傾向が見えてきました",
    visible: true,
  };
}

/**
 * 拡張軸の由来を1行で説明する文字列を返す
 * ダッシュボードの軸名の下に表示
 */
export function getExpansionOriginLabel(axisId: TraitAxisKey): string {
  const def = TRAIT_AXES.find((a) => a.id === axisId);
  if (!def?.parentAxes) return "";

  const parentLabels = def.parentAxes
    .map((p) => {
      const pDef = TRAIT_AXES.find((a) => a.id === p);
      if (!pDef) return null;
      // 短いラベルを作る: "内向/外向" のような形
      return `${pDef.labelLeft}/${pDef.labelRight}`;
    })
    .filter(Boolean);

  if (parentLabels.length === 0) return "";
  if (parentLabels.length <= 2) {
    return `${parentLabels.join(" と ")} の間に`;
  }
  return `${parentLabels.slice(0, 2).join(" と ")} などの間に`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Notification Rules
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 発見通知を出してよいか判定する */
export function shouldNotifyDiscovery(params: {
  /** 前回の発見通知日時 (ISO string) */
  lastNotifiedAt?: string;
  /** 発見された軸の precision */
  precision: number;
  /** ユーザーの最終結果閲覧日時 (ISO string) */
  lastResultsViewAt?: string;
  /** 既発見軸で confidence < 0.30 のものがあるか */
  hasImmatureDiscoveredAxis: boolean;
}): boolean {
  const now = Date.now();

  // 前回の発見通知から7日未満
  if (params.lastNotifiedAt) {
    const diff = now - new Date(params.lastNotifiedAt).getTime();
    if (diff < 7 * 24 * 60 * 60 * 1000) return false;
  }

  // precision が τ > 10 に達していない（裏で育成中）
  if (params.precision < 10) return false;

  // 最終結果閲覧が3日以上前（離脱中）
  if (params.lastResultsViewAt) {
    const diff = now - new Date(params.lastResultsViewAt).getTime();
    if (diff > 3 * 24 * 60 * 60 * 1000) return false;
  }

  // 前の発見軸がまだ育っていない
  if (params.hasImmatureDiscoveredAxis) return false;

  return true;
}
