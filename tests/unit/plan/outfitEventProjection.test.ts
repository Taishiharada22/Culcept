import { describe, it, expect } from "vitest";

import type { ExternalAnchor, OneOffExternalAnchor } from "@/lib/plan/external-anchor";
import type { OutfitContextEvent } from "@/app/(culcept)/plan/tabs/_calendar-outfit/anchorsToOutfitEvents";
import { anchorsToOutfitEvents } from "@/app/(culcept)/plan/tabs/_calendar-outfit/anchorsToOutfitEvents";
import {
  projectEventType,
  projectCalendarEvents,
  buildOutfitDayContext,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/outfitEventProjection";

/** 最小 OutfitContextEvent ファクトリ */
function ev(p: Partial<OutfitContextEvent> & { id: string }): OutfitContextEvent {
  return {
    date: "2026-05-29",
    title: "予定",
    timeOfDay: "day",
    placeKind: "unknown",
    activityKind: "unknown",
    formality: "unknown",
    mobility: "low",
    socialContext: "solo",
    fixed: false,
    reasonTags: [],
    ...p,
  };
}

describe("projectEventType (activityKind/place → engine event_type)", () => {
  it("meeting→meeting / work→work / move→travel / unknown→casual", () => {
    expect(projectEventType(ev({ id: "1", activityKind: "meeting" }))).toBe("meeting");
    expect(projectEventType(ev({ id: "2", activityKind: "work" }))).toBe("work");
    expect(projectEventType(ev({ id: "3", activityKind: "move" }))).toBe("travel");
    expect(projectEventType(ev({ id: "4", activityKind: "unknown" }))).toBe("casual");
  });
  it("meal: 夜→date / それ以外→casual", () => {
    expect(projectEventType(ev({ id: "5", activityKind: "meal", timeOfDay: "evening" }))).toBe("date");
    expect(projectEventType(ev({ id: "6", activityKind: "meal", timeOfDay: "day" }))).toBe("casual");
  });
  it("social: 夜→party / それ以外→casual", () => {
    expect(projectEventType(ev({ id: "7", activityKind: "social", timeOfDay: "evening" }))).toBe("party");
    expect(projectEventType(ev({ id: "8", activityKind: "social", timeOfDay: "day" }))).toBe("casual");
  });
  it("exercise/gym→sports、 outdoor 場所→outdoor", () => {
    expect(projectEventType(ev({ id: "9", activityKind: "exercise" }))).toBe("sports");
    expect(projectEventType(ev({ id: "10", activityKind: "unknown", placeKind: "gym" }))).toBe("sports");
    expect(projectEventType(ev({ id: "11", activityKind: "unknown", placeKind: "outdoor" }))).toBe("outdoor");
  });
});

describe("projectCalendarEvents", () => {
  it("event[] を {event_type,event_name}[] に写像し、 空 title は『予定』に補完", () => {
    const out = projectCalendarEvents([
      ev({ id: "a", activityKind: "meeting", title: "定例会議" }),
      ev({ id: "b", activityKind: "work", title: "" }),
    ]);
    expect(out).toEqual([
      { event_type: "meeting", event_name: "定例会議" },
      { event_type: "work", event_name: "予定" },
    ]);
  });
});

describe("buildOutfitDayContext", () => {
  it("空 events → 安全な default context", () => {
    expect(buildOutfitDayContext([])).toEqual({
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
    });
  });

  it("maxFormality は formal > office > smart_casual > casual の順で集約", () => {
    expect(
      buildOutfitDayContext([
        ev({ id: "1", formality: "casual" }),
        ev({ id: "2", formality: "smart_casual" }),
        ev({ id: "3", formality: "office" }),
      ]).maxFormality,
    ).toBe("office");
    expect(
      buildOutfitDayContext([
        ev({ id: "4", formality: "office" }),
        ev({ id: "5", formality: "formal" }),
      ]).maxFormality,
    ).toBe("formal");
  });

  it("mobility は high を優先して集約", () => {
    expect(
      buildOutfitDayContext([
        ev({ id: "1", mobility: "low" }),
        ev({ id: "2", mobility: "high" }),
        ev({ id: "3", mobility: "medium" }),
      ]).mobility,
    ).toBe("high");
  });

  it("has* フラグ + reasonTags 重複排除", () => {
    const ctx = buildOutfitDayContext([
      ev({ id: "1", activityKind: "meeting", formality: "office", reasonTags: ["会議あり", "オフィス"] }),
      ev({ id: "2", placeKind: "cafe", activityKind: "work", reasonTags: ["カフェ作業", "会議あり"] }),
      ev({ id: "3", activityKind: "meal", placeKind: "restaurant", reasonTags: ["外食"] }),
    ]);
    expect(ctx.hasMeeting).toBe(true);
    expect(ctx.hasCafeWork).toBe(true);
    expect(ctx.hasMeal).toBe(true);
    expect(ctx.hasClientOrFormal).toBe(true); // office formality
    expect(ctx.hasOutdoor).toBe(false);
    // 重複排除: "会議あり" は 1 回だけ
    expect(ctx.reasonTags.filter((t) => t === "会議あり")).toHaveLength(1);
    expect(ctx.reasonTags).toEqual(expect.arrayContaining(["会議あり", "オフィス", "カフェ作業", "外食"]));
    expect(ctx.eventCount).toBe(3);
  });

  it("dominantActivity は最頻活動 (unknown 除外)", () => {
    const ctx = buildOutfitDayContext([
      ev({ id: "1", activityKind: "work" }),
      ev({ id: "2", activityKind: "work" }),
      ev({ id: "3", activityKind: "meal" }),
      ev({ id: "4", activityKind: "unknown" }),
    ]);
    expect(ctx.dominantActivity).toBe("work");
  });
});

describe("privacy: 機微由来の文字列が DayContext.reasonTags に漏れない", () => {
  function oneOff(
    p: Partial<OneOffExternalAnchor> & { id: string; title: string; startTime: string },
  ): ExternalAnchor {
    return {
      anchorKind: "one_off",
      userId: "u1",
      rigidity: "soft",
      sourceId: "src1",
      confirmedAt: "2026-05-29T00:00:00.000Z",
      date: "2026-05-29",
      ...p,
    } as ExternalAnchor;
  }

  it("試験 (sensitive=exam) → maxFormality=formal、 reasonTags は『きちんとした場』で中身を出さない", () => {
    const events = anchorsToOutfitEvents(
      [oneOff({ id: "x", title: "数学の試験", startTime: "09:00", sensitiveCategory: "exam" })],
      new Date("2026-05-29T00:00:00.000Z"),
    );
    const ctx = buildOutfitDayContext(events);
    expect(ctx.maxFormality).toBe("formal");
    expect(ctx.reasonTags).toContain("きちんとした場");
    expect(ctx.reasonTags.join(" ")).not.toContain("試験");
    expect(ctx.reasonTags.join(" ")).not.toContain("exam");
  });
});
