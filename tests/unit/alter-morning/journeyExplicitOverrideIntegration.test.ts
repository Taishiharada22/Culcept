/**
 * journey explicit anchor override integration test (PR B-2b Commit 5)
 *
 * CEO/GPT 2026-05-02 PR B-2b 必須証明 (GPT 明示要求):
 *   user 明示発話 (deterministic detector 由来) は prior known_exact を上書きできる
 *   ことを **route-level integration** で実証する。
 *
 * 検証シナリオ (GPT 必須):
 *   T_origin_override: prior 自宅 known_exact + 「ホテルから...」
 *     → journeyOrigin=ホテル known_label_only / source=user_declared
 *     → prior 自宅は上書きされる
 *     → travel は生成されない (coords なし)
 *
 *   T_end_override: prior default_round_trip known_exact + 「...ホテルに泊まる」
 *     → journeyEnd=ホテル known_label_only / source=user_explicit_endpoint
 *     → prior default_round_trip は上書きされる
 *     → travel は生成されない
 *
 * 加えて GPT 規律 (LLM 由来は強権なし) の対偶 test:
 *   T_llm_no_override: prior 自宅 known_exact + 発話に explicit pattern なし
 *     → journeyOrigin = 自宅 known_exact (prior 維持)
 *     → travel 生成される
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
const HOME_COORDS = { lat: 35.69, lng: 139.7 }; // 自宅

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

function mkPriorPlanWithHomeAnchors(): any {
  return {
    date: TODAY,
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
    createdAt: `${TODAY}T00:00:00Z`,
    confirmed: false,
    journeyOrigin: {
      kind: "known_exact",
      label: "自宅",
      lat: HOME_COORDS.lat,
      lng: HOME_COORDS.lng,
      source: "registered_home",
    },
    journeyEnd: {
      kind: "known_exact",
      label: "帰宅",
      lat: HOME_COORDS.lat,
      lng: HOME_COORDS.lng,
      source: "default_round_trip",
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T_origin_override [GPT 必須証明]
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("T_origin_override [GPT 必須証明]: 「ホテルから...」 で prior 自宅 known_exact を上書き", () => {
  it("prior 自宅 known_exact + 発話「ホテルから新宿でランチ」 → journeyOrigin=ホテル known_label_only / user_declared", async () => {
    const result = await runMorningPipeline(
      { utterance: "ホテルから12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-origin-override",
      utterance: "ホテルから12時に新宿でランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      priorPlan: mkPriorPlanWithHomeAnchors(),
      today: TODAY,
      // resolver からは自宅 (registered_home) が解決されるが、
      // detector が「ホテルから」 を hit して上書きする
      userHomeLat: HOME_COORDS.lat,
      userHomeLng: HOME_COORDS.lng,
      userHomeLabel: "自宅",
    });

    // GPT 必須証明: USER_EXPLICIT が prior known_exact を上書き
    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_label_only");
    if (adapted.session.plan!.journeyOrigin?.kind === "known_label_only") {
      expect(adapted.session.plan!.journeyOrigin.label).toBe("ホテル");
      expect(adapted.session.plan!.journeyOrigin.source).toBe("user_declared");
    }

    // travel は生成されない (coords なし)
    const travelItems = adapted.session.plan!.items.filter(
      (i) => i.kind === "travel",
    );
    expect(travelItems.length).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T_end_override [GPT 必須証明]
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("T_end_override [GPT 必須証明]: 「...ホテルに泊まる」 で prior default_round_trip を上書き", () => {
  it("prior default_round_trip + 発話「12時に新宿でランチしてホテルに泊まる」 → journeyEnd=ホテル known_label_only / user_explicit_endpoint", async () => {
    const result = await runMorningPipeline(
      { utterance: "12時に新宿でランチしてホテルに泊まる" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-end-override",
      utterance: "12時に新宿でランチしてホテルに泊まる",
      priorPersistedEvents: [mkEventWithCoords()],
      priorPlan: mkPriorPlanWithHomeAnchors(),
      today: TODAY,
      userHomeLat: HOME_COORDS.lat,
      userHomeLng: HOME_COORDS.lng,
    });

    // GPT 必須証明: USER_EXPLICIT が prior default_round_trip (assumed) を上書き
    expect(adapted.session.plan!.journeyEnd?.kind).toBe("known_label_only");
    if (adapted.session.plan!.journeyEnd?.kind === "known_label_only") {
      expect(adapted.session.plan!.journeyEnd.label).toBe("ホテル");
      expect(adapted.session.plan!.journeyEnd.source).toBe(
        "user_explicit_endpoint",
      );
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T_llm_no_override [GPT 規律対偶]
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("T_llm_no_override [GPT 規律対偶]: explicit pattern なし → resolver 結果が採用される", () => {
  it("発話に explicit origin/end なし → resolver 結果 (registered_home / default_round_trip) が採用される", async () => {
    const result = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" }, // explicit origin/end pattern なし
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-no-override",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      // priorPlan なしで test (新規 session として)
      today: TODAY,
      userHomeLat: HOME_COORDS.lat,
      userHomeLng: HOME_COORDS.lng,
    });

    // resolver 結果: registered_home が採用 (detector が hit しないため)
    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_exact");
    if (adapted.session.plan!.journeyOrigin?.kind === "known_exact") {
      expect(adapted.session.plan!.journeyOrigin.source).toBe("registered_home");
      expect(adapted.session.plan!.journeyOrigin.lat).toBe(HOME_COORDS.lat);
    }

    // journeyEnd は default_round_trip
    expect(adapted.session.plan!.journeyEnd?.kind).toBe("known_exact");
    if (adapted.session.plan!.journeyEnd?.kind === "known_exact") {
      expect(adapted.session.plan!.journeyEnd.source).toBe("default_round_trip");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T_negative_event_where: event where (「ホテルでランチ」) は origin/end として拾わない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("T_negative_event_where: event where 「ホテルでランチ」 は detector に拾われない", () => {
  it("発話「ホテルでランチ」 → detector は null、resolver 結果が採用される", async () => {
    const result = await runMorningPipeline(
      { utterance: "12時にホテルでランチ" }, // ホテル**で**ランチ = event where
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-event-where",
      utterance: "12時にホテルでランチ",
      priorPersistedEvents: [mkEventWithCoords()],
      today: TODAY,
      userHomeLat: HOME_COORDS.lat,
      userHomeLng: HOME_COORDS.lng,
    });

    // ホテル は event where、origin/end として拾われない → resolver 結果採用
    expect(adapted.session.plan!.journeyOrigin?.kind).toBe("known_exact");
    if (adapted.session.plan!.journeyOrigin?.kind === "known_exact") {
      expect(adapted.session.plan!.journeyOrigin.source).toBe("registered_home");
    }
  });
});
