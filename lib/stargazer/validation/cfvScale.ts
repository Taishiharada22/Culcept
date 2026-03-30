// lib/stargazer/validation/cfvScale.ts
// ──────────────────────────────────────────────────────────────────────
// CFV Scale — Confidence-Fidelity-Validity 三次元評価フレームワーク
//
// Aneurasync の全測定結果に統一的な品質指標を付与するフレームワーク。
//
// ### 三次元の定義
// - **Confidence (確信度)**: データ量に基づく統計的確信度
//   根拠: サンプルサイズと標準誤差の関係 (Nunnally, 1978)
// - **Fidelity (忠実度)**: 測定が対象構成概念をどれだけ正確に捉えているか
//   根拠: 構成概念妥当性 (Cronbach & Meehl, 1955)
// - **Validity (妥当性)**: 結果が行動予測にどれだけ有効か
//   根拠: 予測的妥当性 (Meehl, 1954)
//
// ### 表示ラベル体系
// - 確信 (>= 0.85): 十分なデータと一貫性。高い信頼で表示可能
// - 信頼 (>= 0.60): 方向性は信頼できる。詳細は暫定的
// - 暫定 (>= 0.30): パターン検出段階。変化の可能性あり
// - 推定 (<  0.30): 初期推定。観測継続で精度向上
//
// ### 重み配分の根拠
// confidence: 0.40 — 初期段階ではデータ量が精度の主要制約要因
// fidelity:   0.35 — データが蓄積するにつれ測定精度が主要ボトルネックに移行
// validity:   0.25 — 予測的妥当性は他の2軸が十分な場合にのみ意味を持つ
// ──────────────────────────────────────────────────────────────────────

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * CFV レベル — 4段階の品質評価
 *
 * - confirmed:   収束的妥当性が確立。複数の独立した指標が一致
 * - trusted:     暫定的だが方向性は信頼できる。主要パターンは安定
 * - provisional: パターン検出段階。変化の可能性あり
 * - estimated:   初期推定。データ不足のため観測継続で精度向上
 */
export type CFVLevel = "confirmed" | "trusted" | "provisional" | "estimated";

export interface CFVScore {
  /** 確信度 (0-1): データ量に基づく統計的確信度 */
  confidence: number;
  /** 忠実度 (0-1): 構成概念の捕捉精度 */
  fidelity: number;
  /** 妥当性 (0-1): 行動予測の有効性 */
  validity: number;
  /** 総合スコア (0-1): 重み付き結合 */
  overall: number;
  /** 品質レベル */
  level: CFVLevel;
  /** 日本語表示ラベル */
  label: string;
}

