/**
 * T11-C-D — engine-generated projection page source-contract test。
 *   server page は実行せず source-contract で検証（既存 dev-preview page test 同方式）。
 *   flag 再利用・engine 実行を client に authoritative で渡さない・toServerAuthoritativePacket 不使用・
 *   diagnostics/raw output 非 render・no fetch/DB/useCoAlter/talk/送信・本番 /plan 非接触。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const stripComments = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const read = (rel: string) => stripComments(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));

const PAGE = read("app/(culcept)/plan/dev-travel-engine-projection/page.tsx");
const INPUT = read("app/(culcept)/plan/dev-travel-engine-projection/engine-fixture-input.ts");

describe("1. provider seam gate（既存 flag→fixtureAllowed・not_ready→fail-closed）", () => {
  it("既存 PLAN_FLAGS.travelProjectionPreview を fixtureAllowed に解決（新 flag なし）", () => {
    expect(PLAN_FLAGS.travelProjectionPreview).toBe(false);
    expect([...new Set(PAGE.match(/PLAN_FLAGS\.\w+/g) ?? [])]).toEqual(["PLAN_FLAGS.travelProjectionPreview"]);
    expect(PAGE).toMatch(/getDevFixtureTravelInput\(\s*FIXTURE_ENGINE_INPUT\s*,\s*\{\s*fixtureAllowed:\s*PLAN_FLAGS\.travelProjectionPreview\s*\}/);
    expect(PAGE).toContain("<Disabled");
  });
  it("provider not_ready → engine を走らせず Disabled（status !== ready で gate）", () => {
    expect(PAGE).toMatch(/provided\.status\s*!==\s*["']ready["']/);
    // engine は ready 後・provider が供給した input でのみ実行（raw FIXTURE を直接 engine に渡さない）。
    expect(PAGE).toMatch(/runTravelPlanEngine\(\s*provided\.input\s*\)/);
    expect(PAGE).not.toMatch(/runTravelPlanEngine\(\s*FIXTURE_ENGINE_INPUT\s*\)/);
  });
  it("provider provenance を client へ出さない（render しない・server-only）", () => {
    expect(PAGE).not.toMatch(/provenance=\{/);
    expect(PAGE).not.toMatch(/\{provided\.provenance\}/);
    expect(PAGE).not.toMatch(/\{provided\}/);
  });
});

describe("2. engine chain を server 実行し projection/cues のみ client へ渡す", () => {
  it("runTravelPlanEngine → toDisplayPacket → buildPlanIntelligenceProjection → deriveCoAlterProjectionCues", () => {
    for (const f of ["runTravelPlanEngine", "toDisplayPacket", "buildPlanIntelligenceProjection", "deriveCoAlterProjectionCues"]) {
      expect(PAGE).toContain(f);
    }
  });
  it("component へは projection / cues のみ渡す（authoritative/output/packet を渡さない）", () => {
    expect(PAGE).toMatch(/projection=\{projection\}/);
    expect(PAGE).toMatch(/cues=\{cues\}/);
    expect(PAGE).not.toMatch(/authoritative=\{/);
    expect(PAGE).not.toMatch(/output=\{/);
    expect(PAGE).not.toMatch(/packet=\{/);
    expect(PAGE).not.toMatch(/diagnostics=\{/);
  });
  it("toServerAuthoritativePacket を呼ばない（authoritative は暗黙 server-only）", () => {
    expect(PAGE).not.toContain("toServerAuthoritativePacket");
  });
  it("raw output / diagnostics を render しない（JSON.stringify dump なし）", () => {
    expect(PAGE).not.toContain("JSON.stringify");
    expect(PAGE).not.toMatch(/\{output\}/);
    expect(PAGE).not.toMatch(/\{output\.diagnostics\}/);
  });
  it("engine 実行を try/catch で fail-closed（throw を本番 path に出さない）", () => {
    expect(PAGE).toContain("try");
    expect(PAGE).toContain("catch");
  });
});

describe("3. read-only・no runtime/CoAlter/送信（page + fixture）", () => {
  it("page: fetch/DB/useCoAlter/talk/送信/apply/seed/PlanClient を持たない", () => {
    for (const f of ["fetch(", "/api/", "supabase", "useCoAlter", "/talk", "realtime", "read_receipt", "PlanClient", "<button", "<input"]) {
      expect(PAGE).not.toContain(f);
    }
    for (const re of [/\.insert\s*\(/, /\.update\s*\(/, /\.delete\s*\(/, /apply/i, /seed/i]) expect(PAGE).not.toMatch(re);
  });
  it("fixture: Date.now/Math.random/process.env/fetch/DB/M2 を含まない", () => {
    for (const f of ["Date.now", "Math.random", "process.env", "fetch(", "supabase"]) {
      expect(INPUT).not.toContain(f);
    }
  });
  it("fixture: static TravelPlanEngineInput を export（evaluateFit で fixture fit 生成）", () => {
    expect(INPUT).toContain("export const FIXTURE_ENGINE_INPUT");
    expect(INPUT).toContain("TravelPlanEngineInput");
  });
});
