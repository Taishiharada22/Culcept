/**
 * C — Events → TravelSessionPersistenceWriteInput pure mapper tests（pure・no DB/repository/engine/display）
 *
 * 設計正本: docs/t11-server-action-persistence-wiring-preflight.md（§7 B+D / §C / §11）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapTravelSessionEventsToPersistenceWriteInput } from "@/lib/shared/travel/travel-session-persistence-write-mapper";
import type { SessionSurfaceEvent } from "@/lib/shared/travel/travel-session-binding-types";

const strip = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/travel-session-persistence-write-mapper.ts"), "utf8"));

const DEST: SessionSurfaceEvent = { kind: "destination_input", areaText: "京都", surface: "form_input" };
const DATE: SessionSurfaceEvent = { kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } };
const BUDGET: SessionSurfaceEvent = { kind: "budget_input", value: { lo: 5000, hi: 20000, confidence: 1, currency: "JPY" }, surface: "form_input" };
const map = (events: SessionSurfaceEvent[], over: { ownerUserId?: string; viewerId?: string } = {}) =>
  mapTravelSessionEventsToPersistenceWriteInput({ events, ownerUserId: over.ownerUserId ?? "u1", ...(over.viewerId !== undefined ? { viewerId: over.viewerId } : {}) });
const slotKeys = (r: ReturnType<typeof map>) => (r.status === "ready" ? r.writeInput.inputs.map((i) => i.slotKey).sort() : []);

describe("1. provider-ready のみ writeInput を生成", () => {
  it("confirmed destination + date → ready + writeInput（destination_area/date_or_range）", () => {
    const r = map([DEST, DATE]);
    expect(r.status).toBe("ready");
    if (r.status !== "ready") throw new Error("ready 期待");
    expect(slotKeys(r)).toEqual(["date_or_range", "destination_area"]);
    expect(r.writeInput.ownerUserId).toBe("u1");
    expect(r.writeInput.status).toBe("ready_snapshot");
    expect(r.writeInput.links).toEqual([]);
  });
  it("explicit budget/pace/soft_preference も persist（shared・explicit）", () => {
    const r = map([
      DEST, DATE, BUDGET,
      { kind: "pace_input", value: "slow", surface: "form_input" },
      { kind: "descriptor_input", slotKey: "soft_preference", value: { descriptorKey: "prefer", descriptorValue: "nature" }, surface: "form_input", visibility: "shared" },
    ]);
    expect(slotKeys(r)).toEqual(["budget_band", "date_or_range", "destination_area", "pace", "soft_preference"]);
  });
});

describe("2. not-ready / invalid → writeInput なし（events surface は explicit ゆえ unconfirmed は非到達）", () => {
  it("missing destination → not_ready_missing", () => {
    const r = map([DATE]);
    expect(r.status).toBe("not_ready_missing");
    expect("writeInput" in r).toBe(false);
  });
  it("missing date → not_ready_missing", () => {
    expect(map([DEST]).status).toBe("not_ready_missing");
  });
  it("空 events → not_ready_missing", () => {
    expect(map([]).status).toBe("not_ready_missing");
  });
  it("★ viewer ≠ owner（participant 構造違反）→ invalid・writeInput なし", () => {
    const r = map([DEST, DATE], { viewerId: "someone-else" });
    expect(r.status).toBe("invalid");
    expect("writeInput" in r).toBe(false);
  });
  it("非配列 events → invalid", () => {
    // @ts-expect-error runtime 防御
    expect(mapTravelSessionEventsToPersistenceWriteInput({ ownerUserId: "u1", events: null }).status).toBe("invalid");
  });
});

describe("3. owner は server 供給のみ・private/red_line/M2 を persist しない", () => {
  it("ownerUserId は input のみ（event から owner を持てない）", () => {
    expect(map([DEST, DATE], { ownerUserId: "owner-x" }).status === "ready").toBe(true);
    const r = map([DEST, DATE], { ownerUserId: "owner-x" });
    if (r.status === "ready") expect(r.writeInput.ownerUserId).toBe("owner-x");
  });
  it("★ red_line（shared・explicit）は persist しない（key allowlist 除外）", () => {
    const r = map([DEST, DATE, { kind: "descriptor_input", slotKey: "red_line", value: { descriptorKey: "avoid", descriptorValue: "crowd" }, surface: "form_input", visibility: "shared" }]);
    expect(slotKeys(r)).not.toContain("red_line");
    expect(slotKeys(r)).toEqual(["date_or_range", "destination_area"]);
  });
  it("★ private soft_preference（visibility private）は persist しない", () => {
    const r = map([DEST, DATE, { kind: "descriptor_input", slotKey: "soft_preference", value: { descriptorKey: "prefer", descriptorValue: "quiet" }, surface: "form_input", visibility: "private" }]);
    expect(slotKeys(r)).not.toContain("soft_preference");
  });
});

describe("4. output に display/projection/cues/authoritative/href/generated を持たない", () => {
  it("writeInput JSON に forbidden が無い", () => {
    const r = map([DEST, DATE, BUDGET]);
    if (r.status !== "ready") throw new Error("ready 期待");
    const json = JSON.stringify(r.writeInput);
    for (const f of [
      "DisplayPacketForClient", "projection", "cues", "packet", "authoritative", "executionAuthority",
      "TravelPlanEngineOutput", "diagnostics", "href", "generatedUrl", "generated_maps_search",
      "availability", "price", "booking", "calendar", "fitResult",
    ]) {
      expect(json).not.toContain(f);
    }
    // 各 input は permissioned field のみ（参照 id provenance のみ）
    for (const inp of r.writeInput.inputs) {
      expect(Object.keys(inp).sort()).toEqual(["fillState", "owner", "provenance", "slotKey", "slotStatus", "value", "visibility"]);
      expect(Object.keys(inp.provenance)).toEqual(["refIds"]);
    }
  });
});

describe("5. source-contract（pure・engine/display/repository/DB を呼ばない）", () => {
  it("binding/provider は再利用するが engine/display/repository を呼ばない", () => {
    expect(SRC).toContain("bindTravelSessionIntake");
    expect(SRC).toContain("getProductionTravelInput");
    for (const f of ["runTravelPlanEngine", "buildTravelPlanDisplayResult", "buildPlanIntelligenceProjection", "deriveCoAlterProjectionCues", "buildGeneratedMapsSearchIntent", "createTravelSessionRepositoryFromDbPort", "createSupabaseTravelSessionDbPort", "TravelSessionRepositoryContract"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("DB/Supabase/app・UI/M2/CoAlter/talk を import しない", () => {
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\.from\(|\.insert\(|createClient|service_role/);
    expect(SRC).not.toMatch(/\bfetch\(/);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/|_actions|server\/)/);
    expect(SRC).not.toMatch(/useCoAlter|\/talk|coalter/i);
    expect(SRC).not.toMatch(/\bm2\b/i);
  });
});
