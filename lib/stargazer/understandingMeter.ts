// lib/stargazer/understandingMeter.ts
// 理解度メーター — ユーザー理解度の計算・減衰・永続化ロジック
//
// 設計思想:
// - 観測回数 + セッション数 + 矛盾発見で理解度が上昇
// - 非活動期間で減衰（プロスペクト理論: 失う恐怖 > 得る喜び）
// - 最大95%（"完全には理解できない" = 神秘性の維持）
// - 最低10%（完全にゼロには戻さない = 絶望させない）

import { safeSetItem } from "./localStorageHelper";

// ── 型定義 ──────────────────────────────────────────

export interface DimensionScores {
  judgmentPrinciple: number;    // 判断原理
  stressResponse: number;       // ストレス反応
  interpersonalPattern: number; // 対人パターン
  selfImage: number;            // 自己像
  unconsciousDesire: number;    // 無自覚な欲求
  contradictionMap: number;     // 矛盾マップ
  temporalPattern: number;      // 時間的パターン
  valueStructure: number;       // 価値観構造（L5）
  transformationPattern: number; // 変容パターン（L6）
}

export type DimensionKey = keyof DimensionScores;

export interface UnderstandingLevel {
  overall: number; // 0-100
  dimensions: DimensionScores;
  confidence: number; // 0-1
  lastObservationAt: number; // timestamp ms
  observationCount: number;
  decayRate: number; // percentage lost per day of inactivity
  trend: "rising" | "stable" | "declining";
}

export interface UnderstandingStatus {
  message: string;
  warning?: string;
  suggestion?: string;
  nextMilestone: { percentage: number; label: string };
}

// ── 定数 ─────────────────────────────────────────────

const STORAGE_KEY = "stargazer_understanding_meter_v3"; // v3: sqrt日数ベースの新計算式

/**
 * 理解度の上限 75%。
 * Dunning-Kruger 効果 / 認識論的謙虚さの天井 — 漸近モデルにより、
 * 人間の性格には還元不可能な不確実性が存在することを認める
 * (Mischel, 1968; Funder, 1995)。
 * 一流の臨床心理士でも1年で到達するのは70%前後（Costa & McCrae長期研究）。
 * AIがそれを超えるのは非現実的。75%を理論上限とする。
 */
const MAX_LEVEL = 75;

/** 最低 2% — 完全にゼロには戻さない（絶望させない設計） */
const MIN_LEVEL = 2;

/**
 * 早期減衰率 1.5%/日（最初の3日間）。
 * Ebbinghaus の忘却曲線を性格観測に適応。
 * 直近の観測はより強い記憶痕跡を持つため、早期の減衰は緩やか
 * (Wixted, 2004)。
 */
const DECAY_EARLY_RATE = 1.5;

/**
 * 後期減衰率 3.0%/日（4日目以降）。
 * 猶予期間後の加速減衰 — 長期記憶への固定化失敗を反映
 * (McGaugh, 2000)。
 */
const DECAY_LATE_RATE = 3;

/** 猶予日数 0日（即座に減衰開始） */
const DECAY_GRACE_DAYS = 0;

