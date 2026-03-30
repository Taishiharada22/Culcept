/* ─────────────────────────────────────────────
   エラーコード → 回復手順マッピング（日本語）
   ───────────────────────────────────────────── */

import type { BodyColorErrorCode } from "./errors";

export interface RecoveryAction {
    title: string;
    description: string;
    actionLabel?: string;
    actionType?: "reload" | "retry" | "navigate" | "settings";
    actionUrl?: string;
}

const RECOVERY_MAP: Record<BodyColorErrorCode, RecoveryAction> = {
    UNAUTHORIZED: {
        title: "ログインが必要です",
        description: "この機能を使うにはログインしてください。",
        actionLabel: "ログインページへ",
        actionType: "navigate",
        actionUrl: "/login",
    },
    INVALID_INPUT: {
        title: "入力内容を確認してください",
        description: "入力された値に問題があります。各項目の値を確認してください。",
    },
    SESSION_EXPIRED: {
        title: "セッションが期限切れです",
        description: "撮影セッションの有効期限（20分）が切れました。",
        actionLabel: "ページを再読み込み",
        actionType: "reload",
    },
    SESSION_NOT_FOUND: {
        title: "セッションが見つかりません",
        description: "QRコードの有効期限が切れた可能性があります。新しいセッションを開始してください。",
        actionLabel: "やり直す",
        actionType: "reload",
    },
    UPLOAD_FAILED: {
        title: "アップロードに失敗しました",
        description: "ネットワーク接続を確認して、もう一度お試しください。Wi-Fi環境での撮影を推奨します。",
        actionLabel: "リトライ",
        actionType: "retry",
    },
    OPTIMIZATION_FAILED: {
        title: "画像の処理に失敗しました",
        description: "別の画像で再試行するか、画像のサイズを小さくしてお試しください。",
        actionLabel: "撮り直す",
        actionType: "retry",
    },
    SAVE_FAILED: {
        title: "保存に失敗しました",
        description: "サーバーとの通信に問題が発生しました。しばらく待ってからもう一度お試しください。",
        actionLabel: "リトライ",
        actionType: "retry",
    },
    VALIDATION_ERROR: {
        title: "入力値に問題があります",
        description: "ハイライトされている項目を修正してください。",
    },
    FACE_NOT_DETECTED: {
        title: "顔が検出できませんでした",
        description: "以下を確認してください：\n・明るい場所で撮影する\n・正面を向く\n・眼鏡を外す\n・前髪で顔を隠さない",
        actionLabel: "撮り直す",
        actionType: "retry",
    },
    MULTIPLE_FACES: {
        title: "複数の顔が検出されました",
        description: "一人で撮影してください。背景に他の人が映らないようにしてください。",
        actionLabel: "撮り直す",
        actionType: "retry",
    },
    CAMERA_DENIED: {
        title: "カメラへのアクセスが拒否されました",
        description: "ブラウザの設定からカメラのアクセスを許可してください。\n\n・Chrome: アドレスバーのカメラアイコン → 許可\n・Safari: 設定 → Webサイト → カメラ → 許可\n・Firefox: アドレスバーのロックアイコン → カメラ → 許可",
        actionLabel: "設定を確認",
        actionType: "settings",
    },
    MEDIAPIPE_INIT_FAILED: {
        title: "AI検出を初期化できませんでした",
        description: "お使いのブラウザでは AI 検出が利用できない可能性があります。Chrome または Safari の最新版をお試しください。",
        actionLabel: "ページを再読み込み",
        actionType: "reload",
    },
};

export function getRecoveryAction(code: BodyColorErrorCode): RecoveryAction {
    return RECOVERY_MAP[code] ?? {
        title: "エラーが発生しました",
        description: "ページを再読み込みしてもう一度お試しください。",
        actionLabel: "再読み込み",
        actionType: "reload",
    };
}
