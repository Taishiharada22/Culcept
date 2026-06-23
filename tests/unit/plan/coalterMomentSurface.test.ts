import { describe, it, expect } from "vitest";

import { COALTER_DEMO_PERSONALIZATION } from "@/app/(culcept)/plan/tabs/coalter/coalterPersonalizationFixture";
import { COALTER_DEMO_TIMELINE, type CoAlterDayMoment } from "@/app/(culcept)/plan/tabs/coalter/coalterMomentTimeline";
import { buildCoAlterMomentSurface } from "@/app/(culcept)/plan/tabs/coalter/coalterMomentSurface";
import type { AxisSnapshot, PersonalizationSnapshot } from "@/lib/shared/personalization/types";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

function ax(score: number, confidence: number): AxisSnapshot {
  return { score, confidence, observedAt: "2026-06-15T00:00:00.000Z" };
}
function snap(axes: Partial<Record<TraitAxisKey, AxisSnapshot>>): PersonalizationSnapshot {
  return { userId: "t", asOf: "2026-06-20T00:00:00.000Z", axes, hdm: null, dynamicState: null, decisionMeta: null };
}

describe("S3-2 CoAlter moment surface（次の負荷 × 弱い人 → ケア一言・honesty）", () => {
  it("DAILY demo: 次の social 負荷（12:00 人気カフェ）で内向の Mio を先回り", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.daily;
    const tl = COALTER_DEMO_TIMELINE.daily;
    const m = buildCoAlterMomentSurface(tl.moments, tl.nowMin, self, partner, "Mio");
    expect(m).not.toBeNull();
    expect(m?.timeLabel).toBe("12:00");
    expect(m?.momentLabel).toContain("カフェ");
    expect(m?.nudge.includes("Mio")).toBe(true);
    expect(m?.nudge.includes("人混み")).toBe(true); // 即時アクション register（forecast の「静かな時間」と被らない）
    expect(m?.nudge.includes("静かな時間")).toBe(false); // forecast 助言の語をエコーしない
  });

  it("TRAVEL demo: 次の novelty 負荷（14:00 路地裏散策）で定番の Mio を先回り", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.travel;
    const tl = COALTER_DEMO_TIMELINE.travel;
    const m = buildCoAlterMomentSurface(tl.moments, tl.nowMin, self, partner, "Mio");
    expect(m).not.toBeNull();
    expect(m?.timeLabel).toBe("14:00");
    expect(m?.nudge.includes("Mio")).toBe(true);
    expect(m?.nudge.includes("不慣れ")).toBe(true); // 即時アクション register
    expect(m?.nudge.includes("定番を軸")).toBe(false); // forecast 助言の語をエコーしない
  });

  it("両者とも弱い場合は『お二人とも』で出す（pace: 双方ゆっくり）", () => {
    // 双方 ゆっくり（pacePreference 負）→ pace 負荷 moment で both。
    const both = snap({ quality_vs_quantity: ax(-0.5, 0.7), energy_rhythm: ax(-0.5, 0.7) });
    const moments: CoAlterDayMoment[] = [{ atMin: 600, label: "駆け足観光", stressor: "pace" }];
    const m = buildCoAlterMomentSurface(moments, 540, both, both, "Mio");
    expect(m?.nudge.includes("お二人とも")).toBe(true);
  });

  it("honesty: 次の負荷に誰も confident に弱くない → null（状態を捏造しない）", () => {
    // social 負荷だが、両者とも社交軸を持たない（travel demo）→ 弱い人を特定できない → null。
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.travel;
    const moments: CoAlterDayMoment[] = [{ atMin: 600, label: "人混み", stressor: "social" }];
    const m = buildCoAlterMomentSurface(moments, 540, self, partner, "Mio");
    expect(m).toBeNull();
  });

  it("honesty: now 以降に負荷 moment が無ければ null", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.daily;
    const moments: CoAlterDayMoment[] = [
      { atMin: 600, label: "出発", stressor: null },
      { atMin: 720, label: "カフェ", stressor: "social" },
    ];
    // now=800（カフェ 720 はもう過ぎた）→ 以降に負荷なし → null。
    const m = buildCoAlterMomentSurface(moments, 800, self, partner, "Mio");
    expect(m).toBeNull();
  });

  it("最初に来る負荷 moment を選ぶ（now 以降で時刻最小・stressor あり）", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.daily;
    const moments: CoAlterDayMoment[] = [
      { atMin: 700, label: "移動", stressor: null },
      { atMin: 720, label: "最初の混雑", stressor: "social" },
      { atMin: 900, label: "次の混雑", stressor: "social" },
    ];
    const m = buildCoAlterMomentSurface(moments, 650, self, partner, "Mio");
    expect(m?.timeLabel).toBe("12:00"); // 720 を選ぶ（900 ではない）
    expect(m?.momentLabel).toBe("最初の混雑");
  });

  it("raw 値非漏洩: surface は timeLabel/momentLabel/nudge のみ", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.daily;
    const tl = COALTER_DEMO_TIMELINE.daily;
    const m = buildCoAlterMomentSurface(tl.moments, tl.nowMin, self, partner, "Mio");
    expect(m).not.toBeNull();
    if (m) expect(Object.keys(m).sort()).toEqual(["momentLabel", "nudge", "timeLabel"]);
  });
});