/** 軸 → 次元のマッピング（45軸を7次元に集約） */
const AXIS_TO_DIMENSION: Record<string, DimensionKey> = {
  // 判断原理
  analytical_vs_intuitive: "judgmentPrinciple",
  cautious_vs_bold: "judgmentPrinciple",
  plan_vs_spontaneous: "judgmentPrinciple",
  perfectionist_vs_pragmatic: "judgmentPrinciple",
  quality_vs_quantity: "judgmentPrinciple",
  // ストレス反応
  stress_isolation_vs_social: "stressResponse",
  emotional_variability: "stressResponse",
  emotional_regulation: "stressResponse",
  rejection_response_maturity: "stressResponse",
  escalation_risk: "stressResponse",
  // 対人パターン
  introvert_vs_extrovert: "interpersonalPattern",
  individual_vs_social: "interpersonalPattern",
  direct_vs_diplomatic: "interpersonalPattern",
  independence_vs_harmony: "interpersonalPattern",
  social_initiative: "interpersonalPattern",
  intimacy_pace: "interpersonalPattern",
  // 自己像
  function_vs_expression: "selfImage",
  minimal_vs_maximal: "selfImage",
  classic_vs_trendy: "selfImage",
  public_private_gap: "selfImage",
  // 無自覚な欲求
  reassurance_need: "unconsciousDesire",
  change_embrace_vs_resist: "unconsciousDesire",
  tradition_vs_novelty: "unconsciousDesire",
  boundary_awareness: "unconsciousDesire",
  // 矛盾マップ
  relationship_mode_split: "contradictionMap",
  control_tendency: "contradictionMap",
  exclusivity_pressure: "contradictionMap",
  pressure_risk: "contradictionMap",
  // 時間的パターン
  intent_stability: "temporalPattern",
  long_term_shift_risk: "temporalPattern",
  boundary_respect: "temporalPattern",
  consent_maturity: "temporalPattern",
  friend_mode_fit: "temporalPattern",
  // Stage 3 追加軸
  attachment_style: "interpersonalPattern",
  locus_of_control: "judgmentPrinciple",
  growth_mindset: "transformationPattern",
  shame_vs_guilt: "stressResponse",
  rumination_tendency: "stressResponse",
  fairness_sensitivity: "valueStructure",
};

/** マイルストーン定義 — sqrt日数+対数観測数カーブ
 *
 * 到達目安（日次5-8問想定）:
 *    7日(50問) → ~8%   |  14日(100問) → ~12%
 *   30日(200問) → ~18% |  60日(400問) → ~28%
 *   90日(600問) → ~38% | 180日(1200問) → ~55%
 *  365日(2500問) → ~70% | MAX = 75%
 *
 * 半年で50%台、1年かけてようやく70%前後。
 * これが臨床心理の現実に近い成長カーブ。
 */
const MILESTONES: { percentage: number; label: string }[] = [
  { percentage: 5, label: "ぼんやり見えてきた" },         // ~1-2週間
  { percentage: 10, label: "なんとなく掴めてきた" },      // ~2-3週間
  { percentage: 18, label: "傾向が浮かび上がってきた" },  // ~1ヶ月
  { percentage: 28, label: "判断のクセが見えてきた" },    // ~2ヶ月
  { percentage: 38, label: "矛盾に気づき始めた" },       // ~3ヶ月
  { percentage: 50, label: "深いところが繋がってきた" },  // ~6ヶ月
  { percentage: 60, label: "もうひとりの自分に出会った" }, // ~9ヶ月
  { percentage: 70, label: "あなたの全体像が見えてきた" }, // ~1年
  { percentage: 75, label: "まだ奥がある — 終わりはない" }, // 理論上限
];

/** 次元の日本語ラベル */
export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  judgmentPrinciple: "判断原理",
  stressResponse: "ストレス反応",
  interpersonalPattern: "対人パターン",
  selfImage: "自己像",
  unconsciousDesire: "無自覚な欲求",
  contradictionMap: "矛盾マップ",
  temporalPattern: "時間的パターン",
  valueStructure: "価値観構造",
  transformationPattern: "変容パターン",
};

// ── 計算ロジック ─────────────────────────────────────

/**
 * 観測データから理解度レベルを計算する
 */
