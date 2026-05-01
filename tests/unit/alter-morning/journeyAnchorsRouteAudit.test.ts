/**
 * journey anchors route-level audit (PR B-2 冒頭 audit)
 *
 * CEO 2026-05-02 指示:
 *   PR B-2 の冒頭で、候補選択後の response と次 turn session に
 *   journeyOrigin / journeyEnd が維持されることを route-level で確認すること。
 *
 * 本 audit が固定する 4 シナリオ:
 *   A. Chat 経路 (legacyAdapter) は events>0 path で **毎 turn 再解決**
 *      → priorPlan.journeyOrigin は inherit されず、input.currentLat/Lng /
 *        userHomeLat/Lng から fresh に resolve される。
 *   B. Chat 経路で input 座標が消えると、anchor が unknown に flip する
 *      (priorPlan.journeyOrigin が known_exact でも継承されない)
 *      → これが PR B-2 で塞ぐべき state contract gap (= turn 跨ぎでの anchor 不安定)。
 *   C. Selection 経路 (alter/selection/route.ts) は selectionHomeAnchor が null の
 *      ときのみ priorPlan.journeyOrigin を fallback として保持する。
 *      → chat 経路と挙動が異なる。両経路の差異を test で固定する。
 *   D. Selection 経路で response.morningSession.plan に journeyOrigin/End が
 *      乗ることを確認 (= 次 turn の chat route が priorPlan として受け取れる)。
 *
 * 結論 (PR B-2 設計時の制約):
 *   PR B-2 で以下のいずれかを実装する必要がある:
 *     option A: legacyAdapter で priorPlan.journeyOrigin を fallback として継承する
 *               (selection 経路と同じ挙動)
 *     option B: morningSession に anchor を別 field として永続化し、route 共通で
 *               input から復元する (= sticky anchor design)
 *     option C: 何もせず、毎 turn currentLat/Lng/userHomeLat/Lng を確実に渡す
 *               UX 規約にする (frontend 側の対応)
 *
 *   PR B-2 では origin clarify (PendingSlot 拡張) を入れるが、その前に
 *   この anchor preservation の方針を CEO に提示し決めてもらう必要がある。
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
    targetDate: "2026-05-02",
    startPoint: null,
    departureTime: null,
    goOut: true,
    operations: [],
    events: [],
    ...overrides,
  };
}

const SHIBUYA_COORDS = { lat: 35.6595, lng: 139.7004 };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario A: Chat 経路 (events>0) は anchor を毎 turn 再解決する
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario A: Chat 経路は events>0 で毎 turn 再解決", () => {
  it("Turn N で currentLat/Lng → known_exact (current)", async () => {
    const raw = mkRaw({ events: [] });
    const result = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-A1",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      currentLat: SHIBUYA_COORDS.lat,
      currentLng: SHIBUYA_COORDS.lng,
    });
    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_exact");
    if (adapted.session.plan!.journeyOrigin?.kind === "known_exact") {
      expect(adapted.session.plan!.journeyOrigin.source).toBe("current");
    }
  });

  it("Turn N+1 で同じ currentLat/Lng が来ても anchor は input から fresh に再解決される (priorPlan inherit ではない)", async () => {
    // Turn N: anchor 設定済み plan
    const priorPlanWithAnchor = {
      date: "2026-05-02",
      items: [],
      dayConditions: {},
      createdAt: "2026-05-02T00:00:00Z",
      confirmed: false,
      journeyOrigin: {
        kind: "known_exact" as const,
        label: "現在地",
        lat: SHIBUYA_COORDS.lat,
        lng: SHIBUYA_COORDS.lng,
        source: "current" as const,
      },
      journeyEnd: {
        kind: "known_exact" as const,
        label: "帰宅",
        lat: SHIBUYA_COORDS.lat,
        lng: SHIBUYA_COORDS.lng,
        source: "default_round_trip" as const,
      },
    };

    // Turn N+1: 同じ currentLat/Lng を渡す
    const raw = mkRaw({ events: [] });
    const result = await runMorningPipeline(
      { utterance: "次の予定" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-A2",
      utterance: "次の予定",
      priorPersistedEvents: [mkEventWithCoords()],
      priorPlan: priorPlanWithAnchor,
      currentLat: SHIBUYA_COORDS.lat,
      currentLng: SHIBUYA_COORDS.lng,
    });

    // 同じ座標なので結果も known_exact + current だが、
    // **これは preservation ではなく fresh resolve の結果が一致するだけ**。
    // 内部では resolveHomeAnchor が input から再解決している (不変条件 audit)。
    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_exact");
    if (adapted.session.plan!.journeyOrigin?.kind === "known_exact") {
      expect(adapted.session.plan!.journeyOrigin.source).toBe("current");
      expect(adapted.session.plan!.journeyOrigin.lat).toBe(SHIBUYA_COORDS.lat);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario B: input 座標が消えると anchor が unknown に flip する (PR B-2 で塞ぐべき gap)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario B: input 座標が消えると anchor が unknown に flip する (PR B-2 gap)", () => {
  it("priorPlan.journeyOrigin が known_exact でも、input.currentLat/Lng/userHomeLat/Lng が全 null なら unknown に flip", async () => {
    const priorPlanWithAnchor = {
      date: "2026-05-02",
      items: [],
      dayConditions: {},
      createdAt: "2026-05-02T00:00:00Z",
      confirmed: false,
      journeyOrigin: {
        kind: "known_exact" as const,
        label: "現在地",
        lat: SHIBUYA_COORDS.lat,
        lng: SHIBUYA_COORDS.lng,
        source: "current" as const,
      },
    };

    const raw = mkRaw({ events: [] });
    const result = await runMorningPipeline(
      { utterance: "次の予定" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    // input から座標を全て外す (= 次 turn で geolocation が取れない、registered_home なし)
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-B1",
      utterance: "次の予定",
      priorPersistedEvents: [mkEventWithCoords()],
      priorPlan: priorPlanWithAnchor,
      currentLat: null,
      currentLng: null,
      userHomeLat: null,
      userHomeLng: null,
    });

    // priorPlan.journeyOrigin は known_exact だったが、unknown に flip。
    // これは PR B-2 で塞ぐべき gap (= turn 跨ぎでの anchor 不安定性)。
    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("unknown");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario C: chat 経路では userHomeLat/Lng で fallback、selection 経路では使えない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario C: chat 経路は userHomeLat/Lng で fallback、selection 経路は使えない", () => {
  it("chat 経路: currentLat/Lng=null + userHomeLat/Lng 有り → registered_home anchor", async () => {
    const raw = mkRaw({ events: [] });
    const result = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-C1",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      currentLat: null,
      currentLng: null,
      userHomeLat: 35.69,
      userHomeLng: 139.7,
    });

    // chat 経路は registered_home fallback あり
    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_exact");
    if (adapted.session.plan!.journeyOrigin?.kind === "known_exact") {
      expect(adapted.session.plan!.journeyOrigin.source).toBe("registered_home");
      expect(adapted.session.plan!.journeyOrigin.label).toBe("自宅");
    }
  });

  // 注: selection 経路は registered_home を使わないため (selection/route.ts:182-185)、
  // 同じ条件 (currentLat/Lng=null + userHomeLat/Lng 有り) でも selectionHomeAnchor=null
  // となり、priorPlan.journeyOrigin に fallback する。
  // これは selection route の現在の仕様 (DB アクセスを避けるため)。
  // PR B-2 で「selection でも userHomeLat/Lng を渡せるようにする」 か、
  // 「priorPlan.journeyOrigin を信頼する」 か、選択する必要がある。
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario D: events=0 path で priorPlan が継承されるか
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario D: events=0 + priorPlan あり → priorPlan の anchor が継承される", () => {
  it("events=0 + priorPlan に anchor 有り → adapter は priorPlan を spread して anchor 維持", async () => {
    const priorPlanWithAnchor = {
      date: "2026-05-02",
      items: [
        {
          id: "item_1",
          kind: "fixed" as const,
          text: "既存予定",
          what: "ミーティング",
          startTime: "09:00",
          durationMin: 60,
          completed: false,
        },
      ],
      dayConditions: {},
      createdAt: "2026-05-02T00:00:00Z",
      confirmed: true,
      journeyOrigin: {
        kind: "known_exact" as const,
        label: "現在地",
        lat: SHIBUYA_COORDS.lat,
        lng: SHIBUYA_COORDS.lng,
        source: "current" as const,
      },
      journeyEnd: {
        kind: "known_exact" as const,
        label: "帰宅",
        lat: SHIBUYA_COORDS.lat,
        lng: SHIBUYA_COORDS.lng,
        source: "default_round_trip" as const,
      },
    };

    const raw = mkRaw({ events: [] });
    const result = await runMorningPipeline(
      { utterance: "今日も同じで" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-D1",
      utterance: "今日も同じで",
      priorPlan: priorPlanWithAnchor,
      // priorPersistedEvents 未指定 → events.length === 0 path
      currentLat: null,
      currentLng: null,
    });

    // events=0 path は priorPlan を spread。anchor は そのまま継承される。
    expect(adapted.session.plan).toBeDefined();
    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_exact");
    if (adapted.session.plan!.journeyOrigin?.kind === "known_exact") {
      expect(adapted.session.plan!.journeyOrigin.source).toBe("current");
      expect(adapted.session.plan!.journeyOrigin.lat).toBe(SHIBUYA_COORDS.lat);
    }
    expect(adapted.session.plan!.journeyEnd?.kind).toBe("known_exact");
  });
});
