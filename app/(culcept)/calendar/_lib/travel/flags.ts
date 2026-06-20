// app/(culcept)/calendar/_lib/travel/flags.ts
// 旅の1日詳細（Concierge Dashboard）の feature flag。
// Candidate Lens（lib/plan/candidateLens/candidateLensUi.ts）と同じ「dev ON / production hard block」方針。

/**
 * カレンダー日付クリック→「旅の詳細を見る」 entry を出すか。
 * UX-3（CEO 確定 2026-06-21）: faraday の NODE_ENV 方式（dev 常時 ON）は使わず、
 *   Battery/CoAlter と同じ **明示 ON の env flag・default OFF** に変更。本番表示は別 GO。
 *   client（CalendarTab）到達のため NEXT_PUBLIC_。env 未設定＝OFF＝既存挙動完全不変。
 */
export function isTravelDayDetailEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PLAN_TRAVEL_DAY_DETAIL_ENABLED === "true";
}

/**
 * 「地図を開く / 地図で見る」押下時に実 Google 地図を lazy 描画するか。
 * OFF / key 未設定 / 未 ready / 座標なし → 静的プレビューに fail-open（捏造しない・honesty）。
 * UX-3: 同様に env flag・default OFF（travel day detail に入った後の polish）。
 */
export function isTravelMapLiveEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PLAN_TRAVEL_MAP_LIVE_ENABLED === "true";
}
