/**
 * B2-bind A/B — Real Session/Intake Source Binding tests
 *
 * 設計正本: docs/t11-real-session-intake-source-binding-design.md（§4/§6/§13 + CEO 補正）
 *
 * 主眼: surface→slot 決定論・status は surface 由来（override 不能）・normalizeSlot gate・
 *   selected window→session_context normalized date / explicit→confirmed / generic は dest/date を作らない /
 *   manual_entity_evidence・chat は hard 不可 / private soft / fail-closed / provider 連携。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bindTravelSessionIntake, bindTravelSessionIntakeWithDiagnostics } from "@/lib/shared/travel/travel-session-binding";
import { getProductionTravelInput } from "@/lib/shared/travel/production-travel-input";
import { runTravelPlanEngine } from "@/lib/shared/travel/engine";
import type { SessionSurfaceEvent, TravelSessionBindingInput } from "@/lib/shared/travel/travel-session-binding-types";
import type { ExtractedSlot } from "@/lib/shared/travel/slot-types";

const bind = (events: SessionSurfaceEvent[], over: Partial<TravelSessionBindingInput> = {}) =>
  bindTravelSessionIntake({ events, participantIds: ["P1"], ...over });
const slotOf = (slots: ExtractedSlot[], key: ExtractedSlot["key"]) => slots.find((s) => s.key === key);
const PROD = { fixtureAllowed: false } as const;

// ── 1. date/destination 生成（status は surface 由来）─────────────────────────
describe("1. slot 生成・status surface 由来", () => {
  it("selected_plan_window → date_or_range（session_context・normalized）", () => {
    const d = slotOf(bind([{ kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } }]).slots, "date_or_range");
    expect(d?.status).toBe("normalized");
    expect(d?.evidence[0].surface).toBe("session_context");
  });
  it("selected_plan_date → date_or_range（single_day・session_context）", () => {
    const d = slotOf(bind([{ kind: "selected_plan_date", date: "2026-07-01" }]).slots, "date_or_range");
    expect(d?.value).toEqual({ kind: "single_day", date: "2026-07-01" });
    expect(d?.evidence[0].surface).toBe("session_context");
  });
  it("explicit date_input(form_input) → confirmed date_or_range", () => {
    const d = slotOf(bind([{ kind: "date_input", window: { kind: "single_day", date: "2026-07-01" }, surface: "form_input" }]).slots, "date_or_range");
    expect(d?.status).toBe("confirmed");
  });
  it("explicit destination_input(form_input) → confirmed destination_area", () => {
    const d = slotOf(bind([{ kind: "destination_input", areaText: "京都", surface: "form_input" }]).slots, "destination_area");
    expect(d?.status).toBe("confirmed");
    expect((d?.value as { areaText: string }).areaText).toBe("京都");
  });
  it("status は surface 由来で caller override 不能（status を注入しても無視）", () => {
    // @ts-expect-error event は status を持たない（注入を無視することを検証）
    const ev: SessionSurfaceEvent = { kind: "destination_input", areaText: "京都", surface: "form_input", status: "proposed" };
    expect(slotOf(bind([ev]).slots, "destination_area")?.status).toBe("confirmed");
  });
});

// ── 2. generic / entity / chat は hard を作らない ──────────────────────────────
describe("2. generic / manual_entity_evidence / chat は dest/date を作らない", () => {
  it("選択日/window event 無し（budget のみ）→ date/destination slot なし → provider missing", () => {
    const intake = bind([{ kind: "budget_input", value: { lo: 0, hi: 30000, confidence: 0.9, currency: "JPY" }, surface: "quick_action" }]);
    expect(slotOf(intake.slots, "date_or_range")).toBeUndefined();
    expect(slotOf(intake.slots, "destination_area")).toBeUndefined();
    const r = getProductionTravelInput(intake, PROD);
    expect(r.status).toBe("not_ready_missing");
    if (r.status === "not_ready_missing") {
      expect(r.missing).toContain("destination");
      expect(r.missing).toContain("date_or_range");
    }
  });
  it("manual_entity_evidence の event は drop（unknown_kind）・destination/date を作らない", () => {
    const res = bindTravelSessionIntakeWithDiagnostics({
      // @ts-expect-error union に存在しない種別（entity 側・hard 不可）
      events: [{ kind: "manual_entity_evidence", areaText: "京都" }],
      participantIds: ["P1"],
    });
    expect(res.intake.slots).toEqual([]);
    expect(res.diagnostics.some((d) => d.reason === "unknown_kind")).toBe(true);
  });
  it("chat 種別の event は drop（confirmed destination を作れない）", () => {
    const res = bindTravelSessionIntakeWithDiagnostics({
      // @ts-expect-error chat event は union に存在しない（raw chat / LLM なし）
      events: [{ kind: "chat_message", areaText: "京都", surface: "chat_message" }],
      participantIds: ["P1"],
    });
    expect(slotOf(res.intake.slots, "destination_area")).toBeUndefined();
  });
});

// ── 3. soft enrichment / private / participantIds ─────────────────────────────
describe("3. soft / private / participantIds", () => {
  it("budget/pace/mobility → soft slot", () => {
    const slots = bind([
      { kind: "budget_input", value: { lo: 0, hi: 30000, confidence: 0.9, currency: "JPY" }, surface: "quick_action" },
      { kind: "pace_input", value: "slow", surface: "form_input" },
      { kind: "mobility_input", value: { maxWalkKm: 3 }, surface: "form_input" },
    ]).slots;
    expect(slotOf(slots, "budget_band")).toBeDefined();
    expect(slotOf(slots, "pace")).toBeDefined();
    expect(slotOf(slots, "mobility_tolerance")).toBeDefined();
  });
  it("private red_line（participant 指定）→ server-side soft enrichment（visibility private・owner participant）", () => {
    const slots = bind([{ kind: "descriptor_input", slotKey: "red_line", value: { descriptorKey: "avoid", descriptorValue: "crowd" }, surface: "form_input", visibility: "private", participantId: "P1" }]).slots;
    const rl = slotOf(slots, "red_line");
    expect(rl?.visibility).toBe("private");
    expect(rl?.owner).toEqual({ kind: "participant", participantId: "P1" });
  });
  it("participantIds は slot でなく別供給で pass-through", () => {
    expect(bind([], { participantIds: ["P1", "P2"] }).participantIds).toEqual(["P1", "P2"]);
  });
});

// ── 4. fail-closed / normalizeSlot gate / retracted / partial ───────────────────
describe("4. fail-closed gate", () => {
  it("invalid 値（descriptorValue 空）→ normalize_rejected で drop（slot なし）", () => {
    const res = bindTravelSessionIntakeWithDiagnostics({ events: [{ kind: "descriptor_input", slotKey: "soft_preference", value: { descriptorKey: "prefer", descriptorValue: "" }, surface: "form_input" }], participantIds: ["P1"] });
    expect(slotOf(res.intake.slots, "soft_preference")).toBeUndefined();
    expect(res.diagnostics.some((d) => d.reason === "normalize_rejected")).toBe(true);
  });
  it("binding は retracted slot を産出しない（全 slot は confirmed/normalized）", () => {
    const slots = bind([{ kind: "destination_input", areaText: "京都", surface: "form_input" }, { kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } }]).slots;
    expect(slots.every((s) => s.status !== "retracted")).toBe(true);
  });
  it("provider: 手組み retracted destination は無視 → not_ready_missing（downstream firewall）", () => {
    const retractedDest: ExtractedSlot = { key: "destination_area", value: { areaText: "京都" }, status: "retracted", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [{ surface: "form_input", refId: "f:d" }] };
    const r = getProductionTravelInput({ slots: [retractedDest, { key: "date_or_range", value: { kind: "single_day", date: "2026-07-01" }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [{ surface: "form_input", refId: "f:t" }] }], participantIds: ["P1"] }, PROD);
    expect(r.status).toBe("not_ready_missing");
  });
  it("provider: partial fillState の destination は hard を満たさない → not_ready_unconfirmed", () => {
    const partialDest: ExtractedSlot = { key: "destination_area", value: { areaText: "京都" }, status: "confirmed", fillState: "partial", confidence: 0.5, owner: { kind: "shared" }, visibility: "shared", evidence: [{ surface: "form_input", refId: "f:d" }] };
    const r = getProductionTravelInput({ slots: [partialDest, { key: "date_or_range", value: { kind: "single_day", date: "2026-07-01" }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [{ surface: "form_input", refId: "f:t" }] }], participantIds: ["P1"] }, PROD);
    expect(r.status).toBe("not_ready_unconfirmed");
  });
});

// ── 5. end-to-end binding → provider → engine ─────────────────────────────────
describe("5. binding → provider → engine", () => {
  it("confirmed events → bind → getProductionTravelInput ready → runTravelPlanEngine output", () => {
    const intake = bind([
      { kind: "destination_input", areaText: "京都", surface: "form_input" },
      { kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } },
    ]);
    const provided = getProductionTravelInput(intake, PROD);
    expect(provided.status).toBe("ready");
    if (provided.status !== "ready") throw new Error("unreachable");
    const output = runTravelPlanEngine(provided.input);
    expect(output.inputError).toBeNull();
    expect(output.shared).toBeTruthy();
  });
});

// ── 6. source-contract（binding 純度）─────────────────────────────────────────
describe("6. binding source-contract", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/travel-session-binding.ts"), "utf8"));
  it("normalizeSlot + SURFACE_INITIAL_STATUS を使う（status DERIVE）", () => {
    expect(SRC).toContain("normalizeSlot");
    expect(SRC).toContain("SURFACE_INITIAL_STATUS");
  });
  it("engine / provider / display / projection / cues を呼ばない", () => {
    for (const f of ["runTravelPlanEngine", "getProductionTravelInput", "getSessionIntakeTravelInput", "toDisplayPacket", "buildPlanIntelligenceProjection", "deriveCoAlterProjectionCues"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("raw chat / LLM / NLP なし・fetch/DB/M2/route-weather-place なし", () => {
    expect(SRC).not.toMatch(/\bfetch\(/);
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\/api\//);
    expect(SRC).not.toMatch(/googleapis|weather|route\b/i);
    expect(SRC).not.toMatch(/m2|personalization|llm|openai|anthropic/i);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/)/i);
  });
});
