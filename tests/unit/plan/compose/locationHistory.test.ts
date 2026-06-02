import { describe, it, expect } from "vitest";

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import {
  deriveLocationChips,
  extractLocationUsages,
  isSpecificPlace,
  LOCATION_CHIP_LIMIT,
} from "@/lib/plan/compose/locationHistory";

let seq = 0;
function oneOff(
  opts: {
    title?: string;
    locationText?: string;
    locationCategory?: ExternalAnchor["locationCategory"];
    date?: string;
  } = {},
): ExternalAnchor {
  seq += 1;
  const base = {
    id: `a${seq}`,
    userId: "u1",
    sourceId: "s1",
    title: opts.title ?? "予定",
    startTime: "09:00",
    rigidity: "soft" as const,
    confirmedAt: "2026-01-01T00:00:00Z",
    anchorKind: "one_off" as const,
    date: opts.date ?? "2026-01-01",
  };
  const a = base as ExternalAnchor;
  if (opts.locationText !== undefined) a.locationText = opts.locationText;
  if (opts.locationCategory !== undefined) a.locationCategory = opts.locationCategory;
  return a;
}

function usages(anchors: ExternalAnchor[]) {
  return extractLocationUsages(anchors);
}

describe("isSpecificPlace（① 具体的な場所のみ）", () => {
  it("一般名詞は false（家 / カフェ / オフィス / cafe）", () => {
    expect(isSpecificPlace("家")).toBe(false);
    expect(isSpecificPlace("カフェ")).toBe(false);
    expect(isSpecificPlace(" オフィス ")).toBe(false);
    expect(isSpecificPlace("Cafe")).toBe(false); // 大小無視
    expect(isSpecificPlace("")).toBe(false);
  });

  it("固有名は true（渋谷オフィス / 隠れ房 新宿店 / Cafe Nakameguro）", () => {
    expect(isSpecificPlace("渋谷オフィス")).toBe(true);
    expect(isSpecificPlace("隠れ房 新宿店")).toBe(true);
    expect(isSpecificPlace("Cafe Nakameguro")).toBe(true);
    expect(isSpecificPlace("自習室 KAKOI 文京")).toBe(true);
  });
});

describe("extractLocationUsages（空・一般語を除外）", () => {
  it("空 / 一般語の location は除外、固有名のみ残る", () => {
    const u = usages([
      oneOff({ locationText: "" }),
      oneOff({ locationText: "家" }),
      oneOff({ locationText: "カフェ" }),
      oneOff({ locationText: "渋谷オフィス" }),
    ]);
    expect(u.map((x) => x.text)).toEqual(["渋谷オフィス"]);
  });
});

describe("deriveLocationChips — frequent（よく行く・常時）", () => {
  it("頻度順で具体的な場所のみ", () => {
    const { frequent } = deriveLocationChips(
      usages([
        oneOff({ locationText: "渋谷オフィス" }),
        oneOff({ locationText: "渋谷オフィス" }),
        oneOff({ locationText: "渋谷オフィス" }),
        oneOff({ locationText: "新宿カフェ店" }),
        oneOff({ locationText: "家" }), // 除外される
      ]),
    );
    expect(frequent[0].text).toBe("渋谷オフィス");
    expect(frequent[0].count).toBe(3);
    expect(frequent.some((c) => c.text === "家")).toBe(false);
  });

  it("title 未指定なら forTitle は空（最初から出さない）", () => {
    const { forTitle } = deriveLocationChips(
      usages([oneOff({ locationText: "渋谷オフィス" })]),
    );
    expect(forTitle).toEqual([]);
  });

  it("正規化: 全角/半角空白で同一グループ", () => {
    const { frequent } = deriveLocationChips(
      usages([
        oneOff({ locationText: "スタバ 渋谷" }),
        oneOff({ locationText: "スタバ　渋谷" }),
      ]),
    );
    expect(frequent).toHaveLength(1);
    expect(frequent[0].count).toBe(2);
  });
});

describe("deriveLocationChips — forTitle（② 予定内容連動）", () => {
  it("'勉強' で過去の勉強予定の場所を提示（frequent 外）", () => {
    const data = usages([
      // よく行く = 渋谷オフィス（仕事で多用）
      oneOff({ title: "会議", locationText: "渋谷オフィス" }),
      oneOff({ title: "会議", locationText: "渋谷オフィス" }),
      oneOff({ title: "会議", locationText: "渋谷オフィス" }),
      // 勉強の場所 = 自習室 KAKOI（頻度は低い＝frequent 外）
      oneOff({ title: "勉強", locationText: "自習室 KAKOI" }),
      oneOff({ title: "数学の勉強", locationText: "自習室 KAKOI" }),
    ]);
    const { frequent, forTitle } = deriveLocationChips(data, { title: "勉強" }, 1);
    expect(frequent.map((c) => c.text)).toEqual(["渋谷オフィス"]);
    // "勉強" 連動で 自習室 KAKOI が出る（双方向 substring: "勉強" ⊂ "数学の勉強"）
    expect(forTitle.map((c) => c.text)).toContain("自習室 KAKOI");
  });

  it("title マッチは forTitle 優先で出し、よく行くからは外す（二重表示しない）", () => {
    const data = usages([
      oneOff({ title: "勉強", locationText: "自習室 KAKOI" }),
      oneOff({ title: "勉強", locationText: "自習室 KAKOI" }),
    ]);
    // 自習室 KAKOI は title 連動で forTitle に出し、frequent からは除外（重複なし）
    const { frequent, forTitle } = deriveLocationChips(data, { title: "勉強" });
    expect(forTitle.map((c) => c.text)).toContain("自習室 KAKOI");
    expect(frequent.map((c) => c.text)).not.toContain("自習室 KAKOI");
  });

  it("マッチ無しの title なら forTitle 空", () => {
    const { forTitle } = deriveLocationChips(
      usages([oneOff({ title: "会議", locationText: "渋谷オフィス" })]),
      { title: "ランチ" },
    );
    expect(forTitle).toEqual([]);
  });
});

describe("空・limit", () => {
  it("空 usages → 空チップ", () => {
    expect(deriveLocationChips([])).toEqual({ frequent: [], forTitle: [] });
  });

  it("frequent は limit 件まで", () => {
    const data = usages(
      Array.from({ length: LOCATION_CHIP_LIMIT + 3 }, (_, i) =>
        oneOff({ locationText: `固有地点${i}`, date: `2026-01-0${(i % 9) + 1}` }),
      ),
    );
    expect(deriveLocationChips(data).frequent.length).toBeLessThanOrEqual(
      LOCATION_CHIP_LIMIT,
    );
  });
});
