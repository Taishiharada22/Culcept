import { describe, it, expect } from "vitest";

import {
  MINUTES_PER_DAY,
  DEFAULT_WINDOW_START_MIN,
  DEFAULT_WINDOW_END_MIN,
  type TimelineViewport,
  windowMinutes,
  pxPerMin,
  minutesToY,
  yToMinutes,
  snapMinutes,
  snappedMinAtY,
  layoutLanes,
  clampMin,
  computeWindowStart,
  formatMinutes,
  parseMinutes,
} from "@/lib/plan/timeline-geometry";

// 既定可視窓 6:00–24:00 を高さ 540px に圧縮（俯瞰・A-0-5）。1080 分 → 0.5 px/分。
const VP: TimelineViewport = {
  startMin: DEFAULT_WINDOW_START_MIN, // 360
  endMin: DEFAULT_WINDOW_END_MIN, // 1440
  heightPx: 540,
};

describe("constants", () => {
  it("1日=1440分、既定窓=6:00–24:00", () => {
    expect(MINUTES_PER_DAY).toBe(1440);
    expect(DEFAULT_WINDOW_START_MIN).toBe(360);
    expect(DEFAULT_WINDOW_END_MIN).toBe(1440);
  });
});

describe("windowMinutes / pxPerMin", () => {
  it("窓幅と px/分を算出（俯瞰圧縮）", () => {
    expect(windowMinutes(VP)).toBe(1080);
    expect(pxPerMin(VP)).toBeCloseTo(0.5, 6);
  });

  it("窓幅 ≤ 0 / 高さ ≤ 0 は 0（除算ガード）", () => {
    expect(pxPerMin({ startMin: 600, endMin: 600, heightPx: 540 })).toBe(0);
    expect(pxPerMin({ startMin: 700, endMin: 600, heightPx: 540 })).toBe(0);
    expect(pxPerMin({ startMin: 360, endMin: 1440, heightPx: 0 })).toBe(0);
  });
});

describe("minutesToY / yToMinutes", () => {
  it("窓開始は Y=0、窓末端は Y=heightPx", () => {
    expect(minutesToY(360, VP)).toBe(0);
    expect(minutesToY(1440, VP)).toBe(540);
    expect(minutesToY(900, VP)).toBe((900 - 360) * 0.5); // 270
  });

  it("round-trip（分→Y→分）", () => {
    for (const min of [360, 540, 720, 905, 1439]) {
      expect(yToMinutes(minutesToY(min, VP), VP)).toBeCloseTo(min, 6);
    }
  });

  it("pxPerMin=0 のとき yToMinutes は窓開始を返す", () => {
    const degenerate: TimelineViewport = { startMin: 600, endMin: 600, heightPx: 540 };
    expect(yToMinutes(123, degenerate)).toBe(600);
  });
});

describe("snapMinutes", () => {
  it("既定 grid=1 は最近傍整数", () => {
    expect(snapMinutes(905.4)).toBe(905);
    expect(snapMinutes(905.6)).toBe(906);
  });

  it("grid=15 / 30 に丸め（最近傍）", () => {
    expect(snapMinutes(907, 15)).toBe(900);
    expect(snapMinutes(908, 15)).toBe(915);
    expect(snapMinutes(914, 30)).toBe(900); // 30.47 → 900
    expect(snapMinutes(916, 30)).toBe(930); // 30.53 → 930
  });

  it("grid ≤ 0 は整数丸め", () => {
    expect(snapMinutes(905.6, 0)).toBe(906);
  });
});

describe("snappedMinAtY（drop 位置 → 配置開始分）", () => {
  const VP: TimelineViewport = { startMin: 360, endMin: 1440, heightPx: 540 }; // 0.5px/分

  it("局所Y → 窓開始 + Y/pxPerMin を grid に snap", () => {
    expect(snappedMinAtY(0, VP, 5)).toBe(360); // 06:00
    expect(snappedMinAtY(270, VP, 5)).toBe(900); // 15:00
    expect(snappedMinAtY(283, VP, 5)).toBe(925); // 926 → 5分 snap → 925
  });

  it("grid=1 は分そのまま丸め", () => {
    expect(snappedMinAtY(283, VP, 1)).toBe(926);
  });
});

