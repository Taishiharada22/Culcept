import { describe, it, expect } from "vitest";
import {
  placeCandidatePersonalReason,
  placeCandidateBestReason,
  isPlaceAffinityReasonEnabled,
  PLACE_AFFINITY_REASON_UI_ENABLED,
} from "@/lib/plan/compose/placeAffinityReasonUi";
import { normalizeLocationText } from "@/lib/plan/mobility/mobilityObservationStore";
import type { PlaceAffinityReadiness, PlaceVisitStrength } from "@/lib/plan/compose/placeAffinityReadiness";
import type { PlaceConditionAffinity, PlaceCondition, PlaceConditionDimension } from "@/lib/plan/compose/placeConditionAffinity";

function p2(entries: { text: string; strength: PlaceVisitStrength }[], status: "ready" | "not_enough" = "ready"): PlaceAffinityReadiness {
  return {
    status,
    totalVisits: 20,
    distinctPlaces: entries.length,
    profiles: entries.map((e) => ({ placeKey: normalizeLocationText(e.text)!, visitCount: 5, strength: e.strength })),
  };
}

describe("placeCandidatePersonalReason — 照合 / 沈黙", () => {
  it("★not_enough → null", () => {
    expect(placeCandidatePersonalReason("スタバ 渋谷", p2([{ text: "スタバ 渋谷", strength: "habitual" }], "not_enough"))).toBeNull();
  });
  it("★canonical text が habitual/frequent place に一致 → reason", () => {
    expect(placeCandidatePersonalReason("スタバ 渋谷", p2([{ text: "スタバ 渋谷", strength: "habitual" }]))).toContain("よく行く");
    expect(placeCandidatePersonalReason("ジム", p2([{ text: "ジム", strength: "frequent" }]))).toContain("ときどき");
  });
  it("★occasional → null（弱い・沈黙）", () => {
    expect(placeCandidatePersonalReason("公園", p2([{ text: "公園", strength: "occasional" }]))).toBeNull();
  });
  it("★未訪問（一致なし）→ null", () => {
    expect(placeCandidatePersonalReason("新しい店", p2([{ text: "スタバ 渋谷", strength: "habitual" }]))).toBeNull();
  });
  it("★正規化で一致（表記揺れ吸収）", () => {
    // NFKC + lowercase + 空白圧縮: "ＳＴＡＲ  ＣＡＦＥ" ≈ "star cafe"
    expect(placeCandidatePersonalReason("ＳＴＡＲ  ＣＡＦＥ", p2([{ text: "star cafe", strength: "habitual" }]))).toContain("よく行く");
  });
  it("★raw 数値/place名/人格語を含まない", () => {
    const line = placeCandidatePersonalReason("スタバ 渋谷", p2([{ text: "スタバ 渋谷", strength: "habitual" }]))!;
    expect(line).not.toMatch(/[0-9]|スタバ|渋谷|好き|タイプ|性格/);
  });
});

// ─ P5.1 条件付き ─
function p3(text: string, dimension: PlaceConditionDimension, value: string, skew = true, strength: PlaceVisitStrength = "frequent", status: "ready" | "not_enough" = "ready"): PlaceConditionAffinity {
  const condition: PlaceCondition = { dimension, value };
  return {
    status,
    condition,
    underConditionTotal: 12,
    profiles: [{ placeKey: normalizeLocationText(text)!, underConditionCount: 4, totalCount: 5, skewsToCondition: skew, strength }],
  };
}

describe("placeCandidateBestReason — P5.1 条件付き / 優先 / fallback", () => {
  const emptyP2 = p2([], "not_enough");
  it("★timeband 一致 → 「この時間帯に選ばれやすい場所のようです」（時刻を露わさない）", () => {
    const line = placeCandidateBestReason("カフェ", emptyP2, [p3("カフェ", "timeband", "evening")]);
    expect(line).toBe("この時間帯に選ばれやすい場所のようです。");
  });
  it("★weekday weekend → 「週末に選ばれやすい」/ weather rain → 「雨の日に選ばれやすい」", () => {
    expect(placeCandidateBestReason("公園", emptyP2, [p3("公園", "weekday", "weekend")])).toContain("週末に選ばれやすい");
    expect(placeCandidateBestReason("ジム", emptyP2, [p3("ジム", "weather", "rain")])).toContain("雨の日に選ばれやすい");
  });
  it("★p3List の優先順（先頭の一致が勝つ）", () => {
    const line = placeCandidateBestReason("店", emptyP2, [p3("店", "timeband", "morning"), p3("店", "weekday", "weekend")]);
    expect(line).toBe("この時間帯に選ばれやすい場所のようです。"); // timeband 優先
  });
  it("★P5.2: weather を先頭に置くと timeband より優先（weather>timeband>weekday）", () => {
    const line = placeCandidateBestReason("店", emptyP2, [p3("店", "weather", "rain"), p3("店", "timeband", "morning")]);
    expect(line).toContain("雨の日に選ばれやすい"); // weather 最優先
  });
  it("★条件一致なし → 無条件 P2 に fallback", () => {
    const line = placeCandidateBestReason("スタバ", p2([{ text: "スタバ", strength: "habitual" }]), [p3("別の店", "timeband", "evening")]);
    expect(line).toContain("よく行く");
  });
  it("★skew false / occasional / not_enough → 条件 reason なし（P2 fallback or null）", () => {
    expect(placeCandidateBestReason("x", emptyP2, [p3("x", "timeband", "evening", false)])).toBeNull(); // skew false + P2 空
    expect(placeCandidateBestReason("x", emptyP2, [p3("x", "timeband", "evening", true, "occasional")])).toBeNull();
    expect(placeCandidateBestReason("x", emptyP2, [p3("x", "timeband", "evening", true, "frequent", "not_enough")])).toBeNull();
  });
  it("★raw 数値/place名/人格語なし", () => {
    const line = placeCandidateBestReason("カフェ", emptyP2, [p3("カフェ", "weather", "rain")])!;
    expect(line).not.toMatch(/[0-9]|カフェ|好き|タイプ|性格/);
  });
});

describe("flag", () => {
  it("★default OFF・dev でも flag OFF ゆえ無効（production hard block 込み）", () => {
    expect(PLACE_AFFINITY_REASON_UI_ENABLED).toBe(false);
    expect(isPlaceAffinityReasonEnabled()).toBe(false);
  });
});
