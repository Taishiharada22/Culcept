/**
 * composeTimeResolver — 予定追加 2カラム体験の「時間条件 → 配置時刻」解決（pure）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md §4.3 / A-0-1 / A-0-6
 *
 * 4 ケース（未定 / 開始のみ / 終了のみ / 開始＋終了）の配置時刻を解決する。
 * 確定事項:
 *   - 既定ブロック長 60 分は「未定 / 開始のみ / 終了のみ」の仮長にのみ使う（A-0-6 #3）。
 *   - 開始＋終了は end − start を正とし、60 分で上書きしない（A-0-6 #4 / CEO 条件4）。
 *   - end_time は DB round-trip 永続（A-0-1）。ただし「未定 / 開始のみ」は end=null（未保存）。
 *   - Phase A は日跨ぎ（next-day wrap）を複雑化しない。crossesMidnight で flag し、
 *     UI が警告 / legacy 退避する（CEO 条件3）。
 *
 * 範囲外（A-1）: React / DOM、保存変換（A-4）、PlanClient、flag。
 */

import { MINUTES_PER_DAY } from "@/lib/plan/timeline-geometry";

export type TimeConstraintMode = "none" | "start" | "end" | "both";

export interface ComposeTimeConstraint {
  mode: TimeConstraintMode;
  /** mode = "start" | "both" で参照（分・0–1439） */
  startMin?: number;
  /** mode = "end" | "both" で参照（分・0–1439） */
  endMin?: number;
}

/** 未定 / 開始のみ / 終了のみ の仮ブロック長（保存値ではない・A-0-6 #3）。 */
export const DEFAULT_BLOCK_MIN = 60;

export interface ResolvedPlacement {
  /** 保存・描画の開始（分・0–1439） */
  startMin: number;
  /** 保存される終了（分）。null = 未保存（開いた長さ）=「未定 / 開始のみ」 */
  endMin: number | null;
  /** Phase A で警告 / 退避すべき日跨ぎ・退化（end ≤ start 等） */
  crossesMidnight: boolean;
  /** 端で clamp した（例: 終了のみ で end < 既定長 → start=0） */
  edgeClamped: boolean;
}

export interface ResolveOptions {
  /** 「未定」など配置位置が起点になるケースの drop 開始（分・snap 済）。 */
  dropStartMin?: number;
  defaultBlockMin?: number;
}

/**
 * 時間条件と配置位置から、保存・描画に使う start/end を解決する。
 */
export function resolvePlacement(
  time: ComposeTimeConstraint,
  opts: ResolveOptions = {},
): ResolvedPlacement {
  const block = opts.defaultBlockMin ?? DEFAULT_BLOCK_MIN;

  switch (time.mode) {
    case "none": {
      // 配置位置（drop）が開始。end は未保存（仮長は visualBlock で別途算出）。
      const startMin = clampDay(opts.dropStartMin ?? 0);
      return { startMin, endMin: null, crossesMidnight: false, edgeClamped: false };
    }
    case "start": {
      // 開始入力が上端。end は未保存。
      const startMin = clampDay(time.startMin ?? opts.dropStartMin ?? 0);
      return { startMin, endMin: null, crossesMidnight: false, edgeClamped: false };
    }
    case "end": {
      // 終了入力が下端。start = end − 既定長。負なら 0 に clamp（edgeClamped）。
      const endMin = clampDay(time.endMin ?? 0);
      let startMin = endMin - block;
      let edgeClamped = false;
      if (startMin < 0) {
        startMin = 0;
        edgeClamped = true;
      }
      // end ≤ start（end=0 等の退化）は Phase A で退避。
      const crossesMidnight = endMin <= startMin;
      return { startMin, endMin, crossesMidnight, edgeClamped };
    }
    case "both": {
      // 入力 start/end をそのまま採用。end−start を正とし 60 で上書きしない。
      const startMin = clampDay(time.startMin ?? 0);
      const endMin = clampDay(time.endMin ?? 0);
      // end ≤ start = 日跨ぎ or 退化 → Phase A 退避（CEO 条件3）。
      const crossesMidnight = endMin <= startMin;
      return { startMin, endMin, crossesMidnight, edgeClamped: false };
    }
  }
}

/**
 * 描画用ブロック [startMin, endMin]。endMin=null（未定 / 開始のみ）は既定長で仮描画する。
 * これは保存値ではない（A-0-6 #3）。
 */
export function visualBlock(
  resolved: ResolvedPlacement,
  defaultBlockMin = DEFAULT_BLOCK_MIN,
): { startMin: number; endMin: number } {
  const endMin =
    resolved.endMin ??
    Math.min(resolved.startMin + defaultBlockMin, MINUTES_PER_DAY);
  return { startMin: resolved.startMin, endMin };
}

/** 分を当日 [0, 1439] に丸め clamp（保存可能な TIME 範囲）。 */
function clampDay(min: number): number {
  return Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(min)));
}
