/**
 * T11-G1-C tests — server session/intake provider（confirmed-real・slot-key aware・hard/soft・missing/unconfirmed）。
 *
 * 設計正本: docs/t11-g1-session-intake-provider-design.md v2（+ CEO/GPT 補正: slot-key aware）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getSessionIntakeTravelInput,
  classifyTravelIntakePrerequisites,
  isHardSlotSatisfied,
} from "@/lib/shared/travel/session-intake-provider";
import { assertNoFixtureSource } from "@/lib/shared/travel/travel-input-provider";
import type { TravelIntakeInput } from "@/lib/shared/travel/travel-input-provider-types";
import type { ExtractedSlot, ExtractionSurface, SlotStatus, SlotFillState } from "@/lib/shared/travel/slot-types";

// ── slot builders ────────────────────────────────────────────────────────────
const slot = (
  key: ExtractedSlot["key"],
  value: ExtractedSlot["value"],
  surface: ExtractionSurface,
  over: Partial<{ status: SlotStatus; fillState: SlotFillState; visibility: "shared" | "private"; participantId: string }> = {},
): ExtractedSlot =>
  ({
    key,
    value,
    status: over.status ?? "confirmed",
    fillState: over.fillState ?? "filled",
    confidence: 1,
    owner: over.participantId ? { kind: "participant", participantId: over.participantId } : { kind: "shared" },
    visibility: over.visibility ?? "shared",
    evidence: [{ surface, refId: `${surface}:1` }],
  }) as ExtractedSlot;

const dest = (surface: ExtractionSurface, over = {}) => slot("destination_area", { areaText: "箱根" }, surface, over);
const date = (surface: ExtractionSurface, over = {}) => slot("date_or_range", { kind: "single_day", date: "2026-07-01" }, surface, over);
const softPref = (vis: "shared" | "private", pid: string, surface: ExtractionSurface = "chat_message") =>
  slot("soft_preference", { descriptorKey: "prefer", descriptorValue: "nature" }, surface, { status: "proposed", visibility: vis, participantId: pid });
const redLine = (vis: "shared" | "private", pid: string) =>
  slot("red_line", { descriptorKey: "avoid", descriptorValue: "crowd" }, "chat_message", { status: "proposed", visibility: vis, participantId: pid });

const intake = (over: Partial<TravelIntakeInput> = {}): TravelIntakeInput => ({
  slots: [dest("form_input"), date("form_input")],
  participantIds: ["P1"],
  ...over,
});

// ════════════════════════════════════════════════════════════════════════════
describe("1. 完全 confirmed intake → ready・real_only", () => {
  it("destination/date confirmed + participants 妥当 → ready・provenance real_only(session_slots/user_intake)・dev_fixture なし", () => {
    const r = getSessionIntakeTravelInput(intake());
    expect(r.status).toBe("ready");
    if (r.status === "ready") {
      expect(r.provenance.realOnly).toBe(true);
      expect(r.provenance.sources).not.toContain("dev_fixture");
      expect(r.provenance.sources).toContain("user_intake");
      expect(() => assertNoFixtureSource(r.provenance)).not.toThrow();
      expect(r.input.participantIds).toEqual(["P1"]);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. hard 不足 → not_ready（missing / unconfirmed 分離・input なし）", () => {
  it("destination 欠如 → missing:[destination]", () => {
    const r = getSessionIntakeTravelInput(intake({ slots: [date("form_input")] }));
    expect(r.status).toBe("not_ready");
    if (r.status === "not_ready") {
      expect(r.missing).toContain("destination");
      expect("input" in r).toBe(false);
    }
  });
  it("date 欠如 → missing:[date_or_range]", () => {
    const r = getSessionIntakeTravelInput(intake({ slots: [dest("form_input")] }));
    if (r.status === "not_ready") expect(r.missing).toContain("date_or_range");
  });
  it("proposed destination（chat）→ unconfirmed:[destination]（聞くでなく確認させる）", () => {
    const r = getSessionIntakeTravelInput(intake({ slots: [dest("chat_message", { status: "proposed" }), date("form_input")] }));
    if (r.status === "not_ready") {
      expect(r.unconfirmed).toContain("destination");
      expect(r.missing).not.toContain("destination");
    }
  });
  it("proposed date（chat）→ unconfirmed:[date_or_range]", () => {
    const r = getSessionIntakeTravelInput(intake({ slots: [dest("form_input"), date("chat_message", { status: "proposed" })] }));
    if (r.status === "not_ready") expect(r.unconfirmed).toContain("date_or_range");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. retracted / partial / 派生 normalized は hard を満たさない", () => {
  it("retracted destination は無視 → 他に無ければ missing", () => {
    const r = getSessionIntakeTravelInput(intake({ slots: [dest("form_input", { status: "retracted" }), date("form_input")] }));
    if (r.status === "not_ready") expect(r.missing).toContain("destination");
  });
  it("partial fillState は不充足（unconfirmed）", () => {
    const r = getSessionIntakeTravelInput(intake({ slots: [dest("form_input", { fillState: "partial" }), date("form_input")] }));
    if (r.status === "not_ready") expect(r.unconfirmed).toContain("destination");
  });
  it("派生のみ normalized destination（profile_prior/relation/after_action）は hard 不充足", () => {
    for (const s of ["profile_prior", "relation_context", "after_action"] as ExtractionSurface[]) {
      expect(isHardSlotSatisfied(dest(s, { status: "normalized" }))).toBe(false);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. ★slot-key aware: session_context は date を満たすが destination を満たさない", () => {
  it("session_context-normalized date → confirmed", () => {
    expect(isHardSlotSatisfied(date("session_context", { status: "normalized" }))).toBe(true);
    expect(classifyTravelIntakePrerequisites(intake({ slots: [dest("form_input"), date("session_context", { status: "normalized" })] })).date_or_range).toBe("confirmed");
  });
  it("session_context-normalized destination → 不充足（generic context が destination を満たさない・fail-closed）", () => {
    expect(isHardSlotSatisfied(dest("session_context", { status: "normalized" }))).toBe(false);
    const r = getSessionIntakeTravelInput(intake({ slots: [dest("session_context", { status: "normalized" }), date("form_input")] }));
    if (r.status === "not_ready") expect(r.unconfirmed).toContain("destination");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. participants 検証（1–2・unique・viewer 範囲内）", () => {
  it("0 人 → not_ready", () => {
    expect(getSessionIntakeTravelInput(intake({ participantIds: [] })).status).toBe("not_ready");
  });
  it(">2 人 → not_ready(unconfirmed)", () => {
    const r = getSessionIntakeTravelInput(intake({ participantIds: ["P1", "P2", "P3"] }));
    if (r.status === "not_ready") expect(r.unconfirmed).toContain("participants");
  });
  it("重複 participantIds → not_ready", () => {
    expect(getSessionIntakeTravelInput(intake({ participantIds: ["P1", "P1"] })).status).toBe("not_ready");
  });
  it("viewerId が participantIds 外 → not_ready", () => {
    expect(getSessionIntakeTravelInput(intake({ participantIds: ["P1"], viewerId: "PX" })).status).toBe("not_ready");
  });
  it("viewerId が participantIds 内 → ready", () => {
    expect(getSessionIntakeTravelInput(intake({ participantIds: ["P1", "P2"], viewerId: "P1" })).status).toBe("ready");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. soft/private slot は input に流入（server-only）・readiness を妨げない", () => {
  it("proposed/派生 soft + private red_line/soft_pref があっても ready・input に含まれる", () => {
    const r = getSessionIntakeTravelInput(intake({ slots: [dest("form_input"), date("form_input"), softPref("private", "P1"), redLine("private", "P1"), softPref("shared", "P2")] }));
    expect(r.status).toBe("ready");
    if (r.status === "ready") {
      expect(r.input.slots.some((s) => s.key === "red_line" && s.visibility === "private")).toBe(true);
      expect(r.input.slots.some((s) => s.key === "soft_preference")).toBe(true);
    }
  });
  it("retracted slot は input から除外", () => {
    const r = getSessionIntakeTravelInput(intake({ slots: [dest("form_input"), date("form_input"), slot("red_line", { descriptorKey: "avoid", descriptorValue: "x" }, "chat_message", { status: "retracted" })] }));
    if (r.status === "ready") expect(r.input.slots.some((s) => s.status === "retracted")).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("7. 純度: engine/display/外部を呼ばない・import 純度", () => {
  it("provider は engine/display chain/外部を import せず env/Date.now/fetch なし", () => {
    const stripComments = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    const src = stripComments(readFileSync(resolve(process.cwd(), "lib/shared/travel/session-intake-provider.ts"), "utf8"));
    for (const f of ["process.env", "Date.now", "Math.random", "supabase"]) expect(src).not.toContain(f);
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/from ["']next/);
    expect(src).not.toMatch(/from ["'][^"']*(\/engine["']|engine-consume|plan-intelligence|coalter-projection|components|app\/|dev-fixture)/);
    expect(src).not.toMatch(/runTravelPlanEngine|toDisplayPacket|buildPlanIntelligenceProjection|deriveCoAlterProjectionCues/);
  });
});
