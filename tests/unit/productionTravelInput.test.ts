/**
 * B2-prod A/B — Production Travel Input helper tests
 *
 * 設計正本: docs/t11-production-travel-input-provider-preflight.md（§7/§13/§14）
 *
 * 主眼: 5 状態（ready/not_ready_missing/not_ready_unconfirmed/unavailable/invalid）・production gate・
 *   participant invalid・manual_entity_evidence は hard 不可・profile_prior/relation/after_action は hard 不可・
 *   private soft は server-only input に流入・fixture fallback なし・provider 純度。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getProductionTravelInput } from "@/lib/shared/travel/production-travel-input";
import { TRAVEL_INPUT_SOURCE_KINDS } from "@/lib/shared/travel/travel-input-provider-types";
import { EXTRACTION_SURFACES } from "@/lib/shared/travel/slot-types";
import type { TravelIntakeInput } from "@/lib/shared/travel/travel-input-provider-types";
import type { ExtractedSlot, ExtractionSurface, SlotStatus } from "@/lib/shared/travel/slot-types";

const PROD = { fixtureAllowed: false } as const;

const slot = (
  key: ExtractedSlot["key"],
  value: ExtractedSlot["value"],
  surface: ExtractionSurface,
  over: Partial<{ status: SlotStatus; visibility: "shared" | "private"; participantId: string }> = {},
): ExtractedSlot =>
  ({
    key,
    value,
    status: over.status ?? "confirmed",
    fillState: "filled",
    confidence: 1,
    owner: over.participantId ? { kind: "participant", participantId: over.participantId } : { kind: "shared" },
    visibility: over.visibility ?? "shared",
    evidence: [{ surface, refId: `${surface}:1` }],
  }) as ExtractedSlot;

const dest = (surface: ExtractionSurface, over = {}) => slot("destination_area", { areaText: "箱根" }, surface, over);
const date = (surface: ExtractionSurface, over = {}) => slot("date_or_range", { kind: "single_day", date: "2026-07-01" }, surface, over);

const intake = (over: Partial<TravelIntakeInput> = {}): TravelIntakeInput => ({
  slots: [dest("form_input"), date("form_input")],
  participantIds: ["P1"],
  ...over,
});

// ── 1. ready ──────────────────────────────────────────────────────────────────
describe("1. confirmed → ready・real-only", () => {
  it("confirmed dest/date/participants → ready・provenance realOnly・real sources・dev_fixture なし", () => {
    const r = getProductionTravelInput(intake(), PROD);
    expect(r.status).toBe("ready");
    if (r.status !== "ready") throw new Error("unreachable");
    expect(r.provenance.realOnly).toBe(true);
    expect(r.provenance.sources).not.toContain("dev_fixture");
    expect(r.provenance.sources).toContain("user_intake");
    expect(r.input.participantIds).toEqual(["P1"]);
  });
  it("private soft enrichment は server-only input.slots に流入する（display でなく engine input）", () => {
    const r = getProductionTravelInput(
      intake({ slots: [dest("form_input"), date("session_context"), slot("red_line", { descriptorKey: "avoid", descriptorValue: "crowd" }, "chat_message", { status: "proposed", visibility: "private", participantId: "P1" })] }),
      PROD,
    );
    if (r.status !== "ready") throw new Error("unreachable");
    const priv = r.input.slots.find((s) => s.key === "red_line");
    expect(priv?.visibility).toBe("private"); // server-only input が private を保持（client へは別途出さない）
  });
});

// ── 2. not_ready（missing / unconfirmed 分離）─────────────────────────────────
describe("2. not_ready_missing / not_ready_unconfirmed 分離", () => {
  it("proposed destination → not_ready_unconfirmed（destination）", () => {
    const r = getProductionTravelInput(intake({ slots: [dest("chat_message", { status: "proposed" }), date("form_input")] }), PROD);
    expect(r.status).toBe("not_ready_unconfirmed");
    if (r.status === "not_ready_unconfirmed") expect(r.unconfirmed).toContain("destination");
  });
  it("proposed date → not_ready_unconfirmed（date_or_range）", () => {
    const r = getProductionTravelInput(intake({ slots: [dest("form_input"), date("chat_message", { status: "proposed" })] }), PROD);
    expect(r.status).toBe("not_ready_unconfirmed");
    if (r.status === "not_ready_unconfirmed") expect(r.unconfirmed).toContain("date_or_range");
  });
  it("missing destination → not_ready_missing（destination）", () => {
    const r = getProductionTravelInput(intake({ slots: [date("form_input")] }), PROD);
    expect(r.status).toBe("not_ready_missing");
    if (r.status === "not_ready_missing") expect(r.missing).toContain("destination");
  });
  it("missing date → not_ready_missing（date_or_range）", () => {
    const r = getProductionTravelInput(intake({ slots: [dest("form_input")] }), PROD);
    expect(r.status).toBe("not_ready_missing");
    if (r.status === "not_ready_missing") expect(r.missing).toContain("date_or_range");
  });
  it("generic session_context は destination を hard-confirm しない（→ unconfirmed）・date は満たす", () => {
    const r = getProductionTravelInput(intake({ slots: [dest("session_context"), date("session_context")] }), PROD);
    expect(r.status).toBe("not_ready_unconfirmed");
    if (r.status === "not_ready_unconfirmed") expect(r.unconfirmed).toContain("destination");
  });
});

// ── 3. invalid（participant 構造違反）──────────────────────────────────────────
describe("3. participant 構造違反 → invalid", () => {
  it("重複 participants → invalid（duplicate_participants）", () => {
    const r = getProductionTravelInput(intake({ participantIds: ["P1", "P1"] }), PROD);
    expect(r.status).toBe("invalid");
    if (r.status === "invalid") expect(r.reasons).toContain("duplicate_participants");
  });
  it(">2 participants → invalid（too_many_participants）", () => {
    const r = getProductionTravelInput(intake({ participantIds: ["P1", "P2", "P3"] }), PROD);
    expect(r.status).toBe("invalid");
    if (r.status === "invalid") expect(r.reasons).toContain("too_many_participants");
  });
  it("viewer ∉ participants → invalid（viewer_not_in_participants）", () => {
    const r = getProductionTravelInput(intake({ participantIds: ["P1"], viewerId: "P2" }), PROD);
    expect(r.status).toBe("invalid");
    if (r.status === "invalid") expect(r.reasons).toContain("viewer_not_in_participants");
  });
});

// ── 4. unavailable / production gate（fixture fallback なし）──────────────────────
describe("4. unavailable / dev_fixture 拒否", () => {
  it("session/intake source 不在 → unavailable（no_session_intake）", () => {
    // @ts-expect-error 不正 intake（runtime guard を検証）
    const r = getProductionTravelInput(null, PROD);
    expect(r.status).toBe("unavailable");
    if (r.status === "unavailable") expect(r.reason).toBe("no_session_intake");
  });
  it("production-like gate でない（fixtureAllowed:true）→ unavailable（dev_fixture_rejected・fixture fallback なし）", () => {
    const r = getProductionTravelInput(intake(), { fixtureAllowed: true });
    expect(r.status).toBe("unavailable");
    if (r.status === "unavailable") {
      expect(r.reason).toBe("dev_fixture_rejected");
      expect(r).not.toHaveProperty("input"); // input を出さない（fake fallback なし）
    }
  });
});

// ── 5. entity-side / 派生 surface は hard を満たさない ───────────────────────────
describe("5. manual_entity_evidence / profile_prior / relation_context / after_action は hard 不可", () => {
  it("manual_entity_evidence は source 語彙だが ExtractionSurface でない（slot を hard-confirm できない）", () => {
    expect(TRAVEL_INPUT_SOURCE_KINDS).toContain("manual_entity_evidence");
    expect(EXTRACTION_SURFACES as readonly string[]).not.toContain("manual_entity_evidence");
    // selected_plan_date / explicit_travel_mode も source であって slot surface でない
    expect(EXTRACTION_SURFACES as readonly string[]).not.toContain("selected_plan_date");
    expect(EXTRACTION_SURFACES as readonly string[]).not.toContain("explicit_travel_mode");
  });
  for (const surface of ["profile_prior", "relation_context", "after_action"] as const) {
    it(`${surface} は destination/date を hard-confirm しない（→ unconfirmed）`, () => {
      const r = getProductionTravelInput(intake({ slots: [dest(surface, { status: "normalized" }), date(surface, { status: "normalized" })] }), PROD);
      expect(r.status).toBe("not_ready_unconfirmed");
      if (r.status === "not_ready_unconfirmed") {
        expect(r.unconfirmed).toContain("destination");
        expect(r.unconfirmed).toContain("date_or_range");
      }
    });
  }
});

// ── 6. source-contract（helper 純度）──────────────────────────────────────────
describe("6. provider source-contract", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/production-travel-input.ts"), "utf8"));
  it("engine / display packet / projection / cues を呼ばない", () => {
    for (const f of ["runTravelPlanEngine", "toDisplayPacket", "buildPlanIntelligenceProjection", "deriveCoAlterProjectionCues", "evaluateFit"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("confirmed-real ロジックを複製せず getSessionIntakeTravelInput に委譲", () => {
    expect(SRC).toContain("getSessionIntakeTravelInput");
  });
  it("fetch/API/DB/Supabase/M2/route-weather-place/外部/app/UI を import/呼出しない", () => {
    expect(SRC).not.toMatch(/\bfetch\(/);
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\/api\//);
    expect(SRC).not.toMatch(/googleapis|maps|weather|route/i);
    expect(SRC).not.toMatch(/m2|personalization/i);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/)/i);
  });
});
