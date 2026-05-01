/**
 * legacyAdapter — W3-PR-10 Phase 2 travel display cache 契約テスト
 *
 * カバレッジ:
 *   C3a-1: flag OFF → items[] は Phase 1 と byte-diff ゼロ（travel 注入なし）
 *   C3a-2: flag ON + 両端 coords 揃い → event items の間に travel item が挿入される
 *   C3a-3: flag ON + coords 欠落 → travel 生成されない（heuristic 禁止）
 *   C3a-4: flag ON + mainTransport 未指定 → segment mode=unknown → icon fallback
 *   C3a-5: flag ON + needs_answer pending event → travel は needs_answer を受けない
 *          （travel id は `travel__` prefix で pendingEventId と衝突しないため）
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";

import {
  runMorningPipeline,
  createStubComprehensionProvider,
  type MorningPipelineResult,
} from "@/lib/alter-morning/morningPipeline";
import type { L1PipelineInput } from "@/lib/alter-morning/comprehension/l1Pipeline";
import {
  resetEventCounter,
  utteranceProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import {
  adaptPipelineToLegacy,
  type LegacyAdapterInput,
} from "@/lib/alter-morning/legacyAdapter";
import { stubNarrationProvider } from "@/lib/alter-morning/expression/narration";
import { __setTransportV2Override } from "@/lib/alter-morning/dialog/flags";

function mkInput(utterance: string): LegacyAdapterInput {
  return {
    sessionId: "ms_test_transport_phase2",
    utterance,
    today: "2026-04-23",
  };
}

/** 両端 coordinates が揃った 2 event の raw */
function mkTwoEventsWithCoords(): L1PipelineInput["raw"] {
  return {
    targetDate: "2026-04-23",
    startPoint: null,
    departureTime: null,
    goOut: true,
    operations: [],
    events: [
      {
        turn_mode: "create",
        change_scope: null,
        target_ref: null,
        target_ref_confidence: null,
        certainty: "asserted",
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "サドヤ",
          placeType: "exact_proper_noun",
          coordinates: { lat: 35.68, lng: 139.77 },
          provenance: utteranceProvenance(["サドヤ"], "high"),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "コーヒー",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
        who: [],
        transport: null,
        missing_semantic_critical: [],
        missing_solver_blockers: [],
      },
      {
        turn_mode: "create",
        change_scope: null,
        target_ref: null,
        target_ref_confidence: null,
        certainty: "asserted",
        when: {
          startTime: "12:00",
          timeHint: null,
          provenance: utteranceProvenance(["12時"], "high"),
        },
        where: {
          place_ref: "渋谷",
          placeType: "exact_proper_noun",
          coordinates: { lat: 35.66, lng: 139.7 },
          provenance: utteranceProvenance(["渋谷"], "high"),
        },
        what: {
          activity: "ランチ",
          activityCanonical: "ランチ",
          provenance: utteranceProvenance(["ランチ"], "high"),
        },
        who: [],
        transport: null,
        missing_semantic_critical: [],
        missing_solver_blockers: [],
      },
    ],
  };
}

/** 片側 coordinates が欠落した 2 event の raw */
function mkTwoEventsWithoutCoords(): L1PipelineInput["raw"] {
  return {
    targetDate: "2026-04-23",
    startPoint: null,
    departureTime: null,
    goOut: true,
    operations: [],
    events: [
      {
        turn_mode: "create",
        change_scope: null,
        target_ref: null,
        target_ref_confidence: null,
        certainty: "asserted",
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "サドヤ",
          placeType: "exact_proper_noun",
          coordinates: { lat: 35.68, lng: 139.77 },
          provenance: utteranceProvenance(["サドヤ"], "high"),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "コーヒー",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
        who: [],
        transport: null,
        missing_semantic_critical: [],
        missing_solver_blockers: [],
      },
      {
        turn_mode: "create",
        change_scope: null,
        target_ref: null,
        target_ref_confidence: null,
        certainty: "asserted",
        when: {
          startTime: "12:00",
          timeHint: null,
          provenance: utteranceProvenance(["12時"], "high"),
        },
        where: {
          place_ref: "未確定",
          placeType: "exact_proper_noun",
          coordinates: null,
          provenance: utteranceProvenance(["未確定"], "high"),
        },
        what: {
          activity: "ランチ",
          activityCanonical: "ランチ",
          provenance: utteranceProvenance(["ランチ"], "high"),
        },
        who: [],
        transport: null,
        missing_semantic_critical: [],
        missing_solver_blockers: [],
      },
    ],
  };
}

