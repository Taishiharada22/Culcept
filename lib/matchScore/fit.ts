// lib/matchScore/fit.ts
// サイズ/フィットスコア計算

export type FitScoreInput = {
  category: string | null;
  fitPreference: string | null;
  bodyMeasurements: Record<string, unknown> | null;
  garmentMeasurements: Record<string, unknown> | null;
  bodyType: string | null;
};

export type FitScoreResult = {
  score: number;
  reasons: string[];
};

const BODY_TYPE_FIT: Record<string, Record<string, number>> = {
  "ストレート": { slim: 75, regular: 85, relaxed: 70, oversized: 55 },
  "ウェーブ": { slim: 80, regular: 80, relaxed: 75, oversized: 65 },
  "ナチュラル": { slim: 60, regular: 75, relaxed: 85, oversized: 80 },
};

export function calcFitScore(input: FitScoreInput): FitScoreResult {
  const reasons: string[] = [];

  if (!input.bodyMeasurements || Object.keys(input.bodyMeasurements).length === 0) {
    return { score: 50, reasons: ["体型データ未登録のため暫定評価"] };
  }

  let score = 65;

  // 骨格タイプとフィット感の相性
  if (input.bodyType && input.fitPreference) {
    const typeScores = BODY_TYPE_FIT[input.bodyType];
    if (typeScores && typeScores[input.fitPreference] != null) {
      score = typeScores[input.fitPreference];
      reasons.push(`${input.bodyType}体型 × ${input.fitPreference}フィット`);
    }
  }

  // 体型データの充実度
  const measureKeys = Object.keys(input.bodyMeasurements);
  if (measureKeys.length >= 5) {
    reasons.push("体型計測データあり");
  } else if (measureKeys.length >= 2) {
    reasons.push("一部の体型データあり");
  }

  // カテゴリ別補正
  if (input.category === "outer" && input.fitPreference === "slim") {
    score -= 5;
    reasons.push("アウターのタイトフィットは窮屈な場合あり");
  }

  if (input.garmentMeasurements && Object.keys(input.garmentMeasurements).length > 0) {
    score += 5;
    reasons.push("ガーメント計測データで精度向上");
  }

  if (reasons.length === 0) {
    reasons.push("基本的な体型データで推定");
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: reasons.slice(0, 4),
  };
}
