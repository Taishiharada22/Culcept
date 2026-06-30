// tests/unit/plan/postVisit/personaPrior.test.ts
// 評価OS ②-4: persona prior 推定（shadow）の検証。
//   観測不足=insufficient/null(断定なし)・bounded ±ε(base 逆転しない)・confidence/evidence 必須・
//   preferredValue は fit 最大・dormant 軸(weather/fatigue/mobility)は永久 insufficient・決定論。
import { describe, it, expect } from "vitest";
import {
  estimateAxisTendency,
  estimatePersonaPrior,
  PERSONA_EPSILON,
  LIVE_PERSONA_AXES,
  DORMANT_PERSONA_AXES,
} from "@/lib/plan/postVisit/personaPrior";
import { buildPostVisitObservation, type PostVisitObservation } from "@/lib/plan/postVisit/postVisitObservation";
import type { PostVisitContextSnapshot } from "@/lib/plan/postVisit/postVisitContext";

function cs(over: Partial<PostVisitContextSnapshot> = {}): PostVisitContextSnapshot {
  return { v: 1, sourceSurface: "calendar_past_anchor", timeOfDay: "midday", dayType: "weekday", gapBucket: "under_30", weatherKind: null, fatigue: null, companion: "solo", mobilityLoad: null, locationCategory: "cafe", ...over };
}
function obs(resp: "keep" | "conditional" | "not_today" | "no_more" | null, ctx?: PostVisitContextSnapshot | null, place = "P"): PostVisitObservation {
  return buildPostVisitObservation({ placeDescriptor: place, lens: "focus_work", trigger: "past_plan", response: resp, at: 1, ...(ctx !== undefined ? { contextSnapshot: ctx ?? undefined } : { contextSnapshot: cs() }) });
}

describe("estimateAxisTendency — 観測不足は断定しない", () => {
  it("★観測ゼロ → insufficient / preferredValue null / strength 0", () => {
    const t = estimateAxisTendency([], "companion");
    expect(t.confidence).toBe("insufficient");
    expect(t.preferredValue).toBeNull();
    expect(t.strength).toBe(0);
    expect(t.evidenceCount).toBe(0);
  });
  it("★各値が MIN 未満 → insufficient（薄い値で断定しない）", () => {
    const t = estimateAxisTendency([obs("keep", cs({ companion: "solo" })), obs("no_more", cs({ companion: "with_someone" }))], "companion");
    expect(t.confidence).toBe("insufficient"); // 各値1件＜MIN_PER_VALUE=2
  });
});

describe("estimateAxisTendency — 傾向推定（bounded ε）", () => {
  it("★solo の方が fit 高い → preferredValue=solo・strength は +ε 以内", () => {
    const data = [
      obs("keep", cs({ companion: "solo" })), obs("keep", cs({ companion: "solo" })), obs("keep", cs({ companion: "solo" })),
      obs("no_more", cs({ companion: "with_someone" })), obs("no_more", cs({ companion: "with_someone" })),
    ];
    const t = estimateAxisTendency(data, "companion");
    expect(t.preferredValue).toBe("solo");
    expect(t.strength).toBeGreaterThan(0);
    expect(Math.abs(t.strength)).toBeLessThanOrEqual(PERSONA_EPSILON); // ★bounded＝base 逆転しない
    expect(["hypothesis", "observed"]).toContain(t.confidence);
    expect(t.evidenceCount).toBe(5);
  });
  it("★strength は常に ±PERSONA_EPSILON に clamp（極端な差でも）", () => {
    const data = [
      ...Array.from({ length: 6 }, () => obs("keep", cs({ gapBucket: "under_30" }))),
      ...Array.from({ length: 6 }, () => obs("no_more", cs({ gapBucket: "over_120" }))),
    ];
    const t = estimateAxisTendency(data, "gapBucket");
    expect(t.preferredValue).toBe("under_30");
    expect(Math.abs(t.strength)).toBeLessThanOrEqual(PERSONA_EPSILON);
    expect(t.confidence).toBe("observed"); // total>=8 ∧ 2値
  });
});

describe("estimatePersonaPrior — 全軸 + dormant", () => {
  it("★live 軸 + dormant 軸を返す・dormant は永久 insufficient（weather/fatigue/mobility）", () => {
    const data = Array.from({ length: 6 }, () => obs("keep", cs({ companion: "solo" })));
    const prior = estimatePersonaPrior(data);
    expect(prior.length).toBe(LIVE_PERSONA_AXES.length + DORMANT_PERSONA_AXES.length);
    for (const axis of DORMANT_PERSONA_AXES) {
      const t = prior.find((p) => p.axis === axis)!;
      expect(t.confidence).toBe("insufficient"); // signal 未配線（常時 null）
      expect(t.preferredValue).toBeNull();
    }
  });
  it("★決定論（同入力→同出力・ranking 非依存）", () => {
    const data = [obs("keep", cs({ companion: "solo" })), obs("no_more", cs({ companion: "with_someone" }))];
    expect(estimatePersonaPrior(data)).toEqual(estimatePersonaPrior(data));
  });
  it("★strength は全軸で bounded（base 逆転しない invariant）", () => {
    const data = Array.from({ length: 10 }, (_, i) => obs(i % 2 ? "keep" : "no_more", cs({ timeOfDay: i % 2 ? "morning" : "night" })));
    for (const t of estimatePersonaPrior(data)) {
      expect(Math.abs(t.strength)).toBeLessThanOrEqual(PERSONA_EPSILON);
    }
  });
});

describe("estimateAxisTendency — partial pooling（shrinkage 改善）", () => {
  it("★薄い証拠は strength を baseline へ縮約（ε 未満へ＝証拠量解離の解消）", () => {
    // morning=[conditional,not_today](mean .475,n2) / evening=[not_today,not_today](mean .35,n2)
    const data = [
      obs("conditional", cs({ timeOfDay: "morning" })),
      obs("not_today", cs({ timeOfDay: "morning" })),
      obs("not_today", cs({ timeOfDay: "evening" })),
      obs("not_today", cs({ timeOfDay: "evening" })),
    ];
    const t = estimateAxisTendency(data, "timeOfDay");
    expect(t.preferredValue).toBe("morning");
    expect(t.strength).toBeGreaterThan(0);
    // 縮約後: (raw .475 − baseline .4125)·n/(n+k)=0.0625·2/4=0.03125 < ε（旧実装なら clampEps(.0625)=.05）
    expect(t.strength).toBeLessThan(PERSONA_EPSILON);
    expect(t.strength).toBeCloseTo(0.03125, 4);
  });
});
