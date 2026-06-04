import { describe, it, expect } from "vitest";
import { buildExplanationCopy } from "@/lib/plan/mobility/explanationCopy";
import type { MobilityHypothesis, ContextNote } from "@/lib/plan/mobility/mobilityHypothesis";
import type { GateDecision } from "@/lib/plan/mobility/necessityGate";

function hyp(p: Partial<MobilityHypothesis>): MobilityHypothesis {
  return {
    legKey: "a__b",
    habitualMode: "train",
    habitualStrength: "moderate",
    contextNote: null,
    todayLikelyMode: "train",
    alternatives: [],
    signalStrength: 0.75,
    ...p,
  };
}
const surfaceGate = (reason: GateDecision["reason"] = "surface_habitual"): GateDecision => ({
  surface: true,
  reason,
});
const silentGate = (reason: GateDecision["reason"]): GateDecision => ({ surface: false, reason });
const RAIN_WALK: ContextNote = { kind: "outdoor_burden", reason: "rain", aboutMode: "walk" };
const HEAT_BICYCLE: ContextNote = { kind: "outdoor_burden", reason: "heat", aboutMode: "bicycle" };

describe("buildExplanationCopy (v0-C copy engine・最大ケース)", () => {
  // ── 沈黙系 ──
  it("gate sensitive → 沈黙（copy なし・reasonCode passthrough）", () => {
    const c = buildExplanationCopy(hyp({}), silentGate("sensitive"));
    expect(c.surface).toBe(false);
    expect(c.headline).toBeNull();
    expect(c.reasonCode).toBe("sensitive");
    expect(c.alternativeLabels).toEqual([]);
  });
  it("gate cold_start → 沈黙", () => {
    expect(buildExplanationCopy(hyp({ habitualMode: null }), silentGate("cold_start")).surface).toBe(false);
  });
  it("gate low_signal → 沈黙", () => {
    expect(buildExplanationCopy(hyp({ habitualStrength: "weak" }), silentGate("low_signal")).surface).toBe(false);
  });
  it("防御: surface だが habitual unknown → 沈黙 fallback", () => {
    expect(buildExplanationCopy(hyp({ habitualMode: "unknown" }), surfaceGate()).surface).toBe(false);
  });
  it("防御: surface だが habitual null → 沈黙 fallback", () => {
    expect(buildExplanationCopy(hyp({ habitualMode: null }), surfaceGate()).surface).toBe(false);
  });

  // ── habitual_only ──
  it("habitual_only moderate: headline + 多め rationale + correction・contextNote なし", () => {
    const c = buildExplanationCopy(hyp({ habitualMode: "train", habitualStrength: "moderate" }), surfaceGate());
    expect(c.surface).toBe(true);
    expect(c.scenario).toBe("habitual_only");
    expect(c.headline).toBe("いつもは電車を選びがちです。");
    expect(c.rationale).toBe("この区間では、電車が多めです。");
    expect(c.contextNoteText).toBeNull();
    expect(c.correctionPrompt).toBe("違うなら選び直せます。");
  });
  it("habitual_only strong: rationale が「何度も」", () => {
    const c = buildExplanationCopy(hyp({ habitualMode: "train", habitualStrength: "strong" }), surfaceGate());
    expect(c.rationale).toBe("この区間では、何度も電車を選んでいます。");
  });

  // ── habitual_with_context ──
  it("徒歩 + 雨: contextNoteText（雨・noun 接続）", () => {
    const c = buildExplanationCopy(
      hyp({ habitualMode: "walk", todayLikelyMode: "walk", contextNote: RAIN_WALK }),
      surfaceGate("surface_with_context"),
    );
    expect(c.scenario).toBe("habitual_with_context");
    expect(c.headline).toBe("いつもは徒歩を選びがちです。");
    expect(c.contextNoteText).toBe("今日は雨なので、徒歩は少し負担かもしれません。");
  });
  it("自転車 + 暑さ: contextNoteText（暑い・i-adj 接続）", () => {
    const c = buildExplanationCopy(
      hyp({ habitualMode: "bicycle", todayLikelyMode: "bicycle", contextNote: HEAT_BICYCLE }),
      surfaceGate("surface_with_context"),
    );
    expect(c.contextNoteText).toBe("今日は暑いので、自転車は少し負担かもしれません。");
  });

  // ── alternatives none / one / multiple ──
  it("alternatives none → ラベル []", () => {
    expect(buildExplanationCopy(hyp({ alternatives: [] }), surfaceGate()).alternativeLabels).toEqual([]);
  });
  it("alternatives one → ラベル1つ", () => {
    expect(buildExplanationCopy(hyp({ alternatives: ["walk"] }), surfaceGate()).alternativeLabels).toEqual(["徒歩"]);
  });
  it("alternatives multiple → 複数ラベル", () => {
    expect(buildExplanationCopy(hyp({ alternatives: ["walk", "bus"] }), surfaceGate()).alternativeLabels).toEqual(["徒歩", "バス"]);
  });

  // ── 禁則 ──
  it("禁則: 全 copy に 数字/%/「あなた」/「おすすめ」を含まない", () => {
    const cases = [
      buildExplanationCopy(
        hyp({ habitualMode: "walk", habitualStrength: "strong", todayLikelyMode: "walk", contextNote: RAIN_WALK, alternatives: ["train"] }),
        surfaceGate("surface_with_context"),
      ),
      buildExplanationCopy(
        hyp({ habitualMode: "car", habitualStrength: "moderate", todayLikelyMode: "car", alternatives: ["taxi", "train"] }),
        surfaceGate(),
      ),
    ];
    for (const c of cases) {
      const text = [c.headline, c.rationale, c.contextNoteText, c.correctionPrompt].filter(Boolean).join(" ");
      expect(text).not.toMatch(/[0-9０-９%％]/);
      expect(text).not.toContain("あなた");
      expect(text).not.toContain("おすすめ");
    }
  });
});
