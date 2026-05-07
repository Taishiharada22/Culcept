/**
 * OP-5.4.2.2 observationAggregator.test.ts — buildShadowObservationInput の test
 *
 * 検証カテゴリ:
 *   1. emittedCounts.targetDate / journeyOrigin / journeyEnd / travelEdges = 配列長
 *   2. emittedCounts.bySource = OperationSource 8 値ごとに正しく count
 *   3. selectedSources = dispatchResult から transit
 *   4. comparison = comparator output から transit (= MismatchCategory enum 含む)
 *   5. level / durationBucket = redacted から transit
 *   6. pure (= input mutate なし、 deterministic、 副作用なし)
 *   7. 【invariant】 出力 ShadowObservationInput に danger key (= raw / payload /
 *      coords / utterance / label 等) が **再帰的に存在しない**
 *   8. 【invariant】 utterance に sentinel を入れた orchestrator output から build
 *      しても、 output に sentinel が **値として一切含まれない** (= JSON.stringify grep)
 *   9. 【invariant】 OperationSource 既存 8 値そのまま (= 集約分類なし)
 */

import { describe, it, expect } from "vitest";
import {
  buildShadowObservationInput,
} from "@/lib/alter-morning/op5/observationAggregator";
import { runShadowOrchestrator } from "@/lib/alter-morning/op5/shadowOrchestrator";
import type { ShadowOrchestratorResult } from "@/lib/alter-morning/op5/shadowOrchestrator";
import { compareShadowVsLegacy } from "@/lib/alter-morning/op5/shadowComparator";
import type {
  LegacyShadowSnapshot,
  ShadowComparison,
} from "@/lib/alter-morning/op5/shadowComparator";
import { redactShadowResult } from "@/lib/alter-morning/op5/redaction";
import type {
  RedactedSummaryObservation,
  RedactedVerboseObservation,
} from "@/lib/alter-morning/op5/redaction";
import { wrapOperation } from "@/lib/alter-morning/comprehension/operationEnvelope";
import type {
  OperationEnvelope,
  OperationSource,
} from "@/lib/alter-morning/comprehension/operationEnvelope";
import type {
  SetTargetDateOperationCandidate,
  SetJourneyOriginOperationCandidate,
  SetJourneyEndOperationCandidate,
  AddTravelEdgeOperationCandidate,
} from "@/lib/alter-morning/comprehension/planOperationCandidate";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EMPTY_LEGACY: LegacyShadowSnapshot = {
  targetDate: null,
  journeyOriginKind: null,
  journeyOriginSource: null,
  journeyOriginLabel: null,
  journeyEndKind: null,
  journeyEndSource: null,
  journeyEndLabel: null,
  segmentsCount: 0,
};

const ALL_SOURCES: ReadonlyArray<OperationSource> = [
  "llm_explicit",
  "llm_inferred",
  "regex_deterministic",
  "code_history",
  "code_location",
  "ui_action",
  "caller_request",
  "system_default",
];

function makeTargetDateEnvelope(
  source: OperationSource,
  date = "2026-05-07",
): OperationEnvelope<SetTargetDateOperationCandidate> {
  return wrapOperation<SetTargetDateOperationCandidate>(
    { type: "set_target_date", payload: { date } },
    {
      source,
      priority: 700,
      confidence: "high",
      provenance: {
        source_type: "utterance",
        source_span: ["__SOURCE_SPAN_FIXTURE__"],
        provenance_confidence: "high",
        from_utterance: true,
      },
    },
  );
}

function makeOriginEnvelope(
  source: OperationSource,
  label = "__ORIGIN_LABEL_FIXTURE__",
): OperationEnvelope<SetJourneyOriginOperationCandidate> {
  return wrapOperation<SetJourneyOriginOperationCandidate>(
    {
      type: "set_journey_origin",
      payload: {
        kind: "known_label_only",
        source: "user_override",
        label,
      },
    },
    {
      source,
      priority: 800,
      confidence: "high",
      provenance: {
        source_type: "utterance",
        source_span: ["__SOURCE_SPAN_FIXTURE__"],
        provenance_confidence: "high",
        from_utterance: true,
      },
    },
  );
}

