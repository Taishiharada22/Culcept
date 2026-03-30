/* ─────────────────────────────────────────────
   色彩科学ユーティリティ
   - CIE DE2000 色差計算
   - Gray World AWB（ホワイトバランス自動補正）
   - MAD ベース外れ値除去
   ───────────────────────────────────────────── */

export interface LabColor {
  L: number; // 0-100
  a: number; // -128 to 128
  b: number; // -128 to 128
}

/* ───────────────────── CIE DE2000 ───────────────────── */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/**
 * CIE DE2000 色差
 * Sharma, Wu, Dalal (2005) "The CIEDE2000 Color-Difference Formula" 準拠
 */
export function ciede2000(lab1: LabColor, lab2: LabColor): number {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  // Step 1: C*ab, h_ab
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cab = (C1 + C2) / 2;

  const Cab7 = Cab ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cab7 / (Cab7 + 25 ** 7)));

  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);

  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  let h1p = Math.atan2(b1, a1p) * DEG;
  if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) * DEG;
  if (h2p < 0) h2p += 360;

  // Step 2: Delta values
  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }

  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * RAD);

  // Step 3: CIEDE2000
  const Lp = (L1 + L2) / 2;
  const Cp = (C1p + C2p) / 2;

  let hp: number;
  if (C1p * C2p === 0) {
    hp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hp = (h1p + h2p + 360) / 2;
  } else {
    hp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos((hp - 30) * RAD) +
    0.24 * Math.cos(2 * hp * RAD) +
    0.32 * Math.cos((3 * hp + 6) * RAD) -
    0.2 * Math.cos((4 * hp - 63) * RAD);

  const SL = 1 + (0.015 * (Lp - 50) ** 2) / Math.sqrt(20 + (Lp - 50) ** 2);
  const SC = 1 + 0.045 * Cp;
  const SH = 1 + 0.015 * Cp * T;

  const Cp7 = Cp ** 7;
  const RC = 2 * Math.sqrt(Cp7 / (Cp7 + 25 ** 7));
  const dTheta = 30 * Math.exp(-(((hp - 275) / 25) ** 2));
  const RT = -Math.sin(2 * dTheta * RAD) * RC;

  const kL = 1, kC = 1, kH = 1;

  return Math.sqrt(
    (dLp / (kL * SL)) ** 2 +
    (dCp / (kC * SC)) ** 2 +
    (dHp / (kH * SH)) ** 2 +
    RT * (dCp / (kC * SC)) * (dHp / (kH * SH)),
  );
}

/* ───────────────────── Gray World AWB ───────────────────── */

/**
 * Gray World 仮説に基づくホワイトバランス補正
 * 画像全体のRGB平均を無彩色に寄せる。
 * 補正係数は [0.5, 2.0] にクランプして極端な補正を防止。
 *
 * @returns 新しい ImageData（元は変更しない）と補正の大きさ (correctionMagnitude)
 */
export function applyGrayWorldAWB(imageData: ImageData): {
  corrected: ImageData;
  correctionMagnitude: number;
} {
  const { data, width, height } = imageData;
  const n = width * height;

  let sumR = 0, sumG = 0, sumB = 0;
  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
  }

  const avgR = sumR / n;
  const avgG = sumG / n;
  const avgB = sumB / n;
  const gray = (avgR + avgG + avgB) / 3;

  const clampScale = (v: number) => Math.max(0.5, Math.min(2.0, v));
  const scaleR = clampScale(gray / (avgR || 1));
  const scaleG = clampScale(gray / (avgG || 1));
  const scaleB = clampScale(gray / (avgB || 1));

  // 補正の大きさ（0に近いほど元々バランスが良い）
  const correctionMagnitude = Math.sqrt(
    (scaleR - 1) ** 2 + (scaleG - 1) ** 2 + (scaleB - 1) ** 2,
  );

  const out = new ImageData(new Uint8ClampedArray(data), width, height);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = Math.round(Math.min(255, Math.max(0, data[i] * scaleR)));
    out.data[i + 1] = Math.round(Math.min(255, Math.max(0, data[i + 1] * scaleG)));
    out.data[i + 2] = Math.round(Math.min(255, Math.max(0, data[i + 2] * scaleB)));
    // alpha はそのまま
  }

  return { corrected: out, correctionMagnitude };
}

/* ───────────────────── MAD 外れ値フィルタ ───────────────────── */

/**
 * MAD (Median Absolute Deviation) ベースの外れ値除去
 *
 * Modified Z-score > threshold のデータを除外する。
 * @param values - 数値配列
 * @param threshold - Modified Z-score の閾値（デフォルト 3.5）
 * @returns 外れ値を除去した配列
 */
export function madFilter(values: number[], threshold = 3.5): number[] {
  if (values.length < 4) return values;

  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  const absDevs = values.map((v) => Math.abs(v - median));
  const sortedDevs = [...absDevs].sort((a, b) => a - b);
  const mad = sortedDevs[Math.floor(sortedDevs.length / 2)];

  // MAD が 0（全く同じ値ばかり）の場合はフィルタしない
  if (mad === 0) return values;

  return values.filter((v) => {
    const modifiedZ = 0.6745 * Math.abs(v - median) / mad;
    return modifiedZ <= threshold;
  });
}

/* ───────────────────── RGB → Lab 変換 ───────────────────── */

/**
 * sRGB [0-255] → CIE L*a*b* (D65 白色点)
 */
export function rgbToLab(r: number, g: number, b: number): LabColor {
  // sRGB → Linear RGB
  let lr = r / 255;
  let lg = g / 255;
  let lb = b / 255;
  lr = lr > 0.04045 ? ((lr + 0.055) / 1.055) ** 2.4 : lr / 12.92;
  lg = lg > 0.04045 ? ((lg + 0.055) / 1.055) ** 2.4 : lg / 12.92;
  lb = lb > 0.04045 ? ((lb + 0.055) / 1.055) ** 2.4 : lb / 12.92;

  // Linear RGB → XYZ (D65)
  let x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  let y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  let z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;

  // XYZ → Lab
  const f = (t: number) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);
  x = f(x);
  y = f(y);
  z = f(z);

  return {
    L: 116 * y - 16,
    a: 500 * (x - y),
    b: 200 * (y - z),
  };
}

/* ───────────────────── 多重照明検出 ───────────────────── */

export interface IlluminantReport {
  /** 混合照明が検出されたか */
  isMixed: boolean;
  /** 領域ごとの色温度推定（R/B比） */
  regionTemps: { region: string; rbRatio: number }[];
  /** 領域間の最大温度差 */
  maxTempDelta: number;
  /** 警告メッセージ（日本語） */
  warning: string | null;
}

/**
 * 顔の4領域の色温度を比較し、混合照明を検出
 * @param regionSamples - 各領域の平均RGB
 */
export function detectMixedIlluminant(
  regionSamples: { region: string; avgR: number; avgG: number; avgB: number }[],
): IlluminantReport {
  const regionTemps = regionSamples.map((s) => ({
    region: s.region,
    rbRatio: (s.avgR + 1) / (s.avgB + 1),
  }));

  const ratios = regionTemps.map((r) => r.rbRatio);
  const maxDelta = Math.max(...ratios) - Math.min(...ratios);

  const MIXED_THRESHOLD = 0.35; // 経験的閾値

  return {
    isMixed: maxDelta > MIXED_THRESHOLD,
    regionTemps,
    maxTempDelta: maxDelta,
    warning:
      maxDelta > MIXED_THRESHOLD
        ? "顔の左右で照明の色が異なる可能性があります。均一な白色光で撮影し直してください"
        : null,
  };
}
