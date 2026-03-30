/* ─────────────────────────────────────────────
   API 入力バリデーション
   Body-Color / Avatar 機能共通
   ───────────────────────────────────────────── */

import { BodyColorError } from "./errors";

/* ─── data URL 検証 ─── */

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|gif|bmp);base64,[A-Za-z0-9+/=]+$/;
const MAX_DATA_URL_LENGTH = 20 * 1024 * 1024; // 20MB

export function validateDataUrl(value: unknown, fieldName: string): string {
    if (typeof value !== "string" || !value) {
        throw new BodyColorError("INVALID_INPUT", `${fieldName} が指定されていません`);
    }
    if (value.length > MAX_DATA_URL_LENGTH) {
        throw new BodyColorError("INVALID_INPUT", `${fieldName} のサイズが上限（20MB）を超えています`);
    }
    if (!DATA_URL_RE.test(value.slice(0, 200))) {
        throw new BodyColorError("INVALID_INPUT", `${fieldName} のフォーマットが不正です`);
    }
    return value;
}

/* ─── キャプチャメソッド ─── */

const CAPTURE_METHODS = ["mobile_camera", "pc_camera", "upload"] as const;
type CaptureMethod = (typeof CAPTURE_METHODS)[number];

export function validateCaptureMethod(value: unknown): CaptureMethod {
    if (typeof value !== "string" || !CAPTURE_METHODS.includes(value as CaptureMethod)) {
        throw new BodyColorError("INVALID_INPUT", "captureMethod が不正です");
    }
    return value as CaptureMethod;
}

/* ─── 実顔提出リクエスト ─── */

export interface ValidatedRealFaceSubmitInput {
    captureMethod: CaptureMethod;
    normalizedImageData: string;
    originalImageData: string | null;
    captureSessionToken: string | null;
    fitCheckResult: unknown;
    brightnessCheckResult: unknown;
    poseCheckResult: unknown;
}

export function validateRealFaceSubmitInput(body: unknown): ValidatedRealFaceSubmitInput {
    if (!body || typeof body !== "object") {
        throw new BodyColorError("INVALID_INPUT", "リクエストボディが空です");
    }

    const b = body as Record<string, unknown>;

    return {
        captureMethod: validateCaptureMethod(b.captureMethod),
        normalizedImageData: validateDataUrl(b.normalizedImageData, "normalizedImageData"),
        originalImageData: typeof b.originalImageData === "string" && b.originalImageData
            ? validateDataUrl(b.originalImageData, "originalImageData")
            : null,
        captureSessionToken: typeof b.captureSessionToken === "string" ? b.captureSessionToken : null,
        fitCheckResult: b.fitCheckResult ?? null,
        brightnessCheckResult: b.brightnessCheckResult ?? null,
        poseCheckResult: b.poseCheckResult ?? null,
    };
}

/* ─── 計測値バリデーション（物理的範囲） ─── */

/** 各計測フィールドの物理的に可能な範囲（cm） */
const MEASUREMENT_ABSOLUTE_BOUNDS: Record<string, [number, number]> = {
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

export function validateMeasurementValue(
    key: string,
    value: number,
): { valid: boolean; message?: string } {
    const bounds = MEASUREMENT_ABSOLUTE_BOUNDS[key];
    if (!bounds) return { valid: true };

    const [min, max] = bounds;
    if (value < min || value > max) {
        return {
            valid: false,
            message: `${key} の値 ${value} は物理的範囲外です（${min}〜${max}cm）`,
        };
    }
    return { valid: true };
}