function makeEndEnvelope(
  source: OperationSource,
  label = "__END_LABEL_FIXTURE__",
): OperationEnvelope<SetJourneyEndOperationCandidate> {
  return wrapOperation<SetJourneyEndOperationCandidate>(
    {
      type: "set_journey_end",
      payload: {
        kind: "known_label_only",
        source: "user_override",
        label,
      },
    },
    {
      source,
      priority: 800,
      confidence: "high",
      provenance: {
        source_type: "utterance",
        source_span: ["__SOURCE_SPAN_FIXTURE__"],
        provenance_confidence: "high",
        from_utterance: true,
      },
    },
  );
}

function makeTravelEdgeEnvelope(
  source: OperationSource,
): OperationEnvelope<AddTravelEdgeOperationCandidate> {
  return wrapOperation<AddTravelEdgeOperationCandidate>(
    {
      type: "add_travel_edge",
      payload: {
        segmentOrigin: {
          label: "__SEG_ORIGIN__",
          classification: "ambiguous_or_demonstrative",
        },
        segmentDestination: {
          label: "__SEG_DEST__",
          classification: "ambiguous_or_demonstrative",
        },
        segmentDepartureTime: "09:00",
        matchedSpan: "__MATCHED_SPAN_FIXTURE__",
      },
    },
    {
      source,
      priority: 600,
      confidence: "medium",
      provenance: {
        source_type: "utterance",
        source_span: ["__SOURCE_SPAN_FIXTURE__"],
        provenance_confidence: "high",
        from_utterance: true,
      },
    },
  );
}

/**
 * 全 4 type / 全 8 source の envelope を 1 件ずつ含む orchestrator result を構築。
 * dispatchResult は 4 件 selected (= 各 type の 1 件目) で固定。
 */
function makeFullSpectrumResult(): ShadowOrchestratorResult {
  const targetDateEnvelopes = ALL_SOURCES.map((s) => makeTargetDateEnvelope(s));
  const originEnvelopes = ALL_SOURCES.map((s) => makeOriginEnvelope(s));
  const endEnvelopes = ALL_SOURCES.map((s) => makeEndEnvelope(s));
  const travelEdgeEnvelopes = ALL_SOURCES.map((s) => makeTravelEdgeEnvelope(s));

  return {
    emittedCandidates: {
      targetDate: targetDateEnvelopes,
      journeyOrigin: originEnvelopes,
      journeyEnd: endEnvelopes,
      travelEdges: travelEdgeEnvelopes,
    },
    dispatchResult: {
      selectedTargetDateCandidate: targetDateEnvelopes[0],
      selectedJourneyOriginCandidate: originEnvelopes[0],
      selectedJourneyEndCandidate: endEnvelopes[0],
      selectedTravelEdgeCandidates: travelEdgeEnvelopes,
      systemDefaultGenerated: null,
      rejected: [],
    },
    meta: { factoriesInvoked: ["test"], durationMs: 5 },
  };
}

function makeEmptyResult(): ShadowOrchestratorResult {
  return {
    emittedCandidates: {
      targetDate: [],
      journeyOrigin: [],
      journeyEnd: [],
      travelEdges: [],
    },
    dispatchResult: {
      selectedTargetDateCandidate: null,
      selectedJourneyOriginCandidate: null,
      selectedJourneyEndCandidate: null,
      selectedTravelEdgeCandidates: [],
      systemDefaultGenerated: null,
      rejected: [],
    },
    meta: { factoriesInvoked: [], durationMs: 1 },
  };
}

function makeSummaryRedacted(
  result: ShadowOrchestratorResult,
): RedactedSummaryObservation {
  const r = redactShadowResult(result, { level: "summary" });
  if (r === null || r.level !== "summary") {
    throw new Error("redaction failed in fixture");
  }
  return r;
}

function makeVerboseRedacted(
  result: ShadowOrchestratorResult,
): RedactedVerboseObservation {
  const r = redactShadowResult(result, { level: "verbose" });
  if (r === null || r.level !== "verbose") {
    throw new Error("redaction failed in fixture");
  }
  return r;
}

const DANGER_KEYS = [
  "utterance",
  "rawUtterance",
  "label",
  "rawLabel",
  "userId",
  "user_id",
  "lat",
  "lng",
  "coords",
  "coordinate",
  "payload",
  "matchedSpan",
  "source_span",
  "sourceSpan",
  "provenance",
  "trace",
  "emittedCandidates",
  "dispatchResult",
  "morningPlan",
  "planState",
];

