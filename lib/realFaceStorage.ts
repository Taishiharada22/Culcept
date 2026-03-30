export type RealFaceCaptureMethod = "mobile_camera" | "pc_camera" | "upload";

export type RealFaceCheckStatus = "ok" | "unstable" | "ng";

export type RealFaceCheckResult = {
    status: RealFaceCheckStatus;
    score?: number;
    message: string;
};

export type RealFaceStoredMeta = {
    originalImage?: string | null;
    normalizedRealFace?: string | null;
    captureMethod?: RealFaceCaptureMethod | null;
    captureSessionToken?: string | null;
    fitCheckResult?: RealFaceCheckResult | null;
    brightnessCheckResult?: RealFaceCheckResult | null;
    poseCheckResult?: RealFaceCheckResult | null;
    isNormalized?: boolean;
    diagnosisResult?: Record<string, any> | null;
    answerLogs?: Record<string, any>[] | null;
    updatedAt?: string | null;
};

const REAL_FACE_KEYS = {
    originalImage: "__real_face_original_url",
    normalizedRealFace: "__real_face_normalized_url",
    captureMethod: "__real_face_capture_method",
    captureSessionToken: "__real_face_capture_session_token",
    fitCheckResult: "__real_face_fit_check_result",
    brightnessCheckResult: "__real_face_brightness_check_result",
    poseCheckResult: "__real_face_pose_check_result",
    isNormalized: "__real_face_is_normalized",
    diagnosisResult: "__real_face_diagnosis_result",
    answerLogs: "__real_face_answer_logs",
    updatedAt: "__real_face_updated_at",
} as const;

function parseJson<T>(value: string | undefined): T | null {
    if (!value) return null;
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function stringifyJson(value: unknown) {
    try {
        return JSON.stringify(value);
    } catch {
        return undefined;
    }
}

export function readRealFaceMeta(views?: Record<string, string> | null): RealFaceStoredMeta {
    const safeViews = views ?? {};

    return {
        originalImage: safeViews[REAL_FACE_KEYS.originalImage] ?? null,
        normalizedRealFace: safeViews[REAL_FACE_KEYS.normalizedRealFace] ?? null,
        captureMethod: (safeViews[REAL_FACE_KEYS.captureMethod] as RealFaceCaptureMethod | undefined) ?? null,
        captureSessionToken: safeViews[REAL_FACE_KEYS.captureSessionToken] ?? null,
        fitCheckResult: parseJson<RealFaceCheckResult>(safeViews[REAL_FACE_KEYS.fitCheckResult]),
        brightnessCheckResult: parseJson<RealFaceCheckResult>(safeViews[REAL_FACE_KEYS.brightnessCheckResult]),
        poseCheckResult: parseJson<RealFaceCheckResult>(safeViews[REAL_FACE_KEYS.poseCheckResult]),
        isNormalized: safeViews[REAL_FACE_KEYS.isNormalized] === "1",
        diagnosisResult: parseJson<Record<string, any>>(safeViews[REAL_FACE_KEYS.diagnosisResult]),
        answerLogs: parseJson<Record<string, any>[]>(safeViews[REAL_FACE_KEYS.answerLogs]),
        updatedAt: safeViews[REAL_FACE_KEYS.updatedAt] ?? null,
    };
}

export function mergeRealFaceMeta(
    views: Record<string, string> | null | undefined,
    patch: Partial<RealFaceStoredMeta>
) {
    const nextViews = { ...(views ?? {}) };

    if (patch.originalImage !== undefined) {
        if (patch.originalImage) nextViews[REAL_FACE_KEYS.originalImage] = patch.originalImage;
        else delete nextViews[REAL_FACE_KEYS.originalImage];
    }

    if (patch.normalizedRealFace !== undefined) {
        if (patch.normalizedRealFace) nextViews[REAL_FACE_KEYS.normalizedRealFace] = patch.normalizedRealFace;
        else delete nextViews[REAL_FACE_KEYS.normalizedRealFace];
    }

    if (patch.captureMethod !== undefined) {
        if (patch.captureMethod) nextViews[REAL_FACE_KEYS.captureMethod] = patch.captureMethod;
        else delete nextViews[REAL_FACE_KEYS.captureMethod];
    }

    if (patch.captureSessionToken !== undefined) {
        if (patch.captureSessionToken) nextViews[REAL_FACE_KEYS.captureSessionToken] = patch.captureSessionToken;
        else delete nextViews[REAL_FACE_KEYS.captureSessionToken];
    }

    if (patch.fitCheckResult !== undefined) {
        const serialized = patch.fitCheckResult ? stringifyJson(patch.fitCheckResult) : undefined;
        if (serialized) nextViews[REAL_FACE_KEYS.fitCheckResult] = serialized;
        else delete nextViews[REAL_FACE_KEYS.fitCheckResult];
    }

    if (patch.brightnessCheckResult !== undefined) {
        const serialized = patch.brightnessCheckResult ? stringifyJson(patch.brightnessCheckResult) : undefined;
        if (serialized) nextViews[REAL_FACE_KEYS.brightnessCheckResult] = serialized;
        else delete nextViews[REAL_FACE_KEYS.brightnessCheckResult];
    }

    if (patch.poseCheckResult !== undefined) {
        const serialized = patch.poseCheckResult ? stringifyJson(patch.poseCheckResult) : undefined;
        if (serialized) nextViews[REAL_FACE_KEYS.poseCheckResult] = serialized;
        else delete nextViews[REAL_FACE_KEYS.poseCheckResult];
    }

    if (patch.isNormalized !== undefined) {
        if (patch.isNormalized) nextViews[REAL_FACE_KEYS.isNormalized] = "1";
        else delete nextViews[REAL_FACE_KEYS.isNormalized];
    }

    if (patch.diagnosisResult !== undefined) {
        const serialized = patch.diagnosisResult ? stringifyJson(patch.diagnosisResult) : undefined;
        if (serialized) nextViews[REAL_FACE_KEYS.diagnosisResult] = serialized;
        else delete nextViews[REAL_FACE_KEYS.diagnosisResult];
    }

    if (patch.answerLogs !== undefined) {
        const serialized = patch.answerLogs ? stringifyJson(patch.answerLogs) : undefined;
        if (serialized) nextViews[REAL_FACE_KEYS.answerLogs] = serialized;
        else delete nextViews[REAL_FACE_KEYS.answerLogs];
    }

    if (patch.updatedAt !== undefined) {
        if (patch.updatedAt) nextViews[REAL_FACE_KEYS.updatedAt] = patch.updatedAt;
        else delete nextViews[REAL_FACE_KEYS.updatedAt];
    }

    return nextViews;
}

export function clearRealFaceMeta(views: Record<string, string> | null | undefined) {
    const nextViews = { ...(views ?? {}) };
    Object.values(REAL_FACE_KEYS).forEach((key) => {
        delete nextViews[key];
    });
    return nextViews;
}

export function getRealFaceStorageKeys() {
    return REAL_FACE_KEYS;
}
