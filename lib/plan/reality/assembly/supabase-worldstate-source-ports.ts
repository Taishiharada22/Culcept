import "server-only";
/**
 * Reality Control OS — 4-D1 Supabase WorldState Source Ports（**server-only・wiring のみ**・barrel 非 export）
 *
 * 設計: docs/full-worldstate-reader-preflight.md（§7・4-D）/ decision-log（4-D1）
 *
 * 役割: injected user-RLS client から anchor reader を作り、`WorldStateSourcePorts` に束ねる **wiring**。
 *   - schedule = anchors → `anchorRowsToSnapshots`（PlanItemSnapshot・title 持ち込まない）。
 *   - **gap port なし** → assembler が anchor path（schedule の interval-complement）で windows を出す。
 *   - **context = null**（server で energy/weather を読めない＝client-side・注入は別経路）。mobility = placeholder（null）。
 *   - **query は readSchedule を呼んだ時のみ実行**（4-D1 は fake のみ・実 staging read は 4-E gate）。
 *
 * 厳守: createClient しない（注入）・service_role 禁止・read-only・context/mobility を server で捏造しない（null）・
 *   permission は引数で渡す方針（ここでは port に載せない＝assembler 既定）。
 */

import { createSupabaseAnchorScheduleReader, type AnchorReadClient } from "./supabase-anchor-schedule-reader";
import { anchorRowsToSnapshots } from "./anchor-schedule-mapper";
import type { WorldStateSourcePorts } from "./world-state-assembler";

/**
 * 4-D1: injected user-RLS client + 単一日 → WorldStateSourcePorts（schedule=anchors / context=null / mobility=null）。
 *   実 Supabase client が anchor reader の client interface を structural に満たす（service_role を渡さないこと）。
 */
export function createSupabaseWorldStateSourcePorts(client: unknown, userId: string, date: string): WorldStateSourcePorts {
  const anchorReader = createSupabaseAnchorScheduleReader(client as AnchorReadClient, userId, date);
  return {
    readSchedule: async () => anchorRowsToSnapshots(await anchorReader.readRows()),
    readContext: async () => null, // server で energy/weather は読めない（client-side）→ null・readiness が surface
    readMobility: async () => null, // placeholder（MAP 不可侵）
    // readGaps なし → anchor path（interval-complement）。readPermissionLevel なし → assembler 既定（permission は引数）。
  };
}
