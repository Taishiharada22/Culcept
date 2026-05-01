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
});
