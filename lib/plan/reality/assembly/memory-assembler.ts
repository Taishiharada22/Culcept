/**
 * Reality Control OS — Live Reader Step 1: Memory Assembler（**port 注入・非 server-only**・barrel 非 export）
 *
 * 設計: docs/live-reader-integration-design.md（§1, §4）
 *
 * 役割: **注入された reader port**（M1 events / M3 tendencies）から `MemoryItem[]` を組み立てる integration assembler。
 *   port 注入ゆえ **fake で全テスト可**（実 DB を触らない）。pure mapper 連鎖は `assembleMemoryItemsFromFixture` と同一。
 *
 * 厳守: 直接 DB/Supabase を触らない（port 経由）・**fail-open**（port 失敗→[]・pipeline を壊さない）・
 *   M2 confirm/reject は **deferred**（取得しない・偽生成しない）・捏造しない・redacted（MemoryItem は raw を持たない）。
 */

import { learningEventsToEpisodicMemory } from "../learning/memory-episodic";
import { tendenciesToSemanticMemory } from "../learning/memory-semantic-adapter";
import { tendenciesToPreferenceMemory } from "../learning/memory-preference";
import { tendenciesToProceduralMemory } from "../learning/memory-procedural";
import { tendenciesToCorrectionRecords, correctionRecordsToMemory } from "../learning/memory-correction";
import type { MemoryItem } from "../learning/memory-model";
import type { SecondSelfTendency } from "../learning/prm-model-entry-read";
import type { PrmLearningEventReadRow } from "../learning/prm-learning-event-read";

/** memory source の reader port（実装は server-only wiring・test は fake）。 */
export interface MemorySourcePorts {
  /** M1 prm_learning_events の column-restricted 生 row（episodic 用）。 */
  readEventRows(): Promise<readonly PrmLearningEventReadRow[]>;
  /** M3 prm_model_entries の review 済 tendency（semantic/preference/procedural/correction 用）。 */
  readSecondSelfTendencies(): Promise<readonly SecondSelfTendency[]>;
  // TODO(deferred): M2 prm_review_decisions の user confirm/reject reader（correction confirmed/rejected・procedural confirmed 用）。
}

/** port 失敗を握りつぶし fallback（**fail-open**・pipeline を壊さない）。 */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Step 1: port から MemoryItem[] を assemble。M1→episodic / M3→semantic+preference+procedural+correction(direction/context)。
 *   各 source fail-open。M2 由来（confirmed/rejected）は **deferred**（生成しない）。
 */
export async function assembleMemoryItems(ports: MemorySourcePorts): Promise<readonly MemoryItem[]> {
  const events = await safe(() => ports.readEventRows(), [] as readonly PrmLearningEventReadRow[]);
  const tendencies = await safe(() => ports.readSecondSelfTendencies(), [] as readonly SecondSelfTendency[]);
  return [
    ...learningEventsToEpisodicMemory(events),
    ...tendenciesToSemanticMemory(tendencies),
    ...tendenciesToPreferenceMemory(tendencies),
    ...tendenciesToProceduralMemory(tendencies),
    ...correctionRecordsToMemory(tendenciesToCorrectionRecords(tendencies)),
  ];
}
