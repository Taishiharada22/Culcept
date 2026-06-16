/**
 * B2-disp C — Travel FormData Intake tests（permissioned 読み取りのみ・status/user_id を読まない）
 *
 * 設計正本: docs/t11-production-plan-travel-live-gate-design.md（§5/§6/§14）
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

describe("1. permissioned field → events", () => {
  it("destination/date/participant/budget/pace → events + participantIds", () => {
    const input = buildTravelSessionEventsFromFormData(
      fd([
        ["destination", "京都"],
        ["date", "2026-07-01"],
        ["participantId", "P1"],
        ["budgetLo", "0"],
        ["budgetHi", "30000"],
        ["pace", "slow"],
      ]),
    );
    const kinds = input.events.map((e) => e.kind);
    expect(kinds).toContain("destination_input");
    expect(kinds).toContain("selected_plan_date");
    expect(kinds).toContain("budget_input");
    expect(kinds).toContain("pace_input");
    expect(input.participantIds).toEqual(["P1"]);
  });
  it("date+dateEnd+nights → selected_plan_window(range)", () => {
    const input = buildTravelSessionEventsFromFormData(fd([["date", "2026-07-01"], ["dateEnd", "2026-07-02"], ["nights", "1"]]));
    const w = input.events.find((e) => e.kind === "selected_plan_window");
    expect(w).toBeDefined();
    if (w && w.kind === "selected_plan_window") expect(w.window).toEqual({ kind: "range", startDate: "2026-07-01", endDate: "2026-07-02", nights: 1 });
  });
  it("複数 participantId を別供給で集約", () => {
    expect(buildTravelSessionEventsFromFormData(fd([["participantId", "P1"], ["participantId", "P2"]])).participantIds).toEqual(["P1", "P2"]);
  });
  it("空/不正 field は無視（捏造しない）", () => {
    const input = buildTravelSessionEventsFromFormData(fd([["destination", "   "], ["pace", "turbo"], ["budgetLo", "x"]]));
    expect(input.events).toEqual([]);
  });
});

describe("2. status / user_id を読まない・event は status を持たない", () => {
  it("FormData の status/user_id を無視（events に反映されない）", () => {
    const input = buildTravelSessionEventsFromFormData(
      fd([["destination", "京都"], ["status", "confirmed"], ["user_id", "u-secret"], ["userId", "u-secret"]]),
    );
    // event は status フィールドを持たない（型・runtime）
    for (const e of input.events) expect(e).not.toHaveProperty("status");
    // user_id は participantIds に混入しない
    expect(input.participantIds).not.toContain("u-secret");
    // bind 後の slot status は surface 由来（form_input→confirmed）＝client の status 主張は無視
    const slot = bindTravelSessionIntake(input).slots.find((s) => s.key === "destination_area");
    expect(slot?.status).toBe("confirmed");
  });
});

describe("3. source-contract（intake helper の permissioned lock）", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/plan/travel/travel-formdata-intake.ts"), "utf8"));
  it("status / user_id / raw input を formData.get で読まない", () => {
    for (const f of ['formData.get("status")', 'formData.get("user_id")', 'formData.get("userId")', 'formData.get("slotStatus")', "TravelPlanEngineInput", "AuthoritativePacketForServer"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("env/DB/fetch/booking を持たない（pure）", () => {
    for (const f of ["process.env", "supabase", "fetch(", "/api/", "booking", "calendar", ".insert(", ".update("]) {
      expect(SRC).not.toContain(f);
    }
  });
});
