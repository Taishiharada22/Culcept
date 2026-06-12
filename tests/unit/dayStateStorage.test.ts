/**
 * dayStateStorage（W4・Stage 1）— roundtrip・30 日 purge・防御 parse・Reveal 既読の fixture
 * 正本: docs/day-state-alter-tab-v0-design.md §6.2 Stage 1
 */
import {
  DAY_STATE_KEY,
  MORNING_REVEAL_KEY,
  NIGHT_CHECK_KEY,
  STALE_DAYS,
  isRevealSeen,
  loadDayStateDays,
  loadNightCheckDays,
  markRevealSeen,
  saveDayStateRecord,
  saveNightCheck,
  type StorageLike,
  type StoredNightCheck,
} from "@/lib/plan/alterTab/dayStateStorage";
import { buildDayStateRecord } from "@/lib/plan/dayState/buildDayStateRecord";
import { gradeNightCheck } from "@/lib/plan/dayState/gradeNightCheck";
import type { DayStateRecordV0 } from "@/lib/plan/dayState/dayStateTypes";

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

function recordFor(date: string): DayStateRecordV0 {
  return buildDayStateRecord({
    date,
    nowHHMM: "07:00",
    segments: [
      { kind: "event", startHHMM: "10:00", endHHMM: "11:00", durationMin: 60, timeBucket: "morning" },
    ],
    shift: { kind: "none" },
    weather: null,
    moodCode: "tired",
  });
}

describe("plan_day_state_v0 — roundtrip と凍結保持", () => {
  it("save → load で record が一致（estimatesFrozen 込み）", () => {
    const s = fakeStorage();
    const rec = recordFor("2026-06-12");
    saveDayStateRecord(s, rec, "2026-06-12");
    const days = loadDayStateDays(s, "2026-06-12");
    expect(days["2026-06-12"]).toEqual(rec);
    expect(days["2026-06-12"]!.estimatesFrozen.frozenKind).toBe("morning_baseline");
  });

  it("複数日の併存と前日読取", () => {
    const s = fakeStorage();
    saveDayStateRecord(s, recordFor("2026-06-11"), "2026-06-11");
    saveDayStateRecord(s, recordFor("2026-06-12"), "2026-06-12");
    const days = loadDayStateDays(s, "2026-06-12");
    expect(Object.keys(days).sort()).toEqual(["2026-06-11", "2026-06-12"]);
  });

  it(`30 日 purge: ${STALE_DAYS} 日超過と未来日付は落ちる`, () => {
    const s = fakeStorage();
    saveDayStateRecord(s, recordFor("2026-05-01"), "2026-05-01"); // 42 日前
    saveDayStateRecord(s, recordFor("2026-06-12"), "2026-06-12");
    saveDayStateRecord(s, recordFor("2026-07-01"), "2026-06-12"); // 未来（不正データ）
    const days = loadDayStateDays(s, "2026-06-12");
    expect(days["2026-05-01"]).toBeUndefined();
    expect(days["2026-07-01"]).toBeUndefined();
    expect(days["2026-06-12"]).toBeDefined();
  });

  it("壊れた JSON / schema 不一致は空扱い（throw しない）", () => {
    expect(loadDayStateDays(fakeStorage({ [DAY_STATE_KEY]: "{broken" }), "2026-06-12")).toEqual({});
    expect(
      loadDayStateDays(fakeStorage({ [DAY_STATE_KEY]: '{"schemaVersion":9,"days":{}}' }), "2026-06-12"),
    ).toEqual({});
  });
});

describe("plan_night_check_v0 — record と同時運用（契約注意点 (i)）", () => {
  it("採点出力ごと保存・読取", () => {
    const s = fakeStorage();
    const rec = recordFor("2026-06-12");
    const grade = gradeNightCheck(rec, { dayFelt: 2, answeredAt: "21:30" });
    const entry: StoredNightCheck = {
      answeredAt: "21:30",
      answeredFor: "2026-06-12",
      dayFelt: 2,
      grade,
    };
    saveNightCheck(s, entry, "2026-06-12");
    const days = loadNightCheckDays(s, "2026-06-12");
    expect(days["2026-06-12"]).toEqual(entry);
    expect(days["2026-06-12"]!.grade.carryOverOut.recoveryDebt).toBe("some");
  });

  it("壊れたデータは空扱い", () => {
    expect(loadNightCheckDays(fakeStorage({ [NIGHT_CHECK_KEY]: "null" }), "2026-06-12")).toEqual({});
  });
});

describe("plan_morning_reveal_v0 — 既読管理（1 朝 1 回）", () => {
  it("mark 前 false → mark 後 true", () => {
    const s = fakeStorage();
    expect(isRevealSeen(s, "2026-06-11")).toBe(false);
    markRevealSeen(s, "2026-06-11", "2026-06-12T07:00:00.000Z", "2026-06-12");
    expect(isRevealSeen(s, "2026-06-11")).toBe(true);
  });
  it("壊れたキーは未読扱い（再表示side に倒す）", () => {
    expect(isRevealSeen(fakeStorage({ [MORNING_REVEAL_KEY]: "[]" }), "2026-06-11")).toBe(false);
  });
});
