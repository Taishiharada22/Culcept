import {
    BodyMeasurements,
    CFV,
    GarmentFitProfile,
    GarmentColorProfile,
    UserBodyProfile,
    UserPersonalColorProfile,
    LabColor,
} from "@/types/body-color";

type FitScoreResult = {
    score: number;
    confidence: number;
    reasons: string[];
    evidence: string[];
};

type ColorScoreResult = {
    score: number;
    confidence: number;
    reasons: string[];
    evidence: string[];
};

const LANDMARKS = {
    shoulder: "肩峰（肩の外側の骨）",
    chest: "胸郭/胸骨",
    armhole: "肩甲骨・上腕可動域",
    rise: "腸骨稜/ASIS（腰骨）",
    thigh: "大転子/大腿骨軸",
};

function clamp(n: number, min = 0, max = 100) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

function num(v: any): number | null {
    const n = typeof v === "number" ? v : Number(String(v ?? ""));
    return Number.isFinite(n) ? n : null;
}

function pickMeasurement(m: BodyMeasurements, keys: (keyof BodyMeasurements)[]) {
    for (const k of keys) {
        const v = num(m[k]);
        if (v != null) return v;
    }
    return null;
}

function cfvValue(cfv: Partial<CFV> | undefined, key: keyof CFV, fallback = 1) {
    const v = num(cfv?.[key]);
    if (v == null) return fallback;
    return clamp(v, 0, 2);
}

function allowance(base: number, stretch: number, fit: string | null | undefined) {
    const fitBonus =
        fit === "oversized" ? 1.6 :
            fit === "relaxed" ? 0.8 :
                fit === "slim" ? -0.3 : 0;
    return Math.max(0.2, base + stretch * 0.6 + fitBonus);
}

