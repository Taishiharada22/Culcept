import { describe, it, expect } from "vitest";

import type { ExternalAnchor, OneOffExternalAnchor } from "@/lib/plan/external-anchor";
import { anchorsToOutfitEvents } from "@/app/(culcept)/plan/tabs/_calendar-outfit/anchorsToOutfitEvents";
import { buildOutfitDayContext } from "@/app/(culcept)/plan/tabs/_calendar-outfit/outfitEventProjection";
import type { OutfitDayContext } from "@/app/(culcept)/plan/tabs/_calendar-outfit/outfitEventProjection";
import { buildOutfitReasonVM } from "@/app/(culcept)/plan/tabs/_calendar-outfit/outfitReasonFactors";
import type {
  CalendarOutfitSyncVM,
  CalendarOutfitWeatherVM,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/types";

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

const WEATHER: CalendarOutfitWeatherVM = { icon: "☀️", label: "晴れ", tempMax: 26, tempMin: 18, pop: 10 };
const SYNC: CalendarOutfitSyncVM = { score: 84, bandKey: "good", bandLabel: "良好" };

describe("buildOutfitReasonVM — 5 因子生成", () => {
  it("weather × dayContext(会議/office/medium) → 5 因子が予定・天気・移動・TPO に接続", () => {
    const vm = buildOutfitReasonVM({
      weather: WEATHER,
      dayContext: dayCtx({
        hasMeeting: true,
        maxFormality: "office",
        mobility: "medium",
        eventCount: 2,
        reasonTags: ["会議あり", "オフィス"],
      }),
      sync: SYNC,
    });
    expect(vm).not.toBeNull();
    expect(vm!.factors).toHaveLength(5);
    expect(vm!.factors[0].value).toBe("26° 快適"); // 気温
    expect(vm!.factors[1].value).toBe("やや多め"); // 移動量
    expect(vm!.factors[2].value).toBe("会議あり"); // 予定
    expect(vm!.factors[4].value).toBe("きちんと感"); // 雰囲気 (office)
    expect(vm!.axisChips.map((c) => c.label)).toEqual(
      expect.arrayContaining(["気温 26°に対応", "会議あり", "相性 良好"]),
    );
  });

  it("カフェ作業 → 環境因子『カフェ作業』、 mobility high → 移動量『多め』", () => {
    const vm = buildOutfitReasonVM({
      weather: null,
      dayContext: dayCtx({ eventCount: 1, hasCafeWork: true, mobility: "high", dominantActivity: "work" }),
      sync: null,
    });
    expect(vm).not.toBeNull();
    expect(vm!.factors[3].value).toBe("カフェ作業");
    expect(vm!.factors[1].value).toBe("多め");
    expect(vm!.factors[0].value).toBe("標準"); // weather なし
  });

  it("常に 5 因子構造を維持（UI grid-cols-5）", () => {
    const vm = buildOutfitReasonVM({ weather: WEATHER, dayContext: dayCtx({ eventCount: 1 }), sync: null });
    expect(vm!.factors).toHaveLength(5);
  });
});

describe("buildOutfitReasonVM — fallback", () => {
  it("予定なし AND engine なし AND 天気なし → null (mock 維持)", () => {
    expect(buildOutfitReasonVM({ weather: null, dayContext: dayCtx(), sync: null })).toBeNull();
  });

  it("engine 失敗 (sync null) でも 予定があれば生成する", () => {
    const vm = buildOutfitReasonVM({
      weather: null,
      dayContext: dayCtx({ eventCount: 1, maxFormality: "smart_casual" }),
      sync: null,
    });
    expect(vm).not.toBeNull();
    expect(vm!.factors[4].value).toBe("程よくきれいめ");
  });

  it("予定なしでも engine sync があれば生成する", () => {
    const vm = buildOutfitReasonVM({ weather: WEATHER, dayContext: dayCtx(), sync: SYNC });
    expect(vm).not.toBeNull();
    expect(vm!.factors[2].value).toBe("予定なし");
  });
});

describe("buildOutfitReasonVM — privacy (機微非漏洩)", () => {
  it("formal(機微由来) でも『きちんと感』『きちんとした場』のみ、 生値は出さない (直接)", () => {
    const vm = buildOutfitReasonVM({
      weather: WEATHER,
      dayContext: dayCtx({ eventCount: 1, maxFormality: "formal", reasonTags: ["きちんとした場"] }),
      sync: null,
    });
    const blob = JSON.stringify(vm);
    expect(blob).not.toContain("試験");
    expect(blob).not.toContain("exam");
    expect(vm!.factors[4].value).toBe("きちんと感");
    expect(vm!.axisChips.map((c) => c.label)).toContain("きちんとした場");
  });

  it("試験 anchor からの end-to-end でも理由に機微が出ない", () => {
    const oneOff = (
      p: Partial<OneOffExternalAnchor> & { id: string; title: string; startTime: string },
    ): ExternalAnchor =>
      ({
        anchorKind: "one_off",
        userId: "u1",
        rigidity: "soft",
        sourceId: "s1",
        confirmedAt: "2026-05-29T00:00:00.000Z",
        date: "2026-05-29",
        ...p,
      }) as ExternalAnchor;

    const events = anchorsToOutfitEvents(
      [oneOff({ id: "x", title: "数学の試験", startTime: "09:00", sensitiveCategory: "exam" })],
      new Date("2026-05-29T00:00:00.000Z"),
    );
    const ctx = buildOutfitDayContext(events);
    const vm = buildOutfitReasonVM({ weather: null, dayContext: ctx, sync: null });
    const blob = JSON.stringify(vm);
    expect(blob).not.toContain("試験");
    expect(blob).not.toContain("exam");
    expect(vm!.factors[4].value).toBe("きちんと感"); // formal へ丸め
  });
});
