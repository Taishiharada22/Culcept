/**
 * Reality Control OS — Assembly: Fixture / Fake Assembler（**pure・no-DB**・barrel 非 export）
 *
 * 設計: docs/live-reader-integration-design.md（§4）
 *
 * 役割: 実 DB を触らず、fixture から `MemoryItem[]` と `WorldState` を組み立てる pure assembler。
 *   ＝将来の **server-only integration reader の「純粋な半分」**（DB fetch を fixture に差し替えたもの）。
 *   pipeline を fixture で **全組立**でき、unit/contract test と（後の）shadow の dry 検証に使える。
 *
 * 厳守: no DB / no Supabase / no route・既存 pure mapper を再利用（再実装しない）・捏造しない（欠損は null/[]）・pure。
 */

import { learningEventsToEpisodicMemory } from "../learning/memory-episodic";
import { tendenciesToSemanticMemory } from "../learning/memory-semantic-adapter";
import { tendenciesToPreferenceMemory } from "../learning/memory-preference";
import { tendenciesToProceduralMemory } from "../learning/memory-procedural";
import { tendenciesToCorrectionRecords, correctionRecordsToMemory } from "../learning/memory-correction";
import type { MemoryItem } from "../learning/memory-model";
import type { SecondSelfTendency } from "../learning/prm-model-entry-read";
import type { PrmLearningEventReadRow } from "../learning/prm-learning-event-read";
import type { PlanItemSnapshot } from "../change-set";
import type { ContextSnapshot } from "../../context/contextModifier";
import type { WorldState } from "../world-state/world-state";
import type { EmptyDayPermissionLevel, MobilityPlaceholder } from "../empty-day/empty-day-input";
import { gapNodesToAvailableWindows, type GapWindowSource } from "./daygraph-windows-adapter";
import { snapshotsToHardConstraints } from "./schedule-hardconstraint-mapper";
import type { GapMeaning } from "../gap-meaning";

/** 記憶 fixture（M3 tendency + M1 event row）。 */
export interface MemoryFixture {
  readonly tendencies?: readonly SecondSelfTendency[];
  readonly events?: readonly PrmLearningEventReadRow[];
}

/**
 * fixture → MemoryItem[]（**実 assembleMemoryItems と同じ pure mapper 連鎖**）。
 *   M1 events→episodic / M3 tendencies→semantic+preference+procedural+correction(direction/context)。
 *   M2 confirm/reject は deferred（fixture でも生成しない＝偽生成しない）。
 */
export function assembleMemoryItemsFromFixture(fx: MemoryFixture): readonly MemoryItem[] {
  const t = fx.tendencies ?? [];
  return [
    ...learningEventsToEpisodicMemory(fx.events ?? []),
    ...tendenciesToSemanticMemory(t),
    ...tendenciesToPreferenceMemory(t),
    ...tendenciesToProceduralMemory(t),
    ...correctionRecordsToMemory(tendenciesToCorrectionRecords(t)),
  ];
}

/** WorldState fixture（gap/schedule/context は adapter 経由で組む）。 */
export interface WorldStateFixture {
  readonly date: string;
  readonly nowMinute?: number | null;
  readonly gaps?: readonly GapWindowSource[];
  readonly meaningOf?: (gap: GapWindowSource) => GapMeaning | null;
  readonly schedule?: readonly PlanItemSnapshot[];
  readonly context?: ContextSnapshot | null;
  readonly mobility?: MobilityPlaceholder | null;
  readonly permissionLevel?: EmptyDayPermissionLevel;
}

/**
 * fixture → WorldState（gap→windows / schedule→hardConstraints を adapter で・**実 assembleWorldState と同形**）。
 */
export function fakeWorldState(fx: WorldStateFixture): WorldState {
  return {
    date: fx.date,
    nowMinute: fx.nowMinute ?? null,
    todaySchedule: snapshotsToHardConstraints(fx.schedule ?? []),
    availableWindows: gapNodesToAvailableWindows(fx.gaps ?? [], fx.meaningOf),
    context: fx.context ?? null,
    mobility: fx.mobility ?? null,
    permissionLevel: fx.permissionLevel ?? 2,
  };
}
