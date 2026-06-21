import { describe, it, expect } from "vitest";
import {
  derivePlanParams,
  deriveTravelTraits,
  CONFIDENCE_FLOOR,
} from "@/lib/shared/personalization/derive";
import type { PersonalizationSnapshot } from "@/lib/shared/personalization/types";
import { TRAVEL_TRAIT_KEYS_V0 } from "@/lib/shared/personalization/types";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

function snapshot(
  axes: Partial<Record<TraitAxisKey, { score: number; confidence: number }>> = {},
): PersonalizationSnapshot {
  const full: PersonalizationSnapshot["axes"] = {};
  for (const [k, v] of Object.entries(axes)) {
    full[k as TraitAxisKey] = { score: v!.score, confidence: v!.confidence, observedAt: "2026-06-12T00:00:00Z" };
  }
  return {
    userId: "u1",
    asOf: "2026-06-12T09:00:00Z",
    axes: full,
    hdm: null,
    dynamicState: null,
    decisionMeta: null,
  };
}

describe("derivePlanParams — null-safe / 源泉欠損", () => {
  it("空 snapshot では全 param が中立 default + confidence 0", () => {
    const p = derivePlanParams(snapshot());
    expect(p.paceDefault).toEqual({ value: "normal", confidence: 0, source: "default" });
    expect(p.densityCap).toEqual({ value: 3, confidence: 0, source: "default" });
    expect(p.noveltyBias).toEqual({ value: 0, confidence: 0, source: "default" });
    expect(p.precommitPreference).toEqual({ value: 0.5, confidence: 0, source: "default" });
    expect(p.socialLoadTolerance).toEqual({ value: 0.5, confidence: 0, source: "default" });
    expect(p.budgetPosture).toEqual({ value: "balanced", confidence: 0, source: "default" });
    expect(p.bufferMargin).toEqual({ value: 0.5, confidence: 0, source: "default" });
    expect(p.explanationTone).toEqual({ value: "reason_first", confidence: 0, source: "default" });
  });

  it("morningness は源泉軸が存在しないため常に default 0.5 / confidence 0（捏造しない）", () => {
    const rich = snapshot({
      energy_rhythm: { score: 1, confidence: 1 },
      plan_vs_spontaneous: { score: -1, confidence: 1 },
    });
    expect(derivePlanParams(rich).morningness).toEqual({ value: 0.5, confidence: 0, source: "default" });
  });

  it("confidence が floor 未満なら値は中立 default に丸め、confidence は実測値を保持", () => {
    const p = derivePlanParams(
      snapshot({ tradition_vs_novelty: { score: 1, confidence: 0.2 } }),
    );
    expect(p.noveltyBias.source).toBe("default");
    expect(p.noveltyBias.value).toBe(0);
    expect(p.noveltyBias.confidence).toBeGreaterThan(0);
    expect(p.noveltyBias.confidence).toBeLessThan(CONFIDENCE_FLOOR);
  });
});

describe("derivePlanParams — 写像方向（v0）", () => {
  it("量・活発寄り（高確信）→ intense / densityCap 5", () => {
    const p = derivePlanParams(
      snapshot({
        quality_vs_quantity: { score: 1, confidence: 1 },
        energy_rhythm: { score: 1, confidence: 1 },
      }),
    );
    expect(p.paceDefault).toMatchObject({ value: "intense", source: "derived" });
    expect(p.densityCap).toMatchObject({ value: 5, source: "derived" });
  });

  it("質・充電寄り（高確信）→ slow / densityCap 2", () => {
    const p = derivePlanParams(
      snapshot({
        quality_vs_quantity: { score: -1, confidence: 1 },
        energy_rhythm: { score: -1, confidence: 1 },
      }),
    );
    expect(p.paceDefault.value).toBe("slow");
    expect(p.densityCap.value).toBe(2);
  });

  it("invert: 「変化を歓迎」(score -1) は noveltyBias を正に押す", () => {
    const p = derivePlanParams(
      snapshot({ change_embrace_vs_resist: { score: -1, confidence: 0.95 } }),
    );
    expect(p.noveltyBias.source).toBe("derived");
    expect(p.noveltyBias.value).toBeGreaterThan(0);
  });

  it("計画的 (plan_vs_spontaneous=-1) → precommitPreference 1.0", () => {
    const p = derivePlanParams(
      snapshot({ plan_vs_spontaneous: { score: -1, confidence: 1 } }),
    );
    expect(p.precommitPreference).toMatchObject({ value: 1, source: "derived" });
  });

  it("表現重視+質重視 → budgetPosture quality / 論理判断 → reason_first", () => {
    const p = derivePlanParams(
      snapshot({
        function_vs_expression: { score: 1, confidence: 1 },
        quality_vs_quantity: { score: -1, confidence: 1 },
        rational_vs_emotional_decision: { score: -1, confidence: 1 },
      }),
    );
    expect(p.budgetPosture.value).toBe("quality");
    expect(p.explanationTone.value).toBe("reason_first");
  });

  it("感情判断 (rational_vs_emotional_decision=+1) → feeling_first", () => {
    const p = derivePlanParams(
      snapshot({ rational_vs_emotional_decision: { score: 1, confidence: 1 } }),
    );
    expect(p.explanationTone.value).toBe("feeling_first");
  });

  it("決定論: 同一入力 → 深い等価", () => {
    const s = snapshot({
      cautious_vs_bold: { score: -0.6, confidence: 0.8 },
      introvert_vs_extrovert: { score: 0.4, confidence: 0.7 },
    });
    expect(derivePlanParams(s)).toEqual(derivePlanParams(s));
  });
});

describe("deriveTravelTraits — v0", () => {
  it("空 snapshot では全 trait が default 0 / confidence 0、key set は決定論", () => {
    const t = deriveTravelTraits(snapshot());
    expect(t.version).toBe("v0");
    expect(Object.keys(t.traits).sort()).toEqual([...TRAVEL_TRAIT_KEYS_V0].sort());
    for (const key of TRAVEL_TRAIT_KEYS_V0) {
      expect(t.traits[key]).toEqual({ value: 0, confidence: 0, source: "default" });
    }
  });

  it("新奇寄り高確信 → noveltySeeking 正 / 単軸 passthrough（planningStyle）", () => {
    const t = deriveTravelTraits(
      snapshot({
        tradition_vs_novelty: { score: 1, confidence: 1 },
        novelty_threshold: { score: 1, confidence: 1 },
        change_embrace_vs_resist: { score: -1, confidence: 1 },
        plan_vs_spontaneous: { score: 0.8, confidence: 0.9 },
      }),
    );
    expect(t.traits.noveltySeeking).toMatchObject({ value: 1, source: "derived" });
    expect(t.traits.planningStyle.source).toBe("derived");
    expect(t.traits.planningStyle.value).toBeCloseTo(0.8, 5);
  });

  it("crowdTolerance は proxy のため confidence が減衰する（単軸 conf 0.6 では default 落ち）", () => {
    const t = deriveTravelTraits(
      snapshot({ introvert_vs_extrovert: { score: 1, confidence: 0.6 } }),
    );
    // damp 0.5 × coverage(1/1.7) ≈ 0.18 < floor → default
    expect(t.traits.crowdTolerance.source).toBe("default");
    expect(t.traits.crowdTolerance.value).toBe(0);
    // 同じ単軸でも socialOrientation（非 proxy）は derived
    expect(t.traits.socialOrientation.source).toBe("derived");
  });
});
