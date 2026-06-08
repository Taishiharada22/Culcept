/**
 * Reality Control OS — R3-2 deriveEmptyDayInput（**pure・R3→R2 seam**・barrel 非 export）
 *
 * 設計: docs/r3-world-state-asset-audit-and-boundary.md（R3-0）
 *
 * 役割: `WorldState`（今の現実）+ `MemorySynthesis`（R1 記憶）から R2 の `EmptyDayInput` を **組むだけ**。
 *   energy/weather は ContextSnapshot から取り出し、usableContexts を hint に、**suppressed を excludedContexts に明示注入**。
 *
 * 厳守: 組むだけ（Plan 本線非接続・正本型を作らない）・suppressed は使わせない（excluded に回す）・
 *   userIntent は placeholder（WorldState にまだ無い・将来 daily guidance）・pure。
 */

import type { MemorySynthesis } from "../learning/memory-synthesis";
import type { EmptyDayInput, EmptyDayIntent } from "../empty-day/empty-day-input";
import { normalizeWorldState, worldStateEnergy, worldStateWeather, type WorldState } from "./world-state";

/**
 * R3-2: WorldState + MemorySynthesis → EmptyDayInput。
 *   memoryUsableContexts=synthesis.usableContexts / excludedContexts=suppressed の context（明示除外）。
 *   userIntent は opts で渡せる（既定 null・placeholder）。
 */
export function deriveEmptyDayInput(
  worldState: WorldState,
  memorySynthesis: MemorySynthesis,
  opts: { userIntent?: EmptyDayIntent | null } = {},
): EmptyDayInput {
  const ws = normalizeWorldState(worldState);
  const excludedContexts = memorySynthesis.contexts.filter((c) => c.suppressed).map((c) => c.context);
  return {
    date: ws.date,
    availableWindows: ws.availableWindows,
    hardConstraints: ws.todaySchedule,
    energy: worldStateEnergy(ws),
    weather: worldStateWeather(ws),
    mobility: ws.mobility,
    memoryUsableContexts: memorySynthesis.usableContexts, // hint（ready ∧ 非 suppressed・synthesis 保証）
    userIntent: opts.userIntent ?? null,
    permissionLevel: ws.permissionLevel,
    excludedContexts, // suppressed を明示除外（R2 で二重に使わせない）
  };
}
