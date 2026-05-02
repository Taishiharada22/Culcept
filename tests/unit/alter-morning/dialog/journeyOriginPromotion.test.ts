/**
 * journeyOriginPromotion unit test (B-3c-1 Commit 1)
 *
 * CEO/GPT 2026-05-03 B-3c-1 設計提案 §10 Unit:
 *   pure helper の全 input variant + GPT 2nd 補正 (= coordinates 不正時 blocked) を検証。
 *
 * カバレッジ:
 *   1. Happy path: known_label_only + valid coords → promoted (= known_exact)
 *   2. GPT 2nd 補正: coordinates 不正 → blocked (= "missing_coordinates")
 *      - lat NaN / lng NaN
 *      - lat 範囲外 / lng 範囲外
 *      - lat null / lng null (= 型強制を runtime で破った想定)
 *   3. invalid_state: known_exact / unknown / undefined → blocked (= "invalid_state")
 *   4. Pure: 入力 state mutate しないこと
 *   5. source 固定: 昇格時 必ず "user_override" (= GPT Q1)
 *   6. label 上書き: candidate.displayName が新 label に (= 旧 label 捨てる)
 */

import { describe, it, expect } from "vitest";
import {
  promoteJourneyOrigin,
  isValidCoordinate,
  PROMOTION_SOURCE,
} from "@/lib/alter-morning/dialog/journeyOriginPromotion";
import type { JourneyAnchorState } from "@/lib/alter-morning/journey/anchorState";
import type { NormalizedPlaceCandidate } from "@/lib/alter-morning/search/normalizedPlace";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mockCandidate(
  overrides: Partial<NormalizedPlaceCandidate> = {},
): NormalizedPlaceCandidate {
  return {
    placeId: "place_marunouchi",
    displayName: "東京駅丸の内口",
    address: "東京都千代田区丸の内1丁目",
    coordinates: { lat: 35.681236, lng: 139.767125 },
    distanceFromAnchor: null,
    category: null,
    chainToken: null,
    rawRef: { provider: "google_places", placeId: "place_marunouchi" },
    ...overrides,
  };
}

const knownLabelOnly: JourneyAnchorState = {
  kind: "known_label_only",
  label: "東京駅",
  source: "user_declared",
};

const knownExact: JourneyAnchorState = {
  kind: "known_exact",
  label: "自宅",
  lat: 35.6896,
  lng: 139.7006,
  source: "registered_home",
};

