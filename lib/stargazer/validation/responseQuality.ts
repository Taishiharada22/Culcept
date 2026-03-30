// lib/stargazer/validation/responseQuality.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 応答品質バリデーション v1
//
// 回答の「真剣さ」を定量的に判定する。
// 連打（全回答50ms以下）、均一回答（全て同じ選択肢）、
// 極端に速い応答パターンを検出し、品質スコアを付与する。
//
// 低品質セッションのスコアは計算時にデフレーションされる。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── 型定義 ──

export interface ResponseQualityResult {
  /** 総合品質スコア (0-1): 1=完全に信頼できる応答 */
  quality: number;
  /** 品質レベル */
  level: "unreliable" | "low" | "acceptable" | "good" | "excellent";
  /** 検出された問題 */
  flags: ResponseQualityFlag[];
  /** 推奨: スコア計算時の重み係数 (0.1-1.0) */
  scoringWeight: number;
  /** 人間向けサマリ（日本語） */
  summary: string;
}

export interface ResponseQualityFlag {
  type: "speed_bot" | "uniform_answers" | "too_fast" | "no_variation" | "suspicious_pattern";
  severity: "warning" | "critical";
  detail: string;
}

interface AnswerData {
  questionId: string;
  /** 回答の値（選択肢インデックス or スケール値） */
  value: number | string;
  /** 応答時間 (ms) */
  responseTimeMs: number;
}

// ── 閾値定数 ──

/** この時間以下の回答は「読んでいない」と判定 (ms) */
const MIN_READING_TIME_MS = 800;

/** 全回答の平均がこれ以下なら「連打」 (ms) */
const BOT_SPEED_THRESHOLD_MS = 1500;

/** 応答時間の標準偏差がこれ以下なら「機械的」(ms) */
const TIME_VARIATION_THRESHOLD_MS = 500;

/** 同一回答の割合がこれ以上なら「均一回答」 */
const UNIFORM_ANSWER_THRESHOLD = 0.85;

/** 最低回答数（これ未満は判定不能） */
const MIN_ANSWERS_FOR_QUALITY = 3;

// ── メイン関数 ──

/**
 * 回答セットの品質を判定する
 */
export function assessResponseQuality(answers: AnswerData[]): ResponseQualityResult {
  if (answers.length < MIN_ANSWERS_FOR_QUALITY) {
    return {
      quality: 0.5,
      level: "acceptable",
      flags: [],
      scoringWeight: 0.8,
      summary: "回答数が少ないため、品質判定は保留中です",
    };
  }

  const flags: ResponseQualityFlag[] = [];
  let qualityScore = 1.0;

  const responseTimes = answers.map((a) => a.responseTimeMs).filter((t) => t > 0);

  // ── Check 1: 連打検出（ボットスピード）──
  if (responseTimes.length > 0) {
    const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

    if (avgTime < BOT_SPEED_THRESHOLD_MS) {
      const severity = avgTime < MIN_READING_TIME_MS ? "critical" : "warning";
      flags.push({
        type: "speed_bot",
        severity,
        detail: `平均応答時間が${Math.round(avgTime)}msです（通常は3-8秒）`,
      });
      qualityScore *= severity === "critical" ? 0.2 : 0.5;
    }

    // ── Check 2: 読んでいない回答の割合 ──
    const tooFastCount = responseTimes.filter((t) => t < MIN_READING_TIME_MS).length;
    const tooFastRatio = tooFastCount / responseTimes.length;

    if (tooFastRatio > 0.5) {
      flags.push({
        type: "too_fast",
        severity: tooFastRatio > 0.8 ? "critical" : "warning",
        detail: `${Math.round(tooFastRatio * 100)}%の回答が${MIN_READING_TIME_MS}ms未満です`,
      });
      qualityScore *= 1 - tooFastRatio * 0.6;
    }

    // ── Check 3: 応答時間の均一性（機械的回答）──
    if (responseTimes.length >= 5) {
      const mean = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const variance = responseTimes.reduce((a, b) => a + (b - mean) ** 2, 0) / responseTimes.length;
      const sd = Math.sqrt(variance);

      if (sd < TIME_VARIATION_THRESHOLD_MS && mean < 3000) {
        flags.push({
          type: "no_variation",
          severity: "warning",
          detail: `応答時間のばらつきが極端に小さい（SD=${Math.round(sd)}ms）`,
        });
        qualityScore *= 0.7;
      }
    }
  }

  // ── Check 4: 均一回答パターン ──
  const values = answers.map((a) => String(a.value));
  const valueFrequency = new Map<string, number>();
  for (const v of values) {
    valueFrequency.set(v, (valueFrequency.get(v) ?? 0) + 1);
  }
  const maxFrequency = Math.max(...valueFrequency.values());
  const uniformRatio = maxFrequency / values.length;

  if (uniformRatio >= UNIFORM_ANSWER_THRESHOLD) {
    flags.push({
      type: "uniform_answers",
      severity: uniformRatio >= 0.95 ? "critical" : "warning",
      detail: `${Math.round(uniformRatio * 100)}%が同じ回答です`,
    });
    qualityScore *= uniformRatio >= 0.95 ? 0.15 : 0.4;
  }

  // ── Check 5: 疑わしいパターン（位置バイアス）──
  // 常に最初の選択肢や最後の選択肢を選ぶパターン
  if (answers.length >= 5) {
    const numericValues = values.map(Number).filter((n) => !isNaN(n));
    if (numericValues.length >= 5) {
      const allMin = numericValues.every((v) => v === Math.min(...numericValues));
      const allMax = numericValues.every((v) => v === Math.max(...numericValues));
      if (allMin || allMax) {
        flags.push({
          type: "suspicious_pattern",
          severity: "warning",
          detail: "全回答が極端な値（最小 or 最大）に偏っています",
        });
        qualityScore *= 0.5;
      }
    }
  }

  // ── 最終スコア計算 ──
  qualityScore = Math.max(0.05, Math.min(1.0, qualityScore));

  const level = resolveLevel(qualityScore);
  const scoringWeight = computeScoringWeight(qualityScore);

  const hasCritical = flags.some((f) => f.severity === "critical");
  const summary = hasCritical
    ? "回答の信頼性に深刻な問題が検出されました。スコア計算時に大幅に割り引かれます。"
    : flags.length > 0
      ? `回答品質に${flags.length}件の注意点があります。スコア精度に若干影響します。`
      : "回答品質は良好です。";

  return { quality: qualityScore, level, flags, scoringWeight, summary };
}

// ── ヘルパー ──

function resolveLevel(quality: number): ResponseQualityResult["level"] {
  if (quality >= 0.9) return "excellent";
  if (quality >= 0.7) return "good";
  if (quality >= 0.45) return "acceptable";
  if (quality >= 0.2) return "low";
  return "unreliable";
}

/**
 * 品質スコアからスコア計算時の重み係数を算出
 * 0.1（ほぼ無視）〜 1.0（フル反映）
 */
function computeScoringWeight(quality: number): number {
  if (quality >= 0.7) return 1.0;
  if (quality >= 0.45) return 0.7 + (quality - 0.45) * 1.2; // 0.7 → 1.0
  if (quality >= 0.2) return 0.3 + (quality - 0.2) * 1.6;   // 0.3 → 0.7
  return Math.max(0.1, quality * 1.5);                        // 0.1 → 0.3
}
