/**
 * currentLocationGating + integration test (PR B-2d-c Commit 4)
 *
 * CEO/GPT 2026-05-02 PR B-2d-c 必須証明:
 *   evaluateCurrentLocation 純関数 + legacyAdapter 統合の挙動確認。
 *
 * Part A: evaluateCurrentLocation 純関数 (helper, 12 ケース)
 *   #A1: lat/lng が完全な値 + 全 fields null/undefined (legacy backward compat)
 *   #A2: accuracy = 50m, capturedAt = now, planDate === actualTodayYmdJst → 採用
 *   #A3: lat = NaN → invalid
 *   #A4: lat = 999 (範囲外) → invalid
 *   #A5: lng = -181 (範囲外) → invalid
 *   #A6: planDate !== actualTodayYmdJst → not_today
 *   #A7: actualTodayYmdJst undefined (legacy) → not_today check skip
 *   #A8: accuracy = 5000m → low_accuracy
 *   #A9: accuracy = NaN → low_accuracy (signed reject)
 *   #A10: capturedAt = "not a date" → invalid
 *   #A11: capturedAt = 2 hours ago → stale
 *   #A12: capturedAt = 31 minutes ago (boundary) → stale (= ちょうど境界の外)
 *
 * Part B: 判定順序 (helper, 1 ケース)
 *   #B1: lat = NaN + planDate mismatch → invalid を先に返す (順序確認)
 *
 * Part C: legacyAdapter integration (3 ケース)
 *   #C1: 全 fields 揃い + 良好な accuracy / 今日 plan → current 採用
 *   #C2: accuracy = 5000m → reject、registered_home に fallback
 *   #C3: planDate !== actualTodayYmdJst → reject、registered_home に fallback
 *
 * 計 16 ケース。
 */

