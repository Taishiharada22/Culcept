/**
 * Reality Control OS — R3-3 World State Coherence / Readiness（**pure**・barrel 非 export）
 *
 * 設計: docs/r3-world-state-asset-audit-and-boundary.md（R3-0）
 *
 * 役割: `WorldState` の **欠損/coherence を捏造せず flag** し、R2（と R4）がどれだけ信頼できるかの readiness を返す。
 *   不明な field は **missing のまま**（neutral 補完は R2 が行うが、ここでは「補完した」と偽らない）。
 *
 * 厳守: 捏造しない（missing は missing）・certainty high を作らない・非断定 notes・pure。
 */

import { worldStateEnergy, worldStateWeather, normalizeWorldState, type WorldState } from "./world-state";

export type FieldStatus = "present" | "missing";

export interface WorldStateReadiness {
  readonly fields: {
    readonly windows: FieldStatus; // 空き窓があるか（無ければ日を組めない）
    readonly energy: FieldStatus;
    readonly weather: FieldStatus;
    readonly mobility: FieldStatus;
    readonly now: FieldStatus; // 現在時刻（R4 trigger 用・R2 では任意）
  };
  /** ready=全て揃う / partial=窓はあるが context 一部欠損(neutral で組める) / insufficient=窓なし(組めない)。 */
  readonly overall: "ready" | "partial" | "insufficient";
  /** 非断定の欠損メモ。 */
  readonly notes: readonly string[];
}

/** R3-3: WorldState の readiness を評価（欠損を flag・捏造しない）。 */
export function assessWorldState(worldState: WorldState): WorldStateReadiness {
  const ws = normalizeWorldState(worldState);
  const fields = {
    windows: ws.availableWindows.length > 0 ? ("present" as const) : ("missing" as const),
    energy: worldStateEnergy(ws) !== null ? ("present" as const) : ("missing" as const),
    weather: worldStateWeather(ws) !== null ? ("present" as const) : ("missing" as const),
    mobility: ws.mobility !== null ? ("present" as const) : ("missing" as const),
    now: ws.nowMinute !== null ? ("present" as const) : ("missing" as const),
  };

  const notes: string[] = [];
  if (fields.windows === "missing") notes.push("空き時間が見当たらないため、今日は組めません");
  if (fields.energy === "missing") notes.push("コンディションが未取得のため、中立で組みます");
  if (fields.weather === "missing") notes.push("天気が未取得のため、天気の考慮は控えめになります");

  let overall: WorldStateReadiness["overall"];
  if (fields.windows === "missing") overall = "insufficient"; // 窓なし＝組めない
  else if (fields.energy === "present" && fields.weather === "present") overall = "ready";
  else overall = "partial"; // 窓はあるが context 一部欠損（neutral で組める）

  return { fields, overall, notes };
}
