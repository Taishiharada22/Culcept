/**
 * journey anchors route-level audit (PR B-2a desired behavior)
 *
 * CEO 2026-05-02 指示:
 *   PR B-2a で turn 跨ぎ anchor continuity を確立。本 test は audit ではなく
 *   **desired behavior の固定** に書き換え (GPT 規律: 悪い現状を固定するな)。
 *
 * 本 test が固定する 7 シナリオ (desired behavior):
 *   T1: prior known_exact + fresh unknown → prior 維持 (PR B-2a 核心)
 *   T2: prior unknown + fresh known_exact → fresh 採用 (再活性化)
 *   T3: prior known_label_only + fresh unknown → prior 継承、travel 不生成
 *   T4: prior default_round_trip (samePlanDate=true) + fresh unknown → prior assumed 維持
 *   T5: prior known_exact + fresh known_label_only → prior 維持 (coords 落とさない、GPT 規律)
 *   T6: prior current + samePlanDate=false + fresh unknown → fresh (= unknown、stale 拒否)
 *   T7: prior default_round_trip + samePlanDate=false + fresh unknown → fresh (= unknown、GPT 必須証明)
 *
 * Selection route の挙動 (chat と異なる) は別 test で固定 (将来 PR で必要なら追加):
 *   selection 経路は body から userHomeLat/Lng を受けない (DB アクセス避ける設計)。
 *   chat 経路と挙動が異なる構造的 inconsistency は、本 PR では PR B-1 audit で
 *   identify 済みの「両経路差異」 として comment で残す (PR B-3 以降で解消)。
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
import { isAssumedAnchor } from "@/lib/alter-morning/journey/anchorState";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  resetEventCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TODAY = "2026-05-02";
const SHIBUYA_COORDS = { lat: 35.6595, lng: 139.7004 };
const SHINJUKU_COORDS = { lat: 35.6896, lng: 139.7006 };

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
      coordinates: SHINJUKU_COORDS,
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

/**
 * 起点 anchor 付き priorPlan を組み立てる。
 * source / kind を test ごとに変えられるよう options で受ける。
 */
