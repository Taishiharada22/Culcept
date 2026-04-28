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

// Stage 4 L4-pre-3: CoAlter telemetry sink wiring (client runtime).
//
// client 側でも sink を Sentry に向けて injection 統一 (server / client breadcrumb
// 統合)。実 send は telemetry.safeEmit 経路で NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR
// flag を gate するため、flag OFF (既定) で全ゼロ動作 (production behavior 不変)。
//
// LLM call wrapper は server 専用 (Anthropic SDK は server runtime でのみ走らせる、
// API key 漏洩防止)。client 側は LLM 注入経路を持たず、本 file には Anthropic 関連
// import を入れない (Stage 4 L4-l 統合経路は API route 経由で server 側 LLM へ委譲)。
import { wireSentryTelemetry } from "@/lib/coalter/presence/sentryTelemetry";
void wireSentryTelemetry();
