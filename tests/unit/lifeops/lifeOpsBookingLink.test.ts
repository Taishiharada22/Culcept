/**
 * Life Ops L-6 — 予約導線 deep-link（pure・no-fetch）。
 *   permission 厳守(open_link 許可=美容系のみ)・検索ページURL組立て・encode・area・医療/買い物/事務は空。
 */
import { describe, it, expect } from "vitest";
import { buildBookingLinks } from "@/lib/lifeops/booking-link";
import { assessLifeOpsPermission } from "@/lib/lifeops/permission";
import { getCategorySpec, type LifeOpsCategoryId } from "@/lib/lifeops/category-model";
import type { DueReason, LifeOpsCandidate } from "@/lib/lifeops/candidate-types";

const cycle: DueReason = { kind: "cycle", elapsedDays: 45, typicalIntervalDays: 42, phase: "beyond_typical" };

function cand(categoryId: LifeOpsCategoryId): LifeOpsCandidate {
  const spec = getCategorySpec(categoryId)!;
  return {
    category: spec.id,
    menu: null,
    dueReason: cycle,
    suggestedWindow: null,
    placeQuery: spec.placeQueryHint,
    permissionLevelHint: spec.defaultMaxLevelHint,
    riskFlags: spec.typicalRiskFlags,
  };
}
function links(categoryId: LifeOpsCategoryId, area?: string) {
  const c = cand(categoryId);
  return buildBookingLinks(c, assessLifeOpsPermission(c), area ? { area } : {});
}

describe("L-6 美容系(open_link 許可)→ hotpepper + google", () => {
  it("beauty_salon → 2 リンク・URL は検索ページ・query encode", () => {
    const out = links("beauty_salon");
    expect(out.map((l) => l.platform)).toEqual(["hotpepper_beauty", "google_maps"]);
    expect(out[0].url).toBe(`https://beauty.hotpepper.jp/CSP/bt/freeword/?freeWord=${encodeURIComponent("美容室")}`);
    expect(out[1].url).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("美容室")}`);
    expect(out[0].label).toBe("ホットペッパーで探す");
  });
  it("area を query に含める（encode 済）", () => {
    const out = links("eyebrow", "新宿");
    expect(out[0].url).toContain(encodeURIComponent("眉サロン 新宿"));
    expect(out[0].url).not.toContain(" "); // 生スペースを含まない（encode 済）
  });
  it("脱毛/整体など美容系も hotpepper 対象", () => {
    expect(links("hair_removal").map((l) => l.platform)).toContain("hotpepper_beauty");
    expect(links("bodywork").map((l) => l.platform)).toContain("hotpepper_beauty");
  });
});

describe("L-6 permission 厳守 — open_link 不許可は空", () => {
  it("医療(dental・suggest cap)→ 空", () => {
    expect(links("dental")).toEqual([]);
    expect(links("eye_care")).toEqual([]);
  });
  it("買い物(groceries・suggest)→ 空", () => {
    expect(links("groceries")).toEqual([]);
  });
  it("事務(license・notify)→ 空", () => {
    expect(links("license_renewal")).toEqual([]);
  });
  it("準備(outfit_prep・notify ∧ placeQuery null)→ 空", () => {
    expect(links("outfit_prep")).toEqual([]);
  });
});

describe("L-6 pure / no-fetch", () => {
  it("同入力同出力（pure）", () => {
    const c = cand("beauty_salon");
    const a = assessLifeOpsPermission(c);
    expect(buildBookingLinks(c, a)).toEqual(buildBookingLinks(c, a));
  });
  it("placeQuery なしは空（open_link 許可でも）", () => {
    const c = cand("beauty_salon");
    const noQuery: LifeOpsCandidate = { ...c, placeQuery: null };
    expect(buildBookingLinks(noQuery, assessLifeOpsPermission(noQuery))).toEqual([]);
  });
});
