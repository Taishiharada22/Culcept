/**
 * T11-A-F — Travel Projection dev preview page/fixture/flag source-contract test。
 *   server component（async でない単純 server component だが）は source-contract で guard 配線を検証する
 *   （既存 realityPipelinePreviewPage.test.ts と同方式）。flag default OFF・read-only・no runtime/no送信。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const stripComments = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

const PAGE = stripComments(read("app/(culcept)/plan/dev-travel-projection/page.tsx"));
const FIXTURE = stripComments(read("app/(culcept)/plan/dev-travel-projection/fixture.ts"));
const COMP = stripComments(read("app/(culcept)/plan/dev-travel-projection/TravelProjectionPreview.tsx"));

describe("1. flag gate（default OFF・fail-closed）", () => {
  it("PLAN_FLAGS.travelProjectionPreview は env 未設定で false（本番デフォルト OFF）", () => {
    expect(PLAN_FLAGS.travelProjectionPreview).toBe(false);
  });
  it("page は !PLAN_FLAGS.travelProjectionPreview で Disabled（render しない）", () => {
    expect(PAGE).toContain("PLAN_FLAGS.travelProjectionPreview");
    expect(PAGE).toMatch(/if\s*\(\s*!PLAN_FLAGS\.travelProjectionPreview\s*\)/);
    expect(PAGE).toContain("<Disabled");
  });
  it("flag ON 時のみ fixture projection を render", () => {
    expect(PAGE).toContain("<TravelProjectionPreview");
    expect(PAGE).toMatch(/projection=\{FIXTURE_TRAVEL_PROJECTION\}/);
  });
});

describe("2. page は read-only・no runtime/engine/送信/DB", () => {
  it("engine runtime（runTravelPlanEngine）を実行しない", () => {
    expect(PAGE).not.toContain("runTravelPlanEngine");
  });
  it("fetch/API/DB/Supabase/送信/realtime/useCoAlter/PlanClient を持たない", () => {
    for (const f of ["fetch(", "/api/", "supabase", "useCoAlter", "realtime", "PlanClient", "readReceipt", "read_receipt"]) {
      expect(PAGE).not.toContain(f);
    }
  });
  it("write/apply/seed を持たない（read-only）", () => {
    for (const re of [/\.insert\s*\(/, /\.update\s*\(/, /\.delete\s*\(/, /\.upsert\s*\(/, /apply/i, /seed/i]) {
      expect(PAGE).not.toMatch(re);
    }
  });
});

describe("3. fixture は display tier 由来・engine 非実行・authoritative/raw 不使用", () => {
  it("実 mapper buildPlanIntelligenceProjection を display packet から呼ぶ", () => {
    expect(FIXTURE).toContain("buildPlanIntelligenceProjection");
    expect(FIXTURE).toContain("DisplayPacketForClient");
    expect(FIXTURE).toContain("authoritative: false");
    expect(FIXTURE).toContain("executionAuthority: false");
  });
  it("runTravelPlanEngine / AuthoritativePacketForServer / raw FitResult / diagnostics を使わない", () => {
    for (const f of ["runTravelPlanEngine", "AuthoritativePacketForServer", "FitResult", "diagnostics", "fetch(", "supabase"]) {
      expect(FIXTURE).not.toContain(f);
    }
  });
});

describe("4. component は read-only・accepts PlanIntelligenceProjection・action なし", () => {
  it("prop 型は PlanIntelligenceProjection（packet/raw を受けない）", () => {
    expect(COMP).toContain("projection: PlanIntelligenceProjection");
    expect(COMP).not.toContain("executionAuthority");
    expect(COMP).not.toContain("AuthoritativePacketForServer");
    expect(COMP).not.toContain("FitResult");
  });
  it("button/input/form/onClick/useState/fetch/送信/useCoAlter を持たない", () => {
    for (const f of ["<button", "<input", "<form", "onClick", "useState", "fetch(", "useCoAlter", "realtime", "/api/"]) {
      expect(COMP).not.toContain(f);
    }
  });
});