export function calculateUnderstanding(params: {
  totalObservations: number;
  axisScores: Record<string, number>;
  contradictionCount: number;
  lastObservationTimestamp: number;
  sessionCount: number;
  daysActive: number;
}): UnderstandingLevel {
  const {
    totalObservations,
    axisScores,
    contradictionCount,
    lastObservationTimestamp,
    sessionCount,
    daysActive,
  } = params;

  // ── 全体スコア（sqrt日数 + 対数観測数ベース） ──
  // 設計思想: 人間の深層心理は120問で理解できるわけがない。
  // 一流の臨床心理士でも1年の継続セッションでようやく70%前後。
  // AIがそれより速くなることはない。
  //
  // 日数の平方根を主軸に、継続的な観測が最も重要であることを表現。
  // 「一気に大量回答しても理解度は上がらない」×「毎日続けると着実に理解が深まる」
  //
  // 到達目安（日次5-8問想定）:
  //    7日(50問) → ~8%   |  14日(100問) → ~12%
  //   30日(200問) → ~18% |  60日(400問) → ~28%
  //   90日(600問) → ~38% | 180日(1200問) → ~55%
  //  365日(2500問) → ~70% | MAX = 75%
  /**
   * sqrt(日数) * 2.5 — 平方根成長は縦断的性格評価における対数的収穫逓減をモデル化
   * (Roberts & DelVecchio, 2000)。
   * 係数 2.5 は 30日で ~18%、180日で ~55% に到達するよう較正。
   * 以前の 4.0 は早期に高すぎる値を返していた。
   */
  const daysContrib = Math.sqrt(daysActive) * 2.5;

  /**
   * log(1 + 観測数) * 0.8 — 対数スケーリングにより観測数インフレを防止。
   * 以前の 1.5 は120問で ~7.2pt寄与し高すぎた。
   * 0.8 にすることで120問で ~3.8pt、1000問で ~5.5ptに抑制。
   */
  const observationContrib = Math.log(1 + totalObservations) * 0.8;

  const sessionContrib = Math.log(1 + sessionCount) * 0.5;

  /**
   * 矛盾ボーナス — 検出はあくまで+α。
   * 矛盾の検出は高情報量シグナルだが、理解度を大きく跳ね上げるものではない。
   */
  const contradictionBonus = Math.log(1 + contradictionCount) * 0.6;

  const rawOverall = 2 + daysContrib + observationContrib + sessionContrib + contradictionBonus;

  const overall = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(rawOverall)));

  // ── 次元別スコア ──
  const dimensionCoverage: Record<DimensionKey, number> = {
    judgmentPrinciple: 0,
    stressResponse: 0,
    interpersonalPattern: 0,
    selfImage: 0,
    unconsciousDesire: 0,
    contradictionMap: 0,
    temporalPattern: 0,
    valueStructure: 0,
    transformationPattern: 0,
  };

  // 各軸のスコアが存在するか（非ゼロ）をカウントして次元カバレッジを算出
  const dimensionAxesTotal: Record<DimensionKey, number> = {
    judgmentPrinciple: 0,
    stressResponse: 0,
    interpersonalPattern: 0,
    selfImage: 0,
    unconsciousDesire: 0,
    contradictionMap: 0,
    temporalPattern: 0,
    valueStructure: 0,
    transformationPattern: 0,
  };
  const dimensionAxesCovered: Record<DimensionKey, number> = {
    judgmentPrinciple: 0,
    stressResponse: 0,
    interpersonalPattern: 0,
    selfImage: 0,
    unconsciousDesire: 0,
    contradictionMap: 0,
    temporalPattern: 0,
    valueStructure: 0,
    transformationPattern: 0,
  };

  for (const [axisKey, dim] of Object.entries(AXIS_TO_DIMENSION)) {
    dimensionAxesTotal[dim]++;
    if (axisScores[axisKey] !== undefined && axisScores[axisKey] !== 0) {
      dimensionAxesCovered[dim]++;
    }
  }

  const allDimensionKeys = Object.keys(dimensionCoverage) as DimensionKey[];
  for (const dim of allDimensionKeys) {
    const total = dimensionAxesTotal[dim];
    if (total === 0) {
      dimensionCoverage[dim] = 0;
    } else {
      // カバレッジ率 * 全体スコアに比例
      const coverage = dimensionAxesCovered[dim] / total;
      dimensionCoverage[dim] = Math.min(
        MAX_LEVEL,
        Math.round(coverage * overall * 1.1)
      );
    }
  }

  // 矛盾マップは矛盾発見数でブースト
  dimensionCoverage.contradictionMap = Math.min(
    MAX_LEVEL,
    dimensionCoverage.contradictionMap + contradictionCount * 5
  );

  // ── 信頼度（sqrt日数ベース） ──
  // 信頼度 = 理解度の「確からしさ」。日数 + データ量 + 多次元カバレッジで決まる
  // 7日で~0.08, 30日で~0.15, 90日で~0.25, 180日で~0.38, 365日で~0.52
  // 一流の心理テストでも再検査信頼性は0.7〜0.85程度（Costa & McCrae, 1992）
  // AIベースの推定がそれに並ぶことは非現実的なので上限 0.65
  const coveredDimensions = allDimensionKeys.filter(
    (dim) => dimensionAxesCovered[dim] > 0
  ).length;
  const dimensionCoverageRatio = coveredDimensions / allDimensionKeys.length;

  const confidence = Math.min(
    0.65,  // 信頼度65%が上限 — 臨床心理士の長期セッションにすら及ばない
    Math.sqrt(daysActive) * 0.02 +
    Math.log(1 + totalObservations) * 0.008 +
    dimensionCoverageRatio * 0.08 +
    0.02  // ベースライン
  );

  // ── トレンド判定 ──
  const existing = loadUnderstandingLevel();
  let trend: UnderstandingLevel["trend"] = "stable";
  if (existing) {
    if (overall > existing.overall + 2) trend = "rising";
    else if (overall < existing.overall - 2) trend = "declining";
  } else if (totalObservations > 0) {
    trend = "rising";
  }

  // ── 減衰率 ──
  const now = Date.now();
  const daysSince = lastObservationTimestamp
    ? (now - lastObservationTimestamp) / (1000 * 60 * 60 * 24)
    : 0;
  const decayRate = daysSince <= 3 ? DECAY_EARLY_RATE : DECAY_LATE_RATE;

  return {
    overall,
    dimensions: dimensionCoverage,
    confidence,
    lastObservationAt: lastObservationTimestamp,
    observationCount: totalObservations,
    decayRate,
    trend,
  };
}

