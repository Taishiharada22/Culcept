/**
 * Reality Control OS — R4-4 Trigger Gating / Silence-by-default（**pure**・barrel 非 export）
 *
 * 設計: docs/r4-trigger-asset-audit-and-boundary.md（R4-0）/ trigger-model.ts（R4-1）
 *
 * 役割: 発火候補から **実際に surface するもの**を決める。**沈黙をデフォルト**（fireScore 閾値未満は出さない）・
 *   **同時 surface 数を cap**（notification fatigue 回避）・優先度順（preflight 最優先）。
 *
 * 厳守: silence-by-default・cap・配送しない（surface 集合を返すだけ）・pure。
 */

import { TRIGGER_PRIORITY } from "./trigger-model";
import type { FiredTrigger } from "./trigger-evaluator";

/** 沈黙デフォルトの閾値（これ未満は出さない）。 */
export const FIRE_THRESHOLD = 0.5;
/** 同時に surface する最大数（fatigue 回避）。 */
export const MAX_CONCURRENT = 1;

export interface TriggerSurface {
  /** 実際に出すもの（優先度順・cap 済み）。 */
  readonly surfaced: readonly FiredTrigger[];
  /** 沈黙した候補数（閾値未満 + cap 超過）。 */
  readonly silencedCount: number;
}

/**
 * R4-4: 発火候補を gate。閾値以上のみ・優先度順・MAX_CONCURRENT で cap・残りは silence。
 */
export function gateTriggers(
  fired: readonly FiredTrigger[],
  opts: { threshold?: number; maxConcurrent?: number } = {},
): TriggerSurface {
  const threshold = opts.threshold ?? FIRE_THRESHOLD;
  const maxConcurrent = opts.maxConcurrent ?? MAX_CONCURRENT;

  const eligible = [...fired]
    .filter((f) => f.fireScore >= threshold)
    .sort((a, b) => TRIGGER_PRIORITY[b.kind] - TRIGGER_PRIORITY[a.kind] || b.fireScore - a.fireScore);

  const surfaced = eligible.slice(0, Math.max(0, maxConcurrent));
  return { surfaced, silencedCount: fired.length - surfaced.length };
}
