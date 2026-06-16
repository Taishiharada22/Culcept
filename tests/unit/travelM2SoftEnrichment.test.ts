/**
 * F — M2 Travel Soft Enrichment mapper tests（fixture・soft only・hard 不可・private 既定）
 *
 * 設計正本: docs/t11-f-m2-soft-enrichment-provider-design.md（§11 + CEO 補正: avoid は soft）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapM2SoftEnrichmentToSlots } from "@/lib/shared/travel/m2-soft-enrichment";
import { getProductionTravelInput } from "@/lib/shared/travel/production-travel-input";
import type { M2TravelSoftPreference } from "@/lib/shared/travel/m2-soft-enrichment-types";
import type { ExtractedSlot } from "@/lib/shared/travel/slot-types";

const CTX = { participantId: "u1" };
const map = (p: M2TravelSoftPreference) => mapM2SoftEnrichmentToSlots(p, CTX);
const slotOf = (slots: ExtractedSlot[], key: ExtractedSlot["key"]) => slots.find((s) => s.key === key);

describe("1. soft slot 化（profile_prior/normalized/private）", () => {
  it("pace → profile_prior normalized private soft slot", () => {
    const s = slotOf(map({ pace: "slow" }), "pace")!;
    expect(s.status).toBe("normalized");
    expect(s.visibility).toBe("private");
    expect(s.evidence[0].surface).toBe("profile_prior");
    expect(s.owner).toEqual({ kind: "participant", participantId: "u1" });
  });
  it("mobility / budget → profile_prior normalized private soft slot", () => {
    const slots = map({ mobility: { maxWalkKm: 2 }, budgetBand: { lo: 0, hi: 20000, confidence: 0.6, currency: "JPY" } });
    expect(slotOf(slots, "mobility_tolerance")?.evidence[0].surface).toBe("profile_prior");
    expect(slotOf(slots, "budget_band")?.visibility).toBe("private");
  });
  it("lodging/food/quietness/crowd/novelty → soft_preference descriptor", () => {
    const slots = map({ descriptors: [
      { kind: "food", value: "local" },
      { kind: "quietness", value: "calm" },
      { kind: "novelty", value: "nature" },
    ] });
    const sps = slots.filter((s) => s.key === "soft_preference");
    expect(sps.length).toBe(3);
    expect(sps.every((s) => s.evidence[0].surface === "profile_prior")).toBe(true);
  });
});

describe("2. ★ avoid は soft（hard red_line にしない）・hard key を産出しない", () => {
  it("avoid 傾向 → soft_preference{descriptorKey:avoid}・red_line を産出しない", () => {
    const slots = map({ descriptors: [{ kind: "avoid", value: "crowd" }] });
    expect(slotOf(slots, "red_line")).toBeUndefined(); // ★ hard red_line を作らない
    const sp = slotOf(slots, "soft_preference")!;
    expect((sp.value as { descriptorKey: string }).descriptorKey).toBe("avoid");
  });
  it("destination_area / date_or_range / red_line を産出しない", () => {
    const slots = map({ pace: "slow", descriptors: [{ kind: "avoid", value: "crowd" }] });
    for (const k of ["destination_area", "date_or_range", "red_line"]) expect(slotOf(slots, k as ExtractedSlot["key"])).toBeUndefined();
  });
});

describe("3. hard 前提を満たさない（M2 だけでは provider not-ready）", () => {
  it("M2 soft slot のみの intake → getProductionTravelInput not_ready_missing（destination/date）", () => {
    const slots = map({ pace: "slow", mobility: { maxWalkKm: 2 }, descriptors: [{ kind: "food", value: "local" }] });
    const r = getProductionTravelInput({ slots, participantIds: ["u1"] }, { fixtureAllowed: false });
    expect(r.status).toBe("not_ready_missing");
    if (r.status === "not_ready_missing") {
      expect(r.missing).toContain("destination");
      expect(r.missing).toContain("date_or_range");
    }
  });
});

describe("4. raw score-like / dump / 不正を drop（band/enum 強制）", () => {
  it("raw axis score 形 / 無制限 dump field は読まれず slot 化されない", () => {
    // @ts-expect-error 余分 raw field を意図注入（型に無い・read されない）
    const slots = map({ pace: "slow", axisScores: { extraversion: 0.83 }, personalityDump: { a: 1, b: 2 } });
    expect(slots.map((s) => s.key)).toEqual(["pace"]); // pace のみ・raw 由来は出ない
    expect(JSON.stringify(slots)).not.toContain("extraversion");
    expect(JSON.stringify(slots)).not.toContain("personalityDump");
  });
  it("不正 pace（enum 外）は normalizeSlot で drop", () => {
    // @ts-expect-error 不正 enum 値
    expect(slotOf(map({ pace: "turbo" }), "pace")).toBeUndefined();
  });
});

describe("5. visibility（既定 private・shared は明示時のみ）", () => {
  it("既定 private", () => {
    expect(slotOf(map({ pace: "slow" }), "pace")?.visibility).toBe("private");
  });
  it("descriptor visibility:shared を明示 → shared（owner shared）", () => {
    const sp = slotOf(map({ descriptors: [{ kind: "food", value: "local", visibility: "shared" }] }), "soft_preference")!;
    expect(sp.visibility).toBe("shared");
    expect(sp.owner).toEqual({ kind: "shared" });
  });
});

describe("6. source-contract（mapper 純度）", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/m2-soft-enrichment.ts"), "utf8"));
  it("hard key / red_line を産出しない（コードに emit しない）", () => {
    expect(SRC).not.toContain('"destination_area"');
    expect(SRC).not.toContain('"date_or_range"');
    expect(SRC).not.toContain('"red_line"');
    expect(SRC).not.toContain("participantIds");
  });
  it("provider/engine/display/M2 runtime を呼ばない・slot-normalizer のみ使用", () => {
    expect(SRC).toContain("normalizeSlot");
    for (const f of ["getProductionTravelInput", "runTravelPlanEngine", "buildTravelPlanDisplayResult", "toDisplayPacket", "buildPlanIntelligenceProjection"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("DB/Supabase/fetch/API/app-UI/CoAlter/talk/route-weather-place を import/呼出しない", () => {
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\bfetch\(/);
    expect(SRC).not.toMatch(/\/api\//);
    expect(SRC).not.toMatch(/useCoAlter|\/talk|coalter/i);
    // 注: `weather_tolerance` は preference kind 名（weather API でない）。API token のみ ban。
    expect(SRC).not.toMatch(/googleapis|maps\b|getWeather|weatherApi|routeApi|placesApi/i);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/)/i);
  });
});
