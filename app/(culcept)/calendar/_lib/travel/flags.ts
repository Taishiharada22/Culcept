// app/(culcept)/calendar/_lib/travel/flags.ts
// 旅の1日詳細（Concierge Dashboard）の feature flag。
// Candidate Lens（lib/plan/candidateLens/candidateLensUi.ts）と同じ「dev ON / production hard block」方針。

/** カレンダー日付クリック→「旅の詳細を見る」 entry を出すか。production は env gate で常時 OFF。 */
export const TRAVEL_DAY_DETAIL_ENABLED = true;
export function isTravelDayDetailEnabled(): boolean {
  return TRAVEL_DAY_DETAIL_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
}

/**
 * 「地図を開く / 地図で見る」押下時に実 Google 地図を lazy 描画するか。
 * OFF / key 未設定 / 未 ready / 座標なし → 静的プレビューに fail-open（捏造しない・honesty）。
 */
export const TRAVEL_MAP_LIVE_ENABLED = true;
export function isTravelMapLiveEnabled(): boolean {
  return TRAVEL_MAP_LIVE_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
}
