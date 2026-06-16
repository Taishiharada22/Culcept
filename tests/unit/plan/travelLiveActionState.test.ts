/**
 * B2-disp A(2) — Travel Live ActionState mapper tests（display-safe by construction）
 *
 * 設計正本: docs/t11-rich-display-transport-boundary-design.md（§8 + CEO 補正: 返り値型を構造で拘束）
 */
import { describe, it, expect } from "vitest";
import { toTravelLiveActionState, TRAVEL_LIVE_INITIAL_STATE } from "@/lib/plan/travel/travel-live-action-state";
import { buildTravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter";
import type { TravelPlanDisplayInput } from "@/lib/shared/travel/travel-plan-display-adapter-types";
import type { SessionSurfaceEvent } from "@/lib/shared/travel/travel-session-binding-types";

const PROD = { fixtureAllowed: false } as const;
const input = (events: SessionSurfaceEvent[]): TravelPlanDisplayInput => ({ events, participantIds: ["P1"], viewerId: "P1" });
const READY = input([
  { kind: "destination_input", areaText: "京都", surface: "form_input" },
  { kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } },
]);

describe("1. mapper", () => {
  it("初期は idle", () => {
    expect(TRAVEL_LIVE_INITIAL_STATE).toEqual({ status: "idle" });
  });
  it("ready → {status:ready, display(packet/projection/cues)}", () => {
    const r = buildTravelPlanDisplayResult(READY, PROD);
    expect(r.status).toBe("ready");
    const s = toTravelLiveActionState(r);
    expect(s.status).toBe("ready");
    if (s.status !== "ready") throw new Error("unreachable");
    expect(Object.keys(s.display).sort()).toEqual(["cues", "packet", "projection"]);
    expect(s.display.packet.authoritative).toBe(false);
    expect(s.display.packet.executionAuthority).toBe(false);
  });
  it("not_ready_missing → {status, ask}（中立）", () => {
    const r = buildTravelPlanDisplayResult(input([{ kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } }]), PROD);
    const s = toTravelLiveActionState(r);
    expect(s.status).toBe("not_ready_missing");
    if (s.status === "not_ready_missing") expect(s.ask.some((a) => a.prerequisite === "destination")).toBe(true);
  });
  it("invalid（重複 participants）→ {status:invalid}", () => {
    const r = buildTravelPlanDisplayResult({ ...READY, participantIds: ["P1", "P1"] }, PROD);
    expect(toTravelLiveActionState(r).status).toBe("invalid");
  });
  it("gate dev_fixture → unavailable", () => {
    expect(toTravelLiveActionState(buildTravelPlanDisplayResult(READY, { fixtureAllowed: true })).status).toBe("unavailable");
  });
});

describe("2. display-safe by construction（authoritative/raw/diagnostics を持たない）", () => {
  it("ready state JSON に authoritative-tier / raw output / diagnostics / provenance を含まない", () => {
    const s = toTravelLiveActionState(buildTravelPlanDisplayResult(READY, PROD));
    const json = JSON.stringify(s);
    for (const f of ["\"server\"", "\"authoritative\":true", "executionAuthority\":true", "diagnostics", "provenance", "TravelPlanEngineInput", "fitLabel", "hardBlocks"]) {
      expect(json).not.toContain(f);
    }
  });
});