export interface CFVInput {
  /** 確信度 (0-1): 観測数・日数・カバレッジ等から算出 */
  confidence: number;
  /** 忠実度 (0-1): 内的整合性・矛盾検出・深度等から算出 */
  fidelity: number;
  /** 妥当性 (0-1): 予言精度・行動予測の的中率等から算出 */
  validity: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 三次元の重み配分。
 *
 * confidence (0.40): 初期段階ではデータ量が精度の主要制約要因。
 *   サンプルサイズが標準誤差を支配する (Nunnally, 1978)。
 *
 * fidelity (0.35): データが蓄積するにつれ、測定が構成概念を
 *   正確に捉えているかが主要ボトルネックに移行する
 *   (Cronbach & Meehl, 1955)。
 *
 * validity (0.25): 予測的妥当性は confidence と fidelity が
 *   十分な場合にのみ意味を持つ。基盤なき予測は偶然の一致にすぎない
 *   (Meehl, 1954)。
 */
const WEIGHTS = {
  confidence: 0.40,
  fidelity: 0.35,
  validity: 0.25,
} as const;

/**
 * レベル閾値の根拠:
 *
 * confirmed (>= 0.85):
 *   心理測定における「良好な」信頼性の標準閾値。
 *   Cronbach's alpha >= 0.85 に相当 (Nunnally, 1978)。
 *   収束的妥当性が確立された状態。
 *
 * trusted (>= 0.60):
 *   「許容可能な」信頼性の下限。
 *   方向性は信頼できるが、詳細は暫定的 (DeVellis, 2016)。
 *
 * provisional (>= 0.30):
 *   パターンが検出され始める最低限の閾値。
 *   効果量 d >= 0.3 (中程度) に概念的に対応 (Cohen, 1988)。
 *
 * estimated (< 0.30):
 *   統計的に有意なパターンが未確立。
 *   初期推定値として扱い、観測継続で精度向上を期待。
 */
const THRESHOLDS: { level: CFVLevel; minOverall: number }[] = [
  { level: "confirmed", minOverall: 0.85 },
  { level: "trusted", minOverall: 0.60 },
  { level: "provisional", minOverall: 0.30 },
  { level: "estimated", minOverall: 0 },
];

/** 日本語ラベル */
const LEVEL_LABELS: Record<CFVLevel, string> = {
  confirmed: "確信",
  trusted: "信頼",
  provisional: "暫定",
  estimated: "推定",
};

/** UI 表示用カラー (RGBA) */
const LEVEL_COLORS: Record<CFVLevel, string> = {
  confirmed: "rgba(74, 222, 128, 0.9)",   // green
  trusted: "rgba(96, 165, 250, 0.9)",     // blue
  provisional: "rgba(251, 191, 36, 0.9)", // amber
  estimated: "rgba(156, 163, 175, 0.7)",  // gray
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * CFV スコアを算出する。
 *
 * 3つの入力次元を重み付き結合し、統一的な品質スコアを返す。
 *
 * @param input - confidence, fidelity, validity の各スコア (0-1)
 * @returns CFVScore - 総合スコア・レベル・ラベルを含む完全な評価
 */
export function calculateCFV(input: CFVInput): CFVScore {
  const confidence = clamp01(input.confidence);
  const fidelity = clamp01(input.fidelity);
  const validity = clamp01(input.validity);

  const overall = clamp01(
    confidence * WEIGHTS.confidence +
    fidelity * WEIGHTS.fidelity +
    validity * WEIGHTS.validity
  );

  const level = getCFVLevel(overall);
  const label = getCFVLabel(level);

  return {
    confidence,
    fidelity,
    validity,
    overall,
    level,
    label,
  };
}

/**
 * 総合スコアから CFV レベルを判定する。
 */
export function getCFVLevel(overall: number): CFVLevel {
  const clamped = clamp01(overall);
  for (const t of THRESHOLDS) {
    if (clamped >= t.minOverall) {
      return t.level;
    }
  }
  return "estimated";
}

/**
 * CFV レベルから日本語ラベルを返す。
 */
export function getCFVLabel(level: CFVLevel): string {
  return LEVEL_LABELS[level];
}

/**
 * CFV レベルから UI 表示用カラー (RGBA) を返す。
 */
export function getCFVColor(level: CFVLevel): string {
  return LEVEL_COLORS[level];
}

/**
 * CFV スコアを表示用の文字列にフォーマットする。
 *
 * @example
 * formatCFVDisplay(cfv) => "信頼 (C:0.72 F:0.65 V:0.48 = 0.64)"
 */
export function formatCFVDisplay(cfv: CFVScore): string {
  const c = cfv.confidence.toFixed(2);
  const f = cfv.fidelity.toFixed(2);
  const v = cfv.validity.toFixed(2);
  const o = cfv.overall.toFixed(2);
  return `${cfv.label} (C:${c} F:${f} V:${v} = ${o})`;
}

/**
 * 各次元の改善アドバイスを日本語で返す（最も弱い次元から最大3つ）。
 */
export function getCFVAdvice(cfv: CFVScore): string[] {
  const dimensions: { key: string; score: number; advice: string }[] = [
    {
      key: "confidence",
      score: cfv.confidence,
      advice: "観測を続けることで、統計的な確信度が高まります",
    },
    {
      key: "fidelity",
      score: cfv.fidelity,
      advice: "より多くの軸を観測し、内的整合性を高めましょう",
    },
    {
      key: "validity",
      score: cfv.validity,
      advice: "行動予測の検証を重ねることで、妥当性が向上します",
    },
  ];

  return dimensions
    .filter((d) => d.score < 0.7)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((d) => d.advice);
}
