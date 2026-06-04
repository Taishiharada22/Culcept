/**
 * lib/plan/map/legState.ts — leg の時刻 focus 階層 (= done/previous/current/ahead)。
 * FH MapTab (claude/frosty-hellman) から忠実 port した純ロジック (距離推定なし・副作用なし)。
 * Slice 1 (API不要): readOnly(過去 leg=実績) と recall gate の土台。視覚復元は Tier 2。
 */

export type RouteLegState = "done" | "previous" | "current" | "ahead";

/** "HH:MM..." → 分 (0-)。不正は null。 */
export function parseStartTimeToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

/**
 * 焦点区間 (= 「次に動くべき leg」) を現在時刻から決定。
 *   - leg は pin[i] → pin[i+1] (index 0..pins.length-2)
 *   - 次の目的地 = startTime が現在時刻より後の最初の pin → その pin に到着する leg (= nextStop-1)
 *   - 開始前 (= 最初の pin も未来) → 最初の leg(0)
 *   - 全て過去 → 最後の leg (= 焦点ゼロにしない)
 *   - pin が 2 未満なら -1 (focus なし)
 */
export function resolveFocusLegIndex(
  pins: ReadonlyArray<{ anchor: { startTime: string } }>,
  nowMinutes: number,
): number {
  if (pins.length < 2) return -1;
  const nextStop = pins.findIndex((p) => {
    const t = parseStartTimeToMinutes(p.anchor.startTime);
    return t != null && t > nowMinutes;
  });
  if (nextStop > 0) return nextStop - 1;
  if (nextStop === 0) return 0;
  return pins.length - 2;
}

/** leg index → 状態 (current=今→次 を中心に、 前=previous/done、 後=ahead)。 */
export function resolveLegState(
  legIndex: number,
  focusLegIndex: number,
): RouteLegState {
  if (focusLegIndex < 0) return "ahead";
  if (legIndex === focusLegIndex) return "current";
  if (legIndex === focusLegIndex - 1) return "previous";
  if (legIndex < focusLegIndex - 1) return "done";
  return "ahead";
}