/**
 * 非活動期間に基づいて理解度を減衰させる
 */
export function applyDecay(level: UnderstandingLevel): UnderstandingLevel {
  const now = Date.now();
  if (!level.lastObservationAt) return level;

  const daysSince =
    (now - level.lastObservationAt) / (1000 * 60 * 60 * 24);

  if (daysSince < 1) return level; // 1日未満は減衰なし

  // 日数ごとの累積減衰を計算
  let totalDecay = 0;
  const fullDays = Math.floor(daysSince);

  for (let d = 1; d <= fullDays; d++) {
    if (d <= 3) {
      totalDecay += DECAY_EARLY_RATE;
    } else {
      totalDecay += DECAY_LATE_RATE;
    }
  }

  if (totalDecay <= 0) return level;

  const decayedOverall = Math.max(MIN_LEVEL, Math.round(level.overall - totalDecay));

  // 次元別にも同じ割合で減衰
  const ratio = level.overall > 0 ? decayedOverall / level.overall : 1;
  const decayedDimensions = { ...level.dimensions };
  for (const key of Object.keys(decayedDimensions) as DimensionKey[]) {
    decayedDimensions[key] = Math.max(
      0,
      Math.round(decayedDimensions[key] * ratio)
    );
  }

  // 信頼度も若干低下
  const decayedConfidence = Math.max(0, level.confidence - totalDecay * 0.005);

  const decayRate = daysSince <= 3 ? DECAY_EARLY_RATE : DECAY_LATE_RATE;

  return {
    ...level,
    overall: decayedOverall,
    dimensions: decayedDimensions,
    confidence: decayedConfidence,
    decayRate,
    trend: totalDecay > 0 ? "declining" : level.trend,
  };
}