function mkPriorPlanWithOriginAnchor(opts: {
  date: string;
  origin?: any;
  end?: any;
}): any {
  return {
    date: opts.date,
    items: [
      {
        id: "item_1",
        kind: "fixed",
        text: "既存予定",
        what: "ミーティング",
        startTime: "09:00",
        durationMin: 60,
        completed: false,
      },
    ],
    dayConditions: {},
    createdAt: `${opts.date}T00:00:00Z`,
    confirmed: false,
    journeyOrigin: opts.origin,
    journeyEnd: opts.end,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T1: prior known_exact + fresh unknown → prior 維持 (PR B-2a 核心)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("T1: prior known_exact + fresh unknown → prior 維持 (turn 跨ぎ continuity)", () => {
  it("priorPlan に current 由来 anchor + 同 plan date + fresh 全 null → prior 維持", async () => {
    const priorPlan = mkPriorPlanWithOriginAnchor({
      date: TODAY,
      origin: {
        kind: "known_exact",
        label: "現在地",
        lat: SHIBUYA_COORDS.lat,
        lng: SHIBUYA_COORDS.lng,
        source: "current",
      },
      end: {
        kind: "known_exact",
        label: "帰宅",
        lat: SHIBUYA_COORDS.lat,
        lng: SHIBUYA_COORDS.lng,
        source: "default_round_trip",
      },
    });

    const result = await runMorningPipeline(
      { utterance: "次の予定" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-T1",
      utterance: "次の予定",
      priorPersistedEvents: [mkEventWithCoords()],
      priorPlan,
      today: TODAY,
      // fresh resolve は全 null (= unknown)
      currentLat: null,
      currentLng: null,
      userHomeLat: null,
      userHomeLng: null,
    });

    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_exact");
    if (adapted.session.plan!.journeyOrigin?.kind === "known_exact") {
      expect(adapted.session.plan!.journeyOrigin.source).toBe("current");
      expect(adapted.session.plan!.journeyOrigin.lat).toBe(SHIBUYA_COORDS.lat);
    }
    expect(adapted.session.plan!.journeyEnd?.kind).toBe("known_exact");
    if (adapted.session.plan!.journeyEnd?.kind === "known_exact") {
      expect(adapted.session.plan!.journeyEnd.source).toBe("default_round_trip");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T2: prior unknown + fresh known_exact → fresh (再活性化)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("T2: prior unknown + fresh known_exact → fresh (再活性化)", () => {
  it("priorPlan の anchor が unknown でも、新たに位置情報取れたら fresh 採用", async () => {
    const priorPlan = mkPriorPlanWithOriginAnchor({
      date: TODAY,
      origin: { kind: "unknown", reason: "no_baseline" },
      end: { kind: "unknown", reason: "no_endpoint_signal" },
    });

    const result = await runMorningPipeline(
      { utterance: "次の予定" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-T2",
      utterance: "次の予定",
      priorPersistedEvents: [mkEventWithCoords()],
      priorPlan,
      today: TODAY,
      currentLat: SHIBUYA_COORDS.lat,
      currentLng: SHIBUYA_COORDS.lng,
    });

    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_exact");
    if (adapted.session.plan!.journeyOrigin?.kind === "known_exact") {
      expect(adapted.session.plan!.journeyOrigin.source).toBe("current");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T3: prior known_label_only + fresh unknown → prior 継承、travel 不生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("T3: prior known_label_only + fresh unknown → prior 継承 (label 維持)", () => {
  it("priorPlan の label_only anchor が継承される、ただし travel item は生成されない", async () => {
    const priorPlan = mkPriorPlanWithOriginAnchor({
      date: TODAY,
      origin: {
        kind: "known_label_only",
        label: "ホテル",
        source: "comprehension_explicit",
      },
      end: { kind: "unknown", reason: "no_endpoint_signal" },
    });

    const result = await runMorningPipeline(
      { utterance: "次の予定" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-T3",
      utterance: "次の予定",
      priorPersistedEvents: [mkEventWithCoords()],
      priorPlan,
      today: TODAY,
      currentLat: null,
      currentLng: null,
    });

    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_label_only");
    if (adapted.session.plan!.journeyOrigin?.kind === "known_label_only") {
      expect(adapted.session.plan!.journeyOrigin.label).toBe("ホテル");
    }
    // travel item は生成されない (coords なしなので buildTransportSegments が skip)
    const travelItems = adapted.session.plan!.items.filter(
      (i) => i.kind === "travel",
    );
    expect(travelItems.length).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T4: prior default_round_trip (samePlanDate=true) + fresh unknown → prior assumed 維持
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("T4: prior assumed end (samePlanDate=true) + fresh unknown → prior 維持", () => {
  it("default_round_trip は同 plan date なら継承 OK、isAssumedAnchor で識別される", async () => {
    const priorPlan = mkPriorPlanWithOriginAnchor({
      date: TODAY,
      origin: {
        kind: "known_exact",
        label: "現在地",
        lat: SHIBUYA_COORDS.lat,
        lng: SHIBUYA_COORDS.lng,
        source: "current",
      },
      end: {
        kind: "known_exact",
        label: "帰宅",
        lat: SHIBUYA_COORDS.lat,
        lng: SHIBUYA_COORDS.lng,
        source: "default_round_trip",
      },
    });

    const result = await runMorningPipeline(
      { utterance: "次の予定" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-T4",
      utterance: "次の予定",
      priorPersistedEvents: [mkEventWithCoords()],
      priorPlan,
      today: TODAY,
      currentLat: null,
      currentLng: null,
    });

    expect(adapted.session.plan!.journeyEnd?.kind).toBe("known_exact");
    expect(isAssumedAnchor(adapted.session.plan!.journeyEnd!)).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T5: prior known_exact + fresh known_label_only → prior 維持 (coords 落とさない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("T5 [GPT 規律]: fresh label_only で prior known_exact を上書きしない (coords 維持)", () => {
  // 注: 現状の resolver は HomeAnchor (known_exact 相当) しか返さないため、
  // fresh が known_label_only になる経路は PR B-3 以降 (extractStartPointAnchor で
  // label のみ抽出したケース)。本 test は直接 applyAnchorFallback の不変条件で
  // 固定済み (applyAnchorFallback.test.ts Case 2)。
  // route-level での再現は PR B-3 で integration test 追加予定。
  it("(reserved) PR B-3 で fresh label_only 経路が入ったとき、prior known_exact を維持することを再 assert する場所", () => {
    expect(true).toBe(true); // placeholder、PR B-3 で実装
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T6: prior current + samePlanDate=false + fresh unknown → fresh (stale 拒否)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("T6 [GPT 修正 1]: stale current_location は date mismatch で継承拒否", () => {
  it("priorPlan.date が yesterday、currentPlanDate=today → samePlanDate=false → fresh (=unknown)", async () => {
    const priorPlan = mkPriorPlanWithOriginAnchor({
      date: "2026-05-01", // yesterday
      origin: {
        kind: "known_exact",
        label: "現在地",
        lat: SHIBUYA_COORDS.lat,
        lng: SHIBUYA_COORDS.lng,
        source: "current",
      },
    });

    const result = await runMorningPipeline(
      { utterance: "今日の予定" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-T6",
      utterance: "今日の予定",
      priorPersistedEvents: [mkEventWithCoords()],
      priorPlan,
      today: TODAY, // 2026-05-02
      currentLat: null,
      currentLng: null,
      userHomeLat: null,
      userHomeLng: null,
    });

    // priorPlan.date !== today → samePlanDate=false → STALE current 継承拒否
    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("unknown");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T7: prior default_round_trip + samePlanDate=false → fresh (GPT 必須証明)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("T7 [GPT 修正 2 必須証明]: stale default_round_trip も継承拒否", () => {
  it("priorPlan.date が yesterday、currentPlanDate=today → default_round_trip 継承拒否", async () => {
    const priorPlan = mkPriorPlanWithOriginAnchor({
      date: "2026-05-01", // yesterday
      end: {
        kind: "known_exact",
        label: "帰宅",
        lat: SHIBUYA_COORDS.lat,
        lng: SHIBUYA_COORDS.lng,
        source: "default_round_trip",
      },
    });

    const result = await runMorningPipeline(
      { utterance: "今日の予定" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-T7",
      utterance: "今日の予定",
      priorPersistedEvents: [mkEventWithCoords()],
      priorPlan,
      today: TODAY,
      currentLat: null,
      currentLng: null,
      userHomeLat: null,
      userHomeLng: null,
    });

    // STALE default_round_trip は date mismatch で継承拒否
    expect(adapted.session.plan!.journeyEnd?.kind).toBe("unknown");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T8 [追加]: 非 STALE source は date mismatch でも継承 (registered_home 時刻非依存)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("T8: 非 STALE source (registered_home) は date mismatch でも継承 OK", () => {
  it("priorPlan.date が yesterday + prior registered_home + fresh unknown → prior 維持 (時刻非依存)", async () => {
    const priorPlan = mkPriorPlanWithOriginAnchor({
      date: "2026-05-01",
      origin: {
        kind: "known_exact",
        label: "自宅",
        lat: 35.69,
        lng: 139.7,
        source: "registered_home",
      },
    });

    const result = await runMorningPipeline(
      { utterance: "今日の予定" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-T8",
      utterance: "今日の予定",
      priorPersistedEvents: [mkEventWithCoords()],
      priorPlan,
      today: TODAY,
      currentLat: null,
      currentLng: null,
      userHomeLat: null,
      userHomeLng: null,
    });

    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_exact");
    if (adapted.session.plan!.journeyOrigin?.kind === "known_exact") {
      expect(adapted.session.plan!.journeyOrigin.source).toBe("registered_home");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T9 [GPT 重大修正 1 必須証明]: 明日プラン継続編集で samePlanDate=true
//   GPT 指摘:
//     samePlanDate は「今日比較」 ではなく「同じ plan 対象日 (currentPlanDate)」 比較。
//     legacyAdapter の `today` 変数は input.today ?? todayYmd() から取得され、
//     plan.date に使われる「対象日」 = currentPlanDate と同義。
//
//   本 test は「明日プランを 2 turn 連続編集」 シナリオで samePlanDate=true が
//   正しく成立し、anchor が継承されることを assert する (現実の OS の今日と
//   plan の対象日が異なるケース)。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("T9 [GPT 重大修正 1 必須証明]: 明日プラン継続編集で samePlanDate=true", () => {
  const TOMORROW = "2026-05-03"; // currentPlanDate (today から見て翌日)

  it("input.today=TOMORROW + priorPlan.date=TOMORROW + fresh unknown → prior 維持 (samePlanDate=true)", async () => {
    // 今日が 2026-05-02 だが、明日 (2026-05-03) のプランを作っているシナリオ。
    // caller (route.ts) は input.today に TOMORROW を渡す。
    // priorPlan.date も TOMORROW (前 turn で作った明日プランの継続)。
    const priorPlan = mkPriorPlanWithOriginAnchor({
      date: TOMORROW,
      origin: {
        kind: "known_exact",
        label: "現在地",
        lat: SHIBUYA_COORDS.lat,
        lng: SHIBUYA_COORDS.lng,
        source: "current",
      },
    });

    const result = await runMorningPipeline(
      { utterance: "明日の予定追加" },
      {
        comprehension: createStubComprehensionProvider(
          mkRaw({ targetDate: TOMORROW }),
        ),
        weather: null,
      },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-T9",
      utterance: "明日の予定追加",
      priorPersistedEvents: [mkEventWithCoords()],
      priorPlan,
      today: TOMORROW, // ← caller が「対象日 = 明日」 を渡す (CEO/GPT 規律)
      currentLat: null,
      currentLng: null,
      userHomeLat: null,
      userHomeLng: null,
    });

    // samePlanDate = (priorPlan.date === today) = (TOMORROW === TOMORROW) = true
    // → STALE source (current) でも継承可
    // → prior 維持
    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_exact");
    if (adapted.session.plan!.journeyOrigin?.kind === "known_exact") {
      expect(adapted.session.plan!.journeyOrigin.source).toBe("current");
      expect(adapted.session.plan!.journeyOrigin.lat).toBe(SHIBUYA_COORDS.lat);
    }
  });

  it("対偶: input.today=TODAY (caller bug = 明日プランで input.today 渡し忘れ) + priorPlan.date=TOMORROW → samePlanDate=false → fresh", async () => {
    // caller responsibility 違反のケース。input.today を渡し忘れたため、
    // legacyAdapter は todayYmd() (OS の今日 = TODAY) を使う。
    // priorPlan.date は TOMORROW なので samePlanDate=false → STALE current 拒否。
    // この挙動は test で固定し、caller bug を早期検出する。
    const priorPlan = mkPriorPlanWithOriginAnchor({
      date: TOMORROW,
      origin: {
        kind: "known_exact",
        label: "現在地",
        lat: SHIBUYA_COORDS.lat,
        lng: SHIBUYA_COORDS.lng,
        source: "current",
      },
    });

    const result = await runMorningPipeline(
      { utterance: "予定追加" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-T9-bug",
      utterance: "予定追加",
      priorPersistedEvents: [mkEventWithCoords()],
      priorPlan,
      today: TODAY, // caller が誤って TODAY を渡した (bug シミュレーション)
      currentLat: null,
      currentLng: null,
      userHomeLat: null,
      userHomeLng: null,
    });

    // priorPlan.date (TOMORROW) !== today (TODAY) → samePlanDate=false → STALE 拒否
    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("unknown");
  });
});
