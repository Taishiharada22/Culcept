/**
 * Reality Control OS — Live Reader Step 1: WorldState Assembler（**port 注入・非 server-only**・barrel 非 export）
 *
 * 設計: docs/live-reader-integration-design.md（§2, §4）
 *
 * 役割: **注入された source port**（schedule / gap / context / mobility / permission）から `WorldState` を組み立てる。
 *   schedule→HardConstraint・gap→AvailableWindow は既存 pure adapter を再利用。port 注入ゆえ **fake で全テスト可**。
 *   **実 plan 側 port 実装は deferred**（本 Step 1 は interface + assembler + fake test まで）。
 *
 * 厳守: 直接 DB を触らない（port 経由）・**fail-open**（port 失敗→null/[]・捏造しない→readiness が surface）・
 *   nowMinute/date は caller が渡す（Date.now しない）・label redact は mapper が担保・pure-ish。
 */

import type { PlanItemSnapshot } from "../change-set";
import type { ContextSnapshot } from "../../context/contextModifier";
import type { WorldState } from "../world-state/world-state";
import type { EmptyDayPermissionLevel, MobilityPlaceholder } from "../empty-day/empty-day-input";
import type { GapMeaning } from "../gap-meaning";
import { gapNodesToAvailableWindows, type GapWindowSource } from "./daygraph-windows-adapter";
import { snapshotsToHardConstraints } from "./schedule-hardconstraint-mapper";

/** WorldState source の reader port（schedule/gap/context は **実装 deferred**・test は fake）。 */
export interface WorldStateSourcePorts {
  /** 当日の固定予定（PlanItemSnapshot・実装は plan 側・deferred）。 */
  readSchedule(): Promise<readonly PlanItemSnapshot[]>;
  /** DayGraph の gap（GapNode の startTime/endTime・実装は DayGraph 側・deferred）。 */
  readGaps(): Promise<readonly GapWindowSource[]>;
  /** context 集約（buildDayContextSnapshot・実装は context 側・deferred）。null=未取得。 */
  readContext(): Promise<ContextSnapshot | null>;
  /** 移動 placeholder（任意・無ければ null）。 */
  readMobility?(): Promise<MobilityPlaceholder | null>;
  /** permission level（任意・無ければ既定 2）。 */
  readPermissionLevel?(): Promise<EmptyDayPermissionLevel>;
  /** gap meaning resolver（任意・無ければ null＝捏造しない）。 */
  meaningOf?: (gap: GapWindowSource) => GapMeaning | null;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Step 1: port から WorldState を assemble。各 port fail-open（欠損は null/[]→readiness が surface・捏造しない）。
 */
export async function assembleWorldState(ports: WorldStateSourcePorts, date: string, nowMinute: number | null): Promise<WorldState> {
  const schedule = await safe(() => ports.readSchedule(), [] as readonly PlanItemSnapshot[]);
  const gaps = await safe(() => ports.readGaps(), [] as readonly GapWindowSource[]);
  const context = await safe(() => ports.readContext(), null as ContextSnapshot | null);
  const mobility = ports.readMobility ? await safe(() => ports.readMobility!(), null as MobilityPlaceholder | null) : null;
  const permissionLevel = ports.readPermissionLevel ? await safe(() => ports.readPermissionLevel!(), 2 as EmptyDayPermissionLevel) : (2 as EmptyDayPermissionLevel);

  return {
    date,
    nowMinute,
    todaySchedule: snapshotsToHardConstraints(schedule),
    availableWindows: gapNodesToAvailableWindows(gaps, ports.meaningOf),
    context,
    mobility,
    permissionLevel,
  };
}
