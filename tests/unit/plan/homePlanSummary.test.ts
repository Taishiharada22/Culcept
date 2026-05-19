/**
 * Home Plan Pane Summary — pure logic tests (W1-Home-Swipe)
 *
 * `lib/plan/home-plan-summary.ts` の buildHomePlanSummary を deterministic に検証。
 * Date を inject して fixed-time でテスト。
 */

import { describe, it, expect } from "vitest";

import { buildHomePlanSummary } from "@/lib/plan/home-plan-summary";
import type {
  ExternalAnchor,
  OneOffExternalAnchor,
  RecurringExternalAnchor,
} from "@/lib/plan/external-anchor";

const USER_A = "user-A";
const SOURCE_A = "src-A";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function oneOff(
  id: string,
  date: string,
  startTime: string,
  title = "予定"
): OneOffExternalAnchor {
  return {
    id,
    userId: USER_A,
    sourceId: SOURCE_A,
    title,
    startTime,
    rigidity: "hard",
    confirmedAt: "2026-05-19T00:00:00.000Z",
    anchorKind: "one_off",
    date,
  };
}

function recurring(
  id: string,
  validFrom: string,
  recurrenceRule: string,
  title = "繰り返し"
): RecurringExternalAnchor {
  return {
    id,
    userId: USER_A,
    sourceId: SOURCE_A,
    title,
    startTime: "10:00",
    rigidity: "soft",
    confirmedAt: "2026-05-19T00:00:00.000Z",
    anchorKind: "recurring",
    validFrom,
    recurrenceRule,
  };
}

// Wed 2026-05-20 14:30 local
const NOW = new Date(2026, 4, 20, 14, 30, 0, 0);