function findDangerKeys(
  obj: unknown,
  path: ReadonlyArray<string> = [],
): string[] {
  const found: string[] = [];
  if (obj === null || obj === undefined) return found;
  if (typeof obj !== "object") return found;

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      found.push(...findDangerKeys(item, [...path, `[${i}]`]));
    });
    return found;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (DANGER_KEYS.includes(key)) {
      found.push([...path, key].join("."));
    }
    found.push(...findDangerKeys(value, [...path, key]));
  }

  return found;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. emittedCounts (per type)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildShadowObservationInput — emittedCounts (per type)", () => {
  it("各 type の emittedCounts は配列長と一致する", () => {
    const result = makeFullSpectrumResult();
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeSummaryRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);

    expect(input.emittedCounts.targetDate).toBe(8);
    expect(input.emittedCounts.journeyOrigin).toBe(8);
    expect(input.emittedCounts.journeyEnd).toBe(8);
    expect(input.emittedCounts.travelEdges).toBe(8);
  });

  it("空 result では全 type 0", () => {
    const result = makeEmptyResult();
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeSummaryRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);

    expect(input.emittedCounts.targetDate).toBe(0);
    expect(input.emittedCounts.journeyOrigin).toBe(0);
    expect(input.emittedCounts.journeyEnd).toBe(0);
    expect(input.emittedCounts.travelEdges).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. emittedCounts.bySource (per OperationSource enum)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildShadowObservationInput — emittedCounts.bySource", () => {
  it("OperationSource 8 値ごとに正しく count される (= 全 type 通算で 4 件 / 1 source)", () => {
    const result = makeFullSpectrumResult();
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeSummaryRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);

    // 全 4 type × 1 件 / source = 4 件 / source
    expect(input.emittedCounts.bySource.llmExplicit).toBe(4);
    expect(input.emittedCounts.bySource.llmInferred).toBe(4);
    expect(input.emittedCounts.bySource.regexDeterministic).toBe(4);
    expect(input.emittedCounts.bySource.codeHistory).toBe(4);
    expect(input.emittedCounts.bySource.codeLocation).toBe(4);
    expect(input.emittedCounts.bySource.uiAction).toBe(4);
    expect(input.emittedCounts.bySource.callerRequest).toBe(4);
    expect(input.emittedCounts.bySource.systemDefault).toBe(4);
  });

  it("空 result では bySource 全 0", () => {
    const result = makeEmptyResult();
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeSummaryRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);

    expect(input.emittedCounts.bySource.llmExplicit).toBe(0);
    expect(input.emittedCounts.bySource.llmInferred).toBe(0);
    expect(input.emittedCounts.bySource.regexDeterministic).toBe(0);
    expect(input.emittedCounts.bySource.codeHistory).toBe(0);
    expect(input.emittedCounts.bySource.codeLocation).toBe(0);
    expect(input.emittedCounts.bySource.uiAction).toBe(0);
    expect(input.emittedCounts.bySource.callerRequest).toBe(0);
    expect(input.emittedCounts.bySource.systemDefault).toBe(0);
  });

  it("同一 source の多重出現で正しく加算される", () => {
    const result = makeEmptyResult();
    result.emittedCandidates = {
      targetDate: [
        makeTargetDateEnvelope("regex_deterministic"),
        makeTargetDateEnvelope("regex_deterministic"),
        makeTargetDateEnvelope("regex_deterministic"),
      ],
      journeyOrigin: [],
      journeyEnd: [],
      travelEdges: [],
    };
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeSummaryRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);

    expect(input.emittedCounts.bySource.regexDeterministic).toBe(3);
    expect(input.emittedCounts.bySource.llmExplicit).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. selectedSources transit
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildShadowObservationInput — selectedSources transit", () => {
  it("dispatchResult から source enum literal がそのまま渡る", () => {
    const result = makeFullSpectrumResult();
    // selected を強制的に異なる source に
    result.dispatchResult.selectedTargetDateCandidate =
      makeTargetDateEnvelope("llm_inferred");
    result.dispatchResult.selectedJourneyOriginCandidate =
      makeOriginEnvelope("ui_action");
    result.dispatchResult.selectedJourneyEndCandidate =
      makeEndEnvelope("code_history");

    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeSummaryRedacted(result);
    const input = buildShadowObservationInput(result, comparison, redacted);

    expect(input.selectedSources.targetDate).toBe("llm_inferred");
    expect(input.selectedSources.journeyOrigin).toBe("ui_action");
    expect(input.selectedSources.journeyEnd).toBe("code_history");
  });

  it("selected が null なら null", () => {
    const result = makeEmptyResult();
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeSummaryRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);

    expect(input.selectedSources.targetDate).toBeNull();
    expect(input.selectedSources.journeyOrigin).toBeNull();
    expect(input.selectedSources.journeyEnd).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. comparison transit
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildShadowObservationInput — comparison transit", () => {
  it("comparator output の boolean / MismatchCategory enum がそのまま渡る", () => {
    const result = makeEmptyResult();
    const comparison: ShadowComparison = {
      targetDate: { match: false },
      journeyOrigin: {
        match: false,
        legacyKind: "known_exact",
        op5Kind: "unknown",
        legacySource: "user_override",
        op5Source: null,
        mismatchCategory: "missing_in_op5",
      },
      journeyEnd: {
        match: false,
        legacyKind: "known_label_only",
        op5Kind: "known_label_only",
        legacySource: "user_override",
        op5Source: "user_override",
        mismatchCategory: "different_label",
      },
      travelEdges: {
        legacyCount: 3,
        op5Count: 1,
        countMatch: false,
      },
    };
    const redacted = makeSummaryRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);

    expect(input.comparison.targetDateMatch).toBe(false);
    expect(input.comparison.journeyOriginMatch).toBe(false);
    expect(input.comparison.journeyOriginMismatchCategory).toBe(
      "missing_in_op5",
    );
    expect(input.comparison.journeyEndMatch).toBe(false);
    expect(input.comparison.journeyEndMismatchCategory).toBe(
      "different_label",
    );
    expect(input.comparison.travelEdgesCountMatch).toBe(false);
  });

  it("全 match 時に true / 'match' が渡る", () => {
    const result = makeEmptyResult();
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeSummaryRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);

    expect(input.comparison.targetDateMatch).toBe(true);
    expect(input.comparison.journeyOriginMatch).toBe(true);
    expect(input.comparison.journeyOriginMismatchCategory).toBe("match");
    expect(input.comparison.journeyEndMatch).toBe(true);
    expect(input.comparison.journeyEndMismatchCategory).toBe("match");
    expect(input.comparison.travelEdgesCountMatch).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. level / durationBucket transit
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildShadowObservationInput — level / durationBucket transit", () => {
  it("redacted.level 'summary' が input.level にそのまま渡る", () => {
    const result = makeEmptyResult();
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeSummaryRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);

    expect(input.level).toBe("summary");
  });

  it("redacted.level 'verbose' が input.level にそのまま渡る", () => {
    const result = makeEmptyResult();
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeVerboseRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);

    expect(input.level).toBe("verbose");
  });

  it("redacted.durationBucket がそのまま渡る (bucket enum literal)", () => {
    const result = makeEmptyResult();
    result.meta = { factoriesInvoked: [], durationMs: 75 };
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeSummaryRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);

    // 75ms → "50-100ms" bucket
    expect(input.durationBucket).toBe("50-100ms");
    expect(input.durationBucket).toBe(redacted.durationBucket);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. pure (= input mutate なし、 deterministic、 副作用なし)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildShadowObservationInput — pure", () => {
  it("input result / comparison / redacted を mutate しない", () => {
    const result = makeFullSpectrumResult();
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeSummaryRedacted(result);

    const resultSnapshot = JSON.stringify(result);
    const comparisonSnapshot = JSON.stringify(comparison);
    const redactedSnapshot = JSON.stringify(redacted);

    buildShadowObservationInput(result, comparison, redacted);

    expect(JSON.stringify(result)).toBe(resultSnapshot);
    expect(JSON.stringify(comparison)).toBe(comparisonSnapshot);
    expect(JSON.stringify(redacted)).toBe(redactedSnapshot);
  });

  it("同一 input で同一 output (= deterministic)", () => {
    const result = makeFullSpectrumResult();
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeSummaryRedacted(result);

    const input1 = buildShadowObservationInput(result, comparison, redacted);
    const input2 = buildShadowObservationInput(result, comparison, redacted);

    expect(JSON.stringify(input1)).toBe(JSON.stringify(input2));
  });

  it("【invariant】 console.* / fetch を呼ばない", async () => {
    const { vi } = await import("vitest");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({}), {
            status: 200,
          }),
      );

    const result = makeFullSpectrumResult();
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeVerboseRedacted(result);
    buildShadowObservationInput(result, comparison, redacted);

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    fetchSpy.mockRestore();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. 【CEO invariant】 raw key absence (= type + recursive value 検査)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildShadowObservationInput — 【CEO invariant】 raw key absence", () => {
  it("【invariant】 出力 ShadowObservationInput に danger key が **再帰的に** 存在しない (= raw 含む orchestrator output から build しても)", () => {
    const result = makeFullSpectrumResult();
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeVerboseRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);

    const found = findDangerKeys(input);
    expect(found).toEqual([]);
  });

  it("【invariant】 出力 top-level keys は固定 5 (= level / emittedCounts / selectedSources / comparison / durationBucket)", () => {
    const result = makeFullSpectrumResult();
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeSummaryRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);

    expect(Object.keys(input).sort()).toEqual([
      "comparison",
      "durationBucket",
      "emittedCounts",
      "level",
      "selectedSources",
    ]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. 【CEO invariant】 sentinel value absence (= JSON.stringify grep)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildShadowObservationInput — 【CEO invariant】 sentinel value absence", () => {
  it("【invariant】 utterance 由来 sentinel (= matchedSpan / source_span / label / segmentOrigin) が output に **値として含まれない**", () => {
    const result = makeFullSpectrumResult();
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeVerboseRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);
    const json = JSON.stringify(input);

    expect(json).not.toContain("__SOURCE_SPAN_FIXTURE__");
    expect(json).not.toContain("__ORIGIN_LABEL_FIXTURE__");
    expect(json).not.toContain("__END_LABEL_FIXTURE__");
    expect(json).not.toContain("__SEG_ORIGIN__");
    expect(json).not.toContain("__SEG_DEST__");
    expect(json).not.toContain("__MATCHED_SPAN_FIXTURE__");
  });

  it("【invariant】 raw orchestrator 起動 (= 「自宅から東京駅へ」) から build しても raw が漏れない", () => {
    const result = runShadowOrchestrator({
      utterance: "自宅から東京駅へ",
      actualToday: "2026-05-07",
    });
    const legacy: LegacyShadowSnapshot = {
      ...EMPTY_LEGACY,
      journeyOriginLabel: "自宅",
      journeyEndLabel: "東京駅",
    };
    const comparison = compareShadowVsLegacy(legacy, result);
    const redacted = makeVerboseRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);
    const json = JSON.stringify(input);

    // raw 文字列が値として一切含まれないことを確認
    expect(json).not.toContain("自宅");
    expect(json).not.toContain("東京駅");
    expect(json).not.toContain("自宅から東京駅へ");

    // danger key も無いことを確認
    expect(findDangerKeys(input)).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. 【CEO invariant】 OperationSource 既存 8 値そのまま (= 集約分類なし)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildShadowObservationInput — 【CEO invariant】 OperationSource 8 値 1 to 1", () => {
  it("【invariant】 bySource の keys は固定 8 値 (= 「llm」「regex」「deterministic」 等の集約分類なし)", () => {
    const result = makeFullSpectrumResult();
    const comparison = compareShadowVsLegacy(EMPTY_LEGACY, result);
    const redacted = makeSummaryRedacted(result);

    const input = buildShadowObservationInput(result, comparison, redacted);

    expect(Object.keys(input.emittedCounts.bySource).sort()).toEqual([
      "callerRequest",
      "codeHistory",
      "codeLocation",
      "llmExplicit",
      "llmInferred",
      "regexDeterministic",
      "systemDefault",
      "uiAction",
    ]);

    // 「llm」「regex」「deterministic」 等の集約分類が **存在しない**
    expect(input.emittedCounts.bySource).not.toHaveProperty("llm");
    expect(input.emittedCounts.bySource).not.toHaveProperty("regex");
    expect(input.emittedCounts.bySource).not.toHaveProperty("deterministic");
  });
});
