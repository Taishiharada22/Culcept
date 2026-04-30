/**
 * timeLabel — PR-11 Step 2b 最小根治 の unit test
 *
 * カバレッジ:
 *   C1: 正常 range
 *     - startTime + durationMin > 0 + !isDayBoundary → "HH:MM–HH:MM"
 *   C2: isDayBoundary=true → 単一時刻（CEO 確定: 開始点/終点は range 対象外）
 *   C3: 退化 input
 *     - startTime undefined → undefined（caller fallback）
 *     - durationMin 0 / 負 / NaN → 単一時刻
 *     - 不正 startTime 形式 → 単一時刻 fallback
 *     - 24h 越え end → 単一時刻 fallback
 *   C4: helper function boundary
 *     - timeToMinutes: 境界値 (00:00, 23:59, 不正入力)
 *     - minutesToTimeHHMM: 境界値 (0, 1439, >=1440, 負数)
 */
import { describe, test, expect } from "vitest";

import {
  timeToMinutes,
  minutesToTimeHHMM,
  formatStartEndLabel,
} from "@/components/home/morning/timeLabel";

describe("timeToMinutes", () => {
  test("正常な HH:MM 形式を分に変換", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("09:30")).toBe(9 * 60 + 30);
    expect(timeToMinutes("23:59")).toBe(23 * 60 + 59);
  });

  test("一桁時間も受け付ける (9:30)", () => {
    expect(timeToMinutes("9:30")).toBe(9 * 60 + 30);
  });

  test("不正形式は undefined", () => {
    expect(timeToMinutes("invalid")).toBeUndefined();
    expect(timeToMinutes("9:5")).toBeUndefined(); // 分は 2 桁必須
    expect(timeToMinutes("")).toBeUndefined();
    expect(timeToMinutes("25:00")).toBeUndefined(); // 24h 以上
    expect(timeToMinutes("12:60")).toBeUndefined(); // 60 分
    expect(timeToMinutes("-1:00")).toBeUndefined();
  });

  test("非 string は undefined", () => {
    // @ts-expect-error - 型安全性の runtime guard
    expect(timeToMinutes(null)).toBeUndefined();
    // @ts-expect-error
    expect(timeToMinutes(undefined)).toBeUndefined();
    // @ts-expect-error
    expect(timeToMinutes(900)).toBeUndefined();
  });
});

describe("minutesToTimeHHMM", () => {
  test("正常な分値を HH:MM に変換", () => {
    expect(minutesToTimeHHMM(0)).toBe("00:00");
    expect(minutesToTimeHHMM(570)).toBe("09:30");
    expect(minutesToTimeHHMM(1439)).toBe("23:59");
  });

  test("境界値", () => {
    // 1440 = 24:00 相当 → invalid（clamp せず undefined）
    expect(minutesToTimeHHMM(1440)).toBeUndefined();
    expect(minutesToTimeHHMM(1500)).toBeUndefined();
  });

  test("負数 / NaN / Infinity", () => {
    expect(minutesToTimeHHMM(-1)).toBeUndefined();
    expect(minutesToTimeHHMM(NaN)).toBeUndefined();
    expect(minutesToTimeHHMM(Infinity)).toBeUndefined();
  });
});

describe("formatStartEndLabel — C1 正常 range", () => {
  test("通常行は startTime–endTime の range 文字列", () => {
    expect(
      formatStartEndLabel({
        startTime: "09:00",
        durationMin: 60,
        isDayBoundary: false,
      }),
    ).toBe("09:00–10:00");
  });

  test("en dash U+2013 で区切る (ハイフン - や em dash — ではない)", () => {
    const result = formatStartEndLabel({
      startTime: "09:00",
      durationMin: 30,
      isDayBoundary: false,
    });
    expect(result).toBe("09:00–09:30");
    // U+2013 (EN DASH) の確認
    expect(result?.includes("\u2013")).toBe(true);
    expect(result?.includes("-")).toBe(false);
    expect(result?.includes("\u2014")).toBe(false); // em dash 含めない
  });

  test("分単位の加算が正しい (跨ぎ時間)", () => {
    expect(
      formatStartEndLabel({
        startTime: "09:45",
        durationMin: 30,
        isDayBoundary: false,
      }),
    ).toBe("09:45–10:15");

    expect(
      formatStartEndLabel({
        startTime: "23:00",
        durationMin: 30,
        isDayBoundary: false,
      }),
    ).toBe("23:00–23:30");
  });
});

