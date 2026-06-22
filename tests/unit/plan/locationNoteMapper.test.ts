/**
 * Phase E-3A — mapLocationNoteRow（location_notes 行 → LocationItem・pure）
 *
 * 検証: trip/spot 変換・classification・contributor_type→source・author fail-soft・
 *       null/欠落 fail-soft・写真 null/placeholder・price_level/match の安全処理。捏造なし。
 */
import { describe, it, expect } from "vitest";
import { mapLocationNoteRow, mapContributorToSource, type LocationNoteRow } from "@/app/(culcept)/calendar/_lib/travel/repository/locationNoteMapper";
import type { PhotoRow } from "@/app/(culcept)/calendar/_lib/travel/repository/tripDayAssembler";

function row(overrides: Partial<LocationNoteRow>): LocationNoteRow {
  return {
    id: "n1",
    kind: "spot",
    prefecture: "京都府",
    title: "テスト",
    area_label: null,
    description: null,
    genre: null,
    hours: null,
    price_level: null,
    classification: null,
    contributor_type: null,
    source_type: null,
    author: null,
    theme_keys: null,
    tags: null,
    stops: null,
    match_reasons: null,
    rating: null,
    rating_count: null,
    duration_label: null,
    tagline: null,
    why_special: null,
    why_hidden: null,
    spot_count: null,
    match_pct: null,
    photo_id: null,
    status: "private",
    moderation_status: "none",
    ...overrides,
  };
}

const NO_PHOTOS = new Map<string, PhotoRow>();

describe("mapContributorToSource", () => {
  it("local→local / traveler→traveler / self→traveler", () => {
    expect(mapContributorToSource("local")).toBe("local");
    expect(mapContributorToSource("traveler")).toBe("traveler");
    expect(mapContributorToSource("self")).toBe("traveler");
    expect(mapContributorToSource(null)).toBe("traveler");
  });
});

describe("mapLocationNoteRow — fail-soft 既定値", () => {
  const item = mapLocationNoteRow(row({}), NO_PHOTOS);
  it("null/欠落は空配列・空文字・0・null", () => {
    expect(item.areaLabel).toBe("");
    expect(item.genre).toBe("");
    expect(item.themeKeys).toEqual([]);
    expect(item.tags).toEqual([]);
    expect(item.rating).toBe(0);
    expect(item.ratingCount).toBe(0);
    expect(item.description).toBe("");
    expect(item.photo).toBeNull();
  });
  it("kind 既定は spot / classification 不明は standard", () => {
    expect(item.kind).toBe("spot");
    expect(item.classification).toBe("standard");
  });
  it("author 欠落は name 空＋fallback source（捏造しない）", () => {
    expect(item.author).toEqual({ name: "", source: "traveler" });
  });
  it("optional フィールドは欠落時に未設定", () => {
    expect(item.durationLabel).toBeUndefined();
    expect(item.spotCount).toBeUndefined();
    expect(item.stops).toBeUndefined();
    expect(item.hours).toBeUndefined();
    expect(item.priceLevel).toBeUndefined();
    expect(item.whySpecial).toBeUndefined();
    expect(item.matchPct).toBeUndefined();
    expect(item.matchReasons).toBeUndefined();
  });
});

describe("mapLocationNoteRow — trip / classification classic", () => {
  const item = mapLocationNoteRow(
    row({
      kind: "trip",
      classification: "classic",
      contributor_type: "local",
      duration_label: "1泊2日",
      spot_count: 4,
      stops: ["清水寺", "祇園", null as unknown as string],
      theme_keys: ["quiet-morning", "photogenic"],
      tags: ["静かさ", "写真映え"],
      match_pct: 92,
      match_reasons: ["静かさ重視のあなたに"],
    }),
    NO_PHOTOS
  );
  it("trip 固有 + classification + source", () => {
    expect(item.kind).toBe("trip");
    expect(item.classification).toBe("classic");
    expect(item.source).toBe("local");
    expect(item.durationLabel).toBe("1泊2日");
    expect(item.spotCount).toBe(4);
    expect(item.stops).toEqual(["清水寺", "祇園"]); // null 要素は除去
    expect(item.themeKeys).toEqual(["quiet-morning", "photogenic"]);
    expect(item.matchPct).toBe(92);
    expect(item.matchReasons).toEqual(["静かさ重視のあなたに"]);
  });
});

describe("mapLocationNoteRow — spot / classification hidden / 写真あり", () => {
  const photos = new Map<string, PhotoRow>([
    ["p1", { id: "p1", source: "placeholder", url: null, label: "竹林", tone: "garden", caption: null, captured_at: null }],
  ]);
  const item = mapLocationNoteRow(
    row({
      kind: "spot",
      classification: "hidden",
      contributor_type: "self",
      hours: "6:00–9:00",
      price_level: "¥¥",
      why_special: "早朝の静寂",
      why_hidden: "観光ルート外",
      tagline: "誰も知らない神社",
      photo_id: "p1",
      rating: "4.7",
      rating_count: 12,
    }),
    photos
  );
  it("spot 固有 + price_level + 穴場フィールド + 写真 + self→traveler", () => {
    expect(item.kind).toBe("spot");
    expect(item.classification).toBe("hidden");
    expect(item.source).toBe("traveler"); // self → traveler
    expect(item.hours).toBe("6:00–9:00");
    expect(item.priceLevel).toBe("¥¥");
    expect(item.whySpecial).toBe("早朝の静寂");
    expect(item.whyHidden).toBe("観光ルート外");
    expect(item.tagline).toBe("誰も知らない神社");
    expect(item.photo?.label).toBe("竹林");
    expect(item.rating).toBeCloseTo(4.7, 5); // 文字列 numeric も数値化
    expect(item.ratingCount).toBe(12);
  });
  it("不正 price_level は未設定（捏造しない）", () => {
    const it2 = mapLocationNoteRow(row({ price_level: "free" }), NO_PHOTOS);
    expect(it2.priceLevel).toBeUndefined();
  });
  it("photo_id があっても join に無ければ null（blank）", () => {
    const it3 = mapLocationNoteRow(row({ photo_id: "missing" }), NO_PHOTOS);
    expect(it3.photo).toBeNull();
  });
});

describe("mapLocationNoteRow — author jsonb 有効時は採用", () => {
  it("name/source/roleLabel を採用", () => {
    const item = mapLocationNoteRow(
      row({ contributor_type: "local", author: { name: "Kyoto Local M", source: "local", roleLabel: "京都在住8年" } }),
      NO_PHOTOS
    );
    expect(item.author).toEqual({ name: "Kyoto Local M", source: "local", roleLabel: "京都在住8年" });
  });
  it("author.source 不正は contributor 由来へ fallback", () => {
    const item = mapLocationNoteRow(
      row({ contributor_type: "local", author: { name: "X", source: "bogus" } }),
      NO_PHOTOS
    );
    expect(item.author).toEqual({ name: "X", source: "local" });
  });
});
