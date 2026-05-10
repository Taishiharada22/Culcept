/**
 * Layer 2 (previous day endpoint inheritance) route-level integration test
 * (PR B-2c Commit 5)
 *
 * CEO/GPT 2026-05-02 PR B-2c 必須証明:
 *   `legacyAdapter.adaptPipelineToLegacy` の **final journeyOrigin** を確認する。
 *   helper 単体ではなく、推論 chain (Layer 1 → strong prior → Layer 2 → resolver)
 *   全体を通した最終結果を assert することで、applyAnchorFallback が後段で
 *   prior を復活させる事故を防ぐ。
 *
 * 13 ケース構成:
 *   #1: 前日 hotel + baseline → previous_day_endpoint wins (GPT 必須)
 *   #2: 前日 default_round_trip + baseline → previous_day_assumed_endpoint
 *   #3: 当 turn explicit + 前日 home → explicit wins
 *   #4: prior user_declared + 前日 endpoint + samePlanDate=true → STRONG prior wins
 *   #5: prior registered_home + 前日 hotel → previous_day_endpoint wins
 *   #6: samePlanDate=false + prior user_declared + 前日 hotel → previous_day_endpoint wins
 *   #7: previous_day_* journeyEnd → cascade guard (helper level、Commit 2 で固定済)
 *   #8: previous_day_* は USER_EXPLICIT_SOURCES に含まれない (helper level、Commit 2 で固定済)
 *   #9: 前日 known_label_only 継承で travel 不生成
 *   #10: 前日 comprehension_explicit → 今日 previous_day_endpoint
 *   #11: 前日 plan null → resolver fallback
 *   #12: cascade なし (前日 plan 存在 + 一昨日プランは見ない、route level)
 *   #13: samePlanDate=true + prior previous_day_assumed_endpoint → 守る
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
import type { MorningPlan } from "@/lib/alter-morning/types";
import { isAssumedAnchor } from "@/lib/alter-morning/journey/anchorState";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  resetEventCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TODAY = "2026-05-02";
const YESTERDAY = "2026-05-01";
const BASELINE_HOME = { lat: 35.69, lng: 139.7 };
const HOTEL_COORDS = { lat: 35.6595, lng: 139.7004 };

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

/** 前日 plan を組み立てる helper (journeyEnd の source / coords を controllable に) */
function mkPreviousDayPlan(opts: {
  date?: string;
  endSource:
    | "user_explicit_endpoint"
    | "default_round_trip"
    | "comprehension_explicit"
    | "previous_day_endpoint" // for cascade test
    | "previous_day_assumed_endpoint"; // for cascade test
  endLabel?: string;
  endCoords?: { lat: number; lng: number };
  endKind?: "known_exact" | "known_label_only";
}): MorningPlan {
  const kind = opts.endKind ?? "known_exact";
  const label = opts.endLabel ?? "ホテル";
  const coords = opts.endCoords ?? HOTEL_COORDS;
  return {
    date: opts.date ?? YESTERDAY,
    items: [],
    dayConditions: {},
    createdAt: `${opts.date ?? YESTERDAY}T00:00:00Z`,
    confirmed: false,
    journeyEnd:
      kind === "known_exact"
        ? {
            kind: "known_exact",
            label,
            lat: coords.lat,
            lng: coords.lng,
            source: opts.endSource,
          }
        : ({ kind: "known_label_only", label, source: opts.endSource } as any),
  } as MorningPlan;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #1: 前日 hotel known_exact + baseline_home → previous_day_endpoint wins
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[GPT 必須 #1] previous day hotel + baseline home → previous_day_endpoint wins", () => {
  it("前日 hotel user_explicit_endpoint + baseline_home → final journeyOrigin = ホテル / previous_day_endpoint", async () => {
    const result = await runMorningPipeline(
      { utterance: "今日のミーティング" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-1",
      utterance: "今日のミーティング",
      priorPersistedEvents: [mkEventWithCoords()],
      today: TODAY,
      // baseline_home (Layer 3) は known を返すが、Layer 2 が勝つ
      userHomeLat: BASELINE_HOME.lat,
      userHomeLng: BASELINE_HOME.lng,
      // Layer 2: 前日 hotel
      previousDayPlan: mkPreviousDayPlan({
        endSource: "user_explicit_endpoint",
        endLabel: "ホテル",
      }),
    });

    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_exact");
    if (adapted.session.plan!.journeyOrigin?.kind === "known_exact") {
      expect(adapted.session.plan!.journeyOrigin.source).toBe("previous_day_endpoint");
      expect(adapted.session.plan!.journeyOrigin.label).toBe("ホテル");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #2: 前日 default_round_trip → previous_day_assumed_endpoint + isAssumedAnchor=true
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[GPT 必須 #2] previous day default_round_trip + baseline → previous_day_assumed_endpoint", () => {
  it("前日 default_round_trip → final = previous_day_assumed_endpoint + isAssumedAnchor()=true", async () => {
    const result = await runMorningPipeline(
      { utterance: "今日のミーティング" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-2",
      utterance: "今日のミーティング",
      priorPersistedEvents: [mkEventWithCoords()],
      today: TODAY,
      userHomeLat: BASELINE_HOME.lat,
      userHomeLng: BASELINE_HOME.lng,
      previousDayPlan: mkPreviousDayPlan({
        endSource: "default_round_trip",
        endLabel: "帰宅",
        endCoords: BASELINE_HOME,
      }),
    });

    const origin = adapted.session.plan!.journeyOrigin;
    expect(origin?.kind).toBe("known_exact");
    if (origin?.kind === "known_exact") {
      expect(origin.source).toBe("previous_day_assumed_endpoint");
    }
    expect(isAssumedAnchor(origin!)).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #3: 当 turn explicit + 前日 home → explicit wins
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[GPT 必須 #3] explicit > previous day", () => {
  it("当 turn 「ホテルから...」 + 前日 home → final = ホテル user_declared (explicit wins)", async () => {
    const result = await runMorningPipeline(
      { utterance: "ホテルから 12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-3",
      utterance: "ホテルから 12時に新宿でランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      today: TODAY,
      userHomeLat: BASELINE_HOME.lat,
      userHomeLng: BASELINE_HOME.lng,
      previousDayPlan: mkPreviousDayPlan({
        endSource: "default_round_trip",
        endLabel: "帰宅",
      }),
    });

    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_label_only");
    if (adapted.session.plan!.journeyOrigin?.kind === "known_label_only") {
      expect(adapted.session.plan!.journeyOrigin.label).toBe("ホテル");
      expect(adapted.session.plan!.journeyOrigin.source).toBe("user_declared");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #4: prior user_declared + 前日 endpoint + samePlanDate=true → STRONG prior wins
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[GPT 必須 #4] prior user_declared (STRONG) + same plan + 前日 → STRONG prior wins", () => {
  it("priorPlan.journeyOrigin = ホテル user_declared + samePlanDate=true → STRONG prior wins", async () => {
    const result = await runMorningPipeline(
      { utterance: "次の予定" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-4",
      utterance: "次の予定",
      priorPersistedEvents: [mkEventWithCoords()],
      today: TODAY,
      userHomeLat: BASELINE_HOME.lat,
      userHomeLng: BASELINE_HOME.lng,
      // priorPlan.date = today → samePlanDate=true
      priorPlan: {
        date: TODAY,
        items: [{ id: "i_1", kind: "fixed", text: "x", what: "x", durationMin: 60, completed: false }],
        dayConditions: {},
        createdAt: `${TODAY}T00:00:00Z`,
        confirmed: false,
        journeyOrigin: {
          kind: "known_label_only",
          label: "ホテルA",
          source: "user_declared",
        },
      } as any,
      previousDayPlan: mkPreviousDayPlan({
        endSource: "user_explicit_endpoint",
        endLabel: "別ホテル",
      }),
    });

    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_label_only");
    if (adapted.session.plan!.journeyOrigin?.kind === "known_label_only") {
      expect(adapted.session.plan!.journeyOrigin.source).toBe("user_declared");
      expect(adapted.session.plan!.journeyOrigin.label).toBe("ホテルA");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #5: prior registered_home (weak) + 前日 hotel → previous_day_endpoint wins
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[GPT 必須 #5] prior registered_home (weak) + 前日 hotel → previous_day_endpoint wins", () => {
  it("priorPlan.journeyOrigin = 自宅 registered_home + 前日 hotel → final = ホテル previous_day_endpoint", async () => {
    const result = await runMorningPipeline(
      { utterance: "次の予定" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-5",
      utterance: "次の予定",
      priorPersistedEvents: [mkEventWithCoords()],
      today: TODAY,
      userHomeLat: BASELINE_HOME.lat,
      userHomeLng: BASELINE_HOME.lng,
      // weak prior (registered_home) は守られない
      priorPlan: {
        date: TODAY,
        items: [{ id: "i_1", kind: "fixed", text: "x", what: "x", durationMin: 60, completed: false }],
        dayConditions: {},
        createdAt: `${TODAY}T00:00:00Z`,
        confirmed: false,
        journeyOrigin: {
          kind: "known_exact",
          label: "自宅",
          lat: BASELINE_HOME.lat,
          lng: BASELINE_HOME.lng,
          source: "registered_home",
        },
      } as any,
      previousDayPlan: mkPreviousDayPlan({
        endSource: "user_explicit_endpoint",
        endLabel: "ホテル",
      }),
    });

    // weak prior は Layer 2 に負ける
    const origin = adapted.session.plan!.journeyOrigin;
    expect(origin?.kind).toBe("known_exact");
    if (origin?.kind === "known_exact") {
      expect(origin.source).toBe("previous_day_endpoint");
      expect(origin.label).toBe("ホテル");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #6: samePlanDate=false + prior user_declared + 前日 hotel → previous_day_endpoint wins
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[GPT 必須 #6] samePlanDate=false: STRONG prior でも守らない、Layer 2 が勝つ", () => {
  it("samePlanDate=false (異日 plan) + prior user_declared + 前日 hotel → final = previous_day_endpoint", async () => {
    const result = await runMorningPipeline(
      { utterance: "今日のミーティング" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-6",
      utterance: "今日のミーティング",
      priorPersistedEvents: [mkEventWithCoords()],
      today: TODAY,
      userHomeLat: BASELINE_HOME.lat,
      userHomeLng: BASELINE_HOME.lng,
      // priorPlan.date = yesterday → samePlanDate=false
      priorPlan: {
        date: YESTERDAY, // 異日
        items: [{ id: "i_1", kind: "fixed", text: "x", what: "x", durationMin: 60, completed: false }],
        dayConditions: {},
        createdAt: `${YESTERDAY}T00:00:00Z`,
        confirmed: false,
        journeyOrigin: {
          kind: "known_label_only",
          label: "前日のホテルA",
          source: "user_declared",
        },
      } as any,
      previousDayPlan: mkPreviousDayPlan({
        endSource: "user_explicit_endpoint",
        endLabel: "ホテルB",
      }),
    });

    // samePlanDate=false → STRONG prior 守らない、Layer 2 が勝つ
    const origin = adapted.session.plan!.journeyOrigin;
    expect(origin?.kind).toBe("known_exact");
    if (origin?.kind === "known_exact") {
      expect(origin.source).toBe("previous_day_endpoint");
      expect(origin.label).toBe("ホテルB");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #9: 前日 known_label_only 継承で travel 不生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#9] 前日 known_label_only 継承で travel 不生成", () => {
  it("前日 hotel known_label_only → origin = label_only / previous_day_endpoint、travel 不生成", async () => {
    const result = await runMorningPipeline(
      { utterance: "今日のミーティング" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-9",
      utterance: "今日のミーティング",
      priorPersistedEvents: [mkEventWithCoords()],
      today: TODAY,
      // baseline_home なし → resolver は unknown を返す → Layer 2 が活きる
      previousDayPlan: mkPreviousDayPlan({
        endSource: "user_explicit_endpoint",
        endKind: "known_label_only",
        endLabel: "ホテル",
      }),
    });

    const origin = adapted.session.plan!.journeyOrigin;
    expect(origin?.kind).toBe("known_label_only");
    if (origin?.kind === "known_label_only") {
      expect(origin.source).toBe("previous_day_endpoint");
    }
    // travel item は生成されない (coords なしのため)
    const travelItems = adapted.session.plan!.items.filter(
      (i) => i.kind === "travel",
    );
    expect(travelItems.length).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #10: 前日 comprehension_explicit → 今日 previous_day_endpoint (assumed でない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#10] 前日 comprehension_explicit → previous_day_endpoint (assumed でない)", () => {
  it("前日 hotel comprehension_explicit → final = previous_day_endpoint (NOT assumed)", async () => {
    const result = await runMorningPipeline(
      { utterance: "次の予定" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-10",
      utterance: "次の予定",
      priorPersistedEvents: [mkEventWithCoords()],
      today: TODAY,
      previousDayPlan: mkPreviousDayPlan({
        endSource: "comprehension_explicit",
        endLabel: "ホテル",
      }),
    });

    const origin = adapted.session.plan!.journeyOrigin;
    expect(origin?.kind).toBe("known_exact");
    if (origin?.kind === "known_exact") {
      expect(origin.source).toBe("previous_day_endpoint");
    }
    // assumed ではない (LLM 由来でも前日由来なので previous_day_endpoint = confirmed)
    expect(isAssumedAnchor(origin!)).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #11: 前日 plan null → resolver fallback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#11] 前日 plan null → Layer 3 (resolver) fallback", () => {
  it("previousDayPlan = null + baseline_home あり → final = baseline_home (Layer 3 fallback)", async () => {
    const result = await runMorningPipeline(
      { utterance: "今日のミーティング" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-11",
      utterance: "今日のミーティング",
      priorPersistedEvents: [mkEventWithCoords()],
      today: TODAY,
      userHomeLat: BASELINE_HOME.lat,
      userHomeLng: BASELINE_HOME.lng,
      previousDayPlan: null, // 前日 plan なし
    });

    // Layer 2 skip → Layer 3 (resolver) が動く
    const origin = adapted.session.plan!.journeyOrigin;
    expect(origin?.kind).toBe("known_exact");
    if (origin?.kind === "known_exact") {
      expect(origin.source).toBe("registered_home");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #13: samePlanDate=true + prior previous_day_assumed_endpoint → 守る
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#13] samePlanDate=true + prior previous_day_assumed_endpoint → 守る", () => {
  it("priorPlan.journeyOrigin = 自宅 previous_day_assumed_endpoint + samePlanDate=true → 守る", async () => {
    const result = await runMorningPipeline(
      { utterance: "次の予定" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-13",
      utterance: "次の予定",
      priorPersistedEvents: [mkEventWithCoords()],
      today: TODAY,
      // priorPlan.date = today → samePlanDate=true、STRONG prior
      priorPlan: {
        date: TODAY,
        items: [{ id: "i_1", kind: "fixed", text: "x", what: "x", durationMin: 60, completed: false }],
        dayConditions: {},
        createdAt: `${TODAY}T00:00:00Z`,
        confirmed: false,
        journeyOrigin: {
          kind: "known_exact",
          label: "自宅",
          lat: BASELINE_HOME.lat,
          lng: BASELINE_HOME.lng,
          source: "previous_day_assumed_endpoint",
        },
      } as any,
      // 当 turn の Layer 2 source も同じ assumed
      previousDayPlan: mkPreviousDayPlan({
        endSource: "default_round_trip",
        endLabel: "帰宅",
      }),
    });

    const origin = adapted.session.plan!.journeyOrigin;
    expect(origin?.kind).toBe("known_exact");
    if (origin?.kind === "known_exact") {
      // STRONG prior が守られる (再計算しない)
      expect(origin.source).toBe("previous_day_assumed_endpoint");
      expect(origin.label).toBe("自宅");
    }
    expect(isAssumedAnchor(origin!)).toBe(true);
  });
});
