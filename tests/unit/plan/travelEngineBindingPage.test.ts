/**
 * B2-bind C — session binding → provider → engine preview page source-contract + logic test。
 *   既存 flag 再利用・event fixture → bindTravelSessionIntake → getProductionTravelInput → engine・read-only。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { bindTravelSessionIntake } from "@/lib/shared/travel/travel-session-binding";
import { getProductionTravelInput } from "@/lib/shared/travel/production-travel-input";
import { runTravelPlanEngine } from "@/lib/shared/travel/engine";
import { FIXTURE_BINDING_EVENTS } from "@/app/(culcept)/plan/dev-travel-engine-binding/binding-events-fixture";

const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const read = (rel: string) => strip(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
const DIR = "app/(culcept)/plan/dev-travel-engine-binding";
const PAGE = read(`${DIR}/page.tsx`);
const FIXTURE = read(`${DIR}/binding-events-fixture.ts`);

describe("1. binding seam（flag・event→bind→provider・raw fixture 不使用）", () => {
  it("既存 PLAN_FLAGS.travelProjectionPreview のみ + OFF → Disabled", () => {
    expect(PLAN_FLAGS.travelProjectionPreview).toBe(false);
    expect([...new Set(PAGE.match(/PLAN_FLAGS\.\w+/g) ?? [])]).toEqual(["PLAN_FLAGS.travelProjectionPreview"]);
    expect(PAGE).toContain("<Disabled");
  });
  it("event fixture → bindTravelSessionIntake → getProductionTravelInput(fixtureAllowed:false)", () => {
    expect(PAGE).toMatch(/bindTravelSessionIntake\(\s*FIXTURE_BINDING_EVENTS\s*\)/);
    expect(PAGE).toMatch(/getProductionTravelInput\(\s*intake\s*,\s*\{\s*fixtureAllowed:\s*false\s*\}/);
  });
  it("provider not ready → engine を走らせず Disabled・生 fixture を engine に渡さない", () => {
    expect(PAGE).toMatch(/provided\.status\s*!==\s*["']ready["']/);
    expect(PAGE).toMatch(/runTravelPlanEngine\(\s*provided\.input\s*\)/);
    expect(PAGE).not.toContain("FIXTURE_ENGINE_INPUT");
    expect(PAGE).not.toContain("getDevFixtureTravelInput");
  });
});

describe("2. engine chain・server-only output", () => {
  it("runTravelPlanEngine → toDisplayPacket → buildPlanIntelligenceProjection → deriveCoAlterProjectionCues", () => {
    for (const f of ["runTravelPlanEngine", "toDisplayPacket", "buildPlanIntelligenceProjection", "deriveCoAlterProjectionCues"]) expect(PAGE).toContain(f);
  });
  it("projection/cues のみ client へ（provenance/output/packet/authoritative/diagnostics/dump なし）", () => {
    expect(PAGE).toMatch(/projection=\{projection\}/);
    expect(PAGE).toMatch(/cues=\{cues\}/);
    for (const re of [/provenance=\{/, /output=\{/, /packet=\{/, /authoritative=\{/, /diagnostics=\{/]) expect(PAGE).not.toMatch(re);
    expect(PAGE).not.toContain("JSON.stringify");
    expect(PAGE).not.toContain("toServerAuthoritativePacket");
  });
  it("try/catch で fail-closed", () => {
    expect(PAGE).toContain("try");
    expect(PAGE).toContain("catch");
  });
});

describe("3. read-only（page + fixture）", () => {
  it("page: fetch/DB/useCoAlter/talk/送信/booking/button なし", () => {
    for (const f of ["fetch(", "/api/", "supabase", "useCoAlter", "/talk", "realtime", "read_receipt", "booking", "<button", "<input"]) expect(PAGE).not.toContain(f);
  });
  it("fixture: Date.now/Math.random/process.env/fetch/DB なし・TravelSessionBindingInput を export・raw chat なし", () => {
    for (const f of ["Date.now", "Math.random", "process.env", "fetch(", "supabase", "chat_message"]) expect(FIXTURE).not.toContain(f);
    expect(FIXTURE).toContain("export const FIXTURE_BINDING_EVENTS");
    expect(FIXTURE).toContain("TravelSessionBindingInput");
  });
});

describe("4. logic: event→bind→provider→engine（end-to-end）", () => {
  it("fixture events → bind → ready → runTravelPlanEngine が valid output を返す", () => {
    const intake = bindTravelSessionIntake(FIXTURE_BINDING_EVENTS);
    // binding が confirmed destination + normalized(session_context) date を生成
    expect(intake.slots.find((s) => s.key === "destination_area")?.status).toBe("confirmed");
    const dateSlot = intake.slots.find((s) => s.key === "date_or_range");
    expect(dateSlot?.status).toBe("normalized");
    expect(dateSlot?.evidence[0].surface).toBe("session_context");
    const provided = getProductionTravelInput(intake, { fixtureAllowed: false });
    expect(provided.status).toBe("ready");
    if (provided.status !== "ready") throw new Error("unreachable");
    const output = runTravelPlanEngine(provided.input);
    expect(output.inputError).toBeNull();
    expect(output.shared).toBeTruthy();
  });
});
