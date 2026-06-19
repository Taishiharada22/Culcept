/**
 * prepTimeModel — RO-2 D2（2026-06-20）: 準備時間の heuristic 推定（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro2-mobility-control-tower-design.md（RO-2 D2・v0.2）/ RJ0 §4（rj0.md:60-65）
 * 思想: prepTime は **heuristic・confidence ≤0.35・debugOnly/notActionable**。wakeAt/prepareAt 派生入力にのみ供給し、
 *   recommended/hard 生成・hard line・強い文言には**絶対に流さない**（型組成で構造保証）。
 *
 * 算出（RJ0 §4 逐語）: prepTimeMin = base(外出×時間帯) + sleepShort(+10) + rain(+5) + 対人/formal(+5) + B1(v0=0)
 * 不変条件: heuristicAttribute が confidence を 0.35 に clamp・status='heuristic'・displayPolicy∈{debugOnly,notActionable}。
 *   IO / RNG / now / Date / DB / write を持たない。
 */
import { heuristicAttribute, type RealityAttribute } from "./realityAttribute";
import type { TimeBucket } from "@/lib/plan/dayGraph/dayGraphTypes";

export const PREP_TIME_MODEL_VERSION = 0;

export interface PrepTimeInputV0 {
  /** 外出を伴うか（移動前提の準備か）。在宅作業は短い。 */
  readonly isOutgoing: boolean;
  readonly timeBand: TimeBucket;
  readonly sleepShort: boolean;
  readonly rain: boolean;
  /** 対人 / フォーマルな予定（身支度が伸びる）。 */
  readonly interpersonalOrFormal: boolean;
  /** B1 個人補正（分）。v0 は 0。 */
  readonly personalAdjustMin?: number;
}

const MORNINGISH: ReadonlyArray<TimeBucket> = ["early_morning", "morning"];

/**
 * computePrepTimeV0 — pure heuristic。返り値は status='heuristic'・confidence≤0.35・debugOnly（型で保証）。
 */
export function computePrepTimeV0(input: PrepTimeInputV0): RealityAttribute<number> {
  const evidence: string[] = [];
  let base: number;
  if (input.isOutgoing) {
    base = MORNINGISH.includes(input.timeBand) ? 40 : 30; // 朝外出 30-45 の中庸
    evidence.push("outgoing", MORNINGISH.includes(input.timeBand) ? "morning_band" : "non_morning_band");
  } else {
    base = 12; // 在宅 10-15
    evidence.push("home");
  }
  let total = base;
  if (input.sleepShort) {
    total += 10;
    evidence.push("sleep_short");
  }
  if (input.rain) {
    total += 5;
    evidence.push("rain");
  }
  if (input.interpersonalOrFormal) {
    total += 5;
    evidence.push("interpersonal_or_formal");
  }
  const adj = input.personalAdjustMin ?? 0;
  if (adj !== 0) {
    total += adj;
    evidence.push("personal_adjust");
  }
  if (total < 0) total = 0; // 負にしない

  // confidence は heuristic 上限以下（heuristicAttribute が 0.35 に clamp・本値は低めに固定）
  return heuristicAttribute<number>(total, 0.3, evidence, { displayPolicy: "debugOnly" });
}
