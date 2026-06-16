/**
 * B2-prod C — session/intake provider preview page source-contract + logic test。
 *   server page は実行せず source-contract で検証 + provider→engine path を logic で実証。
 *   既存 flag 再利用・raw FIXTURE_ENGINE_INPUT を engine に渡さない・provider 経由・read-only・本番 /plan 非接触。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { getProductionTravelInput } from "@/lib/shared/travel/production-travel-input";
import { runTravelPlanEngine } from "@/lib/shared/travel/engine";
import { FIXTURE_SESSION_INTAKE } from "@/app/(culcept)/plan/dev-travel-engine-session-intake/session-intake-fixture";
import type { TravelIntakeInput } from "@/lib/shared/travel/travel-input-provider-types";
import type { ExtractedSlot } from "@/lib/shared/travel/slot-types";

const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const read = (rel: string) => strip(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
const DIR = "app/(culcept)/plan/dev-travel-engine-session-intake";
const PAGE = read(`${DIR}/page.tsx`);
const FIXTURE = read(`${DIR}/session-intake-fixture.ts`);

// ── 1. flag gate + provider 経由（raw fixture を直接 engine に渡さない）─────────────
describe("1. provider seam（既存 flag・production gate・raw fixture 不使用）", () => {
  it("既存 PLAN_FLAGS.travelProjectionPreview のみ（新 flag なし）+ OFF → Disabled", () => {
    expect(PLAN_FLAGS.travelProjectionPreview).toBe(false);
    expect([...new Set(PAGE.match(/PLAN_FLAGS\.\w+/g) ?? [])]).toEqual(["PLAN_FLAGS.travelProjectionPreview"]);
    expect(PAGE).toContain("<Disabled");
  });
  it("session/intake fixture を production gate（fixtureAllowed:false）で provider に通す", () => {
    expect(PAGE).toMatch(/getProductionTravelInput\(\s*FIXTURE_SESSION_INTAKE\s*,\s*\{\s*fixtureAllowed:\s*false\s*\}/);
  });
  it("provider not ready → engine を走らせず Disabled（status !== ready で gate）", () => {
    expect(PAGE).toMatch(/provided\.status\s*!==\s*["']ready["']/);
    expect(PAGE).toMatch(/runTravelPlanEngine\(\s*provided\.input\s*\)/);
    // ★ 生 TravelPlanEngineInput fixture を使わない（provider 経由）
    expect(PAGE).not.toContain("FIXTURE_ENGINE_INPUT");
    expect(PAGE).not.toContain("getDevFixtureTravelInput");
  });
});

// ── 2. engine chain → projection/cues のみ client へ ───────────────────────────
describe("2. engine chain・server-only output", () => {
  it("runTravelPlanEngine → toDisplayPacket → buildPlanIntelligenceProjection → deriveCoAlterProjectionCues", () => {
    for (const f of ["runTravelPlanEngine", "toDisplayPacket", "buildPlanIntelligenceProjection", "deriveCoAlterProjectionCues"]) {
      expect(PAGE).toContain(f);
    }
  });
  it("component へは projection / cues のみ（provenance/output/packet/authoritative 渡さない・dump なし）", () => {
    expect(PAGE).toMatch(/projection=\{projection\}/);
    expect(PAGE).toMatch(/cues=\{cues\}/);
    for (const re of [/provenance=\{/, /\{provided\.provenance\}/, /output=\{/, /packet=\{/, /authoritative=\{/]) expect(PAGE).not.toMatch(re);
    expect(PAGE).not.toContain("JSON.stringify");
    expect(PAGE).not.toContain("toServerAuthoritativePacket");
  });
  it("engine 実行を try/catch で fail-closed", () => {
    expect(PAGE).toContain("try");
    expect(PAGE).toContain("catch");
  });
});

// ── 3. read-only・no runtime/CoAlter/送信 ─────────────────────────────────────
describe("3. read-only（page + fixture）", () => {
  it("page: fetch/DB/useCoAlter/talk/送信/booking/button を持たない", () => {
    for (const f of ["fetch(", "/api/", "supabase", "useCoAlter", "/talk", "realtime", "read_receipt", "booking", "<button", "<input"]) {
      expect(PAGE).not.toContain(f);
    }
  });
  it("fixture: Date.now/Math.random/process.env/fetch/DB なし・TravelIntakeInput を export", () => {
    for (const f of ["Date.now", "Math.random", "process.env", "fetch(", "supabase"]) expect(FIXTURE).not.toContain(f);
    expect(FIXTURE).toContain("export const FIXTURE_SESSION_INTAKE");
    expect(FIXTURE).toContain("TravelIntakeInput");
    expect(FIXTURE).not.toContain("dev_fixture");
  });
});

// ── 4. logic: provider→engine path が end-to-end で動く ───────────────────────────
describe("4. provider→engine path（logic）", () => {
  it("confirmed session/intake fixture → getProductionTravelInput ready → runTravelPlanEngine が output を返す", () => {
    const provided = getProductionTravelInput(FIXTURE_SESSION_INTAKE, { fixtureAllowed: false });
    expect(provided.status).toBe("ready");
    if (provided.status !== "ready") throw new Error("unreachable");
    expect(provided.provenance.realOnly).toBe(true);
    const output = runTravelPlanEngine(provided.input); // 生 fixture でなく provider 供給 input
    expect(output.inputError).toBeNull(); // valid run（input error なし）
    expect(output.shared).toBeTruthy(); // display 用 shared packet を生成
  });
  it("proposed destination の session/intake → not_ready_unconfirmed（engine を走らせない）", () => {
    const proposedDest: ExtractedSlot = { key: "destination_area", value: { areaText: "箱根" }, status: "proposed", fillState: "filled", confidence: 0.6, owner: { kind: "shared" }, visibility: "shared", evidence: [{ surface: "chat_message", refId: "m:d" }] };
    const intake: TravelIntakeInput = { ...FIXTURE_SESSION_INTAKE, slots: [proposedDest, ...FIXTURE_SESSION_INTAKE.slots.filter((s) => s.key !== "destination_area")] };
    const provided = getProductionTravelInput(intake, { fixtureAllowed: false });
    expect(provided.status).toBe("not_ready_unconfirmed");
    if (provided.status === "not_ready_unconfirmed") expect(provided.unconfirmed).toContain("destination");
  });
});
