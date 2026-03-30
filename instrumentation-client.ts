import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // パフォーマンス監視: 本番は10%サンプリング、開発は100%
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Replay: エラー発生時のみセッションリプレイを記録
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,

  // 開発環境では無効化
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 不要なエラーをフィルタリング
  ignoreErrors: [
    // ブラウザ拡張由来のエラー
    "ResizeObserver loop",
    "Non-Error promise rejection captured",
    // Next.js のルーティングキャンセル
    "NEXT_REDIRECT",
    "NEXT_NOT_FOUND",
  ],
});

// ナビゲーション遷移のトレース
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