const unknownState: JourneyAnchorState = {
  kind: "unknown",
  reason: "no_baseline",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #1: Happy path
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#1 Happy] known_label_only + valid coords → promoted", () => {
  it("正常な candidate → kind=promoted、known_exact 生成", () => {
    const result = promoteJourneyOrigin(knownLabelOnly, mockCandidate());
    expect(result.kind).toBe("promoted");
    if (result.kind === "promoted") {
      expect(result.state.kind).toBe("known_exact");
      expect(result.state.label).toBe("東京駅丸の内口");
      expect(result.state.lat).toBeCloseTo(35.681236);
      expect(result.state.lng).toBeCloseTo(139.767125);
      expect(result.state.source).toBe("user_override");
    }
  });

  it("source は必ず user_override (= Q1 確定、PROMOTION_SOURCE 定数連動)", () => {
    const result = promoteJourneyOrigin(knownLabelOnly, mockCandidate());
    if (result.kind === "promoted") {
      expect(result.state.source).toBe(PROMOTION_SOURCE);
      expect(PROMOTION_SOURCE).toBe("user_override");
    }
  });

  it("label は candidate.displayName で上書き (= 旧 label を捨てる)", () => {
    // 旧 known_label_only.label = "東京駅"
    // candidate.displayName = "東京駅丸の内口" (= より具体的)
    const result = promoteJourneyOrigin(knownLabelOnly, mockCandidate());
    if (result.kind === "promoted") {
      expect(result.state.label).toBe("東京駅丸の内口");
      expect(result.state.label).not.toBe(knownLabelOnly.label);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #2: GPT 2nd 補正 — coordinates 不正で blocked (半壊 UX 防止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#2 GPT 2nd 補正] coordinates 不正 → blocked (半壊 UX 防止)", () => {
  it("lat NaN → blocked, reason=missing_coordinates", () => {
    const cand = mockCandidate({ coordinates: { lat: NaN, lng: 139.7 } });
    const result = promoteJourneyOrigin(knownLabelOnly, cand);
    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.reason).toBe("missing_coordinates");
    }
  });

  it("lng NaN → blocked", () => {
    const cand = mockCandidate({ coordinates: { lat: 35.6, lng: NaN } });
    const result = promoteJourneyOrigin(knownLabelOnly, cand);
    expect(result.kind).toBe("blocked");
  });

  it("lat Infinity → blocked", () => {
    const cand = mockCandidate({
      coordinates: { lat: Infinity, lng: 139.7 },
    });
    const result = promoteJourneyOrigin(knownLabelOnly, cand);
    expect(result.kind).toBe("blocked");
  });

  it("lat 範囲外 (>90) → blocked", () => {
    const cand = mockCandidate({ coordinates: { lat: 91, lng: 139.7 } });
    const result = promoteJourneyOrigin(knownLabelOnly, cand);
    expect(result.kind).toBe("blocked");
  });

  it("lat 範囲外 (<-90) → blocked", () => {
    const cand = mockCandidate({ coordinates: { lat: -91, lng: 139.7 } });
    const result = promoteJourneyOrigin(knownLabelOnly, cand);
    expect(result.kind).toBe("blocked");
  });

  it("lng 範囲外 (>180) → blocked", () => {
    const cand = mockCandidate({ coordinates: { lat: 35, lng: 181 } });
    const result = promoteJourneyOrigin(knownLabelOnly, cand);
    expect(result.kind).toBe("blocked");
  });

  it("coordinates null (= runtime 型破り想定) → blocked", () => {
    const cand = mockCandidate();
    // 型強制を runtime で破った想定 (= JSON deserialization で null 混入)
    (cand as unknown as { coordinates: null }).coordinates = null;
    const result = promoteJourneyOrigin(knownLabelOnly, cand);
    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.reason).toBe("missing_coordinates");
    }
  });

  it("0,0 (赤道沖) は valid 扱い (= 既存 known_exact 経路と対称)", () => {
    const cand = mockCandidate({ coordinates: { lat: 0, lng: 0 } });
    const result = promoteJourneyOrigin(knownLabelOnly, cand);
    expect(result.kind).toBe("promoted");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #3: invalid_state — idempotent 防御
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#3 idempotent] state.kind !== known_label_only → blocked", () => {
  it("kind=known_exact (= 既に確定) → blocked, reason=invalid_state", () => {
    const result = promoteJourneyOrigin(knownExact, mockCandidate());
    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.reason).toBe("invalid_state");
    }
  });

  it("kind=unknown → blocked, reason=invalid_state", () => {
    const result = promoteJourneyOrigin(unknownState, mockCandidate());
    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.reason).toBe("invalid_state");
    }
  });

  it("undefined (= origin 未設定) → blocked, reason=invalid_state", () => {
    const result = promoteJourneyOrigin(undefined, mockCandidate());
    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.reason).toBe("invalid_state");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #4: Pure — 入力 mutate なし
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#4 Pure] 入力 mutate しない", () => {
  it("入力 state は呼び出し後も同一値", () => {
    const before = { ...knownLabelOnly };
    const cand = mockCandidate();
    const candBefore = JSON.stringify(cand);
    promoteJourneyOrigin(knownLabelOnly, cand);
    expect(knownLabelOnly).toEqual(before);
    expect(JSON.stringify(cand)).toBe(candBefore);
  });

  it("blocked 時も入力 mutate なし", () => {
    const before = { ...knownExact };
    promoteJourneyOrigin(knownExact, mockCandidate());
    expect(knownExact).toEqual(before);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #5: isValidCoordinate helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#5 isValidCoordinate] helper unit", () => {
  it("normal: 35.6, 139.7 → true", () => {
    expect(isValidCoordinate(35.6, 139.7)).toBe(true);
  });
  it("0, 0 → true (= 赤道沖)", () => {
    expect(isValidCoordinate(0, 0)).toBe(true);
  });
  it("-90, -180 → true (= 範囲端)", () => {
    expect(isValidCoordinate(-90, -180)).toBe(true);
  });
  it("90, 180 → true (= 範囲端)", () => {
    expect(isValidCoordinate(90, 180)).toBe(true);
  });
  it("NaN → false", () => {
    expect(isValidCoordinate(NaN, 0)).toBe(false);
    expect(isValidCoordinate(0, NaN)).toBe(false);
  });
  it("Infinity → false", () => {
    expect(isValidCoordinate(Infinity, 0)).toBe(false);
    expect(isValidCoordinate(0, -Infinity)).toBe(false);
  });
  it("範囲外 → false", () => {
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(-91, 0)).toBe(false);
    expect(isValidCoordinate(0, 181)).toBe(false);
    expect(isValidCoordinate(0, -181)).toBe(false);
  });
  it("非数値 → false", () => {
    expect(isValidCoordinate("35" as unknown as number, 139)).toBe(false);
    expect(isValidCoordinate(null as unknown as number, 0)).toBe(false);
    expect(isValidCoordinate(undefined as unknown as number, 0)).toBe(false);
  });
});