/**
 * 理解度の非活動日数と減衰量を計算
 */
export function getDecayInfo(level: UnderstandingLevel): {
  daysSinceLastObservation: number;
  percentageLost: number;
} {
  if (!level.lastObservationAt) {
    return { daysSinceLastObservation: 0, percentageLost: 0 };
  }

  const now = Date.now();
  const daysSince =
    (now - level.lastObservationAt) / (1000 * 60 * 60 * 24);

  const fullDays = Math.floor(daysSince);
  let totalDecay = 0;
  for (let d = 1; d <= fullDays; d++) {
    totalDecay += d <= 3 ? DECAY_EARLY_RATE : DECAY_LATE_RATE;
  }

  return {
    daysSinceLastObservation: Math.floor(daysSince),
    percentageLost: totalDecay,
  };
}

/**
 * 人間が読めるステータスメッセージを生成
 */
export function getUnderstandingStatus(
  level: UnderstandingLevel
): UnderstandingStatus {
  // ── メインメッセージ ──
  const highestDim = (
    Object.entries(level.dimensions) as [DimensionKey, number][]
  ).sort((a, b) => b[1] - a[1])[0];

  const highestLabel = highestDim
    ? DIMENSION_LABELS[highestDim[0]]
    : "判断原理";

  const message = `あなたの理解度は${level.overall}%。${highestLabel}の観測精度が最も高い`;

  // ── 減衰警告 ──
  const { daysSinceLastObservation, percentageLost } = getDecayInfo(level);
  let warning: string | undefined;
  if (daysSinceLastObservation >= 1 && percentageLost > 0) {
    warning = `${daysSinceLastObservation}日間未観測。理解度が${percentageLost}%低下しました`;
  }

  // ── 提案 ──
  const lowestDim = (
    Object.entries(level.dimensions) as [DimensionKey, number][]
  ).sort((a, b) => a[1] - b[1])[0];

  let suggestion: string | undefined;
  if (lowestDim && lowestDim[1] < level.overall * 0.6) {
    suggestion = `${DIMENSION_LABELS[lowestDim[0]]}の観測が不足しています`;
  }

  // ── 次のマイルストーン ──
  const nextMilestone =
    MILESTONES.find((m) => m.percentage > level.overall) ??
    MILESTONES[MILESTONES.length - 1];

  return {
    message,
    warning,
    suggestion,
    nextMilestone,
  };
}

/**
 * 到達済みマイルストーンのリストを返す
 */
export function getReachedMilestones(
  level: number
): { percentage: number; label: string }[] {
  return MILESTONES.filter((m) => level >= m.percentage);
}

/**
 * 全マイルストーンを返す
 */
export function getAllMilestones(): { percentage: number; label: string }[] {
  return [...MILESTONES];
}

// ── 永続化 ───────────────────────────────────────────

/**
 * 理解度レベルを localStorage に保存
 */
export function saveUnderstandingLevel(level: UnderstandingLevel): void {
  try {
    safeSetItem(STORAGE_KEY, JSON.stringify(level));
  } catch {
    // localStorage が使えない環境では無視
  }
}

/**
 * localStorage から理解度レベルを読み込み
 */
export function loadUnderstandingLevel(): UnderstandingLevel | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UnderstandingLevel;
  } catch {
    return null;
  }
}

/**
 * 初期状態のレベルを生成（観測ゼロの状態）
 */
export function createInitialLevel(): UnderstandingLevel {
  return {
    overall: 0,
    dimensions: {
      judgmentPrinciple: 0,
      stressResponse: 0,
      interpersonalPattern: 0,
      selfImage: 0,
      unconsciousDesire: 0,
      contradictionMap: 0,
      temporalPattern: 0,
      valueStructure: 0,
      transformationPattern: 0,
    },
    confidence: 0,
    lastObservationAt: 0,
    observationCount: 0,
    decayRate: DECAY_EARLY_RATE,
    trend: "stable",
  };
}
