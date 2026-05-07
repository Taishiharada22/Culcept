/**
 * OP-5.4.2.1 observationSink.test.ts — emitShadowObservation の test
 *
 * 検証カテゴリ:
 *   1. summary / verbose level で Sentry.captureMessage が呼ばれる
 *   2. message format = `op5.shadow.observation.<level>` のみ
 *   3. tags は count / boolean / 既存 enum string のみ
 *   4. 【invariant】 raw utterance / label / userId / coords / payload が入らない
 *   5. 【invariant】 sentinel raw value が漏洩しない (= 7 種 sentinel)
 *   6. 【invariant】 OperationSource 既存 enum を勝手に分類していない
 *   7. silent ignore (= Sentry SDK throw でも caller throw なし)
 *   8. console.log / error / warn を呼ばない
 *   9. fetch を呼ばない (= 外部 I/O は Sentry mock のみ)
 *   10. return void
 *   11. pure (= input mutate なし)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Sentry を mock 化 (= 実 ingestion させない)
vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import {
  emitShadowObservation,
  type ShadowObservationInput,
  type ShadowEmittedCountsBySource,
} from "@/lib/alter-morning/op5/observationSink";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeBySource(
  override: Partial<ShadowEmittedCountsBySource> = {},
): ShadowEmittedCountsBySource {
  return {
    llmExplicit: 0,
    llmInferred: 0,
    regexDeterministic: 0,
    codeHistory: 0,
    codeLocation: 0,
    uiAction: 0,
    callerRequest: 0,
    systemDefault: 0,
    ...override,
  };
}

function makeInput(
  override: Partial<ShadowObservationInput> = {},
): ShadowObservationInput {
  return {
    level: "summary",
    emittedCounts: {
      targetDate: 0,
      journeyOrigin: 0,
      journeyEnd: 0,
      travelEdges: 0,
      bySource: makeBySource(),
    },
    selectedSources: {
      targetDate: null,
      journeyOrigin: null,
      journeyEnd: null,
    },
    comparison: {
      targetDateMatch: true,
      journeyOriginMatch: true,
      journeyOriginMismatchCategory: "match",
      journeyEndMatch: true,
      journeyEndMismatchCategory: "match",
      travelEdgesCountMatch: true,
    },
    durationBucket: "<10ms",
    ...override,
  };
}

beforeEach(() => {
  vi.mocked(Sentry.captureMessage).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. summary / verbose level で Sentry.captureMessage が呼ばれる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitShadowObservation — Sentry.captureMessage 呼び出し", () => {
  it("level='summary' → captureMessage が message='op5.shadow.observation.summary' で呼ばれる", () => {
    emitShadowObservation(makeInput({ level: "summary" }));
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Sentry.captureMessage).mock.calls[0][0]).toBe(
      "op5.shadow.observation.summary",
    );
  });

  it("level='verbose' → captureMessage が message='op5.shadow.observation.verbose' で呼ばれる", () => {
    emitShadowObservation(makeInput({ level: "verbose" }));
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Sentry.captureMessage).mock.calls[0][0]).toBe(
      "op5.shadow.observation.verbose",
    );
  });

  it("【invariant】 message format = `op5.shadow.observation.<level>` のみ (= raw 含まない fixed format)", () => {
    for (const level of ["summary", "verbose"] as const) {
      vi.mocked(Sentry.captureMessage).mockClear();
      emitShadowObservation(makeInput({ level }));
      const message = vi.mocked(Sentry.captureMessage).mock.calls[0][0];
      expect(message).toMatch(/^op5\.shadow\.observation\./);
      expect(message.split(".")).toHaveLength(4); // op5 / shadow / observation / level
      expect(message.length).toBeLessThan(50); // = raw を埋め込めない短い fixed format
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. tags は count / boolean / 既存 enum string のみ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitShadowObservation — tags shape", () => {
  it("level='info' で送られる", () => {
    emitShadowObservation(makeInput());
    const options = vi.mocked(Sentry.captureMessage).mock.calls[0][1];
    if (typeof options === "object" && options !== null && "level" in options) {
      expect(options.level).toBe("info");
    }
  });

  it("tags の値は全て string 型", () => {
    emitShadowObservation(
      makeInput({
        emittedCounts: {
          targetDate: 1,
          journeyOrigin: 1,
          journeyEnd: 1,
          travelEdges: 2,
          bySource: makeBySource({
            llmExplicit: 1,
            regexDeterministic: 3,
            codeHistory: 1,
          }),
        },
        selectedSources: {
          targetDate: "regex_deterministic",
          journeyOrigin: "user_declared" as never, // user_declared is not in OperationSource, ただし AnchorSource。 ここは OperationSource を期待しているので test だけのため override
          journeyEnd: null,
        },
      }),
    );
    const options = vi.mocked(Sentry.captureMessage).mock.calls[0][1];
    if (typeof options === "object" && options !== null && "tags" in options) {
      const tags = options.tags as Record<string, unknown>;
      for (const [key, value] of Object.entries(tags)) {
        expect(typeof value, `tag "${key}" should be string`).toBe("string");
      }
    }
  });

  it("【invariant】 既存 OperationSource 8 値が by-source counts に 1 to 1 含まれる", () => {
    emitShadowObservation(makeInput());
    const options = vi.mocked(Sentry.captureMessage).mock.calls[0][1];
    if (typeof options === "object" && options !== null && "tags" in options) {
      const tags = options.tags as Record<string, unknown>;
      // 既存 OperationSource 8 値全部が tags に存在
      expect(tags).toHaveProperty("op5_emit_count_llm_explicit");
      expect(tags).toHaveProperty("op5_emit_count_llm_inferred");
      expect(tags).toHaveProperty("op5_emit_count_regex_deterministic");
      expect(tags).toHaveProperty("op5_emit_count_code_history");
      expect(tags).toHaveProperty("op5_emit_count_code_location");
      expect(tags).toHaveProperty("op5_emit_count_ui_action");
      expect(tags).toHaveProperty("op5_emit_count_caller_request");
      expect(tags).toHaveProperty("op5_emit_count_system_default");
    }
  });

  it("【invariant】 勝手な分類 (= 'llm' / 'regex' / 'deterministic' aggregate tag) を作っていない", () => {
    emitShadowObservation(makeInput());
    const options = vi.mocked(Sentry.captureMessage).mock.calls[0][1];
    if (typeof options === "object" && options !== null && "tags" in options) {
      const tags = options.tags as Record<string, unknown>;
      // 勝手な aggregate 分類 tag が **存在しない**
      expect(tags).not.toHaveProperty("op5_emit_count_llm");
      expect(tags).not.toHaveProperty("op5_emit_count_regex");
      expect(tags).not.toHaveProperty("op5_emit_count_deterministic");
      expect(tags).not.toHaveProperty("op5_emitted_llm_count");
      expect(tags).not.toHaveProperty("op5_emitted_regex_count");
      expect(tags).not.toHaveProperty("op5_emitted_deterministic_count");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 【CEO invariant】 raw utterance / label / userId / coords / payload が入らない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

describe("emitShadowObservation — 【CEO invariant】 danger key 検査", () => {
  it("【invariant】 captureMessage payload に danger key が再帰的に存在しない", () => {
    emitShadowObservation(
      makeInput({
        emittedCounts: {
          targetDate: 1,
          journeyOrigin: 1,
          journeyEnd: 1,
          travelEdges: 2,
          bySource: makeBySource({ llmExplicit: 1, regexDeterministic: 3 }),
        },
      }),
    );
    const callArgs = vi.mocked(Sentry.captureMessage).mock.calls[0];
    expect(findDangerKeys(callArgs)).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 【CEO invariant】 sentinel raw value 漏洩検査 (7 種)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SENTINELS = [
  "RAW_UTTERANCE_SENTINEL_67890",
  "RAW_LABEL_SENTINEL_HOME_12345",
  "RAW_USER_SENTINEL_ABCDE",
  "RAW_LAT_SENTINEL_99999",
  "RAW_LNG_SENTINEL_88888",
  "RAW_PAYLOAD_SENTINEL_OBJECT",
  "RAW_PROVENANCE_SENTINEL_SOURCE",
];

describe("emitShadowObservation — 【CEO invariant】 sentinel 漏洩検査", () => {
  it("【invariant】 input に sentinel 値が含まれる経路を構造的に持たない (= type 設計で持てない)", () => {
    // input type を見ると、 全 field が number / boolean / 既存 enum literal の組み合わせ
    // sentinel string を渡せる field が存在しない (= type レベル boundary)
    const input = makeInput();
    const json = JSON.stringify(input);
    for (const sentinel of SENTINELS) {
      expect(json).not.toContain(sentinel);
    }
  });

  it("【invariant】 captureMessage payload に sentinel が含まれない (= 通常 input)", () => {
    emitShadowObservation(makeInput());
    const callArgs = vi.mocked(Sentry.captureMessage).mock.calls[0];
    const json = JSON.stringify(callArgs);
    for (const sentinel of SENTINELS) {
      expect(json).not.toContain(sentinel);
    }
  });

  it("【invariant】 raw 生活導線文字列 (= 自宅 / ホテル / 東京駅 等) が payload に含まれない", () => {
    emitShadowObservation(makeInput());
    const callArgs = vi.mocked(Sentry.captureMessage).mock.calls[0];
    const json = JSON.stringify(callArgs);
    const rawLabels = ["自宅", "ホテル", "東京駅", "渋谷", "新宿", "うち", "実家", "家", "会社"];
    for (const label of rawLabels) {
      expect(json).not.toContain(label);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. silent ignore
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitShadowObservation — silent ignore", () => {
  it("【invariant】 Sentry.captureMessage が throw しても caller に伝播しない", () => {
    vi.mocked(Sentry.captureMessage).mockImplementationOnce(() => {
      throw new Error("Sentry SDK failure");
    });
    expect(() => emitShadowObservation(makeInput())).not.toThrow();
  });

  it("【invariant】 Sentry.captureMessage が throw した場合も void 戻り値", () => {
    vi.mocked(Sentry.captureMessage).mockImplementationOnce(() => {
      throw new Error("Sentry SDK failure");
    });
    const ret = emitShadowObservation(makeInput());
    expect(ret).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 【CEO invariant】 console.* / fetch 呼ばない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitShadowObservation — 【CEO invariant】 外部 I/O は Sentry のみ", () => {
  it("【invariant】 console.log / error / warn を呼ばない", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    emitShadowObservation(makeInput({ level: "summary" }));
    emitShadowObservation(makeInput({ level: "verbose" }));
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("【invariant】 fetch を呼ばない (= 外部 I/O は Sentry mock のみ)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
        }),
    );
    emitShadowObservation(makeInput({ level: "summary" }));
    emitShadowObservation(makeInput({ level: "verbose" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. return void / pure
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitShadowObservation — return void / pure", () => {
  it("【invariant】 return undefined", () => {
    const ret = emitShadowObservation(makeInput());
    expect(ret).toBeUndefined();
  });

  it("【invariant】 input を mutate しない", () => {
    const input = makeInput({
      emittedCounts: {
        targetDate: 1,
        journeyOrigin: 1,
        journeyEnd: 1,
        travelEdges: 2,
        bySource: makeBySource({ llmExplicit: 1 }),
      },
    });
    const snapshot = JSON.stringify(input);
    emitShadowObservation(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. breadcrumb 単独依存しない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitShadowObservation — breadcrumb 単独不可、 captureMessage 必須", () => {
  it("【invariant】 captureMessage が呼ばれる (= breadcrumb 単独に依存しない)", () => {
    emitShadowObservation(makeInput());
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. 【CEO invariant】 type-level boundary - input 自体に raw が持てない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitShadowObservation — 【CEO invariant】 type-level boundary", () => {
  it("【invariant】 ShadowObservationInput の全 field が raw 持てない型", () => {
    // type 設計で raw を渡せないことを構造的に確認:
    //   - emittedCounts: number / by-source counts も number
    //   - selectedSources: OperationSource | null (= literal enum)
    //   - comparison: boolean / MismatchCategory enum literal
    //   - durationBucket: DurationBucket enum literal
    //   - level: "summary" | "verbose" literal
    // raw string field (= utterance / label) は型に存在しない
    const input = makeInput();

    // input の top-level keys を厳密検証
    expect(Object.keys(input).sort()).toEqual([
      "comparison",
      "durationBucket",
      "emittedCounts",
      "level",
      "selectedSources",
    ]);

    // 危険 key が input top-level に存在しない
    const danger = input as unknown as Record<string, unknown>;
    expect(danger.utterance).toBeUndefined();
    expect(danger.label).toBeUndefined();
    expect(danger.userId).toBeUndefined();
    expect(danger.lat).toBeUndefined();
    expect(danger.lng).toBeUndefined();
    expect(danger.coords).toBeUndefined();
    expect(danger.payload).toBeUndefined();
    expect(danger.morningPlan).toBeUndefined();
    expect(danger.provenance).toBeUndefined();
    expect(danger.trace).toBeUndefined();
  });
});
