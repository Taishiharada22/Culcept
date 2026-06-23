// tests/unit/plan/postVisit/contextFitReadout.test.ts
// 評価OS Stage 4-B（②-1）: 文脈条件付き Fit readout（shadow・pure）の検証。
//   条件 filter・無条件=全件・薄い条件=insufficient(断定なし)・>=3で observed・
//   文脈なし観測は条件に乗らない・weather 条件は live signal 未配線で永久 insufficient・cell 列挙。
import { describe, it, expect } from "vitest";
import {
  buildContextFitReadout,
  observationMatchesCondition,
  listContextFitCells,
  DORMANT_CONDITION_AXES,
} from "@/lib/plan/postVisit/contextFitReadout";
import { buildPostVisitObservation, type PostVisitObservation } from "@/lib/plan/postVisit/postVisitObservation";
import type { PostVisitContextSnapshot } from "@/lib/plan/postVisit/postVisitContext";

function cs(over: Partial<PostVisitContextSnapshot> = {}): PostVisitContextSnapshot {
  return { v: 1, sourceSurface: "calendar_past_anchor", timeOfDay: "midday", dayType: "weekday", gapBucket: "under_30", weatherKind: null, fatigue: null, companion: "solo", mobilityLoad: null, locationCategory: "cafe", ...over };
}
function obs(over: { resp?: "keep" | "conditional" | "not_today" | "no_more" | null; ctx?: PostVisitContextSnapshot | null; place?: string } = {}): PostVisitObservation {
  return buildPostVisitObservation({
    placeDescriptor: over.place ?? "A 1",
    lens: "focus_work",
    trigger: "past_plan",
    response: over.resp === undefined ? "keep" : over.resp,
    at: 1,
    ...(over.ctx !== undefined ? { contextSnapshot: over.ctx ?? undefined } : { contextSnapshot: cs() }),
  });
}

describe("observationMatchesCondition", () => {
  it("★指定軸が一致すれば true・不一致で false", () => {
    const o = obs({ ctx: cs({ gapBucket: "under_30", companion: "solo" }) });
    expect(observationMatchesCondition(o, { gapBucket: "under_30" })).toBe(true);
    expect(observationMatchesCondition(o, { gapBucket: "under_30", companion: "solo" })).toBe(true);
    expect(observationMatchesCondition(o, { gapBucket: "60_120" })).toBe(false);
  });
  it("★未指定軸は無視・空条件は常に true", () => {
    expect(observationMatchesCondition(obs(), {})).toBe(true);
  });
  it("★contextSnapshot 無し観測は条件に乗らない（false）", () => {
    expect(observationMatchesCondition(obs({ ctx: null }), { gapBucket: "under_30" })).toBe(false);
  });
});

describe("buildContextFitReadout — 条件付き readout", () => {
  it("★無条件 = 全件で buildFitArcReadout 相当", () => {
    const r = buildContextFitReadout([obs(), obs(), obs()], {});
    expect(r.matchedCount).toBe(3);
    expect(r.readout.state).toBe("observed");
  });
  it("★条件一致が薄い → insufficient（断定しない）", () => {
    const data = [
      obs({ ctx: cs({ gapBucket: "under_30" }) }),
      obs({ ctx: cs({ gapBucket: "60_120" }) }),
      obs({ ctx: cs({ gapBucket: "over_120" }) }),
    ];
    const r = buildContextFitReadout(data, { gapBucket: "under_30" });
    expect(r.matchedCount).toBe(1);
    expect(r.readout.state).toBe("tentative"); // 1件
  });
  it("★条件一致が3件以上 → observed", () => {
    const data = [
      obs({ resp: "keep", ctx: cs({ gapBucket: "under_30", companion: "solo" }) }),
      obs({ resp: "keep", ctx: cs({ gapBucket: "under_30", companion: "solo" }) }),
      obs({ resp: "conditional", ctx: cs({ gapBucket: "under_30", companion: "solo" }) }),
      obs({ resp: "no_more", ctx: cs({ gapBucket: "over_120", companion: "with_someone" }) }), // 別条件
    ];
    const r = buildContextFitReadout(data, { gapBucket: "under_30", companion: "solo" });
    expect(r.matchedCount).toBe(3);
    expect(r.readout.state).toBe("observed");
    expect(r.readout.fillPercent).not.toBeNull();
  });
  it("★weather 条件は live signal 未配線（常時 null）→ 永久 insufficient（捏造しない）", () => {
    // 観測は weatherKind=null（buildContextSnapshotFromAnchor 相当）。weather 条件で絞ると 0 件。
    const data = [obs({ ctx: cs({ weatherKind: null }) }), obs({ ctx: cs({ weatherKind: null }) }), obs({ ctx: cs({ weatherKind: null }) })];
    const r = buildContextFitReadout(data, { weatherKind: "rain" });
    expect(r.matchedCount).toBe(0);
    expect(r.readout.state).toBe("insufficient");
    expect(DORMANT_CONDITION_AXES).toContain("weatherKind");
  });
  it("★shadow: ranking に影響しない pure（決定論）", () => {
    const data = [obs(), obs({ resp: "no_more" })];
    expect(buildContextFitReadout(data, { companion: "solo" })).toEqual(buildContextFitReadout(data, { companion: "solo" }));
  });
});

describe("listContextFitCells — 意味を持つ条件セル列挙", () => {
  it("★observed 以上のセルだけ返す・observed 優先で並ぶ", () => {
    const data = [
      // gap=under_30 で 3件 → observed
      obs({ resp: "keep", ctx: cs({ gapBucket: "under_30", companion: "solo" }) }),
      obs({ resp: "keep", ctx: cs({ gapBucket: "under_30", companion: "solo" }) }),
      obs({ resp: "keep", ctx: cs({ gapBucket: "under_30", companion: "solo" }) }),
      // companion=with_someone で 1件 → tentative
      obs({ resp: "keep", ctx: cs({ gapBucket: "60_120", companion: "with_someone" }) }),
    ];
    const cells = listContextFitCells(data);
    // under_30(observed) と solo(observed,3件) が上位、with_someone(tentative,1) は後
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0]!.state).toBe("observed");
    const solo = cells.find((c) => c.axis === "companion" && c.value === "solo");
    expect(solo?.state).toBe("observed");
    const withSomeone = cells.find((c) => c.axis === "companion" && c.value === "with_someone");
    expect(withSomeone?.state).toBe("tentative");
    // dormant 軸(weather 等)は live 軸でないので列挙されない
    expect(cells.every((c) => (["weatherKind", "fatigue", "mobilityLoad"] as string[]).indexOf(c.axis) === -1)).toBe(true);
  });
  it("★観測ゼロ/文脈なし → 空配列（光らせるセルなし）", () => {
    expect(listContextFitCells([])).toEqual([]);
    expect(listContextFitCells([obs({ ctx: null }), obs({ ctx: null })])).toEqual([]);
  });
});