describe("P5-Height: 高さ非依存の正しさ（render=drop を単一 height source にする前提を固定）", () => {
  const HEIGHTS = [360, 440, 472, 520]; // clamp(360, 56dvh, 520) の代表値
  for (const h of HEIGHTS) {
    const vp: TimelineViewport = { startMin: 360, endMin: 1440, heightPx: h };
    it(`height=${h}: 窓開始 Y=0 / 窓末端 Y=height（range 6:00–24:00 不変）`, () => {
      expect(minutesToY(360, vp)).toBe(0);
      expect(minutesToY(1440, vp)).toBeCloseTo(h, 6);
    });
    it(`height=${h}: round-trip 分→Y→分`, () => {
      for (const m of [360, 540, 720, 905, 1320, 1439]) {
        expect(yToMinutes(minutesToY(m, vp), vp)).toBeCloseTo(m, 6);
      }
    });
    it(`height=${h}: drop Y→分→Y round-trip（22時以降も作れる）`, () => {
      for (const y of [0, h * 0.25, h * 0.5, h * 0.75, h]) {
        expect(minutesToY(yToMinutes(y, vp), vp)).toBeCloseTo(y, 6);
      }
      expect(yToMinutes(0, vp)).toBe(360); // 06:00
      expect(yToMinutes(h, vp)).toBeCloseTo(1440, 6); // 24:00
      // 22:00 (=1320) は窓内に必ず位置する
      const y22 = minutesToY(1320, vp);
      expect(y22).toBeGreaterThan(0);
      expect(y22).toBeLessThan(h);
    });
  }
  it("同一 Y でも height が違えば別の分（= render≠drop height だとズレる、の明示）", () => {
    const y = 200;
    const m360 = yToMinutes(y, { startMin: 360, endMin: 1440, heightPx: 360 });
    const m520 = yToMinutes(y, { startMin: 360, endMin: 1440, heightPx: 520 });
    expect(Math.abs(m360 - m520)).toBeGreaterThan(60); // 1時間以上ズレる→必ず同一 source に
  });
});

