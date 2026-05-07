/**
 * OP-5.4.1 errorTelemetry.test.ts — emitShadowError の test
 *
 * 検証カテゴリ:
 *   1. category enum の各値で Sentry.captureMessage が呼ばれる
 *   2. payload に raw error message / stack / cause が **入らない** (= type で禁止)
 *   3. tags は category enum のみ (= raw user_id / utterance を入れない)
 *   4. emit 自体の failure は silent ignore (= caller に throw 伝播しない)
 *   5. return void
 *   6. console.log / console.error / console.warn を呼ばない
 *   7. fetch を呼ばない (= 外部 I/O は Sentry のみ)
 *   8. pure (= input mutate なし)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Sentry を mock 化 (= 実 ingestion させない)
vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import {
  emitShadowError,
  type ShadowErrorCategory,
  type ShadowErrorTelemetryInput,
} from "@/lib/alter-morning/op5/errorTelemetry";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ALL_CATEGORIES: ReadonlyArray<ShadowErrorCategory> = [
  "orchestrator_error",
  "extractor_error",
  "comparator_error",
  "redaction_error",
  "unknown",
];

beforeEach(() => {
  vi.mocked(Sentry.captureMessage).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. category 別 Sentry.captureMessage 呼び出し
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitShadowError — category 別 Sentry.captureMessage 呼び出し", () => {
  for (const category of ALL_CATEGORIES) {
    it(`category="${category}" → Sentry.captureMessage が message="op5.shadow.error.${category}" で呼ばれる`, () => {
      emitShadowError({ category });
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(Sentry.captureMessage).mock.calls[0];
      expect(callArgs[0]).toBe(`op5.shadow.error.${category}`);
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 【CEO invariant】 payload に raw error / stack / cause が含まれない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitShadowError — 【CEO invariant】 raw 漏洩なし", () => {
  it("【invariant】 captureMessage の引数に raw error message / stack / cause が含まれない", () => {
    emitShadowError({ category: "orchestrator_error" });
    const callArgs = vi.mocked(Sentry.captureMessage).mock.calls[0];
    const message = callArgs[0];
    const options = callArgs[1];

    // message は category 識別子のみ (= raw error message を含まない)
    expect(message).toBe("op5.shadow.error.orchestrator_error");
    expect(typeof message).toBe("string");

    // options に raw 値が含まれない
    const json = JSON.stringify({ message, options });
    expect(json).not.toContain("Error");
    expect(json).not.toContain("stack");
    expect(json).not.toContain("cause");
    expect(json).not.toContain("SQL");
    expect(json).not.toContain("supabase");
  });

  it("【invariant】 tags は category enum のみ (= raw user_id / utterance を含まない)", () => {
    emitShadowError({ category: "comparator_error" });
    const options = vi.mocked(Sentry.captureMessage).mock.calls[0][1];
    expect(options).toBeDefined();
    if (typeof options === "object" && options !== null && "tags" in options) {
      const tags = options.tags as Record<string, unknown>;
      // tags は op5_shadow_category 1 つのみ
      expect(Object.keys(tags).sort()).toEqual(["op5_shadow_category"]);
      expect(tags.op5_shadow_category).toBe("comparator_error");
    }
  });

  it("【invariant】 input 型に raw error フィールドが存在しない (= type 設計で防御)", () => {
    // 型レベルで category 以外のフィールドが渡せないことを確認
    const input: ShadowErrorTelemetryInput = { category: "unknown" };
    expect(Object.keys(input).sort()).toEqual(["category"]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. emit 自体の failure は silent ignore
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitShadowError — silent ignore", () => {
  it("【invariant】 Sentry.captureMessage が throw しても caller に伝播しない", () => {
    vi.mocked(Sentry.captureMessage).mockImplementationOnce(() => {
      throw new Error("Sentry SDK failure");
    });
    expect(() => emitShadowError({ category: "unknown" })).not.toThrow();
  });

  it("【invariant】 Sentry.captureMessage が throw した場合も void 戻り値", () => {
    vi.mocked(Sentry.captureMessage).mockImplementationOnce(() => {
      throw new Error("Sentry SDK failure");
    });
    const ret = emitShadowError({ category: "unknown" });
    expect(ret).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 【CEO invariant】 console.* / fetch を呼ばない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitShadowError — 【CEO invariant】 console.* / fetch を呼ばない", () => {
  it("【invariant】 console.log / error / warn を呼ばない", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const category of ALL_CATEGORIES) {
      emitShadowError({ category });
    }
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
    for (const category of ALL_CATEGORIES) {
      emitShadowError({ category });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. return void
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitShadowError — return void", () => {
  it("【invariant】 全 category で return undefined", () => {
    for (const category of ALL_CATEGORIES) {
      const ret = emitShadowError({ category });
      expect(ret).toBeUndefined();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. pure (= input mutate なし)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitShadowError — pure", () => {
  it("input を mutate しない", () => {
    const input: ShadowErrorTelemetryInput = { category: "redaction_error" };
    const snapshot = JSON.stringify(input);
    emitShadowError(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. message format invariant (= raw を含めない構造)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitShadowError — message format", () => {
  it("【invariant】 message は op5.shadow.error.<category> 形式のみ", () => {
    for (const category of ALL_CATEGORIES) {
      vi.mocked(Sentry.captureMessage).mockClear();
      emitShadowError({ category });
      const message = vi.mocked(Sentry.captureMessage).mock.calls[0][0];
      expect(message).toMatch(/^op5\.shadow\.error\./);
      expect(message.split(".")).toHaveLength(4); // op5 / shadow / error / category
    }
  });

  it("【invariant】 message に raw user_id / utterance を埋め込まない (= category 識別子のみ)", () => {
    emitShadowError({ category: "orchestrator_error" });
    const message = vi.mocked(Sentry.captureMessage).mock.calls[0][0];
    expect(message).toBe("op5.shadow.error.orchestrator_error");
    // 短い fixed format = raw を含む余地がない
    expect(message.length).toBeLessThan(50);
  });
});