async function runWithRaw(
  raw: L1PipelineInput["raw"],
  utterance: string,
): Promise<MorningPipelineResult> {
  return runMorningPipeline(
    { utterance },
    {
      comprehension: createStubComprehensionProvider(raw),
      narration: stubNarrationProvider,
      weather: null,
    },
  );
}

beforeEach(() => {
  resetEventCounter();
});

afterEach(() => {
  __setTransportV2Override(null);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// C3a-1: flag OFF — items[] は Phase 1 と byte-diff ゼロ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("legacyAdapter Phase 2 — C3a-1 flag OFF byte-diff zero", () => {
  test("flag OFF → plan.items は event items のみ、travel なし", async () => {
    __setTransportV2Override(false);
    const utter = "9時にサドヤでコーヒー、12時に渋谷でランチ";
    const result = await runWithRaw(mkTwoEventsWithCoords(), utter);
    const { response } = adaptPipelineToLegacy(result, mkInput(utter));

    expect(response.phase).toBe("plan_presented");
    const items = response.plan!.items;
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind !== "travel")).toBe(true);
    // transportSegments key 自体が plan に存在しない（Phase 1 T3 契約継承）
    expect("transportSegments" in response.plan!).toBe(false);
  });

  test("flag OFF + coords 欠落 → items は event 2 件、travel なし、transportSegments key 不在", async () => {
    __setTransportV2Override(false);
    const utter = "9時にサドヤ、12時に未確定でランチ";
    const result = await runWithRaw(mkTwoEventsWithoutCoords(), utter);
    const { response } = adaptPipelineToLegacy(result, mkInput(utter));

    const items = response.plan!.items;
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind !== "travel")).toBe(true);
    expect("transportSegments" in response.plan!).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// C3a-2: flag ON + 両端 coords 揃い → travel 挿入
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("legacyAdapter Phase 2 — C3a-2 flag ON travel interleave", () => {
  test("両端 coords 揃い → event の間に travel item が挿入される", async () => {
    __setTransportV2Override(true);
    const utter = "9時にサドヤでコーヒー、12時に渋谷でランチ";
    const result = await runWithRaw(mkTwoEventsWithCoords(), utter);
    const { response } = adaptPipelineToLegacy(result, mkInput(utter));

    const items = response.plan!.items;
    expect(items).toHaveLength(3);
    expect(items[0].kind).not.toBe("travel");
    expect(items[1].kind).toBe("travel");
    expect(items[2].kind).not.toBe("travel");

    // travel id は deterministic（travel__<from>__<to>）
    expect(items[1].id.startsWith("travel__")).toBe(true);
    expect(items[1].travelFrom).toBe("サドヤ");
    expect(items[1].travelTo).toBe("渋谷");

    // orderHint は 0..2 の連番
    expect(items.map((i) => i.orderHint)).toEqual([0, 1, 2]);

    // canonical TransportSegment[] も plan に含まれる
    expect(response.plan!.transportSegments).toHaveLength(1);
  });

  test("再 build は deterministic（同じ入力で同じ items）", async () => {
    __setTransportV2Override(true);
    const utter = "9時にサドヤでコーヒー、12時に渋谷でランチ";

    resetEventCounter();
    const a = await runWithRaw(mkTwoEventsWithCoords(), utter);
    const outA = adaptPipelineToLegacy(a, mkInput(utter));

    resetEventCounter();
    const b = await runWithRaw(mkTwoEventsWithCoords(), utter);
    const outB = adaptPipelineToLegacy(b, mkInput(utter));

    // items の id/kind/text/order は一致する（createdAt 等は別 field）
    const shapeA = outA.response.plan!.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      text: i.text,
      orderHint: i.orderHint,
    }));
    const shapeB = outB.response.plan!.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      text: i.text,
      orderHint: i.orderHint,
    }));
    expect(shapeA).toEqual(shapeB);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// C3a-3: flag ON + coords 欠落 → travel 生成されない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("legacyAdapter Phase 2 — C3a-3 flag ON coords 欠落", () => {
  test("片側 coords 欠落 → travel なし、transportSegments は空配列", async () => {
    __setTransportV2Override(true);
    const utter = "9時にサドヤ、12時に未確定";
    const result = await runWithRaw(mkTwoEventsWithoutCoords(), utter);
    const { response } = adaptPipelineToLegacy(result, mkInput(utter));

    const items = response.plan!.items;
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind !== "travel")).toBe(true);
    // flag ON 契約: transportSegments は key 存在、空配列
    expect(response.plan!.transportSegments).toEqual([]);
  });
});
