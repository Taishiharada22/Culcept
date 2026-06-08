import { describe, it, expect } from "vitest";
import {
  placeCandidatePersonalReason,
  isPlaceAffinityReasonEnabled,
  PLACE_AFFINITY_REASON_UI_ENABLED,
} from "@/lib/plan/compose/placeAffinityReasonUi";
import { normalizeLocationText } from "@/lib/plan/mobility/mobilityObservationStore";
import type { PlaceAffinityReadiness, PlaceVisitStrength } from "@/lib/plan/compose/placeAffinityReadiness";

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

describe("flag", () => {
  it("★default OFF・dev でも flag OFF ゆえ無効（production hard block 込み）", () => {
    expect(PLACE_AFFINITY_REASON_UI_ENABLED).toBe(false);
    expect(isPlaceAffinityReasonEnabled()).toBe(false);
  });
});
