import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Stage 4 L4-pre-3: CoAlter Presence executor startup wiring (server runtime).
    //
    // flag OFF + API key 未設定で全ゼロ動作 (production behavior 1 bit 不変):
    //   - createAnthropicLlmCallFromEnv() returns null when ANTHROPIC_API_KEY 未設定
    //     → setLlmCall を呼ばない (null injection で誤動作させない、speechBuilder の
    //     default static fallback 経路を維持)
    //   - wireSentryTelemetry() は sink injection のみ。実 send は telemetry.safeEmit
    //     経路で COALTER_PRESENCE_EXECUTOR flag を gate (flag OFF で送信ゼロ)
    //
    // L4-l flip 時に CEO ops が:
    //   - .env で ANTHROPIC_API_KEY + 3 flag を設定
    //   - Supabase migrations push + Realtime publication 登録
    //   - vercel deploy --prod
    // を実行することで本 startup wiring が production で有効化される (技術 commit ゼロ)。
    const [
      { setLlmCall },
      { createAnthropicLlmCallFromEnv },
      { wireSentryTelemetry },
    ] = await Promise.all([
      import("./lib/coalter/presence/speechBuilder"),
      import("./lib/coalter/presence/llmCall"),
      import("./lib/coalter/presence/sentryTelemetry"),
    ]);
    const llmFn = createAnthropicLlmCallFromEnv();
    if (llmFn) {
      // null 返却時は呼ばない (誤 injection 防止)
      setLlmCall(llmFn);
    }
    await wireSentryTelemetry();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
