// lib/matchScore/index.ts
// Band判定とマッチスコアの共通ユーティリティ

export type MatchBand = "green" | "yellow" | "red";

export type MatchInput = {
  sizeScore: number;
  colorScore: number;
  visualScore: number;
  confidence: number;
};

export type MatchResult = {
  total: number;
  band: MatchBand;
  explanation: string;
};

export function band(
  total300: number,
  visualScore: number,
  colorScore: number,
  sizeScore: number,
  confidence: number,
): MatchBand {
  const avg = total300 / 3;
  const minSub = Math.min(visualScore, colorScore, sizeScore);

  if (avg >= 65 && minSub >= 40) return "green";
  if (avg >= 40 || minSub >= 30) return "yellow";
  return "red";
}

export function bandExplanation(b: MatchBand): string {
  switch (b) {
    case "green": return "相性が良く、自信を持っておすすめできます";
    case "yellow": return "一部気になる点がありますが、全体的にはまずまずです";
    case "red": return "相性に課題があります。他のアイテムも検討してみてください";
  }
}

export function calcMatch(input: MatchInput): MatchResult {
  const total = input.sizeScore + input.colorScore + input.visualScore;
  const b = band(total, input.visualScore, input.colorScore, input.sizeScore, input.confidence);
  return { total, band: b, explanation: bandExplanation(b) };
}
