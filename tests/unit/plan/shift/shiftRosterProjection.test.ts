import { describe, it, expect } from "vitest";
import {
  projectShiftRoster,
  countPublicHolidays,
  type ShiftCellReading,
} from "@/lib/plan/shift/shiftRosterProjection";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";

const dict = HARADA_SPRIX_DICTIONARY;

function cell(date: string, rawCode: string): ShiftCellReading {
  return { date, rawCode };
}

describe("projectShiftRoster — code 別振り分け", () => {
  it("勤務（G）→ timed_event（09:00-17:45）", () => {
    const out = projectShiftRoster([cell("2025-07-08", "G")], dict);
    expect(out.timedEvents).toHaveLength(1);
    expect(out.timedEvents[0]).toMatchObject({
      date: "2025-07-08",
      title: "日勤",
      startTime: "09:00",
      endTime: "17:45",
      endsNextDay: false,
      semanticType: "day_work",
    });
    expect(out.dayIndicators).toHaveLength(0);
  });

  it("夜勤（N）→ timed_event 日跨ぎ（18:00→06:45）", () => {
    const out = projectShiftRoster([cell("2025-07-06", "N")], dict);
    expect(out.timedEvents[0]).toMatchObject({
      startTime: "18:00",
      endTime: "06:45",
      endsNextDay: true,
    });
  });

  it("休み（H）→ day_indicator（時間枠を作らない）+ 公休フラグ", () => {
    const out = projectShiftRoster([cell("2025-07-03", "H")], dict);
    expect(out.timedEvents).toHaveLength(0); // ★ 休みは枠にしない
    expect(out.dayIndicators).toHaveLength(1);
    expect(out.dayIndicators[0]).toMatchObject({
      date: "2025-07-03",
      label: "休（公休）",
      countsAsPublicHoliday: true,
    });
  });

  it("BD（休み・非公休）→ day_indicator、公休フラグ false", () => {
    const out = projectShiftRoster([cell("2025-07-01", "BD")], dict);
    expect(out.timedEvents).toHaveLength(0);
    expect(out.dayIndicators[0]).toMatchObject({
      countsAsPublicHoliday: false,
    });
  });

  it("HREQ（希望休）→ candidate", () => {
    const out = projectShiftRoster([cell("2025-07-02", "HREQ")], dict);
    expect(out.candidates).toHaveLength(1);
    expect(out.timedEvents).toHaveLength(0);
    expect(out.dayIndicators).toHaveLength(0);
  });

  it("空セルは何も生成しない（記載なし = イベントなし）", () => {
    const out = projectShiftRoster(
      [cell("2025-07-09", ""), cell("2025-07-10", "  ")],
      dict
    );
    expect(out.timedEvents).toHaveLength(0);
    expect(out.dayIndicators).toHaveLength(0);
    expect(out.candidates).toHaveLength(0);
    expect(out.unresolved).toHaveLength(0);
  });

  it("辞書に無いコード → unresolved（沈黙させない）", () => {
    const out = projectShiftRoster([cell("2025-07-09", "ZZ")], dict);
    expect(out.unresolved).toEqual([
      { date: "2025-07-09", rawCode: "ZZ", reason: "unknown_code" },
    ]);
  });
});

describe("July 原田行 fixture（bootstrap・要 CEO 視覚検証）", () => {
  // CEO 提供画像からの私の読み取り草案（synthetic・bootstrap ground truth）
  const julyCodes = [
    "BD", "HREQ", "H", "E-18", "L", "N", "L", "G", "H", "H", // 1-10
    "L", "L", "E", "N", "BD", "H", "H", "E-18", "L", "N", // 11-20
    "L", "G", "H", "H", "L", "L", "E", "N", "BD", "H", // 21-30
    "E-18", // 31
  ];
  const julyCells: ShiftCellReading[] = julyCodes.map((rawCode, i) =>
    cell(`2025-07-${String(i + 1).padStart(2, "0")}`, rawCode)
  );

  it("31 セル・unresolved なし（全コードが辞書に存在）", () => {
    expect(julyCells).toHaveLength(31);
    const out = projectShiftRoster(julyCells, dict);
    expect(out.unresolved).toHaveLength(0);
  });

  it("振り分け内訳: 勤務19 / 休み11 / 候補1", () => {
    const out = projectShiftRoster(julyCells, dict);
    expect(out.timedEvents).toHaveLength(19); // E/E-18/N/L/G
    expect(out.dayIndicators).toHaveLength(11); // H(8) + BD(3)
    expect(out.candidates).toHaveLength(1); // HREQ
  });

  it("公休 checksum = 8（CEO 訂正の 7月公休=8 と一致）", () => {
    // H のみカウント。画像印字「9」は GPT 推論ズレで無効
    expect(countPublicHolidays(julyCells, dict)).toBe(8);
  });

  it("休みの日付（1日=BD）はタイムライン枠に出ない", () => {
    const out = projectShiftRoster(julyCells, dict);
    const timedDates = out.timedEvents.map((e) => e.date);
    expect(timedDates).not.toContain("2025-07-01"); // BD
    expect(timedDates).not.toContain("2025-07-03"); // H
    const indicatorDates = out.dayIndicators.map((d) => d.date);
    expect(indicatorDates).toContain("2025-07-01");
    expect(indicatorDates).toContain("2025-07-03");
  });
});