export function calcFitScore(args: {
    bodyProfile?: UserBodyProfile | null;
    measurements?: BodyMeasurements | null;
    garment?: GarmentFitProfile | null;
}): FitScoreResult {
    const reasons: string[] = [];
    const evidence: string[] = ["ISO 8559-1:2017準拠の人体計測指標を参照"];

    const measurement = args.measurements ?? {};
    const garment = args.garment ?? null;

    if (!garment || !garment.pattern) {
        return {
            score: 50,
            confidence: 20,
            reasons: ["フィットプロファイル未登録のため推定値"],
            evidence,
        };
    }

    const cfv = args.bodyProfile?.cfv ?? {};
    const stretch = clamp(num(garment.fabric?.stretch) ?? 0, 0, 2);
    const rigidity = clamp(num(garment.fabric?.rigidity) ?? 0, 0, 2);

    const shoulder = pickMeasurement(measurement, ["shoulder", "shoulder_breadth"]);
    const chest = pickMeasurement(measurement, ["chest", "chest_circ"]);
    const sleeve = pickMeasurement(measurement, ["sleeve", "sleeve_length"]);
    const rise = pickMeasurement(measurement, ["rise"]);
    const thigh = pickMeasurement(measurement, ["thigh", "thigh_circ"]);

    const parts = [
        {
            key: "shoulder",
            user: shoulder,
            pattern: num(garment.pattern.shoulder_cm),
            weight: 22,
            baseAllow: 1.0,
            label: "肩幅",
            landmark: LANDMARKS.shoulder,
        },
        {
            key: "chest",
            user: chest,
            pattern: num(garment.pattern.chest_cm),
            weight: 28,
            baseAllow: 2.0,
            label: "胸囲",
            landmark: LANDMARKS.chest,
        },
        {
            key: "sleeve",
            user: sleeve,
            pattern: num(garment.pattern.sleeve_cm),
            weight: 10,
            baseAllow: 1.5,
            label: "袖丈",
            landmark: LANDMARKS.armhole,
        },
        {
            key: "rise",
            user: rise,
            pattern: num(garment.pattern.rise_cm),
            weight: 12,
            baseAllow: 1.5,
            label: "股上",
            landmark: LANDMARKS.rise,
        },
        {
            key: "thigh",
            user: thigh,
            pattern: num(garment.pattern.thigh_cm),
            weight: 18,
            baseAllow: 1.5,
            label: "太もも",
            landmark: LANDMARKS.thigh,
        },
    ];

    let penalty = 0;
    let measuredParts = 0;

    for (const p of parts) {
        if (p.user == null || p.pattern == null) continue;
        measuredParts += 1;
        const allow = allowance(p.baseAllow, stretch, garment.intended_fit);
        const gap = p.pattern - p.user;
        let partPenalty = 0;

        if (gap < -allow) {
            const depth = Math.abs(gap) - allow;
            partPenalty = p.weight * (1 + depth / Math.max(0.5, allow));
            if (rigidity >= 1) partPenalty *= 1 + 0.12 * rigidity;
            if (stretch >= 1) partPenalty *= 1 - 0.12 * stretch;
            reasons.push(`${p.label}がタイト傾向（差 ${gap.toFixed(1)}cm, ${p.landmark}基準）`);
        } else if (gap > allow * 1.2) {
            const depth = gap - allow * 1.2;
            partPenalty = p.weight * 0.35 * (depth / Math.max(0.5, allow));
            reasons.push(`${p.label}がややルーズ（差 +${gap.toFixed(1)}cm）`);
        }

        if (p.key === "chest" && gap < 0 && stretch <= 0.5) {
            partPenalty += 12;
            reasons.push("胸郭厚み + 伸縮性低めで突っ張りやすい");
        }

        penalty += partPenalty;
    }

    const mobility = cfvValue(cfv, "mobility_upper", 1);
    const roundShoulder = cfvValue(cfv, "posture_round_shoulders", 1);
    const armhole = num(garment.pattern.armhole);

    if (armhole != null && armhole < 1 && mobility < 1) {
        penalty += 8;
        reasons.push("袖ぐり浅め × 可動性低めで肩周りが窮屈になりやすい");
    }

    if (roundShoulder > 1.2 && garment.intended_fit === "slim") {
        penalty += 6;
        reasons.push("巻き肩傾向 × タイト設計で背中の張りが出やすい");
    }

    if (rise != null) {
        const waistPos = cfvValue(cfv, "waist_position", 1);
        const riseGap = (num(garment.pattern.rise_cm) ?? rise) - rise;
        if (waistPos > 1.2 && riseGap < -1) {
            penalty += 6;
            reasons.push("ウエスト位置高めに対し股上が浅め");
        }
    }

    if (measuredParts === 0) {
        return {
            score: 50,
            confidence: 25,
            reasons: ["計測値が不足しているため推定値"],
            evidence,
        };
    }

    const raw = 100 - penalty;
    const score = clamp(raw, 0, 100);
    const overall = num(args.bodyProfile?.confidence?.overall) ?? 0;
    const conf = clamp(30 + measuredParts * 10 + overall * 20, 10, 95);

    evidence.push(`${LANDMARKS.shoulder}・${LANDMARKS.rise}などの骨ランドマークを参照`);

    return {
        score,
        confidence: Math.round(conf),
        reasons: reasons.slice(0, 4),
        evidence,
    };
}

function deltaE76(a: LabColor, b: LabColor) {
    const dL = a.L - b.L;
    const da = a.a - b.a;
    const db = a.b - b.b;
    return Math.sqrt(dL * dL + da * da + db * db);
}

function normalizeLab(x: any): LabColor | null {
    if (!x) return null;
    const L = num(x.L);
    const a = num(x.a);
    const b = num(x.b);
    if (L == null || a == null || b == null) return null;
    return { L, a, b };
}

