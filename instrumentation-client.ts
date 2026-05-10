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

  // L4-i Phase 2 Stage 2.1 (CEO 確定 2026-05-03): Sentry breadcrumb buffer 拡張。
  //
  // talk page は 5 秒毎に POST /read + GET /messages の polling を実施するため
  // (~24 fetch/min)、default の 100 buffer は ~4 分で overflow し、
  // coalter.pattern.used / coalter.urgent.triggered / coalter.presence.state_transition
  // 等の観測対象 breadcrumb が 100 件先頭から押し出されて消失する事案が発生。
  //
  // 500 に拡張することで polling chatter があっても約 12 分相当の events を保持。
  // Stage 2.1 / 2.2 の 5-call / 20-call / 100-call observation で coalter.* を取り
  // こぼさず Sentry 集計可能にする。
  //
  // 挙動変更ではなく **observability tooling 改善**。本 file は instrumentation 層、
  // Production behavior 不変原則に影響しない。
  maxBreadcrumbs: 500,

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
