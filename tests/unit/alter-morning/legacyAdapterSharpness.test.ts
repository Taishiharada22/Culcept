/**
 * legacyAdapter sharpness 貫通 tests — W3-PR-8 Strict Confirmation
 *
 * 設計書: docs/alter-morning-strict-confirmation-design.md §6.2
 *
 * カバレッジ:
 *   - eventToPlanItem が eventSchema の compute*Sharpness を呼んで PlanItem に
 *     whenSharpness / whereSharpness / whatSharpness を貫通させる
 *   - 全 slot fixed の場合 item.confirmationState = "confirmed"
 *   - pendingClarify.event_id が指す item だけ confirmationState = "needs_answer" で上書き
 *   - vague where の場合 whereVagueSubKind が classify される
 *   - adapter 出口で normalize 済み（UI 側が ?? fallback 不要）
 */

import { describe, test, expect, beforeEach } from "vitest";

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

function mkInput(utterance: string): LegacyAdapterInput {
  return {
    sessionId: "ms_test_sharpness",
    utterance,
    today: "2026-04-22",
  };
}

/** 全 slot fixed（時刻 + 固有名詞 + 具体活動）の raw */
function mkAllFixedRaw(): L1PipelineInput["raw"] {
  return {
    targetDate: "2026-04-22",
    startPoint: null,
    departureTime: null,
    goOut: true,
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
    ],
  };
}

/** 場所が chain_brand で vague な raw（スタバ支店未指定） */
function mkVaguePlaceRaw(): L1PipelineInput["raw"] {
  return {
    targetDate: "2026-04-22",
    startPoint: null,
    departureTime: null,
    goOut: true,
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
          place_ref: "スタバ",
          placeType: "chain_brand",
          provenance: utteranceProvenance(["スタバ"], "high"),
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
    ],
  };
}

/** 時刻欠落で clarify が立つ raw */
function mkMissingTimeRaw(): L1PipelineInput["raw"] {
  return {
    targetDate: "2026-04-22",
    startPoint: null,
    departureTime: null,
    goOut: true,
    events: [
      {
        turn_mode: "create",
        change_scope: null,
        target_ref: null,
        target_ref_confidence: null,
        certainty: "asserted",
        when: {
          startTime: null,
          timeHint: null,
          provenance: utteranceProvenance([], "low"),
        },
        where: {
          place_ref: "サドヤ",
          placeType: "exact_proper_noun",
          provenance: utteranceProvenance(["サドヤ"], "high"),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "コーヒー",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
        who: [],
        transport: null,
        missing_semantic_critical: ["when"],
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

describe("eventToPlanItem — sharpness 貫通", () => {
  test("全 slot fixed → item.confirmationState='confirmed' + 各 sharpness='fixed'", async () => {
    const utter = "9時にサドヤでコーヒー";
    const result = await runWithRaw(mkAllFixedRaw(), utter);
    const { response } = adaptPipelineToLegacy(result, mkInput(utter));

    expect(response.phase).toBe("plan_presented");
    const item = response.plan!.items[0];
    expect(item.whenSharpness).toBe("fixed");
    expect(item.whereSharpness).toBe("fixed");
    expect(item.whatSharpness).toBe("fixed");
    expect(item.confirmationState).toBe("confirmed");
  });

  test("場所 chain_brand (vague) → whereSharpness='vague' + whereVagueSubKind='category_chain' + confirmationState='provisional'", async () => {
    const utter = "9時にスタバでコーヒー";
    const result = await runWithRaw(mkVaguePlaceRaw(), utter);
    const { response } = adaptPipelineToLegacy(result, mkInput(utter));

    // chain_brand 単体は gate で clarify させない想定。plan_presented 相当で item が確認できる
    const item = response.plan!.items[0];
    expect(item.whenSharpness).toBe("fixed");
    expect(item.whereSharpness).toBe("vague");
    expect(item.whereVagueSubKind).toBe("category_chain");
    expect(item.whatSharpness).toBe("fixed");
    // vague が残っていれば confirmationState は confirmed にならない
    expect(item.confirmationState).not.toBe("confirmed");
  });
});

describe("eventToPlanItem — pendingClarify で needs_answer 上書き", () => {
  test("missing_semantic_critical=['when'] → clarify が立ち、対象 item が needs_answer になる", async () => {
    const utter = "サドヤでコーヒー";
    const result = await runWithRaw(mkMissingTimeRaw(), utter);
    const { response, session } = adaptPipelineToLegacy(result, mkInput(utter));

    expect(response.phase).toBe("clarifying");
    // pendingClarify が立ち、対象 event_id が session に記録される
    expect(session.pendingClarify).not.toBeNull();
    expect(session.pendingClarify!.event_id).toBeTruthy();

    // plan.items は保持され、対象 item が needs_answer に上書きされる
    const plan = response.plan;
    expect(plan).toBeDefined();
    const target = plan!.items.find(
      (i) => i.id === session.pendingClarify!.event_id,
    );
    expect(target).toBeDefined();
    expect(target!.confirmationState).toBe("needs_answer");
    // 他の slot の sharpness は貫通している
    expect(target!.whenSharpness).toBe("missing");
    expect(target!.whereSharpness).toBe("fixed");
    expect(target!.whatSharpness).toBe("fixed");
  });
});

describe("adaptPipelineToLegacy — normalize 出口保証", () => {
  test("全 item に confirmationState / sharpness フィールドが必ず存在する", async () => {
    const utter = "9時にサドヤでコーヒー";
    const result = await runWithRaw(mkAllFixedRaw(), utter);
    const { response } = adaptPipelineToLegacy(result, mkInput(utter));
    for (const item of response.plan!.items) {
      // normalize 通過後は必ず required
      expect(item.confirmationState).toBeDefined();
      expect(item.whenSharpness).toBeDefined();
      expect(item.whereSharpness).toBeDefined();
      expect(item.whatSharpness).toBeDefined();
    }
  });

  test("non-vague item では whereVagueSubKind が undefined", async () => {
    const utter = "9時にサドヤでコーヒー";
    const result = await runWithRaw(mkAllFixedRaw(), utter);
    const { response } = adaptPipelineToLegacy(result, mkInput(utter));
    const item = response.plan!.items[0];
    expect(item.whereSharpness).toBe("fixed");
    expect(item.whereVagueSubKind).toBeUndefined();
  });
});