export function calcColorScore(args: {
    colorProfile?: UserPersonalColorProfile | null;
    garment?: GarmentColorProfile | null;
}): ColorScoreResult {
    const reasons: string[] = [];
    const evidence: string[] = ["CIELAB/LCh色空間とΔE色差を利用"];

    const profile = args.colorProfile ?? null;
    const garment = args.garment ?? null;

    if (!garment || !Array.isArray(garment.dominant_colors) || garment.dominant_colors.length === 0) {
        return {
            score: 50,
            confidence: 20,
            reasons: ["色プロファイル未登録のため推定値"],
            evidence,
        };
    }

    const preferred = (profile?.palette?.preferred_lab_centroids ?? [])
        .map(normalizeLab)
        .filter(Boolean) as LabColor[];
    const avoid = (profile?.palette?.avoid_lab_centroids ?? [])
        .map(normalizeLab)
        .filter(Boolean) as LabColor[];

    const cpv = profile?.cpv ?? {};
    if (preferred.length === 0) {
        const fallback = normalizeLab({
            L: cpv.value_L ?? 55,
            a: cpv.skin_redness_a ?? 8,
            b: cpv.skin_yellowness_b ?? 12,
        });
        if (fallback) preferred.push(fallback);
    }

    if (preferred.length === 0) {
        return {
            score: 50,
            confidence: 25,
            reasons: ["パレット情報が不足しているため推定値"],
            evidence,
        };
    }

    const colors = garment.dominant_colors;
    const weights = colors.map((c) => {
        const w = num(c.coverage);
        return w != null ? Math.max(0, Math.min(1, w)) : null;
    });
    const weightSum = weights.filter((w) => w != null).reduce((a, b) => a + (b ?? 0), 0);
    const defaultWeight = weightSum > 0 ? 0 : 1 / Math.max(1, colors.length);

    let totalScore = 0;
    let totalWeight = 0;
    let topDelta = 999;
    let topCoverage = 0;
    let topLch: string | null = null;

    colors.forEach((c, idx) => {
        const lab = normalizeLab(c.lab);
        if (!lab) return;
        const coverage = weights[idx] ?? defaultWeight;

        const d = preferred.reduce((min, p) => Math.min(min, deltaE76(lab, p)), 999);
        const s = clamp(100 - d * 2.2, 0, 100);
        totalScore += s * coverage;
        totalWeight += coverage;

        if (d < topDelta) {
            topDelta = d;
            topCoverage = coverage;
            if (c.lch && num(c.lch.L) != null && num(c.lch.C) != null && num(c.lch.h) != null) {
                topLch = `L=${Number(c.lch.L).toFixed(0)}, C=${Number(c.lch.C).toFixed(0)}, h=${Number(c.lch.h).toFixed(0)}`;
            }
        }

        for (const avoidLab of avoid) {
            const da = deltaE76(lab, avoidLab);
            if (da < 12) {
                totalScore -= (12 - da) * 1.8 * coverage;
            }
        }
    });

    const avgScore = totalWeight > 0 ? totalScore / totalWeight : 50;
    let score = clamp(avgScore, 0, 100);

    const contrast = num(cpv.contrast);
    if (contrast != null) {
        const strongContrast = contrast > 0.7;
        const weakContrast = contrast < 0.3;

        if (colors.length >= 2) {
            const labA = normalizeLab(colors[0].lab);
            const labB = normalizeLab(colors[1].lab);
            if (labA && labB) {
                const delta = deltaE76(labA, labB);
                if (strongContrast && delta < 20) score -= 5;
                if (weakContrast && delta > 40) score -= 5;
            }
        }
    }

    score = clamp(score, 0, 100);

    if (topDelta < 999) {
        reasons.push(`主色のΔE76=${topDelta.toFixed(1)}（coverage ${(topCoverage * 100).toFixed(0)}%）`);
        if (topLch) reasons.push(`LCh: ${topLch}`);
    }
    if (avoid.length > 0) {
        reasons.push("避けたい色域との距離も考慮");
    }

    const conf = clamp(35 + (profile?.cpv?.confidence ?? 0) * 60, 10, 95);

    return {
        score,
        confidence: Math.round(conf),
        reasons: reasons.slice(0, 3),
        evidence,
    };
}
