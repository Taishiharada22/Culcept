/**
 * F2 — M2 Soft Enrichment merge-into-ready tests（explicit 優先・hard 不追加・元 input 不変・冪等）
 *
 * 設計正本: docs/t11-f2-m2-soft-enrichment-merge-boundary-design.md（§12）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mergeM2SoftEnrichmentIntoReadyTravelInput } from "@/lib/shared/travel/m2-soft-enrichment-merge";
import { mapM2SoftEnrichmentToSlots } from "@/lib/shared/travel/m2-soft-enrichment";
import type { TravelPlanEngineInput } from "@/lib/shared/travel/engine-types";
import type { ExtractedSlot } from "@/lib/shared/travel/slot-types";

const dest: ExtractedSlot = { key: "destination_area", value: { areaText: "京都" }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [{ surface: "form_input", refId: "f:d" }] };
const date: ExtractedSlot = { key: "date_or_range", value: { kind: "single_day", date: "2026-07-01" }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [{ surface: "session_context", refId: "s:w" }] };
const explicitPace: ExtractedSlot = { key: "pace", value: "intense", status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [{ surface: "form_input", refId: "f:p" }] };
const readyInput = (slots: ExtractedSlot[]): TravelPlanEngineInput => ({ slots, participantIds: ["u1"], viewerId: "u1" });
const m2 = (p: Parameters<typeof mapM2SoftEnrichmentToSlots>[0]) => mapM2SoftEnrichmentToSlots(p, { participantId: "u1" });
const keys = (i: TravelPlanEngineInput) => i.slots.map((s) => s.key);
const paceVals = (i: TravelPlanEngineInput) => i.slots.filter((s) => s.key === "pace").map((s) => s.value);

describe("1. enrich（explicit が無い soft key）", () => {
  it("explicit pace 無し + M2 pace → enrich される", () => {
    const r = mergeM2SoftEnrichmentIntoReadyTravelInput(readyInput([dest, date]), m2({ pace: "slow" }));
    expect(keys(r)).toContain("pace");
    expect(paceVals(r)).toEqual(["slow"]);
  });
  it("mobility/budget も enrich", () => {
    const r = mergeM2SoftEnrichmentIntoReadyTravelInput(readyInput([dest, date]), m2({ mobility: { maxWalkKm: 2 }, budgetBand: { lo: 0, hi: 20000, confidence: 0.6, currency: "JPY" } }));
    expect(keys(r)).toContain("mobility_tolerance");
    expect(keys(r)).toContain("budget_band");
  });
});

describe("2. explicit precedence（explicit が M2 に勝つ）", () => {
  it("explicit pace + M2 pace → explicit のみ（M2 drop）", () => {
    const r = mergeM2SoftEnrichmentIntoReadyTravelInput(readyInput([dest, date, explicitPace]), m2({ pace: "slow" }));
    expect(paceVals(r)).toEqual(["intense"]); // explicit のみ・M2 slow не追加
  });
  it("explicit destination/date/participants は保持", () => {
    const r = mergeM2SoftEnrichmentIntoReadyTravelInput(readyInput([dest, date]), m2({ pace: "slow" }));
    expect(r.slots.filter((s) => s.key === "destination_area")).toHaveLength(1);
    expect(r.slots.filter((s) => s.key === "date_or_range")).toHaveLength(1);
    expect(r.participantIds).toEqual(["u1"]);
    expect(r.viewerId).toBe("u1");
  });
});

describe("3. M2 hard key / red_line を ignore", () => {
  const malicious: ExtractedSlot[] = [
    { key: "destination_area", value: { areaText: "HACK" }, status: "normalized", fillState: "filled", confidence: 0.5, owner: { kind: "participant", participantId: "u1" }, visibility: "private", evidence: [{ surface: "profile_prior", refId: "m:d" }] },
    { key: "date_or_range", value: { kind: "single_day", date: "2099-01-01" }, status: "normalized", fillState: "filled", confidence: 0.5, owner: { kind: "participant", participantId: "u1" }, visibility: "private", evidence: [{ surface: "profile_prior", refId: "m:t" }] },
    { key: "red_line", value: { descriptorKey: "avoid", descriptorValue: "x" }, status: "normalized", fillState: "filled", confidence: 0.5, owner: { kind: "participant", participantId: "u1" }, visibility: "private", evidence: [{ surface: "profile_prior", refId: "m:r" }] },
    // participant-like 不正 key（cast）
    { key: "participantIds" } as unknown as ExtractedSlot,
  ];
  it("M2 由来 destination_area/date_or_range/red_line/participant-like は drop", () => {
    const r = mergeM2SoftEnrichmentIntoReadyTravelInput(readyInput([dest, date]), malicious);
    expect(JSON.stringify(r)).not.toContain("HACK");
    expect(JSON.stringify(r)).not.toContain("2099-01-01");
    expect(r.slots.some((s) => s.key === "red_line")).toBe(false);
    expect(r.slots.filter((s) => s.key === "destination_area")).toHaveLength(1); // explicit のみ
    expect(r.participantIds).toEqual(["u1"]);
  });
});

describe("4. avoid は soft_preference・additive・dedupe", () => {
  it("M2 avoid → soft_preference（red_line にならない）", () => {
    const r = mergeM2SoftEnrichmentIntoReadyTravelInput(readyInput([dest, date]), m2({ descriptors: [{ kind: "avoid", value: "crowd" }] }));
    expect(r.slots.some((s) => s.key === "red_line")).toBe(false);
    const sp = r.slots.find((s) => s.key === "soft_preference")!;
    expect((sp.value as { descriptorKey: string }).descriptorKey).toBe("avoid");
  });
  it("soft_preference は additive・重複は追加しない", () => {
    const m2slots = m2({ descriptors: [{ kind: "food", value: "local" }] });
    const withOne = mergeM2SoftEnrichmentIntoReadyTravelInput(readyInput([dest, date]), m2slots);
    expect(withOne.slots.filter((s) => s.key === "soft_preference")).toHaveLength(1);
    // 同 descriptor を再 merge → 重複しない
    const again = mergeM2SoftEnrichmentIntoReadyTravelInput(withOne, m2slots);
    expect(again.slots.filter((s) => s.key === "soft_preference")).toHaveLength(1);
  });
});

describe("5. 不変・冪等", () => {
  it("元 input を mutate しない", () => {
    const input = readyInput([dest, date]);
    const before = input.slots.length;
    mergeM2SoftEnrichmentIntoReadyTravelInput(input, m2({ pace: "slow" }));
    expect(input.slots.length).toBe(before); // 元は不変
  });
  it("冪等（同 M2 slots で 2 回 = 1 回）", () => {
    const m2slots = m2({ pace: "slow", descriptors: [{ kind: "food", value: "local" }] });
    const once = mergeM2SoftEnrichmentIntoReadyTravelInput(readyInput([dest, date]), m2slots);
    const twice = mergeM2SoftEnrichmentIntoReadyTravelInput(once, m2slots);
    expect(twice.slots.length).toBe(once.slots.length);
  });
});

describe("6. source-contract（helper 純度）", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/m2-soft-enrichment-merge.ts"), "utf8"));
  it("provider/engine/display/M2 runtime を呼ばない", () => {
    for (const f of ["getProductionTravelInput", "runTravelPlanEngine", "buildTravelPlanDisplayResult", "toDisplayPacket", "buildPlanIntelligenceProjection", "mapM2SoftEnrichmentToSlots"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("DB/Supabase/fetch/API/app-UI/CoAlter/talk を import/呼出しない", () => {
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\bfetch\(/);
    expect(SRC).not.toMatch(/\/api\//);
    expect(SRC).not.toMatch(/useCoAlter|\/talk|coalter/i);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/)/i);
  });
});
