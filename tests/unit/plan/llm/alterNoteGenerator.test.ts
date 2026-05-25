/**
 * Phase 3-N Plan P2 Step 1 — alterNoteGenerator contract test
 *
 * 検証範囲:
 *   - flag OFF / category 'other' / cost cap / validation_failed / llm_failure 各 path
 *   - batch: 並列度 5 / cap 20 / popcorn 防止 (= 一括 return)
 *   - runAI は mock (= 実 LLM 呼び出さない、 network 不要)
 *
 * 不変原則:
 *   - server-only module の test (= vitest server-only stub 必要)
 *   - PLAN_FLAGS.alterNoteLive は env 経由、 test で動的切替
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlterNoteContext } from "@/lib/plan/llm/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mock runAI (= LLM 呼ばない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const runAIMock = vi.fn();

vi.mock("@/lib/ai", () => ({
  runAI: (args: unknown) => runAIMock(args),
}));

// server-only is no-op in test runtime
vi.mock("server-only", () => ({}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Env (= PLAN_ALTER_NOTE_LIVE) 切替
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ORIGINAL_ENV = process.env.PLAN_ALTER_NOTE_LIVE;

beforeEach(() => {
  runAIMock.mockReset();
});

afterEach(() => {
  process.env.PLAN_ALTER_NOTE_LIVE = ORIGINAL_ENV;
  vi.resetModules();
});

/** flag を true にして generator を再 import */
async function importWithFlagOn() {
  process.env.PLAN_ALTER_NOTE_LIVE = "true";
  vi.resetModules();
  return await import("@/lib/plan/llm/alterNoteGenerator");
}

/** flag を false にして generator を再 import */
async function importWithFlagOff() {
  process.env.PLAN_ALTER_NOTE_LIVE = "false";
  vi.resetModules();
  return await import("@/lib/plan/llm/alterNoteGenerator");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sample contexts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ctxCafe: AlterNoteContext = {
  category: "cafe",
  startTime: "09:00",
  title: "朝のカフェ",
};

const ctxOther: AlterNoteContext = {
  category: "other",
  startTime: "12:00",
  title: "予定 A",
};

/** Pure runAI success response (= valid JSON 出力) */
function mockRunAISuccess(text: string) {
  return {
    text: JSON.stringify({ text }),
    structured: { text },
    provider: "gemini" as const,
    model: "gemini-2.5-flash",
    latencyMs: 500,
    success: true,
    fallbackUsed: false,
    cacheHit: false,
    cacheKey: null,
    confidence: null,
    errorMessage: null,
    aiRunId: "test-run-id",
  };
}

/** Pure runAI failure response */
function mockRunAIFailure(errorMessage: string) {
  return {
    text: "",
    structured: null,
    provider: "gemini" as const,
    model: "gemini-2.5-flash",
    latencyMs: 4000,
    success: false,
    fallbackUsed: false,
    cacheHit: false,
    cacheKey: null,
    confidence: null,
    errorMessage,
    aiRunId: "test-run-id",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// generateAlterNote (= single anchor)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("generateAlterNote: flag OFF", () => {
  it("flag OFF なら 'unavailable' (= reason: flag_off)、 runAI 呼ばない", async () => {
    const { generateAlterNote } = await importWithFlagOff();
    const result = await generateAlterNote(ctxCafe);
    expect(result.source).toBe("unavailable");
    if (result.source === "unavailable") {
      expect(result.reason).toBe("flag_off");
    }
    expect(runAIMock).not.toHaveBeenCalled();
  });
});

describe("generateAlterNote: category 'other'", () => {
  it("flag ON でも 'other' は 'unavailable' (= reason: category_other)、 runAI 呼ばない", async () => {
    const { generateAlterNote } = await importWithFlagOn();
    const result = await generateAlterNote(ctxOther);
    expect(result.source).toBe("unavailable");
    if (result.source === "unavailable") {
      expect(result.reason).toBe("category_other");
    }
    expect(runAIMock).not.toHaveBeenCalled();
  });
});

describe("generateAlterNote: LLM 成功", () => {
  it("valid JSON + validator pass → 'llm' source、 text 返す", async () => {
    runAIMock.mockResolvedValueOnce(mockRunAISuccess("朝の集中時間、 ゆっくり進める"));
    const { generateAlterNote } = await importWithFlagOn();
    const result = await generateAlterNote(ctxCafe);
    expect(result.source).toBe("llm");
    if (result.source === "llm") {
      expect(result.text).toBe("朝の集中時間、 ゆっくり進める");
      expect(result.model).toBe("gemini-2.5-flash");
    }
    expect(runAIMock).toHaveBeenCalledTimes(1);
  });

  it("runAI に正しい params が渡る (= taskType / requireJson / temperature 等)", async () => {
    runAIMock.mockResolvedValueOnce(mockRunAISuccess("朝のカフェタイム、 静かに整える"));
    const { generateAlterNote } = await importWithFlagOn();
    await generateAlterNote(ctxCafe);
    expect(runAIMock).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: "plan_alter_note",
        requireJson: true,
        // v3.4.2: temperature 0.2 → 0.7 (= cache miss 時の variation 確保、 CEO 2026-05-25)
        temperature: 0.7,
        maxOutputTokens: 128,
        timeoutMs: 4000,
      }),
    );
  });
});

