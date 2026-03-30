/* ─────────────────────────────────────────────
   計測バリデーション + 回帰推定エンジン
   - 統計的範囲チェック（日本人体型DB基準）
   - BMI 整合性チェック
   - 回帰式による初期推定
   ───────────────────────────────────────────── */

import {
    getStatsForProfile,
    MEASURE_LABELS,
    type Gender,
    type MeasureKey,
} from "./japaneseBodyStats";

/* ─── バリデーション結果型 ─── */

export type ValidationStatus = "ok" | "warning" | "error";

export interface ValidationResult {
    field: string;
    label: string;
    status: ValidationStatus;
    message: string;
    expectedRange?: [number, number];
    mean?: number;
}

export interface ValidationContext {
    heightCm?: number;
    weightKg?: number;
    gender?: Gender;
}

/* ─── 個別フィールドバリデーション ─── */

const ABSOLUTE_BOUNDS: Record<string, [number, number]> = {
    stature: [50, 250],
    neck_circ: [20, 60],
    shoulder_breadth: [25, 65],
    shoulder: [25, 65],
    chest_circ: [50, 160],
    chest: [50, 160],
    waist_circ: [40, 160],
    waist: [40, 160],
    hip_circ: [50, 160],
    hip: [50, 160],
    back_length: [25, 60],
    sleeve_length: [30, 90],
    sleeve: [30, 90],
    inseam: [40, 110],
    rise: [15, 45],
    thigh_circ: [30, 90],
    thigh: [30, 90],
    calf_circ: [20, 60],
    calf: [20, 60],
    armhole_depth: [10, 35],
    torso_depth: [10, 40],
    foot_length_cm: [15, 35],
    foot_girth_cm: [18, 35],
    foot_width_cm: [6, 15],
};

/**
 * 単一計測値のバリデーション
 * 1. 物理的範囲チェック（絶対値）
 * 2. 統計的範囲チェック（身長・体重ベース、1.5σ=warning, 3σ=error）
 */
export function validateMeasurement(
    key: string,
    value: number,
    context: ValidationContext,
): ValidationResult {
    const label = MEASURE_LABELS[key] ?? key;

    // 物理的範囲チェック
    const bounds = ABSOLUTE_BOUNDS[key];
    if (bounds) {
        if (value < bounds[0] || value > bounds[1]) {
            return {
                field: key,
                label,
                status: "error",
                message: `${label} ${value}cm は物理的に考えにくい値です（通常 ${bounds[0]}〜${bounds[1]}cm）`,
                expectedRange: bounds,
            };
        }
    }

    // 統計的範囲チェック（身長があれば）
    if (context.heightCm && context.heightCm > 100) {
        const gender = context.gender ?? "other";
        const stats = getStatsForProfile(gender, context.heightCm, context.weightKg);
        const fieldStats = stats[key as MeasureKey];

        if (fieldStats) {
            const zScore = Math.abs(value - fieldStats.mean) / fieldStats.stdDev;

            if (zScore > 3) {
                return {
                    field: key,
                    label,
                    status: "error",
                    message: `${label} ${value}cm は身長${context.heightCm}cmに対して大幅にずれています。測り方を確認してください`,
                    expectedRange: [fieldStats.min, fieldStats.max],
                    mean: fieldStats.mean,
                };
            }
            if (zScore > 1.5) {
                return {
                    field: key,
                    label,
                    status: "warning",
                    message: `${label} ${value}cm は平均（${fieldStats.mean}cm）からやや離れています`,
                    expectedRange: [fieldStats.min, fieldStats.max],
                    mean: fieldStats.mean,
                };
            }

            return {
                field: key,
                label,
                status: "ok",
                message: `${label} は平均的な範囲内です`,
                expectedRange: [fieldStats.min, fieldStats.max],
                mean: fieldStats.mean,
            };
        }
    }

    return { field: key, label, status: "ok", message: "" };
}

/**
 * 全計測値の一括バリデーション
 */
export function validateAllMeasurements(
    measurements: Record<string, number>,
    context: ValidationContext,
): ValidationResult[] {
    const results: ValidationResult[] = [];

    for (const [key, value] of Object.entries(measurements)) {
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        const result = validateMeasurement(key, value, context);
        if (result.status !== "ok" || result.expectedRange) {
            results.push(result);
        }
    }

    // BMI 整合性チェック
    const bmiResult = crossValidateBMI(
        context.heightCm,
        context.weightKg,
        measurements.chest_circ ?? measurements.chest,
        measurements.waist_circ ?? measurements.waist,
        measurements.hip_circ ?? measurements.hip,
    );
    if (bmiResult) results.push(bmiResult);

    return results;
}

/* ─── BMI 整合性チェック ─── */

function crossValidateBMI(
    heightCm?: number,
    weightKg?: number,
    chestCirc?: number,
    waistCirc?: number,
    hipCirc?: number,
): ValidationResult | null {
    if (!heightCm || !weightKg || heightCm < 100) return null;

    const bmi = weightKg / ((heightCm / 100) ** 2);

    // BMI から期待される周囲径（回帰近似）
    const checks: Array<{ key: string; label: string; value: number; expected: number; tolerance: number }> = [];

    if (chestCirc) {
        checks.push({
            key: "chest_circ",
            label: "バスト/チェスト",
            value: chestCirc,
            expected: 65 + bmi * 1.1,
            tolerance: 8,
        });
    }
    if (waistCirc) {
        checks.push({
            key: "waist_circ",
            label: "ウエスト",
            value: waistCirc,
            expected: 45 + bmi * 1.3,
            tolerance: 8,
        });
    }
    if (hipCirc) {
        checks.push({
            key: "hip_circ",
            label: "ヒップ",
            value: hipCirc,
            expected: 60 + bmi * 1.2,
            tolerance: 8,
        });
    }

    for (const check of checks) {
        const diff = Math.abs(check.value - check.expected);
        if (diff > check.tolerance * 2) {
            return {
                field: check.key,
                label: check.label,
                status: "warning",
                message: `BMI ${bmi.toFixed(1)} に対して ${check.label} ${check.value}cm は通常と異なります（期待値: 約${Math.round(check.expected)}cm）。体重または計測値を確認してください`,
            };
        }
    }

    return null;
}

/* ─── 回帰推定 ─── */

/**
 * 身長・体重・性別から全計測フィールドの推定値を算出
 * （実測値の代替ではなく、初期値提案として使用）
 */
export function estimateInitialMeasurements(
    heightCm: number,
    weightKg: number,
    gender: Gender = "other",
): Record<string, number> {
    const stats = getStatsForProfile(gender, heightCm, weightKg);
    const result: Record<string, number> = {};

    for (const [key, range] of Object.entries(stats)) {
        if (range?.mean != null) {
            result[key] = Math.round(range.mean * 10) / 10;
        }
    }

    // 身長そのもの
    result.stature = heightCm;

    // 重複キーの同期
    if (result.shoulder_breadth) result.shoulder = result.shoulder_breadth;
    if (result.chest_circ) result.chest = result.chest_circ;
    if (result.waist_circ) result.waist = result.waist_circ;
    if (result.hip_circ) result.hip = result.hip_circ;
    if (result.sleeve_length) result.sleeve = result.sleeve_length;
    if (result.thigh_circ) result.thigh = result.thigh_circ;
    if (result.calf_circ) result.calf = result.calf_circ;

    return result;
}
