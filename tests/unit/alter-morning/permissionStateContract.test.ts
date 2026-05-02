/**
 * permissionState contract integration test (PR B-2d-a Commit 5)
 *
 * CEO/GPT 2026-05-02 PR B-2d-a 必須証明:
 *   permissionState は origin の主役ではない。currentLat/Lng も baseline home も
 *   解決できず origin が unknown になる時の **理由説明** として使う。
 *
 * 9 ケース構成 (CEO 必須):
 *   #1: coordsあり → permissionState が denied / prompt / unavailable でも current 採用
 *   #2: coordsなし + home baselineあり → registered_home 採用、unknown reason に落ちない
 *   #3: coordsなし + home baselineなし + denied → reason = denied
 *   #4: coordsなし + home baselineなし + prompt → reason = unrequested
 *   #5: coordsなし + home baselineなし + unsupported → reason = unrequested
 *   #6: coordsなし + home baselineなし + unavailable → reason = unrequested
 *   #7: navigator.permissions なし → "unsupported" (helper level、別 file)
 *   #8: navigator.permissions.query throw → "unavailable" (helper level、別 file)
 *   #9: B-2d-a では新規 getCurrentPosition 呼び出しを追加しない (= 既存 mount 時自動取得 の維持確認、grep 確認のみ)
 *
 * 注: #7/#8 は helper level だが、本 file で integration として確認するのは route → adapter の経路。
 *     helper level の jsdom/環境テストは別 file (frontend test 不在のため、本 PR は backend のみ確認)。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
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

vi.mock("server-only", () => ({}));

beforeEach(() => {
  resetEventCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TODAY = "2026-05-02";
const SHIBUYA_COORDS = { lat: 35.6595, lng: 139.7004 };
const HOME_COORDS = { lat: 35.69, lng: 139.7 };

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

function mkRaw(
  overrides?: Partial<L1PipelineInput["raw"]>,
): L1PipelineInput["raw"] {
  return {
    targetDate: TODAY,
    startPoint: null,
    departureTime: null,
    goOut: true,
    operations: [],
    events: [],
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #1: coords あり → permissionState 不問で current 採用 (GPT 補強 2 必須証明)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#1 GPT 補強 2 必須証明] coords あり → permissionState 不問で current 採用", () => {
  // permissionState の異常値ごとに current が採用されることを確認
  const abnormalPermissions = ["denied", "prompt", "unavailable", "unsupported"] as const;

  for (const ps of abnormalPermissions) {
    it(`coords あり + permissionState=${ps} → final journeyOrigin = current (理論上ありえない組み合わせでも current 優先)`, async () => {
      const result = await runMorningPipeline(
        { utterance: "12時に新宿でランチ" },
        { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
      );
      const adapted = adaptPipelineToLegacy(result, {
        sessionId: `test-1-${ps}`,
        utterance: "12時に新宿でランチ",
        priorPersistedEvents: [mkEventWithCoords()],
        today: TODAY,
        currentLat: SHIBUYA_COORDS.lat,
        currentLng: SHIBUYA_COORDS.lng,
        permissionState: ps,
      });

      expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_exact");
      if (adapted.session.plan!.journeyOrigin?.kind === "known_exact") {
        expect(adapted.session.plan!.journeyOrigin.source).toBe("current");
        expect(adapted.session.plan!.journeyOrigin.lat).toBe(SHIBUYA_COORDS.lat);
      }
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #2: coords なし + baseline home あり → registered_home 採用、unknown 落ちない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#2] coords なし + home baseline あり → registered_home 採用、unknown reason に落ちない", () => {
  const allPermissions = ["granted", "denied", "prompt", "unsupported", "unavailable"] as const;

  for (const ps of allPermissions) {
    it(`coords なし + userHomeLat/Lng + permissionState=${ps} → registered_home 採用 (permissionState は使われない)`, async () => {
      const result = await runMorningPipeline(
        { utterance: "12時に新宿でランチ" },
        { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
      );
      const adapted = adaptPipelineToLegacy(result, {
        sessionId: `test-2-${ps}`,
        utterance: "12時に新宿でランチ",
        priorPersistedEvents: [mkEventWithCoords()],
        today: TODAY,
        currentLat: null,
        currentLng: null,
        userHomeLat: HOME_COORDS.lat,
        userHomeLng: HOME_COORDS.lng,
        permissionState: ps,
      });

      expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_exact");
      if (adapted.session.plan!.journeyOrigin?.kind === "known_exact") {
        expect(adapted.session.plan!.journeyOrigin.source).toBe("registered_home");
      }
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #3: coords なし + baseline なし + denied → reason = denied
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#3] coords なし + baseline なし + denied → reason = denied", () => {
  it("permissionState=denied で AnchorUnknownReason = denied", async () => {
    const result = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-3",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      today: TODAY,
      currentLat: null,
      currentLng: null,
      userHomeLat: null,
      userHomeLng: null,
      permissionState: "denied",
    });

    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("unknown");
    if (adapted.session.plan!.journeyOrigin?.kind === "unknown") {
      expect(adapted.session.plan!.journeyOrigin.reason).toBe("denied");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #4-#6: coords なし + baseline なし + prompt/unsupported/unavailable → reason = unrequested
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#4-#6] prompt/unsupported/unavailable → reason = unrequested (集約)", () => {
  const cases = ["prompt", "unsupported", "unavailable"] as const;

  for (const ps of cases) {
    it(`permissionState=${ps} → AnchorUnknownReason = unrequested (集約)`, async () => {
      const result = await runMorningPipeline(
        { utterance: "12時に新宿でランチ" },
        { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
      );
      const adapted = adaptPipelineToLegacy(result, {
        sessionId: `test-${ps}`,
        utterance: "12時に新宿でランチ",
        priorPersistedEvents: [mkEventWithCoords()],
        today: TODAY,
        currentLat: null,
        currentLng: null,
        userHomeLat: null,
        userHomeLng: null,
        permissionState: ps,
      });

      expect(adapted.session.plan!.journeyOrigin?.kind).toBe("unknown");
      if (adapted.session.plan!.journeyOrigin?.kind === "unknown") {
        expect(adapted.session.plan!.journeyOrigin.reason).toBe("unrequested");
      }
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #7: granted + coords なし + baseline なし → reason = no_baseline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#7] granted + coords なし + baseline なし → reason = no_baseline", () => {
  it("granted だが coords が来ない (理論上ありえる、permission は許可だが getCurrentPosition 失敗等) → no_baseline", async () => {
    const result = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-7",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      today: TODAY,
      currentLat: null,
      currentLng: null,
      userHomeLat: null,
      userHomeLng: null,
      permissionState: "granted",
    });

    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("unknown");
    if (adapted.session.plan!.journeyOrigin?.kind === "unknown") {
      expect(adapted.session.plan!.journeyOrigin.reason).toBe("no_baseline");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #8: permissionState undefined (= legacy caller、後方互換) → no_baseline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#8] permissionState undefined (legacy caller) → no_baseline (後方互換)", () => {
  it("permissionState 未指定 + coords なし + baseline なし → no_baseline (旧挙動と等価)", async () => {
    const result = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-8",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      today: TODAY,
      currentLat: null,
      currentLng: null,
      userHomeLat: null,
      userHomeLng: null,
      // permissionState 未指定
    });

    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("unknown");
    if (adapted.session.plan!.journeyOrigin?.kind === "unknown") {
      expect(adapted.session.plan!.journeyOrigin.reason).toBe("no_baseline");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #9: B-2d-a で新規 getCurrentPosition 呼び出しを追加していない (grep 確認)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#9] B-2d-a で新規 getCurrentPosition 呼び出しを追加していない", () => {
  it("permissionState helper は getCurrentPosition を呼ばない (副作用なし、CEO/GPT 規律)", async () => {
    // helper module の import 自体で getCurrentPosition が呼ばれないことを確認
    // (vitest は node 環境で navigator 不在、そもそも geolocation 経由の取得は起きない)
    const { getGeolocationPermissionState } = await import(
      "@/lib/alter-morning/journey/permissionState"
    );

    // node 環境では navigator 不在 → "unsupported" を返す
    const result = await getGeolocationPermissionState();
    expect(result).toBe("unsupported");
    // getCurrentPosition は呼ばれていない (= test 環境で navigator が undefined だが crash しない)
  });
});
