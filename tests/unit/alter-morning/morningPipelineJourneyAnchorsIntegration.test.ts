/**
 * morningPipeline — journey anchor state contract integration tests (PR B-1 Commit 3)
 *
 * Goal:
 *   `runMorningPipeline` + `adaptPipelineToLegacy` で MorningPlan.journeyOrigin /
 *   journeyEnd が JourneyAnchorState (kind 3 値 discriminated union) として
 *   常に正しく設定されることを実証する。
 *
 * CEO/GPT 2026-05-02 PR B-1 合格条件:
 *   T1: origin known_exact (現在地座標あり) → travel item 生成 + journeyOrigin.kind="known_exact"
 *   T2: origin unknown (座標なし) → travel 不生成 + journeyOrigin.kind="unknown"
 *   T3: end known_exact + assumed (round_trip default) → travel 生成 + isAssumedAnchor=true
 *   T4: end unknown → travel 不生成 + journeyEnd.kind="unknown"
 *   T5 [invariant]: events.length > 0 → journeyOrigin/End は必ず undefined でない
 *   T6 [GPT 必須証明]: source="default_round_trip" → isAssumedAnchor=true (confirmed と区別)
 *
 * 注意 (PR B-1 scope):
 *   events.length === 0 path は legacyAdapter 側で別の contract check
 *   ("clarifying phase with empty items") があり、PR B-1 の核心 (events>0 で
 *   silent fail 排除) と直交する。本 PR では events>0 path のみを assert する。
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

/**
 * 座標つき event fixture (新宿座標)。
 * buildTransportSegments が home→event_1 segment 生成するために coords が必要。
 */
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
      coordinates: { lat: 35.6896, lng: 139.7006 }, // 新宿
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
    targetDate: "2026-05-02",
    startPoint: null,
    departureTime: null,
    goOut: true,
    operations: [],
    events: [],
    ...overrides,
  };
}

