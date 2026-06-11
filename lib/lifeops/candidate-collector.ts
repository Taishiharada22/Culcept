/**
 * Life Ops — Candidate Collector（縦の**単一出口**・§4 縦⇄横 seam・**pure・no-DB・no-UI**・barrel 非 export）
 *
 * 設計: docs/life-ops-r2-integration-contract.md / boundary §4 / candidate-engine(L-3) / event-preparation(L-4) / deadline-engine
 *
 * 役割: Life Ops 縦の **4 生成経路**（周期 / イベント前倒し / one-shot 準備 / 期限）を統合し、
 *   重複排除した単一の `LifeOpsCandidate[]` を返す。**横 R2 はこの 1 関数を consume する**（個別経路を知らなくてよい）。
 *   ＝縦が「何が due か」を全部まとめ、横 R2 が「いつ・どこに置くか」を決める seam の縦側。
 *
 * 厳守:
 *   - **pure・deterministic**（now 注入）・**横エンジン非 import**（横 R2/R4 を呼ばない・置かない）。データは注入。
 *   - 横 R2 の配置/window 確定/3 案化/通知は**作らない**（横の責務）。ここは候補の統合と重複排除だけ。
 *   - dedup は (category, menu) 単位・**source 優先順位**（期限→イベント→周期）で先勝ち。
 */

import { generateLifeOpsCandidates } from "./candidate-engine";
import { generateEventPrepCandidates, generateOneshotPrepCandidates, type UpcomingEvent } from "./event-preparation";
import { generateDeadlineCandidates, type DeadlineObservation } from "./deadline-engine";
import { generateRecurringCandidates, type RecurringObservation } from "./recurrence-model";
import { generateHabitCandidates, type HabitObservation } from "./habit-model";
import { generateRelationshipCandidates, type RelationshipObservation } from "./relationship-candidates";
import type { CadenceObservation, LifeOpsCandidate } from "./candidate-types";

/** 縦の入力（全て注入・calendar/実データ源 非接触）。 */
export interface LifeOpsInputs {
  readonly cadenceObservations?: readonly CadenceObservation[];
  readonly upcomingEvents?: readonly UpcomingEvent[];
  readonly deadlineObservations?: readonly DeadlineObservation[];
  readonly recurringObservations?: readonly RecurringObservation[];
  readonly habitObservations?: readonly HabitObservation[];
  readonly relationshipObservations?: readonly RelationshipObservation[];
}

/** dedup key（通常 category×menu・relationship のみ人物×接点ごとに独立）。 */
function candidateKey(c: LifeOpsCandidate): string {
  if (c.dueReason.kind === "relationship") {
    return `${c.category}:${c.dueReason.touchpointId}:${c.dueReason.personRef}`;
  }
  return `${c.category}:${c.menu ?? ""}`;
}

/**
 * Life Ops 縦の全候補を統合（pure・nowISO 注入）。横 R2 が consume する単一入口。
 *   source 優先順位（期限→イベント前倒し→one-shot→周期）で concat し、(category, menu) で先勝ち dedup。
 *   実際の配置・window・3 案・通知は横 R2/R4（本 collector は作らない）。
 */
export function collectLifeOpsCandidates(inputs: LifeOpsInputs, nowISO: string): readonly LifeOpsCandidate[] {
  const cadenceObs = inputs.cadenceObservations ?? [];
  const events = inputs.upcomingEvents ?? [];
  const deadlineObs = inputs.deadlineObservations ?? [];
  const recurringObs = inputs.recurringObservations ?? [];
  const habitObs = inputs.habitObservations ?? [];
  const relationshipObs = inputs.relationshipObservations ?? [];

  // 優先順位: deadline → recurring → event 前倒し → one-shot → 周期 → habit → relationship（低圧・高 safety ゆえ末尾）
  const ordered: readonly LifeOpsCandidate[] = [
    ...generateDeadlineCandidates(deadlineObs, nowISO),
    ...generateRecurringCandidates(recurringObs, nowISO),
    ...generateEventPrepCandidates(events, cadenceObs, nowISO),
    ...generateOneshotPrepCandidates(events, nowISO),
    ...generateLifeOpsCandidates(cadenceObs, nowISO),
    ...generateHabitCandidates(habitObs),
    ...generateRelationshipCandidates(relationshipObs, nowISO),
  ];

  const seen = new Set<string>();
  const out: LifeOpsCandidate[] = [];
  for (const c of ordered) {
    const key = candidateKey(c);
    if (seen.has(key)) continue; // 同 (category,menu) は最優先 source を採用
    seen.add(key);
    out.push(c);
  }
  return out;
}
