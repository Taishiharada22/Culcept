// lib/stargazer/trackClient.ts
// Lightweight client-side Stargazer analytics tracker.
// Posts events to /api/stargazer/analytics via fire-and-forget fetch.
// Safe to call from any "use client" component — never throws.

type StargazerEvent =
  | "feature_view"
  | "feature_interact"
  | "prophecy_verify"
  | "alter_turn"
  | "whisper_shown"
  | "whisper_clicked"
  | "phase_advance"
  | "session_complete";

// ── Dedup guard: avoid duplicate feature_view within 2 seconds ──
const _recentViews = new Map<string, number>();
const DEDUP_MS = 2000;

function isDuplicateView(feature: string): boolean {
  const now = Date.now();
  const last = _recentViews.get(feature);
  if (last && now - last < DEDUP_MS) return true;
  _recentViews.set(feature, now);
  return false;
}

// ── Core send function ──

function send(
  event: StargazerEvent,
  feature?: string,
  metadata?: Record<string, unknown>,
): void {
  try {
    const body = JSON.stringify({
      event,
      feature: feature ?? null,
      metadata: metadata ?? {},
      timestamp: new Date().toISOString(),
    });

    // navigator.sendBeacon for minimal overhead + survives page unload
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const sent = navigator.sendBeacon("/api/stargazer/analytics", blob);
      if (sent) return;
    }

    // Fallback: fire-and-forget fetch
    fetch("/api/stargazer/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Silently ignore — analytics must never break UX
    });
  } catch {
    // Never throw from tracker
  }
}

// ── Public API ──

/**
 * ユーザーが機能ページを開いたときに呼ぶ。
 * 同一 feature に対して 2 秒以内の重複呼び出しは自動的に無視される。
 */
export function trackFeatureView(feature: string): void {
  if (isDuplicateView(feature)) return;
  send("feature_view", feature);
}

/**
 * ユーザーが機能内でアクションを実行したときに呼ぶ。
 * action は metadata.action として送信される。
 */
export function trackInteraction(
  feature: string,
  action: string,
  metadata?: Record<string, unknown>,
): void {
  send("feature_interact", feature, { action, ...metadata });
}

/**
 * 予言検証イベント。
 */
export function trackProphecyVerify(
  prophecyId: string,
  status: string,
  score: number,
): void {
  send("prophecy_verify", "prophecy", { prophecyId, status, score });
}

/**
 * Alter 対話ターン完了。
 */
export function trackAlterTurn(
  sessionId: string,
  mode: string,
  turnCount: number,
): void {
  send("alter_turn", "alter", { sessionId, mode, turnCount });
}

/**
 * Shadow Whisper が表示された。
 */
export function trackWhisperShown(): void {
  send("whisper_shown", "alter");
}

/**
 * Shadow Whisper の「話す？」がクリックされた。
 */
export function trackWhisperClicked(): void {
  send("whisper_clicked", "alter");
}

/**
 * 深度フェーズが進んだ。
 */
export function trackPhaseAdvance(
  fromPhase: string,
  toPhase: string,
): void {
  send("phase_advance", undefined, { fromPhase, toPhase });
}

/**
 * デイリー観測セッション完了。
 */
export function trackSessionComplete(
  questionCount: number,
  metadata?: Record<string, unknown>,
): void {
  send("session_complete", undefined, { questionCount, ...metadata });
}
