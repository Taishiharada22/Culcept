/* ─────────────────────────────────────────────
   日本人体型統計データ
   経産省人体寸法データベース / JIS 準拠の平均値・標準偏差
   性別 × 身長帯ごとの参照データ
   ───────────────────────────────────────────── */

export type Gender = "female" | "male" | "other";

export interface BodyStatsRange {
    min: number;
    max: number;
    mean: number;
    stdDev: number;
}

export type MeasureKey =
    | "neck_circ" | "shoulder_breadth" | "chest_circ" | "waist_circ"
    | "hip_circ" | "back_length" | "sleeve_length" | "inseam"
    | "rise" | "thigh_circ" | "calf_circ" | "armhole_depth"
    | "torso_depth" | "foot_length_cm";

export type BodyStatsProfile = Partial<Record<MeasureKey, BodyStatsRange>>;

/* ─── 基準値（身長 160cm 女性 / 172cm 男性を基準に線形補間） ─── */

interface BaseStats {
    mean: number;
    stdDev: number;
    /** 身長 1cm あたりの変化量 */
    heightCoeff: number;
    /** 体重 1kg あたりの変化量（周囲径のみ） */
    weightCoeff: number;
}

const FEMALE_BASE: Record<MeasureKey, BaseStats> = {
    neck_circ:        { mean: 32.5, stdDev: 1.8, heightCoeff: 0.08, weightCoeff: 0.12 },
    shoulder_breadth: { mean: 37.5, stdDev: 1.6, heightCoeff: 0.14, weightCoeff: 0.03 },
    chest_circ:       { mean: 82.0, stdDev: 5.0, heightCoeff: 0.22, weightCoeff: 0.45 },
    waist_circ:       { mean: 64.0, stdDev: 5.5, heightCoeff: 0.15, weightCoeff: 0.55 },
    hip_circ:         { mean: 90.0, stdDev: 4.0, heightCoeff: 0.20, weightCoeff: 0.40 },
    back_length:      { mean: 38.0, stdDev: 1.5, heightCoeff: 0.10, weightCoeff: 0.0 },
    sleeve_length:    { mean: 52.0, stdDev: 2.0, heightCoeff: 0.22, weightCoeff: 0.0 },
    inseam:           { mean: 72.0, stdDev: 2.8, heightCoeff: 0.42, weightCoeff: 0.0 },
    rise:             { mean: 25.0, stdDev: 1.5, heightCoeff: 0.06, weightCoeff: 0.10 },
    thigh_circ:       { mean: 52.0, stdDev: 3.5, heightCoeff: 0.10, weightCoeff: 0.30 },
    calf_circ:        { mean: 34.0, stdDev: 2.0, heightCoeff: 0.06, weightCoeff: 0.15 },
    armhole_depth:    { mean: 18.0, stdDev: 1.2, heightCoeff: 0.04, weightCoeff: 0.05 },
    torso_depth:      { mean: 18.5, stdDev: 1.5, heightCoeff: 0.04, weightCoeff: 0.10 },
    foot_length_cm:   { mean: 23.5, stdDev: 0.8, heightCoeff: 0.08, weightCoeff: 0.0 },
};

const MALE_BASE: Record<MeasureKey, BaseStats> = {
    neck_circ:        { mean: 37.5, stdDev: 2.0, heightCoeff: 0.10, weightCoeff: 0.15 },
    shoulder_breadth: { mean: 43.0, stdDev: 1.8, heightCoeff: 0.16, weightCoeff: 0.04 },
    chest_circ:       { mean: 90.0, stdDev: 5.5, heightCoeff: 0.28, weightCoeff: 0.50 },
    waist_circ:       { mean: 72.0, stdDev: 6.0, heightCoeff: 0.18, weightCoeff: 0.60 },
    hip_circ:         { mean: 92.0, stdDev: 4.5, heightCoeff: 0.22, weightCoeff: 0.38 },
    back_length:      { mean: 42.0, stdDev: 1.8, heightCoeff: 0.12, weightCoeff: 0.0 },
    sleeve_length:    { mean: 58.0, stdDev: 2.2, heightCoeff: 0.25, weightCoeff: 0.0 },
    inseam:           { mean: 78.0, stdDev: 3.0, heightCoeff: 0.45, weightCoeff: 0.0 },
    rise:             { mean: 26.0, stdDev: 1.5, heightCoeff: 0.06, weightCoeff: 0.12 },
    thigh_circ:       { mean: 54.0, stdDev: 3.5, heightCoeff: 0.12, weightCoeff: 0.30 },
    calf_circ:        { mean: 36.0, stdDev: 2.2, heightCoeff: 0.08, weightCoeff: 0.15 },
    armhole_depth:    { mean: 20.0, stdDev: 1.3, heightCoeff: 0.05, weightCoeff: 0.06 },
    torso_depth:      { mean: 20.0, stdDev: 1.6, heightCoeff: 0.05, weightCoeff: 0.12 },
    foot_length_cm:   { mean: 26.0, stdDev: 0.9, heightCoeff: 0.09, weightCoeff: 0.0 },
};

const REFERENCE_HEIGHT = { female: 158, male: 172, other: 165 } as const;
const REFERENCE_WEIGHT = { female: 52, male: 65, other: 58 } as const;

/**
 * 性別・身長・体重から各計測フィールドの統計的期待範囲を算出
 */
export function getStatsForProfile(
    gender: Gender,
    heightCm: number,
    weightKg?: number,
): BodyStatsProfile {
    const base = gender === "male" ? MALE_BASE : FEMALE_BASE;
    const refH = REFERENCE_HEIGHT[gender];
    const refW = REFERENCE_WEIGHT[gender];
    const dH = heightCm - refH;
    const dW = weightKg != null ? weightKg - refW : 0;

    const result: BodyStatsProfile = {};

    for (const [key, stats] of Object.entries(base) as [MeasureKey, BaseStats][]) {
        const adjustedMean = stats.mean + dH * stats.heightCoeff + dW * stats.weightCoeff;
        const min = adjustedMean - stats.stdDev * 2;
        const max = adjustedMean + stats.stdDev * 2;
        result[key] = {
            min: Math.round(min * 10) / 10,
            max: Math.round(max * 10) / 10,
            mean: Math.round(adjustedMean * 10) / 10,
            stdDev: stats.stdDev,
        };
    }

    return result;
}

/** 計測フィールドの日本語ラベル */
export const MEASURE_LABELS: Record<string, string> = {
    stature: "身長",
    neck_circ: "首周り",
    shoulder_breadth: "肩幅",
    shoulder: "肩幅",
    chest_circ: "バスト/チェスト",
    chest: "バスト/チェスト",
    waist_circ: "ウエスト",
    waist: "ウエスト",
    hip_circ: "ヒップ",
    hip: "ヒップ",
    back_length: "背丈",
    sleeve_length: "袖丈",
    sleeve: "袖丈",
    inseam: "股下",
    rise: "股上",
    thigh_circ: "太もも周り",
    thigh: "太もも周り",
    calf_circ: "ふくらはぎ周り",
    calf: "ふくらはぎ周り",
    armhole_depth: "アームホール深さ",
    torso_depth: "胴囲前後幅",
    foot_length_cm: "足長",
    foot_girth_cm: "足囲",
    foot_width_cm: "足幅",
};
