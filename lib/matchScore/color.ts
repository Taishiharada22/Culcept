// lib/matchScore/color.ts
// カラーマッチスコア計算

export type ColorToken = {
  hex: string;
  name: string;
  ratio: number;
  [key: string]: unknown;
};

export type PcAxes = {
  temp?: number;
  value?: number;
  chroma?: number;
  contrast?: number;
  subtype?: string;
  conf?: number;
};

export type ColorScoreInput = {
  pcSeason: string | null;
  pcAxes?: PcAxes;
  dominantColors: ColorToken[];
  favoriteColors: string[];
  avoidColors: string[];
};

export type ColorScoreResult = {
  score: number;
  reasons: string[];
};

const SEASON_PROFILE: Record<string, { warm: boolean; bright: boolean }> = {
  spring: { warm: true, bright: true },
  summer: { warm: false, bright: false },
  autumn: { warm: true, bright: false },
  winter: { warm: false, bright: true },
};

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

export function calcColorScore(input: ColorScoreInput): ColorScoreResult {
  const reasons: string[] = [];

  if (input.dominantColors.length === 0) {
    return { score: 50, reasons: ["色情報なし"] };
  }

  let score = 60;
  const season = input.pcSeason?.toLowerCase() ?? null;
  const profile = season ? SEASON_PROFILE[season] : null;

  if (profile) {
    const mainColor = input.dominantColors[0];
    const hsl = hexToHsl(mainColor.hex);

    if (hsl) {
      const isWarm = hsl.h < 60 || hsl.h > 300;
      const isBright = hsl.l > 0.5;

      if (isWarm === profile.warm) {
        score += 15;
        reasons.push(`${season}カラーと色温度が一致`);
      } else {
        score -= 10;
        reasons.push(`${season}カラーと色温度が不一致`);
      }
      if (isBright === profile.bright) score += 10;
      else score -= 5;
    }
  }

  if (input.pcAxes?.conf && input.pcAxes.conf > 0.3) {
    if (input.pcAxes.contrast != null) {
      const mainHsl = hexToHsl(input.dominantColors[0].hex);
      if (mainHsl) {
        const highContrast = input.pcAxes.contrast > 0.6;
        const colorBold = mainHsl.s > 0.6;
        if (highContrast === colorBold) score += 5;
      }
    }
  }

  for (const color of input.dominantColors) {
    const hexLower = color.hex.toLowerCase();
    if (input.favoriteColors.some(f => f.toLowerCase() === hexLower)) {
      score += 10;
      reasons.push("お気に入り色と一致");
    }
    if (input.avoidColors.some(a => a.toLowerCase() === hexLower)) {
      score -= 15;
      reasons.push("避けたい色と一致");
    }
  }

  if (reasons.length === 0) {
    reasons.push(season ? `${season}シーズンで判定` : "色傾向で判定");
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: reasons.slice(0, 3),
  };
}
