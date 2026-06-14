/**
 * T11-B(CoAlter)-E — CoAlter cue dev preview page/fixture/flag source-contract test。
 *   flag は既存 PLAN_TRAVEL_PROJECTION_PREVIEW を再利用（新 flag を足さない）・read-only・no runtime/useCoAlter/talk/送信。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const stripComments = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const read = (rel: string) => stripComments(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));

const PAGE = read("app/(culcept)/plan/dev-coalter-projection-cues/page.tsx");
const FIXTURE = read("app/(culcept)/plan/dev-coalter-projection-cues/fixture.ts");
const COMP = read("app/(culcept)/plan/dev-coalter-projection-cues/CoAlterCuesPreview.tsx");

describe("1. flag gate（既存 flag 再利用・default OFF・fail-closed）", () => {
  it("既存 PLAN_FLAGS.travelProjectionPreview を再利用（default false）", () => {
    expect(PLAN_FLAGS.travelProjectionPreview).toBe(false);
    expect(PAGE).toContain("PLAN_FLAGS.travelProjectionPreview");
    expect(PAGE).toMatch(/if\s*\(\s*!PLAN_FLAGS\.travelProjectionPreview\s*\)/);
    expect(PAGE).toContain("<Disabled");
  });
  it("新 flag を足していない（process.env を page で読まない）", () => {
    expect(PAGE).not.toContain("process.env");
    // PLAN_FLAGS のメンバ参照は travelProjectionPreview のみ（新 flag を足していない）
    expect([...new Set(PAGE.match(/PLAN_FLAGS\.\w+/g) ?? [])]).toEqual(["PLAN_FLAGS.travelProjectionPreview"]);
  });
  it("flag ON 時のみ fixture cue を render", () => {
    expect(PAGE).toContain("<CoAlterCuesPreview");
    expect(PAGE).toMatch(/cues=\{FIXTURE_COALTER_CUES\}/);
  });
});

describe("2. page/fixture/component は runtime/CoAlter/送信なし（read-only）", () => {
  it("page: engine runtime/useCoAlter/talk/fetch/DB/送信/apply/seed を持たない", () => {
    for (const f of ["runTravelPlanEngine", "useCoAlter", "/talk", "fetch(", "/api/", "supabase", "realtime", "read_receipt", "PlanClient"]) {
      expect(PAGE).not.toContain(f);
    }
    for (const re of [/\.insert\s*\(/, /\.update\s*\(/, /\.delete\s*\(/, /apply/i, /seed/i]) expect(PAGE).not.toMatch(re);
  });
  it("fixture: deriveCoAlterProjectionCues を既存 projection fixture から呼ぶ・raw/engine 不使用", () => {
    expect(FIXTURE).toContain("deriveCoAlterProjectionCues");
    expect(FIXTURE).toContain("FIXTURE_TRAVEL_PROJECTION"); // 既存 projection fixture 再利用
    for (const f of ["runTravelPlanEngine", "AuthoritativePacketForServer", "FitResult", "diagnostics", "fetch(", "supabase", "useCoAlter"]) {
      expect(FIXTURE).not.toContain(f);
    }
  });
  it("component: prop は CoAlterProjectionCue[]・button/input/送信/useCoAlter なし", () => {
    expect(COMP).toContain("cues: CoAlterProjectionCue[]");
    for (const f of ["<button", "<input", "<form", "onClick", "useState", "fetch(", "useCoAlter", "realtime", "/talk", "executionAuthority", "authoritative", "diagnostics"]) {
      expect(COMP).not.toContain(f);
    }
  });
});