describe("buildHomePlanSummary", () => {
  describe("empty input", () => {
    it("空配列 → isEmpty=true、全 field 空", () => {
      const s = buildHomePlanSummary([], NOW);
      expect(s.isEmpty).toBe(true);
      expect(s.today).toEqual([]);
      expect(s.tomorrow).toEqual([]);
      expect(s.thisWeekOneOffCount).toBe(0);
      expect(s.recurringTemplateCount).toBe(0);
      expect(s.nextUpcoming).toBeNull();
    });
  });

  describe("today partition", () => {
    it("today date と一致する one_off は today に入る", () => {
      const anchors: ExternalAnchor[] = [
        oneOff("a1", "2026-05-20", "16:00", "歯科"),
      ];
      const s = buildHomePlanSummary(anchors, NOW);
      expect(s.today).toHaveLength(1);
      expect(s.today[0]!.id).toBe("a1");
    });

    it("today date と異なる one_off は today に入らない", () => {
      const anchors: ExternalAnchor[] = [
        oneOff("a1", "2026-05-21", "10:00"),
        oneOff("a2", "2026-05-19", "10:00"),
      ];
      const s = buildHomePlanSummary(anchors, NOW);
      expect(s.today).toEqual([]);
    });

    it("today の anchor は startTime 昇順", () => {
      const anchors: ExternalAnchor[] = [
        oneOff("a1", "2026-05-20", "16:00", "Z"),
        oneOff("a2", "2026-05-20", "09:00", "A"),
        oneOff("a3", "2026-05-20", "12:00", "M"),
      ];
      const s = buildHomePlanSummary(anchors, NOW);
      expect(s.today.map((a) => a.id)).toEqual(["a2", "a3", "a1"]);
    });

    it("同 startTime は title 昇順で決定論的", () => {
      const anchors: ExternalAnchor[] = [
        oneOff("a1", "2026-05-20", "10:00", "Z"),
        oneOff("a2", "2026-05-20", "10:00", "A"),
      ];
      const s = buildHomePlanSummary(anchors, NOW);
      expect(s.today.map((a) => a.id)).toEqual(["a2", "a1"]);
    });
  });

  describe("tomorrow partition", () => {
    it("tomorrow date (today + 1) の one_off は tomorrow に入る", () => {
      const anchors: ExternalAnchor[] = [
        oneOff("t1", "2026-05-21", "09:00"),
      ];
      const s = buildHomePlanSummary(anchors, NOW);
      expect(s.tomorrow).toHaveLength(1);
      expect(s.tomorrow[0]!.id).toBe("t1");
    });

    it("月跨ぎ tomorrow (5/31 → 6/1) も正しく計算", () => {
      const may31 = new Date(2026, 4, 31, 10, 0);
      const anchors: ExternalAnchor[] = [
        oneOff("t1", "2026-06-01", "09:00"),
      ];
      const s = buildHomePlanSummary(anchors, may31);
      expect(s.tomorrow).toHaveLength(1);
    });
  });

  describe("thisWeek count", () => {
    it("today + 6 日以内の one_off を count", () => {
      const anchors: ExternalAnchor[] = [
        oneOff("a1", "2026-05-20", "10:00"), // today
        oneOff("a2", "2026-05-22", "10:00"), // +2
        oneOff("a3", "2026-05-26", "10:00"), // +6 (week end)
        oneOff("a4", "2026-05-27", "10:00"), // +7 (out of week)
        oneOff("a5", "2026-05-19", "10:00"), // -1 (past)
      ];
      const s = buildHomePlanSummary(anchors, NOW);
      expect(s.thisWeekOneOffCount).toBe(3); // a1, a2, a3
    });

    it("recurring は thisWeekOneOffCount に含まれない", () => {
      const anchors: ExternalAnchor[] = [
        recurring("r1", "2026-04-01", "FREQ=WEEKLY;BYDAY=MO"),
      ];
      const s = buildHomePlanSummary(anchors, NOW);
      expect(s.thisWeekOneOffCount).toBe(0);
      expect(s.recurringTemplateCount).toBe(1);
    });
  });

  describe("recurring template count", () => {
    it("recurring template は date 関係なく全 count", () => {
      const anchors: ExternalAnchor[] = [
        recurring("r1", "2026-04-01", "FREQ=WEEKLY;BYDAY=MO"),
        recurring("r2", "2025-01-01", "FREQ=DAILY"),
        recurring("r3", "2027-01-01", "FREQ=MONTHLY"),
      ];
      const s = buildHomePlanSummary(anchors, NOW);
      expect(s.recurringTemplateCount).toBe(3);
    });
  });

  describe("nextUpcoming", () => {
    it("今日の現在時刻以降の anchor が最優先", () => {
      const anchors: ExternalAnchor[] = [
        oneOff("a1", "2026-05-20", "09:00", "過去"), // past today
        oneOff("a2", "2026-05-20", "16:00", "今日後"), // future today
        oneOff("a3", "2026-05-21", "10:00", "明日"), // tomorrow
      ];
      const s = buildHomePlanSummary(anchors, NOW); // now=14:30
      expect(s.nextUpcoming?.id).toBe("a2");
    });

    it("今日の future がない場合は明日の最早が next", () => {
      const anchors: ExternalAnchor[] = [
        oneOff("a1", "2026-05-20", "09:00", "過去"),
        oneOff("a2", "2026-05-21", "10:00", "明日朝"),
        oneOff("a3", "2026-05-21", "07:00", "明日早朝"),
      ];
      const s = buildHomePlanSummary(anchors, NOW);
      expect(s.nextUpcoming?.id).toBe("a3");
    });

    it("今日 / 明日 共に空なら null", () => {
      const anchors: ExternalAnchor[] = [
        oneOff("a1", "2026-05-22", "10:00"),
      ];
      const s = buildHomePlanSummary(anchors, NOW);
      expect(s.nextUpcoming).toBeNull();
    });

    it("now と完全に同時刻の今日 anchor は upcoming に含まれる", () => {
      const anchors: ExternalAnchor[] = [
        oneOff("a1", "2026-05-20", "14:30", "ピッタリ"),
      ];
      const s = buildHomePlanSummary(anchors, NOW);
      expect(s.nextUpcoming?.id).toBe("a1");
    });
  });

  describe("isEmpty", () => {
    it("today / tomorrow / week / recurring 全 0 のみ isEmpty=true", () => {
      const s = buildHomePlanSummary([], NOW);
      expect(s.isEmpty).toBe(true);
    });

    it("recurring 1 件のみでも isEmpty=false", () => {
      const anchors: ExternalAnchor[] = [
        recurring("r1", "2026-04-01", "FREQ=WEEKLY;BYDAY=MO"),
      ];
      const s = buildHomePlanSummary(anchors, NOW);
      expect(s.isEmpty).toBe(false);
    });

    it("今日の anchor 0、明日 0、今週 0 だが thisWeek外 future がある → isEmpty=true (本 summary の責務外)", () => {
      // 設計判断: this week 外の future は summary に出さない (Plan を開く CTA で誘導)
      const anchors: ExternalAnchor[] = [
        oneOff("a1", "2026-06-15", "10:00"),
      ];
      const s = buildHomePlanSummary(anchors, NOW);
      expect(s.isEmpty).toBe(true);
    });
  });

  describe("mixed scenario", () => {
    it("複合 case: today 2 件 / tomorrow 1 件 / week 5 件 / recurring 2 件", () => {
      const anchors: ExternalAnchor[] = [
        oneOff("a1", "2026-05-20", "09:00", "朝会"),
        oneOff("a2", "2026-05-20", "16:00", "歯科"),
        oneOff("a3", "2026-05-21", "10:00", "ランチ"),
        oneOff("a4", "2026-05-22", "10:00"),
        oneOff("a5", "2026-05-24", "10:00"),
        oneOff("a6", "2026-05-19", "10:00"), // past
        recurring("r1", "2026-04-01", "FREQ=WEEKLY;BYDAY=MO"),
        recurring("r2", "2026-04-01", "FREQ=DAILY"),
      ];
      const s = buildHomePlanSummary(anchors, NOW);
      expect(s.today).toHaveLength(2);
      expect(s.tomorrow).toHaveLength(1);
      expect(s.thisWeekOneOffCount).toBe(5); // a1, a2, a3, a4, a5
      expect(s.recurringTemplateCount).toBe(2);
      expect(s.nextUpcoming?.id).toBe("a2"); // today 14:30 以降の最早
      expect(s.isEmpty).toBe(false);
    });
  });

  describe("now default", () => {
    it("now を渡さない場合は new Date() で動作 (smoke)", () => {
      // 内容に再現性はないが、throw しないことだけ確認
      const s = buildHomePlanSummary([oneOff("a1", "2026-05-20", "10:00")]);
      expect(s).toBeDefined();
      expect(s.isEmpty).toBeDefined();
    });
  });
});
