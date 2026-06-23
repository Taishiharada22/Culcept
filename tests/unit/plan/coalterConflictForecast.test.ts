import { describe, it, expect } from "vitest";

import { COALTER_DEMO_PERSONALIZATION } from "@/app/(culcept)/plan/tabs/coalter/coalterPersonalizationFixture";
import { buildCoAlterConflictForecast } from "@/app/(culcept)/plan/tabs/coalter/coalterConflictForecast";
import type { AxisSnapshot, PersonalizationSnapshot } from "@/lib/shared/personalization/types";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

// ── 決定論 helper（Date.now なし）──
function ax(score: number, confidence: number): AxisSnapshot {
  return { score, confidence, observedAt: "2026-06-15T00:00:00.000Z" };
}
function snap(axes: Partial<Record<TraitAxisKey, AxisSnapshot>>): PersonalizationSnapshot {
  return { userId: "t", asOf: "2026-06-20T00:00:00.000Z", axes, hdm: null, dynamicState: null, decisionMeta: null };
}

describe("S3-1 CoAlter conflict forecast（opposed 検出・ランク・橋渡し・honesty）", () => {
  it("TRAVEL demo: 摩擦 2 件（行き先選び・段取り）を出し、各々に tension と bridge が付く", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.travel;
    const f = buildCoAlterConflictForecast(self, partner, "Mio");

    const labels = f.items.map((i) => i.decisionLabel);
    expect(labels).toContain("行き先選び"); // novelty 対立
    expect(labels).toContain("段取り"); //     planning 対立
    expect(f.items.length).toBe(2);
    for (const item of f.items) {
      expect(item.tension.length).toBeGreaterThan(0);
      expect(item.bridge.length).toBeGreaterThan(0);
    }
  });

  it("TRAVEL demo: tension に相手名（Mio）が入り、向き（新しい/定番）が言語化される", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.travel;
    const f = buildCoAlterConflictForecast(self, partner, "Mio");
    const novelty = f.items.find((i) => i.decisionLabel === "行き先選び");
    expect(novelty).toBeDefined();
    expect(novelty?.tension.includes("Mio")).toBe(true);
    expect(novelty?.tension.includes("新しい") || novelty?.tension.includes("定番")).toBe(true);
  });

  it("ランク: 重要度主軸（行き先 > 段取り）。evidence が高い段取りでも行き先が先頭", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.travel;
    const f = buildCoAlterConflictForecast(self, partner, "Mio");
    // importance: 行き先 1.0 > 段取り 0.7。evidence(×0.3) は tiebreak の小項なので逆転しない。
    expect(f.items[0]?.decisionLabel).toBe("行き先選び");
    expect(f.items[1]?.decisionLabel).toBe("段取り");
  });

  it("DAILY demo: 対人の差（人の多さ）を摩擦として出す", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.daily;
    const f = buildCoAlterConflictForecast(self, partner, "Mio");
    expect(f.items.some((i) => i.decisionLabel === "人の多さ")).toBe(true);
  });

  it("honesty: 同方向（両者とも新奇）は摩擦にしない（一致は forecast の領域外）", () => {
    const a = snap({ tradition_vs_novelty: ax(0.6, 0.7), novelty_threshold: ax(0.5, 0.65) });
    const b = snap({ tradition_vs_novelty: ax(0.5, 0.7), novelty_threshold: ax(0.4, 0.65) });
    const f = buildCoAlterConflictForecast(a, b, "Mio");
    expect(f.items.some((i) => i.decisionLabel === "行き先選び")).toBe(false);
  });

  it("honesty: 片側が未観測の軸は摩擦にしない（材料不足を捏造しない）", () => {
    // self は新奇、partner は novelty 軸を持たない → derive default → 摩擦は出さない。
    const a = snap({ tradition_vs_novelty: ax(0.6, 0.7), novelty_threshold: ax(0.5, 0.65) });
    const b = snap({ introvert_vs_extrovert: ax(0.3, 0.6) });
    const f = buildCoAlterConflictForecast(a, b, "Mio");
    expect(f.items.some((i) => i.decisionLabel === "行き先選び")).toBe(false);
  });

  it("honesty: 低 confidence（floor 未満）は摩擦にしない", () => {
    // 反対方向だが両者とも confidence 0.2（< 0.3 floor）→ derive が default に丸める → 摩擦なし。
    const a = snap({ tradition_vs_novelty: ax(0.6, 0.2), novelty_threshold: ax(0.5, 0.2) });
    const b = snap({ tradition_vs_novelty: ax(-0.6, 0.2), novelty_threshold: ax(-0.5, 0.2) });
    const f = buildCoAlterConflictForecast(a, b, "Mio");
    expect(f.items.length).toBe(0);
  });

  it("raw score 非漏洩: item は decisionLabel/tension/bridge のみ（score/priority/軸値を持たない）", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.travel;
    const f = buildCoAlterConflictForecast(self, partner, "Mio");
    for (const item of f.items) {
      expect(Object.keys(item).sort()).toEqual(["bridge", "decisionLabel", "tension"]);
      const rec = item as unknown as Record<string, unknown>;
      expect(rec.score).toBeUndefined();
      expect(rec.priority).toBeUndefined();
    }
  });

  it("摩擦ゼロ: 両者 neutral/未観測なら items は空（カード非表示の根拠）", () => {
    const f = buildCoAlterConflictForecast(snap({}), snap({}), "Mio");
    expect(f.items).toEqual([]);
  });
});
