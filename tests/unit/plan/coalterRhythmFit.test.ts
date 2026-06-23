import { describe, it, expect } from "vitest";

import { COALTER_DEMO_PERSONALIZATION } from "@/app/(culcept)/plan/tabs/coalter/coalterPersonalizationFixture";
import { buildCoAlterRhythmFit } from "@/app/(culcept)/plan/tabs/coalter/coalterRhythmFit";
import type { AxisSnapshot, PersonalizationSnapshot } from "@/lib/shared/personalization/types";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

function ax(score: number, confidence: number): AxisSnapshot {
  return { score, confidence, observedAt: "2026-06-15T00:00:00.000Z" };
}
function snap(axes: Partial<Record<TraitAxisKey, AxisSnapshot>>): PersonalizationSnapshot {
  return { userId: "t", asOf: "2026-06-20T00:00:00.000Z", axes, hdm: null, dynamicState: null, decisionMeta: null };
}

describe("S3-3 CoAlter rhythm fit（energy_rhythm → 一日のかたち・捏造なし）", () => {
  it("TRAVEL demo: 両者 静か充電 → calm（ゆとり型）", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.travel;
    const r = buildCoAlterRhythmFit(self, partner, "Mio");
    expect(r?.kind).toBe("calm");
    expect(r?.shape.includes("余白")).toBe(true);
  });

  it("DAILY demo: energy_rhythm がズレ（self 活発 / Mio 静か）→ interleave（山と谷）", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.daily;
    const r = buildCoAlterRhythmFit(self, partner, "Mio");
    expect(r?.kind).toBe("interleave");
    expect(r?.shape.includes("Mio")).toBe(true);
    expect(r?.shape.includes("あなた")).toBe(true);
    expect(r?.shape.includes("山") && r?.shape.includes("谷")).toBe(true);
  });

  it("両者 活発消費 → active（テンポ型）", () => {
    const a = snap({ energy_rhythm: ax(0.5, 0.6) });
    const b = snap({ energy_rhythm: ax(0.4, 0.6) });
    const r = buildCoAlterRhythmFit(a, b, "Mio");
    expect(r?.kind).toBe("active");
  });

  it("interleave の向き: 静か側（Mio）が谷で休み、活発側（あなた）が軽めに動く", () => {
    const me = snap({ energy_rhythm: ax(0.5, 0.6) }); // 活発
    const other = snap({ energy_rhythm: ax(-0.5, 0.6) }); // 静か
    const r = buildCoAlterRhythmFit(me, other, "Mio");
    // 順序設計コピー: 「谷で Mio が休む間にあなたが軽めに動く」（静か側=休む・活発側=軽めに動く）。
    expect(r?.shape.includes("Mioが休む")).toBe(true);
    expect(r?.shape.includes("あなたが軽めに")).toBe(true);
  });

  it("honesty: 片側でも energy_rhythm 未観測 → null（リズムを捏造しない）", () => {
    const observed = snap({ energy_rhythm: ax(0.5, 0.6) });
    const missing = snap({ introvert_vs_extrovert: ax(-0.4, 0.6) }); // energy_rhythm なし
    expect(buildCoAlterRhythmFit(observed, missing, "Mio")).toBeNull();
  });

  it("honesty: 低 confidence（floor 未満）/ 中立（deadzone 内）は語らない → null", () => {
    const lowConf = snap({ energy_rhythm: ax(0.5, 0.2) }); // conf < 0.3
    const neutral = snap({ energy_rhythm: ax(0.1, 0.6) }); // |0.1| <= 0.2 deadzone
    expect(buildCoAlterRhythmFit(lowConf, snap({ energy_rhythm: ax(-0.5, 0.6) }), "Mio")).toBeNull();
    expect(buildCoAlterRhythmFit(neutral, snap({ energy_rhythm: ax(-0.5, 0.6) }), "Mio")).toBeNull();
  });

  it("raw 値非漏洩: kind/shape のみ（score/axis 値を持たない）", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.travel;
    const r = buildCoAlterRhythmFit(self, partner, "Mio");
    expect(r).not.toBeNull();
    if (r) expect(Object.keys(r).sort()).toEqual(["kind", "shape"]);
  });
});
