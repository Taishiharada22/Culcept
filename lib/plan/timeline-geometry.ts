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

/**
 * 局所 Y（canvas 上端基準・px）→ snap 済みの分。
 * drop 位置 → 配置開始分の算出に使う pure 合成（A-3 のドラッグ配置で利用）。
 */
export function snappedMinAtY(localY: number, vp: TimelineViewport, grid = 1): number {
  return snapMinutes(yToMinutes(localY, vp), grid);
}

/** 重なりブロックの横分割（lane）スロット。lane=列 index、lanes=その重なり群の列数。 */
export interface LaneSlot {
  lane: number;
  lanes: number;
}

/**
 * 同時刻に重なるブロックを横方向の lane（列）へ貪欲割当てする（pure・表示専用・UI-5）。
 *
 *   - 重ならない（touching = end==start 含む）ブロックは独立群 → lanes=1（全幅）。
 *   - 重なる群は最大同時数を lanes とし、各ブロックに lane index を与える。
 *   - **X 方向のみ**。drop 計算（Y→分）には一切干渉しない。
 */
export function layoutLanes(
  items: ReadonlyArray<{ id: string; startMin: number; endMin: number }>,
): Map<string, LaneSlot> {
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin,
  );
  const out = new Map<string, LaneSlot>();
  let group: Array<{ id: string; lane: number }> = [];
  let groupMaxEnd = -Infinity;
  const laneEnds: number[] = [];

  const flush = () => {
    const lanes = group.reduce((m, g) => Math.max(m, g.lane + 1), 1);
    for (const g of group) out.set(g.id, { lane: g.lane, lanes });
    group = [];
  };

  for (const it of sorted) {
    if (group.length && it.startMin >= groupMaxEnd) {
      flush();
      laneEnds.length = 0;
      groupMaxEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((e) => e <= it.startMin);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = it.endMin;
    group.push({ id: it.id, lane });
    groupMaxEnd = Math.max(groupMaxEnd, it.endMin);
  }
  if (group.length) flush();
  return out;
}

/** 値を [lo, hi] に clamp。 */
export function clampMin(min: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, min));
}

/**
 * 適応窓の開始分（CEO 2026-06-03・6時以前対応）。
 *   - 既定(6:00)より早い予定がある日は、最早予定の**時(hour floor)**まで窓を下げる＝クリップしない。
 *   - 早朝予定が無ければ既定のまま（共通ケースは安定＝6-24）。
 *   - end は不変（24:00）。**呼び出し側はこの1値を drop と render の両方に流す＝単一ソース**。
 * pure・副作用なし。drop 計算と描画が同じ window を使うことが安全の核。
 */
export function computeWindowStart(
  starts: ReadonlyArray<number>,
  defaultStart: number,
): number {
  let min = defaultStart;
  for (const s of starts) {
    if (Number.isFinite(s) && s < min) min = s;
  }
  if (min >= defaultStart) return defaultStart;
  return Math.max(0, Math.floor(min / 60) * 60);
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
