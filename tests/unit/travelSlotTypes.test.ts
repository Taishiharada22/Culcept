import { describe, it, expect, expectTypeOf } from "vitest";
import {
  TRAVEL_SLOT_KEYS,
  SLOT_STATUSES,
  SLOT_FILL_STATES,
  EXTRACTION_SURFACES,
  SURFACE_INITIAL_STATUS,
  SURFACE_IS_EXPLICIT,
  SURFACE_DEFAULT_VISIBILITY,
  DESCRIPTOR_KEYS,
  MISSING_SLOT_PRIORITIES,
  type ExtractedSlot,
  type ExtractedSlotSet,
  type EvidenceRef,
  type SlotBase,
} from "@/lib/shared/travel/slot-types";
import type { BudgetBand, Pace } from "@/lib/shared/travel/core-types";
import {
  markEngineOnly,
  assertNoEngineOnlyLeak,
  EngineOnlyLeakError,
} from "@/lib/shared/personalization/engineOnly";

// 共通フィールドの factory（テスト用）
const base = (over: Partial<SlotBase> = {}): SlotBase => ({
  status: "confirmed",
  fillState: "filled",
  confidence: 0.9,
  owner: { kind: "shared" },
  visibility: "shared",
  evidence: [],
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. enum / as-const exhaustiveness
// ─────────────────────────────────────────────────────────────────────────────
describe("enum / as-const exhaustiveness", () => {
  it("固定セット（要素・重複なし）", () => {
    expect(TRAVEL_SLOT_KEYS).toEqual([
      "destination_area",
      "date_or_range",
      "time_window",
      "budget_band",
      "pace",
      "mobility_tolerance",
      "red_line",
      "soft_preference",
    ]);
    expect(SLOT_STATUSES).toEqual(["proposed", "normalized", "confirmed", "retracted"]);
    expect(SLOT_FILL_STATES).toEqual(["filled", "partial", "missing"]);
    expect(MISSING_SLOT_PRIORITIES).toEqual(["required", "recommended", "optional"]);
    expect(DESCRIPTOR_KEYS).toContain("scene");
    for (const arr of [TRAVEL_SLOT_KEYS, SLOT_STATUSES, SLOT_FILL_STATES, EXTRACTION_SURFACES, DESCRIPTOR_KEYS, MISSING_SLOT_PRIORITIES]) {
      expect(new Set(arr).size).toBe(arr.length);
    }
  });

  it("EXTRACTION_SURFACES は session_context を含む 7 種", () => {
    expect(EXTRACTION_SURFACES).toContain("session_context");
    expect(EXTRACTION_SURFACES.length).toBe(7);
  });

  it("3 つの surface メタデータ map は全 surface を網羅", () => {
    const surfaces = [...EXTRACTION_SURFACES].sort();
    expect(Object.keys(SURFACE_INITIAL_STATUS).sort()).toEqual(surfaces);
    expect(Object.keys(SURFACE_IS_EXPLICIT).sort()).toEqual(surfaces);
    expect(Object.keys(SURFACE_DEFAULT_VISIBILITY).sort()).toEqual(surfaces);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ★① date_or_range は session context からも chat/form からも来られる
// ─────────────────────────────────────────────────────────────────────────────
describe("date_or_range は session_context / chat / form のいずれからも構成可能", () => {
  const dateSlot = (surface: EvidenceRef["surface"], over: Partial<SlotBase> = {}): ExtractedSlot => ({
    ...base({ evidence: [{ surface, refId: `${surface}:1` }], ...over }),
    key: "date_or_range",
    value: { kind: "single_day", date: "2026-07-01" }, // 具体 TravelPlanWindow（T1A 互換）
  });

  it("session_context 由来（注入された選択日）が valid", () => {
    const s = dateSlot("session_context");
    expect(s.evidence[0].surface).toBe("session_context");
    expect(s.value).toEqual({ kind: "single_day", date: "2026-07-01" });
  });

  it("chat_message 由来（fuzzy も可）/ form_input 由来（具体）が valid", () => {
    const fromForm = dateSlot("form_input");
    const fromChat: ExtractedSlot = {
      ...base({ status: "proposed", fillState: "partial", evidence: [{ surface: "chat_message", refId: "m1", speakerParticipantId: "P1" }] }),
      key: "date_or_range",
      value: { kind: "fuzzy", descriptor: "next_month" },
    };
    expect(fromForm.value).toMatchObject({ kind: "single_day" });
    expect(fromChat.value).toEqual({ kind: "fuzzy", descriptor: "next_month" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ★② 構造化 surface は confirmed 直行可
// ─────────────────────────────────────────────────────────────────────────────
describe("構造化 surface は confirmed 初期 status", () => {
  it("quick_action / adjustment_card / form_input は initialStatus=confirmed・explicit=true", () => {
    for (const s of ["quick_action", "adjustment_card", "form_input"] as const) {
      expect(SURFACE_INITIAL_STATUS[s]).toBe("confirmed");
      expect(SURFACE_IS_EXPLICIT[s]).toBe(true);
    }
  });

  it("quick_action から confirmed slot を直接構成できる", () => {
    const slot: ExtractedSlot = {
      ...base({ status: "confirmed", evidence: [{ surface: "quick_action", refId: "act:budget_down" }] }),
      key: "budget_band",
      value: { lo: 0, hi: 27000, confidence: 1, currency: "JPY" },
    };
    expect(slot.status).toBe("confirmed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. chat / LLM 候補は proposed のまま
// ─────────────────────────────────────────────────────────────────────────────
describe("chat / LLM 候補は proposed", () => {
  it("chat_message は initialStatus=proposed・explicit=false", () => {
    expect(SURFACE_INITIAL_STATUS.chat_message).toBe("proposed");
    expect(SURFACE_IS_EXPLICIT.chat_message).toBe(false);
  });

  it("chat 由来 soft_preference を proposed で構成できる", () => {
    const slot: ExtractedSlot = {
      ...base({ status: "proposed", owner: { kind: "participant", participantId: "P2" }, evidence: [{ surface: "chat_message", refId: "m25", speakerParticipantId: "P2" }] }),
      key: "soft_preference",
      value: { descriptorKey: "scene", descriptorValue: "conversational" },
    };
    expect(slot.status).toBe("proposed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. ★③ relation_context は default private・explicit shared 可
// ─────────────────────────────────────────────────────────────────────────────
describe("relation_context: default private / explicit shared allowed", () => {
  it("default visibility は private", () => {
    expect(SURFACE_DEFAULT_VISIBILITY.relation_context).toBe("private");
    expect(SURFACE_DEFAULT_VISIBILITY.profile_prior).toBe("private");
    expect(SURFACE_DEFAULT_VISIBILITY.chat_message).toBe("shared");
  });

  it("relation_context slot を shared として構成することは型上許可される（explicit shared）", () => {
    const sharedRelation: ExtractedSlot = {
      ...base({ visibility: "shared", evidence: [{ surface: "relation_context", refId: "rel:summary:shared1" }] }),
      key: "soft_preference",
      value: { descriptorKey: "prefer", descriptorValue: "calm" },
    };
    expect(sharedRelation.visibility).toBe("shared");
    // 既定 private と「明示 shared 可」が両立することの確認
    expect(SURFACE_DEFAULT_VISIBILITY.relation_context).toBe("private");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. evidence は id のみ・本文を持たない / 8. source kind・provider を要求しない
// ─────────────────────────────────────────────────────────────────────────────
describe("EvidenceRef は参照のみ・3 直交を崩さない", () => {
  it("evidence のキーは {surface, refId, speakerParticipantId?} のみ・本文/provider/sourceKind を持たない", () => {
    const ev: EvidenceRef = { surface: "chat_message", refId: "m1", speakerParticipantId: "P1" };
    const keys = Object.keys(ev);
    for (const k of keys) {
      expect(["surface", "refId", "speakerParticipantId"]).toContain(k);
      expect(/text|body|message|content|raw|provider|sourceKind|adapter|mode/i.test(k)).toBe(false);
    }
  });

  it("participant source / adapter provider なしで evidence を構成できる（id だけで足りる）", () => {
    const minimal: EvidenceRef = { surface: "form_input", refId: "form:date" };
    expect(minimal.speakerParticipantId).toBeUndefined();
    // owner も participantId（id）のみで source kind を要求しない
    const slot: ExtractedSlot = { ...base({ owner: { kind: "participant", participantId: "P1" } }), key: "pace", value: "slow" };
    expect(slot.owner).toEqual({ kind: "participant", participantId: "P1" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. profile_prior は生 axis score 形を持てない（band/enum のみ）
// ─────────────────────────────────────────────────────────────────────────────
describe("privacy: profile_prior は生 axis score 形を持てない", () => {
  type RawAxisShape = { score: number; confidence: number; observedAt: string };

  it("型レベル: M2 AxisSnapshot 形は BudgetBand / Pace に代入できない", () => {
    expectTypeOf<RawAxisShape>().not.toMatchTypeOf<BudgetBand>();
    expectTypeOf<RawAxisShape>().not.toMatchTypeOf<Pace>();
  });

  it("runtime: profile_prior 由来 budget slot は band キーを持ち axis キーを持たない", () => {
    const priorBudget: ExtractedSlot = {
      ...base({ status: "normalized", visibility: "private", evidence: [{ surface: "profile_prior", refId: "m2:planParams.budgetPosture" }] }),
      key: "budget_band",
      value: { lo: 20000, hi: 30000, confidence: 0.7, currency: "JPY" },
    };
    const vKeys = Object.keys(priorBudget.value);
    expect(vKeys.sort()).toEqual(["confidence", "currency", "hi", "lo"]);
    expect(vKeys).not.toContain("score");
    expect(vKeys).not.toContain("axis_id");
    expect(vKeys).not.toContain("observedAt");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EngineOnly 互換: branded value を埋めると assertNoEngineOnlyLeak が弾く
// ─────────────────────────────────────────────────────────────────────────────
describe("ExtractedSlotSet は assertNoEngineOnlyLeak 互換", () => {
  const cleanSet = (): ExtractedSlotSet => ({
    participantIds: ["P1", "P2"],
    slots: [
      { ...base(), key: "budget_band", value: { lo: 0, hi: 30000, confidence: 0.8, currency: "JPY" } },
      { ...base({ owner: { kind: "participant", participantId: "P1" }, visibility: "private", evidence: [{ surface: "chat_message", refId: "m1", speakerParticipantId: "P1" }] }), key: "time_window", value: { returnByMin: 1200 } },
    ],
    missingSlotQuestions: [{ slotKey: "destination_area", priority: "required", questionIntent: "ask_destination" }],
  });

  it("clean な set は通過する", () => {
    expect(() => assertNoEngineOnlyLeak(cleanSet())).not.toThrow();
  });

  it("EngineOnly ブランド付き value を埋め込むと throw する（slot value にしてはならない）", () => {
    const tainted = cleanSet();
    const engineBudget = markEngineOnly<BudgetBand>({ lo: 0, hi: 99999, confidence: 1, currency: "JPY" });
    tainted.slots.push({ ...base(), key: "budget_band", value: engineBudget });
    expect(() => assertNoEngineOnlyLeak(tainted)).toThrow(EngineOnlyLeakError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 型レベル: key で value が discriminate される
// ─────────────────────────────────────────────────────────────────────────────
describe("discriminated union（key→value）", () => {
  it("key=budget_band の value は BudgetBand に narrow される", () => {
    const slot: ExtractedSlot = { ...base(), key: "budget_band", value: { lo: 1, hi: 2, confidence: 0.5, currency: "JPY" } };
    if (slot.key === "budget_band") {
      expectTypeOf(slot.value).toEqualTypeOf<BudgetBand>();
    }
    expect(slot.key).toBe("budget_band");
  });
});
