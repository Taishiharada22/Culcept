/**
 * C6-A-1 — CoAlter fixture session → travel engine events（**pure・runtime 副作用なし**）
 *
 * 役割: `CoAlterPlanSessionFixture`（UI fixture）を、travel engine の入口である
 *   `TravelSessionBindingInput`（構造化 `SessionSurfaceEvent[]` + participantIds）へ写す純関数。
 *   server 側 route がこの events を `buildTravelPlanDisplayResult` に通し、engine を駆動する。
 *
 * 設計（honest・境界）:
 *   - **label を parse しない**。condition の engine 意図は fixture の `engineHint` が明示する。
 *     hint 不在の condition は engine に渡さない（扱えない意味を捏造しない）。
 *   - destination / window / participants は engine の hard 前提。destination は session.destinationArea。
 *   - surface は全て `form_input`（構造化・明示操作扱い＝binding が confirmed/normalized を derive）。
 *   - **status を埋めない**（binding が surface から derive＝偽造不能）。
 *   - DB / fetch / runtime / Date.now なし。型のみ travel core から import。
 */

import type { TravelPlanWindow } from "@/lib/shared/travel/core-types";
import type {
  SessionSurfaceEvent,
  TravelSessionBindingInput,
} from "@/lib/shared/travel/travel-session-binding-types";
import type { CoAlterPlanSessionFixture, SharedConditionFixture } from "./coalterPlanSessionFixture";

/** fixture window（daily=date / travel=range）→ engine の TravelPlanWindow。 */
function toTravelPlanWindow(w: CoAlterPlanSessionFixture["window"]): TravelPlanWindow {
  if ("date" in w) return { kind: "single_day", date: w.date };
  return { kind: "range", startDate: w.start, endDate: w.end, nights: w.nights };
}

/**
 * condition → SessionSurfaceEvent（engineHint 経由のみ）。hint 不在は null（engine に渡さない）。
 *   descriptor は severity で red_line / soft_preference に分ける（red_line・hard→red_line / 他→soft）。
 *   visibility は condition のものを保持（private は engine 内で本人 rationale へ・shared 射影で除去）。
 */
function conditionToEvent(c: SharedConditionFixture): SessionSurfaceEvent | null {
  const hint = c.engineHint;
  if (!hint) return null;
  const surface = "form_input" as const;
  switch (hint.slot) {
    case "mobility_tolerance":
      return { kind: "mobility_input", value: hint.value, surface };
    case "time_window":
      return { kind: "time_window_input", value: hint.value, surface };
    case "budget_band":
      return { kind: "budget_input", value: hint.value, surface };
    case "pace":
      return { kind: "pace_input", value: hint.value, surface };
    case "descriptor": {
      const slotKey = c.severity === "red_line" || c.severity === "hard" ? "red_line" : "soft_preference";
      return {
        kind: "descriptor_input",
        slotKey,
        value: { descriptorKey: hint.descriptorKey, descriptorValue: hint.descriptorValue },
        surface,
        visibility: c.visibility,
      };
    }
  }
}

/**
 * CoAlter fixture session → travel engine binding input。
 *   events: destination_input(あれば) → selected_plan_window → conditions(engineHint 経由)。
 *   participantIds: session.participants の id（1–2）。
 *   viewerId は付けない（S1 は shared ビュー・本人 private 説明は後フェーズ）。
 */
export function coalterSessionToTravelEvents(session: CoAlterPlanSessionFixture): TravelSessionBindingInput {
  const events: SessionSurfaceEvent[] = [];

  // destination（engine の hard 前提）。fixture が行き先を持つときのみ。
  if (typeof session.destinationArea === "string" && session.destinationArea.length > 0) {
    events.push({ kind: "destination_input", areaText: session.destinationArea, surface: "form_input" });
  }

  // window（hard 前提・session_context normalized）。
  events.push({ kind: "selected_plan_window", window: toTravelPlanWindow(session.window) });

  // 共有/個別条件（engineHint を持つもののみ・honest）。
  for (const c of session.conditions) {
    const ev = conditionToEvent(c);
    if (ev !== null) events.push(ev);
  }

  return {
    events,
    participantIds: session.participants.map((p) => p.id),
  };
}
