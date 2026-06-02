import { describe, it, expect } from "vitest";

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import {
  deriveLocationHistory,
  LOCATION_CHIP_LIMIT,
} from "@/lib/plan/compose/locationHistory";

let seq = 0;
function oneOff(
  opts: {
    locationText?: string;
    locationCategory?: ExternalAnchor["locationCategory"];
    date?: string;
    confirmedAt?: string;
  } = {},
): ExternalAnchor {
  seq += 1;
  const base = {
    id: `a${seq}`,
    userId: "u1",
    sourceId: "s1",
    title: "予定",
    startTime: "09:00",
    rigidity: "soft" as const,
    confirmedAt: opts.confirmedAt ?? "2026-01-01T00:00:00Z",
    anchorKind: "one_off" as const,
    date: opts.date ?? "2026-01-01",
  };
  const a = base as ExternalAnchor;
  if (opts.locationText !== undefined) a.locationText = opts.locationText;
  if (opts.locationCategory !== undefined) a.locationCategory = opts.locationCategory;
  return a;
}

describe("deriveLocationHistory", () => {
  it("空配列は frequent/recent とも空（fail-open 既定）", () => {
    const h = deriveLocationHistory([]);
    expect(h.frequent).toEqual([]);
    expect(h.recent).toEqual([]);
  });

  it("location_text 空 / 無しの anchor はスキップ", () => {
    const h = deriveLocationHistory([
      oneOff({ locationText: "" }),
      oneOff({}),
      oneOff({ locationText: "   " }),
    ]);
    expect(h.frequent).toEqual([]);
    expect(h.recent).toEqual([]);
  });

  it("頻度で frequent 順位（A×3 > B×1）", () => {
    const h = deriveLocationHistory([
      oneOff({ locationText: "渋谷オフィス", date: "2026-01-01" }),
      oneOff({ locationText: "渋谷オフィス", date: "2026-01-02" }),
      oneOff({ locationText: "渋谷オフィス", date: "2026-01-03" }),
      oneOff({ locationText: "新宿カフェ", date: "2026-01-04" }),
    ]);
    expect(h.frequent[0].text).toBe("渋谷オフィス");
    expect(h.frequent[0].count).toBe(3);
  });

  it("正規化: trim + 連続空白 + 全角空白 で同一グループ化", () => {
    const h = deriveLocationHistory([
      oneOff({ locationText: "渋谷 オフィス" }),
      oneOff({ locationText: "渋谷　オフィス" }), // 全角空白
      oneOff({ locationText: " 渋谷  オフィス " }),
    ]);
    expect(h.frequent).toHaveLength(1);
    expect(h.frequent[0].count).toBe(3);
  });

  it("category は最新使用時のものを採用", () => {
    const h = deriveLocationHistory([
      oneOff({ locationText: "X", locationCategory: "cafe", date: "2026-01-01" }),
      oneOff({ locationText: "X", locationCategory: "office", date: "2026-03-01" }),
    ]);
    expect(h.frequent[0].category).toBe("office");
  });

  it("recent は直近順 + frequent と重複除外（limit=1 で検証）", () => {
    const h = deriveLocationHistory(
      [
        // A: 高頻度（frequent 入り）かつ最新でもある
        oneOff({ locationText: "A", date: "2026-01-01" }),
        oneOff({ locationText: "A", date: "2026-01-02" }),
        oneOff({ locationText: "A", date: "2026-09-09" }),
        // B: 1回・最近 / C: 1回・古い
        oneOff({ locationText: "B", date: "2026-08-08" }),
        oneOff({ locationText: "C", date: "2026-02-02" }),
      ],
      1, // frequent=[A] のみ → recent は A 除外で B(最近)→C の順
    );
    expect(h.frequent.map((c) => c.text)).toEqual(["A"]);
    expect(h.recent.map((c) => c.text)).not.toContain("A");
    expect(h.recent[0].text).toBe("B");
  });

  it("distinct数 ≤ limit のとき recent は空（全部 frequent＝二重表示しない）", () => {
    const h = deriveLocationHistory([
      oneOff({ locationText: "A", date: "2026-01-01" }),
      oneOff({ locationText: "B", date: "2026-02-02" }),
    ]);
    expect(h.frequent.map((c) => c.text).sort()).toEqual(["A", "B"]);
    expect(h.recent).toEqual([]);
  });

  it("frequent / recent とも limit 件まで", () => {
    const many: ExternalAnchor[] = [];
    for (let i = 0; i < LOCATION_CHIP_LIMIT + 3; i++) {
      many.push(oneOff({ locationText: `P${i}`, date: `2026-01-0${(i % 9) + 1}` }));
    }
    const h = deriveLocationHistory(many);
    expect(h.frequent.length).toBeLessThanOrEqual(LOCATION_CHIP_LIMIT);
    expect(h.recent.length).toBeLessThanOrEqual(LOCATION_CHIP_LIMIT);
  });

  it("表示は最頻出の原表記を採用", () => {
    const h = deriveLocationHistory([
      oneOff({ locationText: "スタバ 渋谷" }),
      oneOff({ locationText: "スタバ 渋谷" }),
      oneOff({ locationText: "スタバ　渋谷" }), // 同一キー・別表記
    ]);
    expect(h.frequent[0].text).toBe("スタバ 渋谷"); // 半角版が 2 回で最頻
  });
});
