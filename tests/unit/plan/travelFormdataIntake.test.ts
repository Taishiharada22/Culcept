/**
 * B2-disp C / B — Travel FormData Intake tests（events-only・participantId/user_id を読まない）
 *
 * 設計正本: docs/t11-b-current-user-participant-binding-design.md（§5）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildTravelSessionEventsFromFormData } from "@/lib/plan/travel/travel-formdata-intake";
import { bindTravelSessionIntake } from "@/lib/shared/travel/travel-session-binding";

const fd = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe("1. permissioned event field → SessionSurfaceEvent[]", () => {
  it("destination/date/budget/pace → events（participantId は読まない）", () => {
    const events = buildTravelSessionEventsFromFormData(
      fd([["destination", "京都"], ["date", "2026-07-01"], ["budgetLo", "0"], ["budgetHi", "30000"], ["pace", "slow"], ["participantId", "HACK"]]),
    );
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("destination_input");
    expect(kinds).toContain("selected_plan_date");
    expect(kinds).toContain("budget_input");
    expect(kinds).toContain("pace_input");
    // ★ participantId は events に一切反映されない（identity は server auth context のみ）
    expect(JSON.stringify(events)).not.toContain("HACK");
  });
  it("date+dateEnd+nights → selected_plan_window(range)", () => {
    const w = buildTravelSessionEventsFromFormData(fd([["date", "2026-07-01"], ["dateEnd", "2026-07-02"], ["nights", "1"]])).find((e) => e.kind === "selected_plan_window");
    expect(w).toBeDefined();
    if (w && w.kind === "selected_plan_window") expect(w.window).toEqual({ kind: "range", startDate: "2026-07-01", endDate: "2026-07-02", nights: 1 });
  });
  it("空/不正 field は無視（捏造しない・events 空）", () => {
    expect(buildTravelSessionEventsFromFormData(fd([["destination", "   "], ["pace", "turbo"], ["budgetLo", "x"]]))).toEqual([]);
  });
});

describe("2. status / user_id / participantId を読まない・event は status を持たない", () => {
  it("FormData の status/user_id/participantId を無視（events に反映されない）", () => {
    const events = buildTravelSessionEventsFromFormData(fd([["destination", "京都"], ["status", "confirmed"], ["user_id", "u-secret"], ["userId", "u-secret"], ["participantId", "u-secret"]]));
    for (const e of events) expect(e).not.toHaveProperty("status");
    const json = JSON.stringify(events);
    expect(json).not.toContain("u-secret");
    // bind 後の slot status は surface 由来（form_input→confirmed）＝client の status 主張は無視
    const slot = bindTravelSessionIntake({ events, participantIds: ["P1"] }).slots.find((s) => s.key === "destination_area");
    expect(slot?.status).toBe("confirmed");
  });
});

describe("3. source-contract（events-only・identity lock）", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/plan/travel/travel-formdata-intake.ts"), "utf8"));
  it("participantId / user_id / status / raw input を formData から読まない", () => {
    for (const f of ['formData.get("participantId")', 'formData.getAll("participantId")', 'formData.get("status")', 'formData.get("user_id")', 'formData.get("userId")', "TravelPlanEngineInput", "AuthoritativePacketForServer"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("env/DB/fetch/booking を持たない（pure）", () => {
    for (const f of ["process.env", "supabase", "fetch(", "/api/", "booking", "calendar", ".insert(", ".update("]) {
      expect(SRC).not.toContain(f);
    }
  });
});
