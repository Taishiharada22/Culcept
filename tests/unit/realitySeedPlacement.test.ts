import { describe, it, expect } from "vitest";
import {
  buildSeedPlacements,
  isPlaceable,
  isTentative,
  WEAK_CONFIDENCE_THRESHOLD,
  type SeedPlacement,
  type SeedDispositionHint,
} from "@/lib/plan/reality/seed-placement";
import type { PlanSeed } from "@/lib/plan/plan-seed";
import type { ActionShape } from "@/lib/stargazer/alterHomeAdapter";

/** PlanSeed fixture（必須欄を埋め、optional は呼び出し側が override）。 */
function seed(over: Partial<PlanSeed> & { id: string }): PlanSeed {
  const base: PlanSeed = {
    id: over.id,
    userId: "u1",
    signal: "生の発話テキスト(raw signal)",
    confidence: 0.8,
    status: "active",
    source: "chat",
    capturedAt: "2026-06-05T00:00:00Z",
  };
  return { ...base, ...over };
}

/** SeedPlacement fixture（predicate を直接検証するため・必須欄を埋める）。 */
function placement(over: Partial<SeedPlacement> = {}): SeedPlacement {
  const base: SeedPlacement = {
    seedRef: "s",
    durationMin: null,
    durationSource: "unknown",
    dispositionHint: "place",
    confidence: 0.8,
    grounding: "strong",
  };
  return { ...base, ...over };
}

describe("A1-4-1 buildSeedPlacements — seed → 配置可能材料（候補ではない）", () => {
  it("active のみ通す（consumed/expired/rejected は除外）", () => {
    const out = buildSeedPlacements([
      seed({ id: "a", status: "active" }),
      seed({ id: "b", status: "consumed" }),
      seed({ id: "c", status: "expired" }),
      seed({ id: "d", status: "rejected" }),
    ]);
    expect(out.map((p) => p.seedRef)).toEqual(["a"]);
  });

  it("構造化フィールドを写す（seedRef/date/window/confidence/dispositionHint/grounding）", () => {
    const [p] = buildSeedPlacements([
      seed({
        id: "s1",
        desiredDate: "2026-06-06",
        desiredTimeHint: "morning",
        actionShape: "full_go",
        confidence: 0.9,
      }),
    ]);
    expect(p.seedRef).toBe("s1");
    expect(p.date).toBe("2026-06-06");
    expect(p.window).toEqual({ band: "morning" });
    expect(p.confidence).toBeCloseTo(0.9);
    expect(p.dispositionHint).toBe("place");
    expect(p.grounding).toBe("strong");
  });

  it("durationMin は常に null・durationSource は unknown（PlanSeed に duration 欄なし・推測しない）", () => {
    const out = buildSeedPlacements([
      seed({ id: "s1", actionShape: "full_go", confidence: 0.95, desiredDate: "2026-06-06" }),
      seed({ id: "s2", desiredTimeHint: "evening" }),
    ]);
    for (const p of out) {
      expect(p.durationMin).toBeNull();
      expect(p.durationSource).toBe("unknown");
    }
  });

  it("window: morning/afternoon/evening→band, anytime/未指定→undefined", () => {
    const out = buildSeedPlacements([
      seed({ id: "m", desiredTimeHint: "morning" }),
      seed({ id: "a", desiredTimeHint: "afternoon" }),
      seed({ id: "e", desiredTimeHint: "evening" }),
      seed({ id: "any", desiredTimeHint: "anytime" }),
      seed({ id: "none" }),
    ]);
    const byId = Object.fromEntries(out.map((p) => [p.seedRef, p.window]));
    expect(byId["m"]).toEqual({ band: "morning" });
    expect(byId["a"]).toEqual({ band: "afternoon" });
    expect(byId["e"]).toEqual({ band: "evening" });
    expect(byId["any"]).toBeUndefined();
    expect(byId["none"]).toBeUndefined();
  });

  it("dispositionHint: actionShape の決定的写像（推測なし）", () => {
    const cases: Array<[ActionShape | undefined, SeedDispositionHint]> = [
      ["full_go", "place"],
      ["bounded_go", "place"],
      ["prepare_then_go", "place"],
      ["trial_then_decide", "tentative"],
      ["observe_first", "tentative"],
      ["delegate_or_request", "tentative"],
      ["defer_with_trigger", "skip"],
      ["skip", "skip"],
      [undefined, "place"],
    ];
    for (const [shape, expected] of cases) {
      const [p] = buildSeedPlacements([seed({ id: "x", actionShape: shape })]);
      expect(p.dispositionHint).toBe(expected);
    }
  });

  it("grounding: confidence<0.5→weak, >=0.5→strong（閾値境界は strong）", () => {
    const [weak] = buildSeedPlacements([seed({ id: "w", confidence: 0.3 })]);
    const [boundary] = buildSeedPlacements([seed({ id: "b", confidence: WEAK_CONFIDENCE_THRESHOLD })]);
    const [strong] = buildSeedPlacements([seed({ id: "s", confidence: 0.8 })]);
    expect(weak.grounding).toBe("weak");
    expect(boundary.grounding).toBe("strong"); // 0.5 は < 0.5 でない → strong
    expect(strong.grounding).toBe("strong");
  });

  it("raw text を持ち込まない（signal/desiredAction は出力に一切現れない）", () => {
    const RAW_SIGNAL = "RAW_SIGNAL_カフェで仕事したい_XYZ";
    const RAW_ACTION = "RAW_ACTION_集中作業_XYZ";
    const out = buildSeedPlacements([
      seed({
        id: "s1",
        signal: RAW_SIGNAL,
        desiredAction: RAW_ACTION,
        desiredDate: "2026-06-06",
        actionShape: "full_go",
      }),
    ]);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain(RAW_SIGNAL);
    expect(serialized).not.toContain(RAW_ACTION);
    expect(serialized).not.toContain("RAW_"); // どの raw 由来も漏れない
    // 出力は seedRef(id) のみを参照として持つ
    expect(out[0]?.seedRef).toBe("s1");
  });

  it("入力順を保持", () => {
    const out = buildSeedPlacements([seed({ id: "z" }), seed({ id: "a" }), seed({ id: "m" })]);
    expect(out.map((p) => p.seedRef)).toEqual(["z", "a", "m"]);
  });

  it("confidence は 0..1 に clamp（範囲外は安全側）", () => {
    const out = buildSeedPlacements([
      seed({ id: "hi", confidence: 1.5 }),
      seed({ id: "lo", confidence: -0.2 }),
      seed({ id: "nan", confidence: Number.NaN }),
    ]);
    const byId = Object.fromEntries(out.map((p) => [p.seedRef, p.confidence]));
    expect(byId["hi"]).toBe(1);
    expect(byId["lo"]).toBe(0);
    expect(byId["nan"]).toBe(0);
  });
});

