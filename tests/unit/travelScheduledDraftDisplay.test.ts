/**
 * DP3 — Scheduled-Draft Display Projection golden tests
 *
 * 設計正本: docs/t11-pipeline-closeout-display-preview-preflight.md §4/§5/§10（+ CEO 補正: externalId は inert）
 *
 * 主眼: scheduled_draft→DisplayScheduledItinerary / no_draft→null / status draft_proposal /
 *   serverOnly・audit provenance・authoritative/draft 内部 flag・内部 placeRefId 非露出 / HH:MM 決定論 /
 *   externalId は inert（href/link なし）/ engine/evaluateFit/assembler 非呼出 / import 純度。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectDisplayScheduledItinerary } from "@/lib/shared/travel/scheduled-draft-display";
import type { AssemblyBridgeResult } from "@/lib/shared/travel/solver-assembly-bridge-types";
import type { ScheduledTravelItineraryDraft } from "@/lib/shared/travel/assembly-types";

const yen = (lo: number, hi: number) => ({ lo, hi, confidence: 0.6, currency: "JPY" as const });
const draft: ScheduledTravelItineraryDraft = {
  outcome: "scheduled_draft", authoritative: false, draft: true, candidateId: "c:demo",
  itinerary: {
    days: [{
      dayIndex: 0, date: "2026-07-01",
      nodes: [
        { nodeId: "node:onsen:onsen", startMin: 600, endMin: 690, place: { placeRefId: "onsen", externalId: "place_x_onsen", label: "温泉" }, activityKind: "onsen", budgetBand: yen(1500, 2500), fatigueLoad: 2, nodeConfidence: "anchor" },
        { nodeId: "node:lunch:meal", startMin: 725, endMin: 780, place: { placeRefId: "lunch", label: "蕎麦処" }, activityKind: "meal", budgetBand: yen(2000, 4000), fatigueLoad: 1, nodeConfidence: "anchor" },
      ],
      edges: [{ fromNodeId: "node:onsen:onsen", toNodeId: "node:lunch:meal", transport: "walk", durationMin: 15, cost: yen(0, 0) }],
    }],
  },
  provenance: { nodeBudget: { "node:onsen:onsen": "presolver" }, edgeTransport: {}, edgeCost: {}, dayIndexSource: "single_day_zero" },
};
const envelope: AssemblyBridgeResult = { outcome: "scheduled_draft", serverOnly: true, draft };

describe("1. projection 基本", () => {
  it("scheduled_draft → DisplayScheduledItinerary（status draft_proposal・days/nodes/transitions）", () => {
    const d = projectDisplayScheduledItinerary(envelope);
    expect(d).not.toBeNull();
    expect(d!.status).toBe("draft_proposal");
    expect(d!.candidateId).toBe("c:demo");
    expect(d!.days).toHaveLength(1);
    expect(d!.days[0].nodes).toHaveLength(2);
    expect(d!.days[0].transitions).toHaveLength(1);
  });
  it("no_draft → null（表示なし）", () => {
    expect(projectDisplayScheduledItinerary({ outcome: "no_draft", serverOnly: true, reason: "non_candidate_input" })).toBeNull();
  });
  it("HH:MM は決定論（600→10:00, 690→11:30, 725→12:05）", () => {
    const n = projectDisplayScheduledItinerary(envelope)!.days[0].nodes;
    expect(n[0].startLabel).toBe("10:00");
    expect(n[0].endLabel).toBe("11:30");
    expect(n[1].startLabel).toBe("12:05");
    expect(n[0].startMin).toBe(600); // explicit minutes も保持
  });
});

describe("2. 非露出（serverOnly/audit/internal flag/placeRefId）", () => {
  it("出力に serverOnly / provenance / authoritative / draft 内部 flag を含めない", () => {
    const json = JSON.stringify(projectDisplayScheduledItinerary(envelope));
    for (const f of ["serverOnly", "provenance", "nodeBudget", "dayIndexSource", "authoritative", "\"draft\""]) expect(json).not.toContain(f);
  });
  it("内部 placeRefId を出さない・externalId は inert metadata として carry", () => {
    const d = projectDisplayScheduledItinerary(envelope)!;
    const json = JSON.stringify(d);
    expect(json).not.toContain("placeRefId");
    expect(d.days[0].nodes[0].place.externalId).toBe("place_x_onsen"); // inert に存在
    expect(d.days[0].nodes[0].place).not.toHaveProperty("placeRefId");
  });
  it("executionAuthority/booking/calendar/href/link/action を含まない", () => {
    const json = JSON.stringify(projectDisplayScheduledItinerary(envelope));
    for (const f of ["executionAuthority", "booking", "calendar", "href", "https://", "maps", "TravelCandidate"]) expect(json).not.toContain(f);
  });
});

describe("3. source-contract（projection の純度）", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const src = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/scheduled-draft-display.ts"), "utf8"));
  it("solver/assembler/engine を呼ばない", () => {
    for (const f of ["runTravelPlanEngine", "evaluateFit", "assembleScheduledDraft", "applySelectionLedger"]) expect(src).not.toContain(f);
  });
  it("外部 fetch/API/DB/Supabase/Maps/M2/app/UI を import/呼出しない", () => {
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/from ["']next/);
    expect(src).not.toMatch(/from ["'][^"']*(components|app\/|\/m2|personalization)/i);
    expect(src).not.toMatch(/from ["']react/);
    expect(src).not.toMatch(/maps|googleapis/i);
  });
});
