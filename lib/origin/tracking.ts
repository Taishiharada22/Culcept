// lib/origin/tracking.ts
// Origin イベント計測 — クライアントサイドから fire-and-forget で送信

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type OriginEvent =
  | "origin_entry_recorded"      // エントリー記録完了
  | "origin_entry_updated"       // 同日エントリー更新
  | "origin_sync_completed"      // サーバー同期完了
  | "origin_sync_conflict"       // マージ競合発生（サーバー側が採用された）
  | "origin_hypothesis_created"  // 仮説を記録
  | "origin_hypothesis_evaluated" // 仮説の自動検証実行
  | "origin_verification_confirmed" // ユーザーが検証結果を確定
  | "origin_inquiry_shown"       // 問いかけカードが表示された
  | "origin_inquiry_dismissed"   // 問いかけをスキップ
  | "origin_evidence_card_shown" // 証拠カードが表示された
  | "origin_observation_accepted" // 観測提案を受諾
  | "origin_blind_spot_shown"    // 盲点提案が表示された
  | "origin_layer_toggled"       // 折りたたみ層の展開/折りたたみ
  | "origin_page_view";          // Origin ページを開いた

// ---------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------

/**
 * Origin イベントを送信する。
 * 認証が必要。未ログイン時は無視。
 * fire-and-forget: 結果を待たない。
 */
export function trackOriginEvent(
  event: OriginEvent,
  metadata?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;

  fetch("/api/origin/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, metadata }),
  }).catch(() => {
    // オフライン or 未認証 → 無視
  });
}
