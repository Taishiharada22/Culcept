/**
 * briefBuilder __internal helper tests.
 *
 * 焦点: 2026-04-21 S1 朝誤認修正（rectifyBriefTimeByHour）
 *   LLM が "morning" を返しても explicit hour が 11 なら afternoon に矯正される。
 *   narrationBuilder.formatWhenFromBrief が正しく「昼」と表記するかの基盤。
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { __internal } from "@/lib/coalter/briefBuilder";
import type { ConversationBrief } from "@/lib/coalter/types";

const { rectifyBriefTimeByHour, mapTimeSlot, extractPreferredStartHour } =
  __internal;

function baseBrief(
  timeSlot: "morning" | "afternoon" | "evening" | "night" | null,
  preferredStartHour: number | null = null,
): ConversationBrief {
  return {
    theme: "food",
    area: "新宿",
    approximateTime: {
      date: null,
      timeSlot,
      preferredStartHour,
    },
    mood: [],
    hardConstraints: [],
    rankingAxes: {
      preset: "balance_focus",
      roles: ["balance", "aFocus", "bFocus"],
      rationale: "",
    },
    primaryUnresolvedQuestion: null,
    confidence: 0.6,
    fieldConfidence: {
      theme: 0.85,
      area: 0.75,
      approximateTime: 0.7,
    },
    source: "llm",
  };
}

describe("briefBuilder.__internal", () => {
  describe("mapTimeSlot (既存)", () => {
    it("11時 → afternoon", () => {
      expect(mapTimeSlot("11時")).toBe("afternoon");
    });
    it("7時 → morning", () => {
      expect(mapTimeSlot("7時")).toBe("morning");
    });
    it("19時 → evening", () => {
      expect(mapTimeSlot("19時")).toBe("evening");
    });
    it("22時 → night", () => {
      expect(mapTimeSlot("22時")).toBe("night");
    });
  });

  describe("extractPreferredStartHour (既存)", () => {
    it("'11時頃に行こう' から 11 を抽出", () => {
      expect(extractPreferredStartHour("11時頃に行こう")).toBe(11);
    });
    it("時刻なし → null", () => {
      expect(extractPreferredStartHour("朝から動こう")).toBeNull();
    });
  });

  describe("rectifyBriefTimeByHour (2026-04-21 S1 朝誤認修正)", () => {
    it("LLM が morning を返し、explicit hour=11 → afternoon に矯正", () => {
      const brief = baseBrief("morning", null);
      const rectified = rectifyBriefTimeByHour(brief, 11);
      expect(rectified.approximateTime.timeSlot).toBe("afternoon");
      expect(rectified.approximateTime.preferredStartHour).toBe(11);
    });

    it("LLM が既に afternoon で hour=11 も一致 → 元 brief を返す（no-op）", () => {
      const brief = baseBrief("afternoon", 11);
      const rectified = rectifyBriefTimeByHour(brief, 11);
      expect(rectified).toBe(brief); // 同じ参照
    });

    it("hour=7 + LLM=null → morning に補完", () => {
      const brief = baseBrief(null, null);
      const rectified = rectifyBriefTimeByHour(brief, 7);
      expect(rectified.approximateTime.timeSlot).toBe("morning");
      expect(rectified.approximateTime.preferredStartHour).toBe(7);
    });

    it("hour=19 + LLM=afternoon → evening に矯正", () => {
      const brief = baseBrief("afternoon", null);
      const rectified = rectifyBriefTimeByHour(brief, 19);
      expect(rectified.approximateTime.timeSlot).toBe("evening");
    });

    it("preferredStartHour が既にあれば上書きしない", () => {
      const brief = baseBrief("morning", 11);
      const rectified = rectifyBriefTimeByHour(brief, 11);
      // timeSlot は afternoon に矯正、hour は元の 11 を保持
      expect(rectified.approximateTime.preferredStartHour).toBe(11);
      expect(rectified.approximateTime.timeSlot).toBe("afternoon");
    });
  });
});
