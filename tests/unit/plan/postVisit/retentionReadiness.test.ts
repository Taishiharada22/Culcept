// tests/unit/plan/postVisit/retentionReadiness.test.ts
// 評価OS ②-5: retention 計測仕上げ（pure summary）の検証。
//   観測量/文脈カバレッジ/再訪/arc状態別/セル数/redaction0/answer-skip-suppress rate を統合・
//   ready 判定(観測量+セル+redaction0)・legacy 観測で落ちない・raw 非露出。
import { describe, it, expect } from "vitest";
import {
  buildRetentionReadiness,
  RETENTION_MIN_OBSERVATIONS,
  RETENTION_MIN_CONTEXT_CELLS,
} from "@/lib/plan/postVisit/retentionReadiness";
import { buildPostVisitObservation, type PostVisitObservation } from "@/lib/plan/postVisit/postVisitObservation";
import type { PostVisitContextSnapshot } from "@/lib/plan/postVisit/postVisitContext";

function cs(over: Partial<PostVisitContextSnapshot> = {}): PostVisitContextSnapshot {
  return { v: 1, sourceSurface: "calendar_past_anchor", timeOfDay: "midday", dayType: "weekday", gapBucket: "under_30", weatherKind: null, fatigue: null, companion: "solo", mobilityLoad: null, locationCategory: "cafe", ...over };
}
function obs(place: string, resp: "keep" | "conditional" | "not_today" | "no_more" | null = "keep", ctx?: PostVisitContextSnapshot | null): PostVisitObservation {
  return buildPostVisitObservation({ placeDescriptor: place, lens: "focus_work", trigger: "past_plan", response: resp, at: 1, ...(ctx !== undefined ? { contextSnapshot: ctx ?? undefined } : { contextSnapshot: cs() }) });
}

describe("buildRetentionReadiness — 観測量/品質の統合", () => {
  it("★空 → not ready・理由に観測不足", () => {
    const r = buildRetentionReadiness([]);
    expect(r.observationCount).toBe(0);
    expect(r.readyForContextLearning).toBe(false);
    expect(r.reasons.join()).toContain("観測");
    expect(r.redactionViolations).toBe(0);
  });
  it("★再訪・arc 状態別・セル数を集計", () => {
    const data = [
      obs("A", "keep", cs({ gapBucket: "under_30" })), obs("A", "keep", cs({ gapBucket: "under_30" })), obs("A", "conditional", cs({ gapBucket: "under_30" })), // A:3=observed,再訪
      obs("B", "keep", cs({ gapBucket: "60_120" })), // B:1=tentative
    ];
    const r = buildRetentionReadiness(data);
    expect(r.repeatedPlaceCount).toBe(1); // A
    expect(r.fitArcObservedCount).toBe(1); // A
    expect(r.fitArcTentativeCount).toBe(1); // B
    expect(r.contextCellsCovered).toBeGreaterThanOrEqual(1);
  });
  it("★観測量+セル+redaction0 を満たす → ready", () => {
    const data: PostVisitObservation[] = [];
    // 3 place × 5 件・3 種の cell → 観測>=12, セル>=3
    for (const g of ["under_30", "30_60", "60_120"]) {
      for (let i = 0; i < 5; i++) data.push(obs(`P-${g}`, "keep", cs({ gapBucket: g as "under_30" })));
    }
    const r = buildRetentionReadiness(data);
    expect(r.observationCount).toBeGreaterThanOrEqual(RETENTION_MIN_OBSERVATIONS);
    expect(r.contextCellsCovered).toBeGreaterThanOrEqual(RETENTION_MIN_CONTEXT_CELLS);
    expect(r.redactionViolations).toBe(0);
    expect(r.readyForContextLearning).toBe(true);
    expect(r.reasons).toEqual([]);
  });
  it("★legacy 観測（contextSnapshot なし）で落ちない", () => {
    const r = buildRetentionReadiness([obs("A", "keep", null), obs("B", "no_more", null)]);
    expect(r.observationCount).toBe(2);
    expect(r.contextCoverage).toBe(0);
    expect(r.readyForContextLearning).toBe(false); // 文脈ゼロ
  });
  it("★集計に raw place 名/住所が出ない", () => {
    const r = buildRetentionReadiness([obs("ブルーボトル 江東区", "keep", cs())]);
    const json = JSON.stringify(r);
    expect(json).not.toContain("ブルーボトル");
    expect(json).not.toContain("江東区");
  });
});