describe("generateAlterNote: LLM 失敗 path", () => {
  it("runAI success=false → 'unavailable' (= reason: llm_failure)", async () => {
    runAIMock.mockResolvedValueOnce(mockRunAIFailure("network_error"));
    const { generateAlterNote } = await importWithFlagOn();
    const result = await generateAlterNote(ctxCafe);
    expect(result.source).toBe("unavailable");
    if (result.source === "unavailable") {
      expect(result.reason).toBe("llm_failure");
    }
  });

  it("runAI errorMessage に 'timeout' → 'unavailable' (= reason: timeout)", async () => {
    runAIMock.mockResolvedValueOnce(mockRunAIFailure("request timeout exceeded"));
    const { generateAlterNote } = await importWithFlagOn();
    const result = await generateAlterNote(ctxCafe);
    expect(result.source).toBe("unavailable");
    if (result.source === "unavailable") {
      expect(result.reason).toBe("timeout");
    }
  });

  it("runAI throw → 'unavailable' (= reason: llm_failure)", async () => {
    runAIMock.mockRejectedValueOnce(new Error("unexpected"));
    const { generateAlterNote } = await importWithFlagOn();
    const result = await generateAlterNote(ctxCafe);
    expect(result.source).toBe("unavailable");
    if (result.source === "unavailable") {
      expect(result.reason).toBe("llm_failure");
    }
  });

  it("structured 不正 + text 空 → 'unavailable' (= reason: llm_failure)", async () => {
    runAIMock.mockResolvedValueOnce({
      ...mockRunAISuccess(""),
      structured: { other: "field" },
      text: "",
    });
    const { generateAlterNote } = await importWithFlagOn();
    const result = await generateAlterNote(ctxCafe);
    expect(result.source).toBe("unavailable");
    if (result.source === "unavailable") {
      expect(result.reason).toBe("llm_failure");
    }
  });
});

