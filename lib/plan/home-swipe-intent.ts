/**
 * Home Swipe Intent Calculator — pure 関数
 *
 * HomeSwipeContainer の drag gesture 判定を、React / framer-motion の
 * 副作用と切り離して pure に判定する。同入力 → 同出力。
 *
 * 設計書: docs/alter-plan-home-integration-mini-design.md §4.3 (B2)
 *
 * 不変原則:
 *   - 完全 pure (state なし、I/O なし、time-dependent なし)
 *   - threshold / velocity / edge-back は default 値持つ、test で injection 可能
 *   - 返り値は 4 種 discriminated union (intent を表現、index 計算は applySwipeAction)
 *
 * CEO 補正 2026-05-19 必須補正 2 (Gesture 競合対策) を機械的に実装する核：
 *   - threshold (画面幅 30%)
 *   - velocity (500 px/s)
 *   - direction lock (X 軸 drag のみ、Y 軸は HomeSwipeContainer 側 dragDirectionLock)
 *   - iOS edge back ignore (画面左端 20px 内の右 swipe は browser back に任せる)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Swipe 判定結果。
 *
 * - advance: 次 pane へ (左 swipe = offset 負方向)
 * - retreat: 前 pane へ (右 swipe = offset 正方向)
 * - stay   : 元 pane に留まる (threshold / velocity 不足、spring で戻す)
 * - ignore : 判定保留 (iOS edge back gesture 等、browser に任せる)
 */
export type SwipeAction =
  | { kind: "advance" }
  | { kind: "retreat" }
  | { kind: "stay" }
  | { kind: "ignore" };

export interface SwipeIntentInput {
  /** drag 終了時の X 軸 offset (px、左方向 = 負) */
  offsetX: number;
  /** drag 終了時の X 軸 velocity (px/s、左方向 = 負) */
  velocityX: number;
  /** container 幅 (px、0 以下は stay) */
  containerWidth: number;
  /** drag 開始時の screen X (px、edge back ignore 判定に使う) */
  dragStartX: number;
  /** threshold (画面幅に対する比率、default 0.30 = 30%) */
  thresholdFrac?: number;
  /** velocity threshold (px/s、default 500) */
  velocityThreshold?: number;
  /** edge back ignore 範囲 (画面左端 px、default 20) */
  edgeBackIgnorePx?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Drag gesture から SwipeAction を判定する。
 *
 * 判定順 (fail-closed):
 *   1. containerWidth <= 0 → stay (測定前は何もしない)
 *   2. iOS edge back gesture suspect → ignore (左端 20px 内 + 右方向 drag)
 *   3. 左 swipe threshold / velocity 達成 → advance
 *   4. 右 swipe threshold / velocity 達成 → retreat
 *   5. それ以外 → stay
 */
export function evaluateSwipeIntent(input: SwipeIntentInput): SwipeAction {
  const {
    offsetX,
    velocityX,
    containerWidth,
    dragStartX,
    thresholdFrac = 0.3,
    velocityThreshold = 500,
    edgeBackIgnorePx = 20,
  } = input;

  // (1) 計測前 / 異常 width
  if (containerWidth <= 0) return { kind: "stay" };

  // (2) iOS Safari edge back gesture: 左端 20px 内から右方向 drag は ignore
  if (dragStartX < edgeBackIgnorePx && offsetX > 0) {
    return { kind: "ignore" };
  }

  const offsetFrac = offsetX / containerWidth;

  // (3) 左 swipe (advance)
  if (offsetFrac < -thresholdFrac || velocityX < -velocityThreshold) {
    return { kind: "advance" };
  }

  // (4) 右 swipe (retreat)
  if (offsetFrac > thresholdFrac || velocityX > velocityThreshold) {
    return { kind: "retreat" };
  }

  // (5) threshold 不足
  return { kind: "stay" };
}

/**
 * 現 pane index と SwipeAction から、次 pane index を返す pure 関数。
 *
 * - advance: index + 1 (上限 paneCount - 1 で clamp)
 * - retreat: index - 1 (下限 0 で clamp)
 * - stay / ignore: index 不変
 */
export function applySwipeAction(
  currentIndex: number,
  paneCount: number,
  action: SwipeAction
): number {
  switch (action.kind) {
    case "advance":
      return Math.min(paneCount - 1, currentIndex + 1);
    case "retreat":
      return Math.max(0, currentIndex - 1);
    case "stay":
    case "ignore":
      return currentIndex;
  }
}
