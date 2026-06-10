/**
 * 横 R2 — Life Ops 5 層 cap（**pure helper・未配線**・barrel 非 export）
 *
 * 設計: docs/life-ops-readiness-hardening-a4-c6-mini-design.md（§3）/ calibration §4 gate
 *
 * 役割: 実データで候補が膨らんでも処理量・表示量・overflow が爆発しないための **5 層 cap** の定数と pure helper。
 *   **本 slice では配線しない**（実データ read-only slice で reader 直後に配線＝必須 gate）。fixture/preview は cap 未満。
 *
 * 5 層: ①raw input（本 file）②candidate pool（本 file）③tier fitting（定数のみ・pool cap が上流で bound するため配線判断は実データ slice）
 *   ④representative display（briefing/moment の既存 ≤3）⑤overflow summary（定数のみ・VM は既に count 縮約）。
 *
 * pool cap の不変条件（A-4-c4 の教訓の pool 層再保証）:
 *   - **deadline 不滅**: deadline kind は cap を超えても必ず保持（カテゴリ数で自然 bound）。
 *   - **lane 多様性 floor**: easy/push lane に最低 2 枠（存在すれば）→ urgency 上位が期限/準備で埋まっても push が死なない。
 *   - dropped は **count で返す**（黙って捨てない）。pool cap（判断材料）≠ presentation cap（見せる量）。
 */

import type { LifeOpsCandidate } from "../../../lifeops/candidate-types";
import type { LifeOpsInputs } from "../../../lifeops/candidate-collector";
import { lifeOpsLaneOf, lifeOpsUrgencyRank, type LifeOpsPlanLane } from "./lifeops-placement";

/** ① collector 入力の各観測配列の上限（実 reader の limit と併用・防御線）。 */
export const RAW_INPUT_CAP = 50;
/** ② collector 出力 → placement 入力の候補 pool 上限（判断材料の上限）。 */
export const CANDIDATE_POOL_CAP = 12;
/** ③ compose per-tier fitting の体験上限（**定数のみ・配線は実データ slice で判断**。pool≤12 が上流 bound）。 */
export const TIER_FITTING_CAP = 5;
/** ⑤ compose overflow 配列の保持上限（**定数のみ・配線は実データ slice**。VM line は count 縮約済み）。 */
export const OVERFLOW_RETAINED_CAP = 5;
/** pool cap の lane 多様性 floor（easy/push それぞれ・存在すれば）。 */
export const POOL_LANE_FLOOR = 2;

/** ① raw input cap（各観測配列を先頭 RAW_INPUT_CAP 件に・**入力は不変**）。 */
export function capRawLifeOpsInputs(inputs: LifeOpsInputs, cap: number = RAW_INPUT_CAP): { inputs: LifeOpsInputs; droppedCount: number } {
  const slice = <T>(xs: readonly T[] | undefined) => {
    const arr = xs ?? [];
    return { kept: arr.slice(0, cap), dropped: Math.max(0, arr.length - cap) };
  };
  const c = slice(inputs.cadenceObservations);
  const e = slice(inputs.upcomingEvents);
  const d = slice(inputs.deadlineObservations);
  return {
    inputs: { cadenceObservations: c.kept, upcomingEvents: e.kept, deadlineObservations: d.kept },
    droppedCount: c.dropped + e.dropped + d.dropped,
  };
}

export interface CappedCandidatePool {
  readonly pool: readonly LifeOpsCandidate[];
  /** cap で落とした数（黙って捨てない・「ほかにも◯件」素材）。 */
  readonly droppedCount: number;
}

/**
 * ② candidate pool cap（**deadline 不滅 + lane 多様性 floor + urgency 順**・入力は不変・deterministic）。
 *   1) deadline kind は全保持 2) easy/push に floor 枠を urgency 順で確保 3) 残り枠を urgency 順で充填。
 */
export function capLifeOpsCandidatePool(candidates: readonly LifeOpsCandidate[], cap: number = CANDIDATE_POOL_CAP): CappedCandidatePool {
  if (candidates.length <= cap) return { pool: candidates, droppedCount: 0 };

  const indexed = candidates.map((c, i) => ({ c, i, lane: lifeOpsLaneOf(c), rank: lifeOpsUrgencyRank(c) }));
  const byUrgency = [...indexed].sort((a, b) => a.rank - b.rank || a.i - b.i);

  const chosen = new Set<number>();
  // 1) deadline 不滅（cap を超えても保持）。
  for (const x of byUrgency) if (x.c.dueReason.kind === "deadline") chosen.add(x.i);
  // 2) lane 多様性 floor（easy/push・存在すれば urgency 上位から）。
  for (const lane of ["easy", "push"] as LifeOpsPlanLane[]) {
    let have = [...chosen].filter((i) => indexed[i].lane === lane).length;
    for (const x of byUrgency) {
      if (have >= POOL_LANE_FLOOR) break;
      if (x.lane !== lane || chosen.has(x.i)) continue;
      chosen.add(x.i);
      have++;
    }
  }
  // 3) 残り枠を urgency 順で充填（floor/deadline で cap を超えていれば追加しない）。
  for (const x of byUrgency) {
    if (chosen.size >= cap) break;
    chosen.add(x.i);
  }

  // 元の collector 順（dedup 済み優先順）を保って返す。
  const pool = indexed.filter((x) => chosen.has(x.i)).map((x) => x.c);
  return { pool, droppedCount: candidates.length - pool.length };
}