describe("generateAlterNote: validation 失敗", () => {
  it("禁止語 'おすすめ' → 'unavailable' (= reason: validation_failed)", async () => {
    runAIMock.mockResolvedValueOnce(mockRunAISuccess("おすすめの朝のカフェ"));
    const { generateAlterNote } = await importWithFlagOn();
    const result = await generateAlterNote(ctxCafe);
    expect(result.source).toBe("unavailable");
    if (result.source === "unavailable") {
      expect(result.reason).toBe("validation_failed");
    }
  });

  it("短すぎる (= 5 字) → 'unavailable' (= validation_failed)", async () => {
    runAIMock.mockResolvedValueOnce(mockRunAISuccess("カフェ朝"));
    const { generateAlterNote } = await importWithFlagOn();
    const result = await generateAlterNote(ctxCafe);
    expect(result.source).toBe("unavailable");
  });

  it("空文字 → 'unavailable' (= llm_failure、 empty text)", async () => {
    runAIMock.mockResolvedValueOnce(mockRunAISuccess(""));
    const { generateAlterNote } = await importWithFlagOn();
    const result = await generateAlterNote(ctxCafe);
    expect(result.source).toBe("unavailable");
    if (result.source === "unavailable") {
      expect(result.reason).toBe("llm_failure");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// generateAlterNoteBatch (= popcorn 防止 + cost cap)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("generateAlterNoteBatch: flag OFF", () => {
  it("flag OFF なら 全 'unavailable' (= flag_off)、 runAI 呼ばない", async () => {
    const { generateAlterNoteBatch } = await importWithFlagOff();
    const results = await generateAlterNoteBatch([ctxCafe, ctxCafe, ctxCafe]);
    expect(results.length).toBe(3);
    for (const r of results) {
      expect(r.source).toBe("unavailable");
      if (r.source === "unavailable") {
        expect(r.reason).toBe("flag_off");
      }
    }
    expect(runAIMock).not.toHaveBeenCalled();
  });
});

describe("generateAlterNoteBatch: empty", () => {
  it("空配列 → 空結果、 runAI 呼ばない", async () => {
    const { generateAlterNoteBatch } = await importWithFlagOn();
    const results = await generateAlterNoteBatch([]);
    expect(results.length).toBe(0);
    expect(runAIMock).not.toHaveBeenCalled();
  });
});

describe("generateAlterNoteBatch: cost cap", () => {
  it("21 件 → 最初 20 件 LLM、 21 件目は 'cost_cap'", async () => {
    runAIMock.mockResolvedValue(mockRunAISuccess("朝の集中時間、 ゆっくり整える"));
    const { generateAlterNoteBatch } = await importWithFlagOn();
    const contexts: AlterNoteContext[] = [];
    for (let i = 0; i < 21; i += 1) {
      contexts.push({ category: "cafe", startTime: "09:00" });
    }
    const results = await generateAlterNoteBatch(contexts);
    expect(results.length).toBe(21);
    // 最初 20 件は llm
    for (let i = 0; i < 20; i += 1) {
      expect(results[i].source).toBe("llm");
    }
    // 21 件目は cost_cap
    expect(results[20].source).toBe("unavailable");
    if (results[20].source === "unavailable") {
      expect(results[20].reason).toBe("cost_cap");
    }
    // runAI は 20 回のみ呼ばれる
    expect(runAIMock).toHaveBeenCalledTimes(20);
  });
});

describe("generateAlterNoteBatch: 1:1 index 対応", () => {
  it("混在 (= cafe + other + cafe) で index 順序維持", async () => {
    runAIMock.mockResolvedValue(mockRunAISuccess("朝のカフェタイム、 静か"));
    const { generateAlterNoteBatch } = await importWithFlagOn();
    const contexts: AlterNoteContext[] = [ctxCafe, ctxOther, ctxCafe];
    const results = await generateAlterNoteBatch(contexts);
    expect(results.length).toBe(3);
    expect(results[0].source).toBe("llm");
    expect(results[1].source).toBe("unavailable");
    if (results[1].source === "unavailable") {
      expect(results[1].reason).toBe("category_other");
    }
    expect(results[2].source).toBe("llm");
    // runAI は cafe 2 件のみ
    expect(runAIMock).toHaveBeenCalledTimes(2);
  });
});

describe("generateAlterNoteBatch: 失敗 + 成功 混在", () => {
  it("途中 LLM 失敗あっても他 anchor の結果は得られる", async () => {
    runAIMock
      .mockResolvedValueOnce(mockRunAISuccess("朝のカフェタイム、 静か"))
      .mockResolvedValueOnce(mockRunAIFailure("network_error"))
      .mockResolvedValueOnce(mockRunAISuccess("午後の集中時間、 整え"));
    const { generateAlterNoteBatch } = await importWithFlagOn();
    const contexts: AlterNoteContext[] = [ctxCafe, ctxCafe, ctxCafe];
    const results = await generateAlterNoteBatch(contexts);
    expect(results.length).toBe(3);
    expect(results[0].source).toBe("llm");
    expect(results[1].source).toBe("unavailable");
    if (results[1].source === "unavailable") {
      expect(results[1].reason).toBe("llm_failure");
    }
    expect(results[2].source).toBe("llm");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cost cap 定数 露出 (= constants 検証)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Cost cap 定数 (= readiness v2 §6.2 確定値)", () => {
  it("ALTER_NOTE_MAX_CALLS_PER_VIEW=20、 CONCURRENCY=5、 TIMEOUT_MS=4000", async () => {
    const {
      ALTER_NOTE_MAX_CALLS_PER_VIEW,
      ALTER_NOTE_CONCURRENCY,
      ALTER_NOTE_TIMEOUT_MS,
    } = await importWithFlagOn();
    expect(ALTER_NOTE_MAX_CALLS_PER_VIEW).toBe(20);
    expect(ALTER_NOTE_CONCURRENCY).toBe(5);
    expect(ALTER_NOTE_TIMEOUT_MS).toBe(4000);
  });
});
