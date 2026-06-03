/**
 * Brush Stroke Interpolation (C1L-4c-a) — pure
 *
 * 消しゴム/ブラシのドラッグが「点々」になるバグ修正用。
 * pointermove で前回座標→今回座標を線分補間し、 ブラシ半径に応じた密度で連続点を生成する。
 * canvas 非依存の純関数（Node でテスト可能）。
 */

export interface StrokePoint {
  x: number;
  y: number;
}

/** 補間ステップ係数（ブラシ半径 × これ）。 小さいほど密＝隙間が出にくい。 */
const STEP_FACTOR = 0.35;

/**
 * `from`（直前に塗った点）から `to`（今回点）までを、 ブラシ半径に応じた間隔で補間した点列を返す。
 * 返すのは `from` の **次** から `to`（含む）まで（`from` は呼び出し側で既に塗っている前提）。
 * from===to（タップ）なら `[to]` を返す。
 */
export function interpolateStrokePoints(from: StrokePoint, to: StrokePoint, brushRadius: number): StrokePoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const step = Math.max(1, brushRadius * STEP_FACTOR);
  if (dist <= step) return [{ x: to.x, y: to.y }];
  const count = Math.max(1, Math.ceil(dist / step));
  const points: StrokePoint[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    points.push({ x: from.x + dx * t, y: from.y + dy * t });
  }
  return points;
}
