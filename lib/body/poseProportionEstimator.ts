/* ─────────────────────────────────────────────
   MediaPipe Pose → 体型プロポーション推定
   33点ランドマークから肩幅・腕長・脚長等を推定
   ───────────────────────────────────────────── */
"use client";

import { POSE, type PoseLandmark } from "./mediapipePoseLandmarks";

export interface ProportionEstimate {
    /** 推定値 (cm) */
    value: number;
    /** 信頼度 (0-1) */
    confidence: number;
}

export interface PoseProportionResult {
    /** 推定できたフィールドの Map */
    estimates: Record<string, ProportionEstimate>;
    /** 推定できなかったフィールドの理由 */
    skipped: Record<string, string>;
    /** 全体の推定品質 (0-1) */
    overallQuality: number;
}

/* ─── ヘルパー ─── */

function dist2D(a: PoseLandmark, b: PoseLandmark): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function dist3D(a: PoseLandmark, b: PoseLandmark): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function avgVisibility(...points: PoseLandmark[]): number {
    if (points.length === 0) return 0;
    return points.reduce((s, p) => s + (p.visibility ?? 0), 0) / points.length;
}

const MIN_VISIBILITY = 0.6;

/**
 * Poseランドマーク（正規化座標）+ 実身長から体型プロポーションを推定
 *
 * @param landmarks - 33点の正規化座標ランドマーク
 * @param heightCm - ユーザーの実身長（cm）。スケーリングの基準
 */
export function estimateProportionsFromPose(
    landmarks: PoseLandmark[],
    heightCm: number,
): PoseProportionResult {
    if (landmarks.length < 33 || heightCm < 100) {
        return { estimates: {}, skipped: {}, overallQuality: 0 };
    }

    const lShoulder = landmarks[POSE.LEFT_SHOULDER];
    const rShoulder = landmarks[POSE.RIGHT_SHOULDER];
    const lElbow = landmarks[POSE.LEFT_ELBOW];
    const rElbow = landmarks[POSE.RIGHT_ELBOW];
    const lWrist = landmarks[POSE.LEFT_WRIST];
    const rWrist = landmarks[POSE.RIGHT_WRIST];
    const lHip = landmarks[POSE.LEFT_HIP];
    const rHip = landmarks[POSE.RIGHT_HIP];
    const lKnee = landmarks[POSE.LEFT_KNEE];
    const rKnee = landmarks[POSE.RIGHT_KNEE];
    const lAnkle = landmarks[POSE.LEFT_ANKLE];
    const rAnkle = landmarks[POSE.RIGHT_ANKLE];
    const nose = landmarks[POSE.NOSE];

    // 画像上の全身高さ（ノーズ→足首の平均）を基準にスケール
    const bodyPixelHeight =
        (dist2D(nose, lAnkle) + dist2D(nose, rAnkle)) / 2;

    if (bodyPixelHeight < 0.1) {
        return { estimates: {}, skipped: { all: "全身が検出できませんでした" }, overallQuality: 0 };
    }

    // 全身高さ ≒ 身長 × 0.95（頭頂はノーズより上のため）
    const pixelPerCm = bodyPixelHeight / (heightCm * 0.95);

    const estimates: Record<string, ProportionEstimate> = {};
    const skipped: Record<string, string> = {};
    let qualitySum = 0;
    let qualityCount = 0;

    const tryEstimate = (
        key: string,
        calcFn: () => { pixelDist: number; conf: number },
        label: string,
    ) => {
        try {
            const { pixelDist, conf } = calcFn();
            if (conf < MIN_VISIBILITY) {
                skipped[key] = `${label}: ランドマークの検出精度が低い`;
                return;
            }
            const cm = pixelDist / pixelPerCm;
            estimates[key] = { value: Math.round(cm * 10) / 10, confidence: conf };
            qualitySum += conf;
            qualityCount++;
        } catch {
            skipped[key] = `${label}: 推定失敗`;
        }
    };

    // 肩幅
    tryEstimate("shoulder_breadth", () => ({
        pixelDist: dist2D(lShoulder, rShoulder),
        conf: avgVisibility(lShoulder, rShoulder),
    }), "肩幅");

    // 袖丈（肩→手首）
    tryEstimate("sleeve_length", () => {
        const left = dist2D(lShoulder, lElbow) + dist2D(lElbow, lWrist);
        const right = dist2D(rShoulder, rElbow) + dist2D(rElbow, rWrist);
        return {
            pixelDist: (left + right) / 2,
            conf: avgVisibility(lShoulder, lElbow, lWrist, rShoulder, rElbow, rWrist),
        };
    }, "袖丈");

    // 股下（ヒップ→足首）
    tryEstimate("inseam", () => {
        const left = dist2D(lHip, lKnee) + dist2D(lKnee, lAnkle);
        const right = dist2D(rHip, rKnee) + dist2D(rKnee, rAnkle);
        return {
            pixelDist: (left + right) / 2,
            conf: avgVisibility(lHip, lKnee, lAnkle, rHip, rKnee, rAnkle),
        };
    }, "股下");

    // 股上（ヒップ中点→肩中点の距離のうち下半分）
    tryEstimate("rise", () => {
        const hipMidY = (lHip.y + rHip.y) / 2;
        const shoulderMidY = (lShoulder.y + rShoulder.y) / 2;
        const torsoHeight = Math.abs(hipMidY - shoulderMidY);
        return {
            pixelDist: torsoHeight * 0.35, // 股上 ≒ 体幹長の約35%
            conf: avgVisibility(lHip, rHip, lShoulder, rShoulder),
        };
    }, "股上");

    // 背丈（肩→ヒップ）
    tryEstimate("back_length", () => {
        const left = dist2D(lShoulder, lHip);
        const right = dist2D(rShoulder, rHip);
        return {
            pixelDist: (left + right) / 2,
            conf: avgVisibility(lShoulder, rShoulder, lHip, rHip),
        };
    }, "背丈");

    // 推定できないフィールド（周囲径）の説明
    const circumferenceFields = [
        "neck_circ", "chest_circ", "waist_circ", "hip_circ",
        "thigh_circ", "calf_circ", "armhole_depth", "torso_depth",
    ];
    for (const key of circumferenceFields) {
        skipped[key] = "周囲径はカメラからは推定できません。メジャーで計測してください";
    }

    return {
        estimates,
        skipped,
        overallQuality: qualityCount > 0 ? qualitySum / qualityCount : 0,
    };
}