describe("A1-4-1 isPlaceable — duration 不明は placeable でない（CEO 明示ルール）", () => {
  it("durationMin=null → placeable=false（第一級の保守）", () => {
    expect(isPlaceable(placement({ durationMin: null }))).toBe(false);
  });

  it("実 seed から作った材料は全て placeable=false（durationMin 常に null）", () => {
    const out = buildSeedPlacements([
      seed({ id: "s1", actionShape: "full_go", confidence: 0.95, desiredDate: "2026-06-06", desiredTimeHint: "morning" }),
      seed({ id: "s2", actionShape: "bounded_go", confidence: 0.99 }),
    ]);
    expect(out.every(isPlaceable)).toBe(false);
  });

  it("durationMin>0 → placeable=true（将来 PRM 等が duration を埋めた場合の経路）", () => {
    expect(isPlaceable(placement({ durationMin: 30, durationSource: "prm_typical" }))).toBe(true);
  });

  it("durationMin<=0 → placeable=false（退化な所要時間は置けない）", () => {
    expect(isPlaceable(placement({ durationMin: 0, durationSource: "prm_typical" }))).toBe(false);
    expect(isPlaceable(placement({ durationMin: -10, durationSource: "prm_typical" }))).toBe(false);
  });
});

describe("A1-4-1 isTentative — weak/low-confidence/探索 は tentative 材料", () => {
  it("weak grounding → tentative", () => {
    expect(isTentative(placement({ grounding: "weak", dispositionHint: "place" }))).toBe(true);
  });

  it("tentative disposition → tentative", () => {
    expect(isTentative(placement({ grounding: "strong", dispositionHint: "tentative" }))).toBe(true);
  });

  it("strong grounding ∧ place disposition → not tentative", () => {
    expect(isTentative(placement({ grounding: "strong", dispositionHint: "place" }))).toBe(false);
  });
});
