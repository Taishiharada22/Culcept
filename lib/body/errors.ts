/* ─────────────────────────────────────────────
   構造化エラー型
   Body-Color / Avatar 機能共通
   ───────────────────────────────────────────── */

export type BodyColorErrorCode =
    | "UNAUTHORIZED"
    | "INVALID_INPUT"
    | "SESSION_EXPIRED"
    | "SESSION_NOT_FOUND"
    | "UPLOAD_FAILED"
    | "OPTIMIZATION_FAILED"
    | "SAVE_FAILED"
    | "VALIDATION_ERROR"
    | "FACE_NOT_DETECTED"
    | "MULTIPLE_FACES"
    | "CAMERA_DENIED"
    | "MEDIAPIPE_INIT_FAILED";

const USER_MESSAGES: Record<BodyColorErrorCode, string> = {
    UNAUTHORIZED: "ログインが必要です",
    INVALID_INPUT: "入力内容に問題があります",
    SESSION_EXPIRED: "セッションの有効期限が切れました。ページを再読み込みしてください",
    SESSION_NOT_FOUND: "セッションが見つかりません。もう一度やり直してください",
    UPLOAD_FAILED: "画像のアップロードに失敗しました。ネットワーク接続を確認してください",
    OPTIMIZATION_FAILED: "画像の最適化に失敗しました",
    SAVE_FAILED: "保存に失敗しました。もう一度お試しください",
    VALIDATION_ERROR: "入力値に問題があります。修正してください",
    FACE_NOT_DETECTED: "顔が検出できませんでした。明るい場所で正面を向いて撮影してください",
    MULTIPLE_FACES: "複数の顔が検出されました。一人で撮影してください",
    CAMERA_DENIED: "カメラのアクセスが拒否されました",
    MEDIAPIPE_INIT_FAILED: "AI検出の初期化に失敗しました",
};

const STATUS_CODES: Record<BodyColorErrorCode, number> = {
    UNAUTHORIZED: 401,
    INVALID_INPUT: 400,
    SESSION_EXPIRED: 410,
    SESSION_NOT_FOUND: 404,
    UPLOAD_FAILED: 502,
    OPTIMIZATION_FAILED: 500,
    SAVE_FAILED: 500,
    VALIDATION_ERROR: 400,
    FACE_NOT_DETECTED: 400,
    MULTIPLE_FACES: 400,
    CAMERA_DENIED: 403,
    MEDIAPIPE_INIT_FAILED: 500,
};

export class BodyColorError extends Error {
    readonly code: BodyColorErrorCode;
    readonly statusCode: number;
    readonly userMessage: string;

    constructor(code: BodyColorErrorCode, detail?: string) {
        const userMessage = USER_MESSAGES[code];
        super(detail ? `${userMessage}: ${detail}` : userMessage);
        this.name = "BodyColorError";
        this.code = code;
        this.statusCode = STATUS_CODES[code];
        this.userMessage = userMessage;
    }

    toJSON() {
        return {
            error: this.userMessage,
            code: this.code,
            detail: this.message !== this.userMessage ? this.message : undefined,
        };
    }

    toResponse() {
        return Response.json(this.toJSON(), { status: this.statusCode });
    }
}