describe("layoutLanes（重なり横分割）", () => {
  it("重ならない（touching 含む）群は lanes=1（全幅）", () => {
    const m = layoutLanes([
      { id: "a", startMin: 540, endMin: 600 },
      { id: "b", startMin: 600, endMin: 660 }, // touching = 非重なり
    ]);
    expect(m.get("a")).toEqual({ lane: 0, lanes: 1 });
    expect(m.get("b")).toEqual({ lane: 0, lanes: 1 });
  });

  it("2件重なり → lanes=2、lane 0/1", () => {
    const m = layoutLanes([
      { id: "a", startMin: 540, endMin: 660 },
      { id: "b", startMin: 600, endMin: 720 },
    ]);
    expect(m.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(m.get("b")).toEqual({ lane: 1, lanes: 2 });
  });

  it("重なり解消後は別群（lanes 独立）", () => {
    const m = layoutLanes([
      { id: "a", startMin: 540, endMin: 660 },
      { id: "b", startMin: 600, endMin: 720 },
      { id: "c", startMin: 800, endMin: 860 },
    ]);
    expect(m.get("a")!.lanes).toBe(2);
    expect(m.get("b")!.lanes).toBe(2);
    expect(m.get("c")).toEqual({ lane: 0, lanes: 1 });
  });

  it("空配列は空 Map", () => {
    expect(layoutLanes([]).size).toBe(0);
  });
});

describe("clampMin", () => {
  it("範囲内/下限/上限", () => {
    expect(clampMin(500, 0, 1439)).toBe(500);
    expect(clampMin(-30, 0, 1439)).toBe(0);
    expect(clampMin(2000, 0, 1439)).toBe(1439);
  });
});

describe("formatMinutes", () => {
  it("HH:MM ゼロ埋め", () => {
    expect(formatMinutes(0)).toBe("00:00");
    expect(formatMinutes(9 * 60 + 5)).toBe("09:05");
    expect(formatMinutes(15 * 60)).toBe("15:00");
    expect(formatMinutes(23 * 60 + 59)).toBe("23:59");
  });

  it("1440 は 24:00（窓末端表示）", () => {
    expect(formatMinutes(1440)).toBe("24:00");
  });

  it("範囲外は 1 日ラップ（例外なし）", () => {
    expect(formatMinutes(1500)).toBe("01:00"); // 1500 % 1440 = 60
    expect(formatMinutes(-30)).toBe("23:30");
  });

  it("端数は四捨五入", () => {
    expect(formatMinutes(540.6)).toBe("09:01");
  });
});

describe("parseMinutes", () => {
  it("正常な HH:MM", () => {
    expect(parseMinutes("00:00")).toBe(0);
    expect(parseMinutes("09:05")).toBe(545);
    expect(parseMinutes("15:00")).toBe(900);
    expect(parseMinutes("23:59")).toBe(1439);
  });

  it("24:00 → 1440、秒は分まで採用", () => {
    expect(parseMinutes("24:00")).toBe(1440);
    expect(parseMinutes("09:05:30")).toBe(545);
  });

  it("前後空白を許容", () => {
    expect(parseMinutes("  09:05  ")).toBe(545);
  });

  it("不正形式は null", () => {
    expect(parseMinutes("")).toBeNull();
    expect(parseMinutes("9h05")).toBeNull();
    expect(parseMinutes("09:60")).toBeNull(); // 分 > 59
    expect(parseMinutes("25:00")).toBeNull(); // 1500 > 1440
    expect(parseMinutes("foo")).toBeNull();
  });
});

describe("computeWindowStart（#16 適応窓・6時以前）", () => {
  const D = DEFAULT_WINDOW_START_MIN; // 360 = 6:00

  it("早朝予定なし → 既定(360)", () => {
    expect(computeWindowStart([], D)).toBe(360);
    expect(computeWindowStart([540, 720, 1080], D)).toBe(360); // 9/12/18 時
    expect(computeWindowStart([360], D)).toBe(360); // ちょうど6:00
  });

  it("05:30(330) → 300（5:00 floor）", () => {
    expect(computeWindowStart([330], D)).toBe(300);
  });

  it("04:15(255) → 240（4:00 floor）", () => {
    expect(computeWindowStart([255], D)).toBe(240);
  });

  it("00:30(30) → 0（max(0)）", () => {
    expect(computeWindowStart([30], D)).toBe(0);
  });

  it("不正な start(NaN) は無視", () => {
    expect(computeWindowStart([Number.NaN, 540], D)).toBe(360);
    expect(computeWindowStart([Number.NaN, 255], D)).toBe(240);
  });

  it("複数なら最早 start を採用（existing + placed draft を混ぜても同じ）", () => {
    // existing 540/720 + placed draft 270(=4:30) → 最早 270 → 240
    expect(computeWindowStart([540, 720, 270], D)).toBe(240);
  });

  it("6時以降だけの日は完全に従来通り（360）＝既存表示/drop が不変", () => {
    expect(computeWindowStart([361, 600, 1439], D)).toBe(360);
  });
});

describe("適応窓 startMin=240(4:00) でも y↔time round-trip", () => {
  const VP240: TimelineViewport = { startMin: 240, endMin: 1440, heightPx: 540 };
  it("minutesToY → yToMinutes が往復一致（早朝窓）", () => {
    for (const m of [240, 360, 540, 900, 1440]) {
      const y = minutesToY(m, VP240);
      expect(yToMinutes(y, VP240)).toBeCloseTo(m, 5);
    }
  });
  it("4:00 が最上端(y=0)・24:00 が最下端", () => {
    expect(minutesToY(240, VP240)).toBeCloseTo(0, 5);
    expect(minutesToY(1440, VP240)).toBeCloseTo(540, 5);
  });
});
