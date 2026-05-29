import { describe, it, expect } from "vitest";

import type { ExternalAnchor, OneOffExternalAnchor } from "@/lib/plan/external-anchor";
import {
  anchorsToOutfitEvents,
  inferTimeOfDay,
  inferPlaceKind,
  inferActivityKind,
  inferFormality,
  inferSocialContext,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/anchorsToOutfitEvents";

const DAY = new Date("2026-05-29T00:00:00.000Z"); // 2026-05-29
const DATE = "2026-05-29";

/** 最小 one_off anchor ファクトリ */
function oneOff(
  p: Partial<OneOffExternalAnchor> & { id: string; title: string; startTime: string },
): ExternalAnchor {
  return {
    anchorKind: "one_off",
    userId: "u1",
    rigidity: "soft",
    sourceId: "src1",
    confirmedAt: "2026-05-29T00:00:00.000Z",
    date: DATE,
    ...p,
  } as ExternalAnchor;
}

describe("inferTimeOfDay", () => {
  it("時刻帯を _helpers と同じ帯で分類", () => {
    expect(inferTimeOfDay("08:00")).toBe("morning");
    expect(inferTimeOfDay("13:00")).toBe("day");
    expect(inferTimeOfDay("19:30")).toBe("evening");
    expect(inferTimeOfDay("23:00")).toBe("night");
    expect(inferTimeOfDay(undefined)).toBe("unknown");
  });
});

describe("inferPlaceKind (構造化 locationCategory + title 上書き)", () => {
  it("title の具体語が locationCategory より優先 (public だが『レストラン』→ restaurant)", () => {
    const a = oneOff({ id: "a", title: "歓迎会 レストラン", startTime: "19:00", locationCategory: "public" });
    expect(inferPlaceKind(a)).toBe("restaurant");
  });
  it("title 具体語なし → locationCategory を使用 (cafe)", () => {
    const a = oneOff({ id: "b", title: "ひと休み", startTime: "15:00", locationCategory: "cafe" });
    expect(inferPlaceKind(a)).toBe("cafe");
  });
  it("Zoom → online、 transit → station", () => {
    expect(inferPlaceKind(oneOff({ id: "c", title: "Zoom 定例", startTime: "10:00" }))).toBe("online");
    expect(inferPlaceKind(oneOff({ id: "d", title: "移動", startTime: "09:00", locationCategory: "transit" }))).toBe("station");
  });
  it("情報なし → unknown", () => {
    expect(inferPlaceKind(oneOff({ id: "e", title: "", startTime: "12:00" }))).toBe("unknown");
  });
});

describe("inferActivityKind (title 語 → placeKind 補完)", () => {
  it("『打ち合わせ』→ meeting", () => {
    const a = oneOff({ id: "a", title: "10時 打ち合わせ", startTime: "10:00" });
    expect(inferActivityKind(a, inferPlaceKind(a))).toBe("meeting");
  });
  it("title 弱い + placeKind=restaurant → meal (場所から補完)", () => {
    const a = oneOff({ id: "b", title: "予約", startTime: "19:00", locationCategory: "public", locationText: "イタリアン レストラン" });
    expect(inferActivityKind(a, inferPlaceKind(a))).toBe("meal");
  });
});

describe("inferFormality (横断推論 + 機微)", () => {
  it("面接 → formal", () => {
    expect(inferFormality("meeting", "office", "client", undefined, "最終 面接")).toBe("formal");
  });
  it("sensitiveCategory exam → formal (中身は formality だけに反映)", () => {
    expect(inferFormality("unknown", "unknown", "solo", "exam", "予定")).toBe("formal");
  });
  it("meeting / office → office、 restaurant → smart_casual、 home → casual", () => {
    expect(inferFormality("meeting", "unknown", "solo", undefined, "会議")).toBe("office");
    expect(inferFormality("meal", "restaurant", "friend", undefined, "ディナー")).toBe("smart_casual");
    expect(inferFormality("rest", "home", "solo", undefined, "休息")).toBe("casual");
  });
});

describe("inferSocialContext", () => {
  it("商談→client / チーム→team / 友達→friend / 既定→solo", () => {
    expect(inferSocialContext(oneOff({ id: "a", title: "商談", startTime: "10:00" }))).toBe("client");
    expect(inferSocialContext(oneOff({ id: "b", title: "チーム会議", startTime: "11:00" }))).toBe("team");
    expect(inferSocialContext(oneOff({ id: "c", title: "友達とランチ", startTime: "12:00" }))).toBe("friend");
    expect(inferSocialContext(oneOff({ id: "d", title: "作業", startTime: "14:00" }))).toBe("solo");
  });
});

describe("anchorsToOutfitEvents (統合)", () => {
  it("予定なし → 空配列", () => {
    expect(anchorsToOutfitEvents([], DAY)).toEqual([]);
  });

  it("会議@office → activityKind=meeting / formality=office / reasonTags に『会議あり』", () => {
    const events = anchorsToOutfitEvents(
      [oneOff({ id: "m1", title: "定例 会議", startTime: "10:00", locationCategory: "office", rigidity: "hard" })],
      DAY,
    );
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.date).toBe(DATE);
    expect(ev.activityKind).toBe("meeting");
    expect(ev.formality).toBe("office");
    expect(ev.timeOfDay).toBe("morning");
    expect(ev.fixed).toBe(true); // rigidity hard
    expect(ev.reasonTags).toContain("会議あり");
  });

  it("カフェ作業 → reasonTags に『カフェ作業』", () => {
    const events = anchorsToOutfitEvents(
      [oneOff({ id: "c1", title: "カフェで作業", startTime: "14:00", locationCategory: "cafe" })],
      DAY,
    );
    expect(events[0].placeKind).toBe("cafe");
    expect(events[0].activityKind).toBe("work");
    expect(events[0].reasonTags).toContain("カフェ作業");
  });

  it("試験 (機微) → formality=formal、 reasonTags は『きちんとした場』のみで機微の中身を出さない", () => {
    const events = anchorsToOutfitEvents(
      [oneOff({ id: "x1", title: "数学の試験", startTime: "09:00", sensitiveCategory: "exam" })],
      DAY,
    );
    const ev = events[0];
    expect(ev.formality).toBe("formal");
    expect(ev.reasonTags).toContain("きちんとした場");
    // privacy: 機微の中身 (試験/exam) を tag に晒さない
    expect(ev.reasonTags.join(" ")).not.toContain("試験");
    expect(ev.reasonTags.join(" ")).not.toContain("exam");
  });

  it("title / location 欠落でも落ちず unknown に倒す", () => {
    const events = anchorsToOutfitEvents([oneOff({ id: "u1", title: "", startTime: "12:00" })], DAY);
    expect(events).toHaveLength(1);
    expect(events[0].placeKind).toBe("unknown");
    expect(events[0].activityKind).toBe("unknown");
  });

  it("前後で場所が違えば mobility=medium、 移動予定は high", () => {
    const events = anchorsToOutfitEvents(
      [
        oneOff({ id: "o1", title: "午前 会議", startTime: "10:00", locationCategory: "office" }),
        oneOff({ id: "r1", title: "夜 レストラン ディナー", startTime: "19:00" }),
      ],
      DAY,
    );
    expect(events).toHaveLength(2);
    expect(events[0].mobility).toBe("medium"); // office → (next) restaurant
    expect(events[1].mobility).toBe("medium");

    const moveEv = anchorsToOutfitEvents(
      [oneOff({ id: "mv", title: "電車で移動", startTime: "08:00", locationCategory: "transit" })],
      DAY,
    );
    expect(moveEv[0].mobility).toBe("high");
    expect(moveEv[0].reasonTags).toContain("移動多め");
  });
});