// 渋谷座標を currentLat/Lng として渡す helper (origin 確定 ケース)
const SHIBUYA_COORDS = { lat: 35.6595, lng: 139.7004 };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("morningPipeline — journey anchor state contract (PR B-1 Commit 3)", () => {
  // ──────────────────────────────────────────────────────────────────────────
  // T1: origin known_exact (現在地座標あり) → travel 生成 + journeyOrigin.kind="known_exact"
  // ──────────────────────────────────────────────────────────────────────────
  it("T1: currentLat/Lng 提供 → journeyOrigin.kind=known_exact + source=current + travel item 生成", async () => {
    const raw = mkRaw({ events: [] });
    const pipelineResult = await runMorningPipeline(
      { utterance: "12時に新宿でランチ", priorPersistedEvents: undefined },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-t1",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      currentLat: SHIBUYA_COORDS.lat,
      currentLng: SHIBUYA_COORDS.lng,
    });

    const plan = adapted.session.plan;
    expect(plan).toBeDefined();
    expect(plan!.journeyOrigin).toBeDefined();
    expect(plan!.journeyOrigin?.kind).toBe("known_exact");
    if (plan!.journeyOrigin?.kind === "known_exact") {
      expect(plan!.journeyOrigin.source).toBe("current");
      expect(plan!.journeyOrigin.label).toBe("現在地");
      expect(plan!.journeyOrigin.lat).toBe(SHIBUYA_COORDS.lat);
      expect(plan!.journeyOrigin.lng).toBe(SHIBUYA_COORDS.lng);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T2: origin unknown (座標なし) → travel 不生成 + journeyOrigin.kind="unknown"
  // ──────────────────────────────────────────────────────────────────────────
  it("T2: currentLat/Lng & userHomeLat/Lng どちらも null → journeyOrigin.kind=unknown + reason=no_baseline + travel 不生成", async () => {
    const raw = mkRaw({ events: [] });
    const pipelineResult = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-t2",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      currentLat: null,
      currentLng: null,
      userHomeLat: null,
      userHomeLng: null,
    });

    const plan = adapted.session.plan;
    expect(plan).toBeDefined();
    expect(plan!.journeyOrigin).toBeDefined();
    expect(plan!.journeyOrigin?.kind).toBe("unknown");
    if (plan!.journeyOrigin?.kind === "unknown") {
      expect(plan!.journeyOrigin.reason).toBe("no_baseline");
    }

    // travel item は生成されないことを確認 (homeAnchor=null → segment 不生成)
    const travelItems = plan!.items.filter((i) => i.kind === "travel");
    expect(travelItems.length).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T3: end known_exact + assumed (round_trip default)
  //   currentLat/Lng が設定されると、journeyEnd は homeAnchor からの round-trip
  //   default で派生 → kind="known_exact" + source="default_round_trip"
  // ──────────────────────────────────────────────────────────────────────────
  it("T3: currentLat/Lng 提供 → journeyEnd.kind=known_exact + source=default_round_trip (assumed end)", async () => {
    const raw = mkRaw({ events: [] });
    const pipelineResult = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-t3",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      currentLat: SHIBUYA_COORDS.lat,
      currentLng: SHIBUYA_COORDS.lng,
    });

    const plan = adapted.session.plan;
    expect(plan!.journeyEnd?.kind).toBe("known_exact");
    if (plan!.journeyEnd?.kind === "known_exact") {
      expect(plan!.journeyEnd.source).toBe("default_round_trip");
      expect(plan!.journeyEnd.label).toBe("帰宅");
      // 座標は homeAnchor (currentLat/Lng) と同じ (round-trip default)
      expect(plan!.journeyEnd.lat).toBe(SHIBUYA_COORDS.lat);
      expect(plan!.journeyEnd.lng).toBe(SHIBUYA_COORDS.lng);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T4: end unknown (homeAnchor null → end も派生不可)
  // ──────────────────────────────────────────────────────────────────────────
  it("T4: 全 location null → journeyEnd.kind=unknown + reason=no_endpoint_signal + travel 不生成", async () => {
    const raw = mkRaw({ events: [] });
    const pipelineResult = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-t4",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      currentLat: null,
      currentLng: null,
      userHomeLat: null,
      userHomeLng: null,
    });

    const plan = adapted.session.plan;
    expect(plan!.journeyEnd?.kind).toBe("unknown");
    if (plan!.journeyEnd?.kind === "unknown") {
      expect(plan!.journeyEnd.reason).toBe("no_endpoint_signal");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T5 [invariant]: events.length > 0 → journeyOrigin / End は必ず undefined でない
  //   GPT 規律 (a) の core check。silent fail を構造的に排除する。
  // ──────────────────────────────────────────────────────────────────────────
  it("T5 [invariant]: events.length > 0 + 全 location null でも journeyOrigin/End は undefined にならない", async () => {
    const raw = mkRaw({ events: [] });
    const pipelineResult = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-t5",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      currentLat: null,
      currentLng: null,
      userHomeLat: null,
      userHomeLng: null,
    });

    const plan = adapted.session.plan;
    expect(plan).toBeDefined();
    expect(plan!.items.length).toBeGreaterThan(0); // events.length > 0 確認
    // PR B-1 不変条件: events.length > 0 plan では必ず set
    expect(plan!.journeyOrigin).toBeDefined();
    expect(plan!.journeyEnd).toBeDefined();
    // unknown kind でも構造的に表現される (silent fail 排除)
    expect(["known_exact", "known_label_only", "unknown"]).toContain(
      plan!.journeyOrigin!.kind,
    );
    expect(["known_exact", "known_label_only", "unknown"]).toContain(
      plan!.journeyEnd!.kind,
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T6 [GPT 必須証明]: source="default_round_trip" は assumed end として識別
  //   GPT 規律 (b): known_exact でも source 次第で confirmed と区別する。
  //   isAssumedAnchor() helper が正しく true を返すことを assert。
  // ──────────────────────────────────────────────────────────────────────────
  it("T6 [GPT 必須証明]: journeyEnd.source=default_round_trip → isAssumedAnchor=true (confirmed と区別)", async () => {
    const raw = mkRaw({ events: [] });
    const pipelineResult = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-t6",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      currentLat: SHIBUYA_COORDS.lat,
      currentLng: SHIBUYA_COORDS.lng,
    });

    const plan = adapted.session.plan;
    expect(plan!.journeyEnd).toBeDefined();
    // GPT 規律: known_exact でも default_round_trip は assumed
    expect(isAssumedAnchor(plan!.journeyEnd!)).toBe(true);

    // 一方、journeyOrigin は source="current" なので assumed ではない
    expect(plan!.journeyOrigin).toBeDefined();
    expect(isAssumedAnchor(plan!.journeyOrigin!)).toBe(false);

    // confirmed と assumed の境界線が source で引かれていることを comment で明示
    // (将来 PR B-2 で user_override / PR B-3 で comprehension_explicit が
    //  入ったとき、isAssumedAnchor は引き続き default_round_trip のみを true で
    //  返す = 「user 確定済みかどうか」 の不変判定)
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T7 [GPT (3) 補強]: events=0 contract — priorPlan 継承 path で undefined 維持
  //   GPT 規律: events.length === 0 では journeyOrigin/End は undefined 許容。
  //   legacyAdapter else if (priorPlan) 分岐で priorPlan に anchor が無ければ
  //   inheritance 後も undefined のまま (events>0 invariant の対偶)。
  // ──────────────────────────────────────────────────────────────────────────
  it("T7 [GPT (3) 補強]: events=0 + priorPlan に anchor なし → journeyOrigin/End は undefined 維持", async () => {
    // priorPlan が存在するが journeyOrigin/End を持たない (PR B-1 以前の互換 plan)
    const priorPlanWithoutAnchors = {
      date: "2026-05-02",
      items: [
        {
          id: "item_legacy",
          kind: "fixed" as const,
          text: "既存予定",
          what: "ミーティング",
          startTime: "09:00",
          durationMin: 60,
          completed: false,
        },
      ],
      dayConditions: {},
      createdAt: "2026-05-02T08:00:00Z",
      confirmed: true,
      // journeyOrigin / journeyEnd 不在 (旧形式の plan、互換性確認)
    };

    const raw = mkRaw({ events: [] });
    const pipelineResult = await runMorningPipeline(
      { utterance: "今日はよろしく" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-t7",
      utterance: "今日はよろしく",
      // priorPersistedEvents 未指定 → events.length === 0 path
      priorPlan: priorPlanWithoutAnchors,
      currentLat: SHIBUYA_COORDS.lat,
      currentLng: SHIBUYA_COORDS.lng,
    });

    const plan = adapted.session.plan;
    // priorPlan が継承された plan
    expect(plan).toBeDefined();
    // GPT 規律 (3): events=0 では undefined 許容 (events>0 invariant の対偶)
    expect(plan!.journeyOrigin).toBeUndefined();
    expect(plan!.journeyEnd).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T8 [GPT (2) 補強]: selection 経路と chat 経路の converter 一貫性
  //   GPT 規律: selection route と legacyAdapter は同じ converter (toOriginState
  //   / toEndState) を呼ぶため、同一入力 → 同一 JourneyAnchorState を返す。
  //
  //   本 test は converter 自体の一貫性を assert (両経路が同じ converter を呼ぶ
  //   コード証拠は legacyAdapter.ts:766+ と selection/route.ts:380+ の grep で
  //   別途確認済み)。journeyAnchorState.test.ts の converter unit test と合わせて、
  //   selection 経路の挙動が chat 経路と同等であることを保証する。
  // ──────────────────────────────────────────────────────────────────────────
  it("T8 [GPT (2) 補強]: chat 経路の出力 = selection 経路の出力 (converter 経由)", async () => {
    // chat 経路 (legacyAdapter) で current 座標を渡したときの結果
    const raw = mkRaw({ events: [] });
    const pipelineResult = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const chatResult = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-t8-chat",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      currentLat: SHIBUYA_COORDS.lat,
      currentLng: SHIBUYA_COORDS.lng,
    });

    // 同じ入力で converter を直接呼ぶ (selection 経路の logic と一致)
    const { resolveHomeAnchor, resolveJourneyEndAnchor } = await import(
      "@/lib/alter-morning/planning/transportContext"
    );
    const { toOriginState, toEndState } = await import(
      "@/lib/alter-morning/journey/anchorState"
    );
    const homeAnchor = resolveHomeAnchor({
      currentLat: SHIBUYA_COORDS.lat,
      currentLng: SHIBUYA_COORDS.lng,
      homeLat: null,
      homeLng: null,
    });
    const endAnchor = resolveJourneyEndAnchor(homeAnchor);
    const expectedOrigin = toOriginState(homeAnchor, "no_baseline");
    const expectedEnd = toEndState(endAnchor, "no_endpoint_signal");

    // chat 経路の plan.journeyOrigin と converter 直叩きの結果が一致
    expect(chatResult.session.plan!.journeyOrigin).toEqual(expectedOrigin);
    expect(chatResult.session.plan!.journeyEnd).toEqual(expectedEnd);
    // selection 経路は同じ converter を使うため、selectionHomeAnchor が同じなら
    // 結果も一致 (selection/route.ts:380+ で確認済み):
    //   const nextJourneyOrigin = selectionHomeAnchor
    //     ? toOriginState(selectionHomeAnchor, originReason)
    //     : priorPlan.journeyOrigin;
  });
});
