import { describe, it, expect } from "vitest";

import type { OutfitDayContext } from "@/app/(culcept)/plan/tabs/_calendar-outfit/outfitEventProjection";
import { buildDayContextSummary } from "@/app/(culcept)/plan/tabs/_calendar-outfit/dayContextSummary";

function dayCtx(p: Partial<OutfitDayContext> = {}): OutfitDayContext {
  return {
    dominantActivity: "unknown",
    maxFormality: "unknown",
    mobility: "unknown",
    hasMeeting: false,
    hasMeal: false,
    hasOutdoor: false,
    hasCafeWork: false,
    hasClientOrFormal: false,
    reasonTags: [],
    eventCount: 0,
    ...p,
  };
}

describe("buildDayContextSummary", () => {
  it("eventCount 0 → null（既存の汎用 intro を維持）", () => {
    expect(buildDayContextSummary(dayCtx())).toBeNull();
    // 予定がなければ mobility/formality があっても null
    expect(buildDayContextSummary(dayCtx({ mobility: "high", maxFormality: "office" }))).toBeNull();
  });

  it("会議 + カフェ作業 / medium / office", () => {
    expect(
      buildDayContextSummary(
        dayCtx({ eventCount: 2, hasMeeting: true, hasCafeWork: true, mobility: "medium", maxFormality: "office" }),
      ),
    ).toBe("今日は、会議とカフェ作業が中心の日。移動はやや多め、きちんと感を少し残すと安心です。");
  });

  it("外食 / smart_casual", () => {
    expect(
      buildDayContextSummary(dayCtx({ eventCount: 1, hasMeal: true, mobility: "low", maxFormality: "smart_casual" })),
    ).toBe("今日は、外食の予定がある日。程よくきれいめが馴染みます。");
  });

  it("移動が多めの日（活動フラグなし・high mobility）", () => {
    expect(buildDayContextSummary(dayCtx({ eventCount: 1, mobility: "high" }))).toBe(
      "今日は、移動が多めの日。歩きやすさと軽さを意識すると安心です。",
    );
  });

  it("作業中心 / casual（dominantActivity から）", () => {
    expect(
      buildDayContextSummary(dayCtx({ eventCount: 1, dominantActivity: "work", maxFormality: "casual" })),
    ).toBe("今日は、作業中心の日。落ち着いた印象で過ごしやすく整えます。");
  });

  it("常に「今日は、」で始まる（eventCount > 0）", () => {
    const s = buildDayContextSummary(dayCtx({ eventCount: 1 }));
    expect(s).not.toBeNull();
    expect(s!.startsWith("今日は、")).toBe(true);
  });

  it("privacy: formal(機微由来) でも『きちんと感』に丸め、 生値を出さない", () => {
    const s = buildDayContextSummary(
      dayCtx({ eventCount: 1, maxFormality: "formal", reasonTags: ["きちんとした場"] }),
    )!;
    expect(s).toContain("きちんと感");
    expect(s).not.toContain("試験");
    expect(s).not.toContain("exam");
    // outfit を断定しない
    expect(s).not.toContain("最適");
    expect(s).not.toContain("必ず");
  });
});
