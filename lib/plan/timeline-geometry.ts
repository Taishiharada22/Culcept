/**
 * timeline-geometry — /plan 予定追加 2カラム体験「左タイムライン」用の pure 時間↔座標写像。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md §4.4 / A-0-5
 *
 * 責務（pure・副作用なし）:
 *   - 俯瞰タイムライン（可視窓をシート高に圧縮）の時間↔Y 写像
 *   - 分の snap、HH:MM ↔ 分 の相互変換
 *
 * 範囲外（A-1 では触れない）:
 *   - React / DOM / framer-motion / 描画
 *   - ComposeDraft state（composeDraft.ts）/ 時間条件解決（composeTimeResolver.ts）
 *   - PlanClient / flag / DB / 既存モーダル
 */

export const MINUTES_PER_DAY = 1440;

/** 既定可視窓 = 6:00–24:00（A-0-5。早朝 0:00–6:00 は UI 側で控えめスクロール到達）。 */
export const DEFAULT_WINDOW_START_MIN = 6 * 60; // 360
export const DEFAULT_WINDOW_END_MIN = MINUTES_PER_DAY; // 1440

/**
 * 俯瞰ビューポート。可視時間窓 [startMin, endMin) を canvas 高 heightPx に圧縮する。
 * PX_PER_MIN は window 幅と heightPx から動的算出（A-0-5）。
 */
export interface TimelineViewport {
  /** 可視窓の開始（分・0–1440） */
  startMin: number;
  /** 可視窓の終了（分・startMin < endMin ≤ 1440） */
  endMin: number;
  /** canvas の高さ（px・> 0） */
  heightPx: number;
}

/** 可視窓の幅（分）。 */
export function windowMinutes(vp: TimelineViewport): number {
  return vp.endMin - vp.startMin;
}

/** px / 分。window 幅 ≤ 0 や heightPx ≤ 0 は 0 を返す（呼び出し側で除算ガード不要に）。 */
export function pxPerMin(vp: TimelineViewport): number {
  const span = windowMinutes(vp);
  if (span <= 0 || vp.heightPx <= 0) return 0;
  return vp.heightPx / span;
}

/** 分 → Y（px）。可視窓外も線形に外挿（canvas 側で clip 前提）。 */
export function minutesToY(min: number, vp: TimelineViewport): number {
  return (min - vp.startMin) * pxPerMin(vp);
}

/** Y（px）→ 分。pxPerMin=0 のときは窓開始を返す。 */
export function yToMinutes(y: number, vp: TimelineViewport): number {
  const ppm = pxPerMin(vp);
  if (ppm === 0) return vp.startMin;
  return vp.startMin + y / ppm;
}

/** 分を grid（既定 1 分）に snap。grid ≤ 0 は最近傍整数に丸め。 */
export function snapMinutes(min: number, grid = 1): number {
  if (grid <= 0) return Math.round(min);
  return Math.round(min / grid) * grid;
}

/** 値を [lo, hi] に clamp。 */
export function clampMin(min: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, min));
}

/**
 * 分（0–1440）→ "HH:MM"。範囲外は 1 日でラップして整形（pure・例外なし）。
 * 1440（24:00 ちょうど）は "24:00" を返す（俯瞰窓末端表示用）。
 */
export function formatMinutes(min: number): string {
  const rounded = Math.round(min);
  if (rounded === MINUTES_PER_DAY) return "24:00";
  const wrapped = ((rounded % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * "HH:MM"（24h）→ 分。不正形式は null。
 * "24:00" は 1440 を返す。秒（HH:MM:SS）は分まで採用。
 */
export function parseMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return null;
  const total = h * 60 + min;
  if (total > MINUTES_PER_DAY) return null;
  return total;
}