describe("formatStartEndLabel — C2 isDayBoundary", () => {
  test("isDayBoundary=true は startTime 単一値を返す (1日の開始点/終点)", () => {
    expect(
      formatStartEndLabel({
        startTime: "09:00",
        durationMin: 60,
        isDayBoundary: true,
      }),
    ).toBe("09:00");
  });

  test("isDayBoundary=true は durationMin が 0 でも単一値", () => {
    expect(
      formatStartEndLabel({
        startTime: "18:00",
        durationMin: 0,
        isDayBoundary: true,
      }),
    ).toBe("18:00");
  });

  test("isDayBoundary=true は endTime が 24h 越えでも影響なし (range 計算しない)", () => {
    // 1 日の終点が 23:30 + 120min = 25:30 相当でも、range にしないので fallback 不要
    expect(
      formatStartEndLabel({
        startTime: "23:30",
        durationMin: 120,
        isDayBoundary: true,
      }),
    ).toBe("23:30");
  });
});

describe("formatStartEndLabel — C3 退化 input", () => {
  test("startTime undefined → undefined (caller が [時間未確定] を出す)", () => {
    expect(
      formatStartEndLabel({
        startTime: undefined,
        durationMin: 60,
        isDayBoundary: false,
      }),
    ).toBeUndefined();
  });

  test("durationMin=0 → 単一時刻 (range が 0 幅になる退化を避ける)", () => {
    expect(
      formatStartEndLabel({
        startTime: "09:00",
        durationMin: 0,
        isDayBoundary: false,
      }),
    ).toBe("09:00");
  });

  test("durationMin 負数 → 単一時刻", () => {
    expect(
      formatStartEndLabel({
        startTime: "09:00",
        durationMin: -30,
        isDayBoundary: false,
      }),
    ).toBe("09:00");
  });

  test("durationMin NaN → 単一時刻", () => {
    expect(
      formatStartEndLabel({
        startTime: "09:00",
        durationMin: NaN,
        isDayBoundary: false,
      }),
    ).toBe("09:00");
  });

  test("startTime 形式不正 → 単一時刻 fallback (表示は壊さない)", () => {
    expect(
      formatStartEndLabel({
        startTime: "invalid",
        durationMin: 60,
        isDayBoundary: false,
      }),
    ).toBe("invalid");
  });

  test("endTime が 24h 越え (start 23:30 + 60min = 24:30) → 単一時刻 fallback", () => {
    expect(
      formatStartEndLabel({
        startTime: "23:30",
        durationMin: 60,
        isDayBoundary: false,
      }),
    ).toBe("23:30");
  });

  test("startTime=00:00 + durationMin=0 → 単一時刻", () => {
    expect(
      formatStartEndLabel({
        startTime: "00:00",
        durationMin: 0,
        isDayBoundary: false,
      }),
    ).toBe("00:00");
  });
});

describe("formatStartEndLabel — UI 契約整合", () => {
  test("PR-11 Step 2b CEO 要件: 非 boundary + 正常 input で range 化", () => {
    // CEO 要件確認: 「各予定の時刻表示を開始–終了にする」
    // 1 日の中間行の典型ケース
    expect(
      formatStartEndLabel({
        startTime: "12:00",
        durationMin: 90,
        isDayBoundary: false,
      }),
    ).toBe("12:00–13:30");
  });

  test("PR-11 Step 2b CEO 要件: 1日の開始点/終点は除外 → 単一時刻", () => {
    // CEO 要件「1日の開始点/終点は除く」
    // isDayBoundary=true の場合、どんな durationMin でも range 化しない
    const dayStart = formatStartEndLabel({
      startTime: "09:00",
      durationMin: 60,
      isDayBoundary: true,
    });
    const dayEnd = formatStartEndLabel({
      startTime: "22:00",
      durationMin: 60,
      isDayBoundary: true,
    });
    expect(dayStart).toBe("09:00");
    expect(dayEnd).toBe("22:00");
  });
});