import { describe, it, expect } from "vitest";
import {
  evaluateCurrentLocation,
  CURRENT_LOCATION_MAX_ACCURACY_M,
  CURRENT_LOCATION_MAX_AGE_MS,
} from "@/lib/alter-morning/journey/currentLocationGating";
import {
  runMorningPipeline,
  createStubComprehensionProvider,
} from "@/lib/alter-morning/morningPipeline";
import { adaptPipelineToLegacy } from "@/lib/alter-morning/legacyAdapter";
import {
  resetEventCounter,
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { L1PipelineInput } from "@/lib/alter-morning/comprehension/l1Pipeline";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

const TODAY = "2026-05-02";
const TOMORROW = "2026-05-03";
const NOW_MS = Date.parse("2026-05-02T12:00:00.000Z");
const VALID_LAT = 35.6595;
const VALID_LNG = 139.7004;
const HOME_LAT = 35.69;
const HOME_LNG = 139.7;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part A: evaluateCurrentLocation 純関数 (helper)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Part A] evaluateCurrentLocation 純関数", () => {
  describe("[#A1] 全 fields null/undefined → 採用 (legacy backward compat)", () => {
    it("coords のみで他は省略 → 採用", () => {
      const result = evaluateCurrentLocation(
        { currentLat: VALID_LAT, currentLng: VALID_LNG },
        TODAY,
        NOW_MS,
      );
      expect(result.usable).toBe(true);
    });
  });

  describe("[#A2] 良好な fields すべて → 採用", () => {
    it("accuracy=50m, capturedAt=now, planDate==actualTodayYmdJst", () => {
      const result = evaluateCurrentLocation(
        {
          currentLat: VALID_LAT,
          currentLng: VALID_LNG,
          accuracy: 50,
          capturedAt: new Date(NOW_MS).toISOString(),
          actualTodayYmdJst: TODAY,
        },
        TODAY,
        NOW_MS,
      );
      expect(result.usable).toBe(true);
    });
  });

  describe("[#A3] lat = NaN → invalid", () => {
    it("数学的に無効な lat", () => {
      const result = evaluateCurrentLocation(
        { currentLat: NaN, currentLng: VALID_LNG },
        TODAY,
        NOW_MS,
      );
      expect(result.usable).toBe(false);
      if (!result.usable) expect(result.rejectReason).toBe("invalid");
    });
  });

  describe("[#A4] lat = 999 (範囲外) → invalid", () => {
    it("finite だが範囲外", () => {
      const result = evaluateCurrentLocation(
        { currentLat: 999, currentLng: VALID_LNG },
        TODAY,
        NOW_MS,
      );
      expect(result.usable).toBe(false);
      if (!result.usable) expect(result.rejectReason).toBe("invalid");
    });
  });

  describe("[#A5] lng = -181 (範囲外) → invalid", () => {
    it("finite だが範囲外", () => {
      const result = evaluateCurrentLocation(
        { currentLat: VALID_LAT, currentLng: -181 },
        TODAY,
        NOW_MS,
      );
      expect(result.usable).toBe(false);
      if (!result.usable) expect(result.rejectReason).toBe("invalid");
    });
  });

  describe("[#A6] planDate !== actualTodayYmdJst → not_today", () => {
    it("明日の plan に今の現在地を使わない (B-2d-c の核)", () => {
      const result = evaluateCurrentLocation(
        {
          currentLat: VALID_LAT,
          currentLng: VALID_LNG,
          actualTodayYmdJst: TODAY, // 実際の今日 = 5/2
        },
        TOMORROW, // plan の対象日 = 5/3
        NOW_MS,
      );
      expect(result.usable).toBe(false);
      if (!result.usable) expect(result.rejectReason).toBe("not_today");
    });
  });

  describe("[#A7] actualTodayYmdJst undefined → not_today check skip (legacy)", () => {
    it("legacy caller (3 fields 未指定) は backward compat", () => {
      const result = evaluateCurrentLocation(
        { currentLat: VALID_LAT, currentLng: VALID_LNG },
        TOMORROW, // 明日の plan
        NOW_MS,
      );
      // actualTodayYmdJst 未指定なので check skip → 採用
      expect(result.usable).toBe(true);
    });
  });

  describe("[#A8] accuracy = 5000m → low_accuracy", () => {
    it("threshold 1000m を超える低精度", () => {
      const result = evaluateCurrentLocation(
        {
          currentLat: VALID_LAT,
          currentLng: VALID_LNG,
          accuracy: 5000,
        },
        TODAY,
        NOW_MS,
      );
      expect(result.usable).toBe(false);
      if (!result.usable) expect(result.rejectReason).toBe("low_accuracy");
    });
  });

  describe("[#A9] accuracy = NaN → low_accuracy", () => {
    it("accuracy が信頼できない", () => {
      const result = evaluateCurrentLocation(
        {
          currentLat: VALID_LAT,
          currentLng: VALID_LNG,
          accuracy: NaN,
        },
        TODAY,
        NOW_MS,
      );
      expect(result.usable).toBe(false);
      if (!result.usable) expect(result.rejectReason).toBe("low_accuracy");
    });
  });

  describe("[#A10] capturedAt = 'not a date' → invalid", () => {
    it("Date.parse() が NaN を返す string", () => {
      const result = evaluateCurrentLocation(
        {
          currentLat: VALID_LAT,
          currentLng: VALID_LNG,
          capturedAt: "not a valid date string",
        },
        TODAY,
        NOW_MS,
      );
      expect(result.usable).toBe(false);
      if (!result.usable) expect(result.rejectReason).toBe("invalid");
    });
  });

  describe("[#A11] capturedAt = 2 時間前 → stale", () => {
    it("CURRENT_LOCATION_MAX_AGE_MS = 30min を超える", () => {
      const twoHoursAgo = new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString();
      const result = evaluateCurrentLocation(
        {
          currentLat: VALID_LAT,
          currentLng: VALID_LNG,
          capturedAt: twoHoursAgo,
        },
        TODAY,
        NOW_MS,
      );
      expect(result.usable).toBe(false);
      if (!result.usable) expect(result.rejectReason).toBe("stale");
    });
  });

  describe("[#A12] capturedAt = 31 分前 (境界) → stale", () => {
    it("MAX_AGE = 30min ぴったりを超える 1 分", () => {
      const thirtyOneMinAgo = new Date(NOW_MS - 31 * 60 * 1000).toISOString();
      const result = evaluateCurrentLocation(
        {
          currentLat: VALID_LAT,
          currentLng: VALID_LNG,
          capturedAt: thirtyOneMinAgo,
        },
        TODAY,
        NOW_MS,
      );
      expect(result.usable).toBe(false);
      if (!result.usable) expect(result.rejectReason).toBe("stale");
    });

    it("MAX_AGE = 30min ぴったりは採用 (= 不採用境界は >, ≤ ではない)", () => {
      const exactly30Min = new Date(
        NOW_MS - CURRENT_LOCATION_MAX_AGE_MS,
      ).toISOString();
      const result = evaluateCurrentLocation(
        {
          currentLat: VALID_LAT,
          currentLng: VALID_LNG,
          capturedAt: exactly30Min,
        },
        TODAY,
        NOW_MS,
      );
      expect(result.usable).toBe(true);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part B: 判定順序
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Part B] 判定順序", () => {
  describe("[#B1] lat NaN + planDate mismatch → invalid を先に返す", () => {
    it("invalid → not_today → low_accuracy → invalid (capturedAt) → stale の順", () => {
      const result = evaluateCurrentLocation(
        {
          currentLat: NaN,
          currentLng: VALID_LNG,
          accuracy: 5000,
          capturedAt: "garbage",
          actualTodayYmdJst: TODAY,
        },
        TOMORROW, // not_today にも該当
        NOW_MS,
      );
      expect(result.usable).toBe(false);
      if (!result.usable) {
        // 順序が正しければ invalid (lat NaN) を先に返す
        expect(result.rejectReason).toBe("invalid");
      }
    });
  });

  describe("[#B1.5] threshold = 1000m ぴったりは採用 (= MAX を超えるときだけ reject)", () => {
    it("accuracy = 1000m は usable", () => {
      const result = evaluateCurrentLocation(
        {
          currentLat: VALID_LAT,
          currentLng: VALID_LNG,
          accuracy: CURRENT_LOCATION_MAX_ACCURACY_M,
        },
        TODAY,
        NOW_MS,
      );
      expect(result.usable).toBe(true);
    });

    it("accuracy = 1001m は reject", () => {
      const result = evaluateCurrentLocation(
        {
          currentLat: VALID_LAT,
          currentLng: VALID_LNG,
          accuracy: CURRENT_LOCATION_MAX_ACCURACY_M + 1,
        },
        TODAY,
        NOW_MS,
      );
      expect(result.usable).toBe(false);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part C: legacyAdapter integration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

beforeEach(() => {
  resetEventCounter();
});

function mkEventWithCoords(): Event {
  return {
    event_id: "event_1",
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: "12:00",
      timeHint: null,
      provenance: utteranceProvenance(["12時"], "high"),
    },
    where: {
      place_ref: "新宿",
      placeType: "exact_proper_noun",
      coordinates: { lat: 35.6896, lng: 139.7006 },
      provenance: utteranceProvenance(["新宿"], "high"),
    },
    what: {
      activity: "ランチ",
      activityCanonical: "ランチ",
      provenance: utteranceProvenance(["ランチ"], "high"),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
}

function mkRaw(): L1PipelineInput["raw"] {
  return {
    targetDate: TODAY,
    startPoint: null,
    departureTime: null,
    goOut: true,
    operations: [],
    events: [],
  };
}

import { beforeEach } from "vitest";

describe("[Part C] legacyAdapter integration", () => {
  describe("[#C1] 良好な fields → current 採用", () => {
    it("accuracy=50m, capturedAt=now, planDate==today → current が origin として採用", async () => {
      const result = await runMorningPipeline(
        { utterance: "12時に新宿でランチ" },
        { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
      );
      const adapted = adaptPipelineToLegacy(result, {
        sessionId: "test-c1",
        utterance: "12時に新宿でランチ",
        priorPersistedEvents: [mkEventWithCoords()],
        today: TODAY,
        currentLat: VALID_LAT,
        currentLng: VALID_LNG,
        accuracy: 50,
        capturedAt: new Date().toISOString(), // テスト時 now (recent)
        actualTodayYmdJst: TODAY,
        userHomeLat: HOME_LAT,
        userHomeLng: HOME_LNG,
      });
      expect(adapted.session.plan?.journeyOrigin?.kind).toBe("known_exact");
      if (adapted.session.plan?.journeyOrigin?.kind === "known_exact") {
        expect(adapted.session.plan.journeyOrigin.source).toBe("current");
        expect(adapted.session.plan.journeyOrigin.lat).toBe(VALID_LAT);
      }
    });
  });

  describe("[#C2] accuracy=5000m → reject、registered_home に fallback", () => {
    it("低精度 current は reject されて registered_home が採用", async () => {
      const result = await runMorningPipeline(
        { utterance: "12時に新宿でランチ" },
        { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
      );
      const adapted = adaptPipelineToLegacy(result, {
        sessionId: "test-c2",
        utterance: "12時に新宿でランチ",
        priorPersistedEvents: [mkEventWithCoords()],
        today: TODAY,
        currentLat: VALID_LAT,
        currentLng: VALID_LNG,
        accuracy: 5000, // ← reject される
        capturedAt: new Date().toISOString(),
        actualTodayYmdJst: TODAY,
        userHomeLat: HOME_LAT,
        userHomeLng: HOME_LNG,
      });
      expect(adapted.session.plan?.journeyOrigin?.kind).toBe("known_exact");
      if (adapted.session.plan?.journeyOrigin?.kind === "known_exact") {
        // current が reject されて registered_home に fallback
        expect(adapted.session.plan.journeyOrigin.source).toBe("registered_home");
        expect(adapted.session.plan.journeyOrigin.lat).toBe(HOME_LAT);
      }
    });
  });

  describe("[#C3] planDate != actualTodayYmdJst → reject、registered_home に fallback", () => {
    it("明日の plan に今の現在地を使わない", async () => {
      const result = await runMorningPipeline(
        { utterance: "明日12時に新宿でランチ" },
        { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
      );
      const adapted = adaptPipelineToLegacy(result, {
        sessionId: "test-c3",
        utterance: "明日12時に新宿でランチ",
        priorPersistedEvents: [mkEventWithCoords()],
        today: TOMORROW, // plan の対象日 = 明日
        currentLat: VALID_LAT,
        currentLng: VALID_LNG,
        accuracy: 50,
        capturedAt: new Date().toISOString(),
        actualTodayYmdJst: TODAY, // 実際の今日 = 5/2
        userHomeLat: HOME_LAT,
        userHomeLng: HOME_LNG,
      });
      expect(adapted.session.plan?.journeyOrigin?.kind).toBe("known_exact");
      if (adapted.session.plan?.journeyOrigin?.kind === "known_exact") {
        // not_today reject → registered_home に fallback
        expect(adapted.session.plan.journeyOrigin.source).toBe("registered_home");
      }
    });
  });
});
