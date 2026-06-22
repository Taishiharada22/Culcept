// tests/unit/plan/postVisit/postVisitDogfoodSummary.test.ts
// 評価OS Stage 4-A2: dogfood 集計 pure helper の検証。
//   context 付き/無し(legacy) 集計・sourceSurface/trigger/timeOfDay/dayType/gapBucket/response 別・
//   redaction 違反検出(0 必須)・Fit-Arc per place・raw/PII/exact を出さない。
import { describe, it, expect } from "vitest";
import { summarizePostVisitDogfood, shortenPlaceKey } from "@/lib/plan/postVisit/postVisitDogfoodSummary";
import { buildPostVisitObservation, type PostVisitObservation } from "@/lib/plan/postVisit/postVisitObservation";
import type { PostVisitContextSnapshot } from "@/lib/plan/postVisit/postVisitContext";

function ctx(over: Partial<PostVisitContextSnapshot> = {}): PostVisitContextSnapshot {
  return { v: 1, sourceSurface: "calendar_past_anchor", timeOfDay: "midday", dayType: "weekday", gapBucket: "under_30", weatherKind: null, fatigue: null, companion: "solo", mobilityLoad: null, locationCategory: "cafe", ...over };
}
function obs(over: { desc?: string; response?: "keep" | "conditional" | "not_today" | "no_more" | null; ctx?: PostVisitContextSnapshot | null; trigger?: "past_plan" | "lens_proposed" } = {}): PostVisitObservation {
  return buildPostVisitObservation({
    placeDescriptor: over.desc ?? "ブルーボトル 江東区",
    lens: "focus_work",
    trigger: over.trigger ?? "past_plan",
    response: over.response === undefined ? "keep" : over.response,
    at: 1,
    ...(over.ctx !== undefined ? { contextSnapshot: over.ctx ?? undefined } : { contextSnapshot: ctx() }),
  });
}

describe("summarizePostVisitDogfood — 集計", () => {
  it("★total / context 付き・無し(legacy) / coverage", () => {
    const s = summarizePostVisitDogfood([obs(), obs(), obs({ ctx: null })]);
    expect(s.total).toBe(3);
    expect(s.withContext).toBe(2);
    expect(s.withoutContext).toBe(1);
    expect(s.contextCoverage).toBeCloseTo(2 / 3);
  });
  it("★空配列で 0（NaN を出さない）", () => {
    const s = summarizePostVisitDogfood([]);
    expect(s.total).toBe(0);
    expect(s.contextCoverage).toBe(0);
    expect(s.fitArcByPlace).toEqual([]);
  });
  it("★sourceSurface / trigger / timeOfDay / dayType / gapBucket / response 別集計", () => {
    const s = summarizePostVisitDogfood([
      obs({ response: "keep", ctx: ctx({ timeOfDay: "midday", gapBucket: "under_30" }) }),
      obs({ response: "no_more", ctx: ctx({ timeOfDay: "evening", gapBucket: "over_120" }) }),
      obs({ response: null, ctx: null, trigger: "lens_proposed" }), // legacy・未回答
    ]);
    expect(s.byResponse.keep).toBe(1);
    expect(s.byResponse.no_more).toBe(1);
    expect(s.byResponse.unanswered).toBe(1);
    expect(s.byTrigger.past_plan).toBe(2);
    expect(s.byTrigger.lens_proposed).toBe(1);
    expect(s.byTimeOfDay.midday).toBe(1);
    expect(s.byTimeOfDay.evening).toBe(1);
    expect(s.byTimeOfDay["·null"]).toBe(1); // context 無しは null bucket
    expect(s.bySourceSurface.calendar_past_anchor).toBe(2);
    expect(s.byGapBucket.under_30).toBe(1);
  });
  it("★Fit-Arc per place: 同 place 3件→observed / 1件→tentative", () => {
    const s = summarizePostVisitDogfood([
      obs({ desc: "A 1", response: "keep" }), obs({ desc: "A 1", response: "keep" }), obs({ desc: "A 1", response: "conditional" }),
      obs({ desc: "B 2", response: "keep" }),
    ]);
    const a = s.fitArcByPlace.find((p) => p.count === 3);
    const b = s.fitArcByPlace.find((p) => p.count === 1);
    expect(a?.state).toBe("observed");
    expect(b?.state).toBe("tentative");
  });
  it("★contextCellsCovered: 回答済み×文脈ありの (timeOfDay|dayType|gap) ユニーク数", () => {
    const s = summarizePostVisitDogfood([
      obs({ response: "keep", ctx: ctx({ timeOfDay: "midday", gapBucket: "under_30" }) }),
      obs({ response: "keep", ctx: ctx({ timeOfDay: "midday", gapBucket: "under_30" }) }), // 同 cell
      obs({ response: "keep", ctx: ctx({ timeOfDay: "evening", gapBucket: "over_120" }) }), // 別 cell
      obs({ response: null, ctx: ctx({ timeOfDay: "night" }) }), // 未回答は数えない
    ]);
    expect(s.contextCellsCovered).toBe(2);
  });
});

describe("redaction 監視 + raw/PII 非露出", () => {
  it("★正常観測 → redaction 違反 0", () => {
    expect(summarizePostVisitDogfood([obs(), obs(), obs({ ctx: null })]).redactionViolations).toBe(0);
  });
  it("★非 opaque placeKey / 非 bucket context は違反として検出", () => {
    const dirtyPlace = { ...obs(), placeKey: "スターバックス渋谷" } as PostVisitObservation; // 原文漏れ
    const dirtyCtx = { ...obs(), contextSnapshot: { v: 1, sourceSurface: "calendar_past_anchor", timeOfDay: "EVIL", dayType: null, gapBucket: null, weatherKind: null, fatigue: null, companion: null, mobilityLoad: null, locationCategory: null } } as unknown as PostVisitObservation;
    const s = summarizePostVisitDogfood([dirtyPlace, dirtyCtx]);
    expect(s.redactionViolations).toBe(2);
  });
  it("★集計結果に raw locationText/住所/相手名が一切現れない", () => {
    const s = summarizePostVisitDogfood([obs({ desc: "ブルーボトル 東京都江東区" })]);
    const json = JSON.stringify(s);
    expect(json).not.toContain("ブルーボトル");
    expect(json).not.toContain("江東区");
  });
  it("★shortenPlaceKey: opaque を短縮", () => {
    expect(shortenPlaceKey("p123")).toBe("p123");
    expect(shortenPlaceKey("p1234567890abcdef")).toBe("p123456789…");
  });
});
