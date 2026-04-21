/**
 * L3.1 LLM Narration Provider — Contract Tests
 *
 * Wave 2 末尾 PR: A（LLM Narrator 配線）の成功条件を担保する。
 *
 * 4 成功条件:
 *   1. plan graph にない時刻・場所を narration が増やさない
 *   2. tentative を断定しない
 *   3. L3.2 で弾かれた時に retry → deterministic fallback が機能する
 *   4. 実機で "通じている感" が最低限出る（prompt + provider 契約のレベルで担保）
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

import {
  type Event,
  resetEventCounter,
  utteranceProvenance,
  inferredProvenance,
  baselineProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import { solveTimeLine } from "@/lib/alter-morning/planning/timeSolver";
import { groundPlaces } from "@/lib/alter-morning/planning/placeGrounder";
import { runL3Pipeline } from "@/lib/alter-morning/expression/pipeline";
import type { NarrationInput } from "@/lib/alter-morning/expression/narration";
import {
  buildNarrationPrompt,
  buildNarrationUserPrompt,
  NARRATION_RESPONSE_SCHEMA,
  NARRATION_SYSTEM_PROMPT,
} from "@/lib/alter-morning/expression/llmNarrationPrompt";
import {
  createLLMNarrationProvider,
  parseNarrationResponse,
} from "@/lib/alter-morning/expression/llmNarrationProvider";

vi.mock("server-only", () => ({}));

// runAI をモック。各テストで mockImplementation を上書きする。
const runAIMock = vi.fn();
vi.mock("@/lib/ai", () => ({
  runAI: (...args: unknown[]) => runAIMock(...args),
}));

beforeEach(() => {
  resetEventCounter();
  runAIMock.mockReset();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkEvent(overrides: Partial<Event>): Event {
  const base: Event = {
    event_id: "event_x",
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: null,
      timeHint: null,
      provenance: inferredProvenance(),
    },
    where: {
      place_ref: null,
      placeType: null,
      provenance: inferredProvenance(),
    },
    what: {
      activity: "",
      activityCanonical: "",
      provenance: inferredProvenance(),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
  return { ...base, ...overrides };
}

function mkNarrationInput(events: Event[]): NarrationInput {
  return {
    comprehension: {
      events,
      targetDate: "today",
      startPoint: null,
      departureTime: null,
      goOut: true,
    },
    timeline: solveTimeLine(events),
    grounded: groundPlaces(events),
  };
}

function aiSuccess(text: string, structured?: unknown) {
  return {
    text,
    provider: "openai" as const,
    model: "gpt-4o-mini",
    latencyMs: 123,
    success: true,
    structured: structured ?? null,
    fallbackUsed: false,
    cacheHit: false,
    cacheKey: null,
    confidence: null,
    errorMessage: null,
    aiRunId: "test-run",
  };
}

function aiFailure(errorMessage = "provider_timeout") {
  return {
    text: "",
    provider: "openai" as const,
    model: "gpt-4o-mini",
    latencyMs: 123,
    success: false,
    structured: null,
    fallbackUsed: false,
    cacheHit: false,
    cacheKey: null,
    confidence: null,
    errorMessage,
    aiRunId: null,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("NARRATION_SYSTEM_PROMPT", () => {
  test("「plan graph にある event 以外」「時刻を narration に書かない」「hedge」の禁則が明記されている", () => {
    expect(NARRATION_SYSTEM_PROMPT).toContain("plan graph");
    expect(NARRATION_SYSTEM_PROMPT).toContain("event 以外の予定を追加しない");
    expect(NARRATION_SYSTEM_PROMPT).toContain("時刻を narration に書かない");
    expect(NARRATION_SYSTEM_PROMPT).toContain("場所・固有名を narration に書かない");
    expect(NARRATION_SYSTEM_PROMPT).toContain("hedge");
    expect(NARRATION_SYSTEM_PROMPT).toContain("covered_event_ids");
  });
});

describe("NARRATION_RESPONSE_SCHEMA", () => {
  test("strict JSON schema の shape", () => {
    expect(NARRATION_RESPONSE_SCHEMA).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["text", "covered_event_ids"],
    });
    const props = (NARRATION_RESPONSE_SCHEMA as { properties: Record<string, unknown> }).properties;
    expect(props).toHaveProperty("text");
    expect(props).toHaveProperty("covered_event_ids");
  });
});

describe("buildNarrationUserPrompt", () => {
  test("event の時刻 / 場所 / 活動 / 同行者 が列挙される", () => {
    const ev = mkEvent({
      event_id: "e1",
      when: { startTime: "09:00", timeHint: "morning", provenance: utteranceProvenance(["9時"]) },
      where: { place_ref: "スタバ", placeType: "chain_brand", provenance: utteranceProvenance(["スタバ"]) },
      what: { activity: "作業", activityCanonical: "作業", provenance: utteranceProvenance(["作業"]) },
      who: ["田中"],
    });
    const prompt = buildNarrationUserPrompt(mkNarrationInput([ev]));
    expect(prompt).toContain("event e1");
    expect(prompt).toContain("09:00");
    expect(prompt).toContain("スターバックス"); // resolved
    expect(prompt).toContain("作業");
    expect(prompt).toContain("田中");
  });

  test("certainty=tentative の event には hedge 要求が添えられる", () => {
    const ev = mkEvent({
      event_id: "e1",
      certainty: "tentative",
      when: { startTime: "15:00", timeHint: null, provenance: utteranceProvenance(["15時"]) },
      where: { place_ref: "カフェ", placeType: "generic_place", provenance: utteranceProvenance(["カフェ"]) },
      what: { activity: "休憩", activityCanonical: "休憩", provenance: utteranceProvenance(["休憩"]) },
    });
    const prompt = buildNarrationUserPrompt(mkNarrationInput([ev]));
    expect(prompt).toContain("tentative");
    expect(prompt).toContain("hedge");
    expect(prompt).toContain("あたり");
  });

  test("許容時刻・許容固有名の集合を prompt に明示列挙する", () => {
    const ev = mkEvent({
      event_id: "e1",
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
      where: { place_ref: "サドヤ", placeType: "exact_proper_noun", provenance: utteranceProvenance(["サドヤ"]) },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"]) },
    });
    const prompt = buildNarrationUserPrompt(mkNarrationInput([ev]));
    expect(prompt).toContain("許容時刻");
    expect(prompt).toContain("09:00");
    expect(prompt).toContain("許容固有名");
    expect(prompt).toContain("サドヤ");
  });

  test("feedback 付きだと前回違反が prompt に現れる", () => {
    const ev = mkEvent({
      event_id: "e1",
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
      where: { place_ref: "スタバ", placeType: "chain_brand", provenance: utteranceProvenance(["スタバ"]) },
      what: { activity: "作業", activityCanonical: "作業", provenance: utteranceProvenance(["作業"]) },
    });
    const input: NarrationInput = {
      ...mkNarrationInput([ev]),
      feedback: [
        { type: "extra_time_in_text", offender: "14:00", message: "plan に無い時刻" },
      ],
    };
    const prompt = buildNarrationUserPrompt(input);
    expect(prompt).toContain("前回の narration");
    expect(prompt).toContain("extra_time_in_text");
    expect(prompt).toContain("14:00");
  });

  test("who が空なら 「同行者の名前を勝手に足さない」 の禁則行", () => {
    const ev = mkEvent({
      event_id: "e1",
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
      where: { place_ref: "スタバ", placeType: "chain_brand", provenance: utteranceProvenance(["スタバ"]) },
      what: { activity: "作業", activityCanonical: "作業", provenance: utteranceProvenance(["作業"]) },
      who: [],
    });
    const prompt = buildNarrationUserPrompt(mkNarrationInput([ev]));
    expect(prompt).toContain("同行者の名前を勝手に足さない");
  });
});

describe("buildNarrationPrompt (combined)", () => {
  test("system + user を両方返す", () => {
    const ev = mkEvent({
      event_id: "e1",
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
      where: { place_ref: "スタバ", placeType: "chain_brand", provenance: utteranceProvenance(["スタバ"]) },
      what: { activity: "作業", activityCanonical: "作業", provenance: utteranceProvenance(["作業"]) },
    });
    const { systemPrompt, userPrompt } = buildNarrationPrompt(mkNarrationInput([ev]));
    expect(systemPrompt).toBe(NARRATION_SYSTEM_PROMPT);
    expect(userPrompt).toContain("event e1");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseNarrationResponse
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseNarrationResponse", () => {
  test("structured が正しい shape なら採用", () => {
    const out = parseNarrationResponse(
      { text: "9時にサドヤでコーヒー。", covered_event_ids: ["e1"] },
      "",
    );
    expect(out).toEqual({ text: "9時にサドヤでコーヒー。", covered_event_ids: ["e1"] });
  });

  test("structured が null でも text が JSON 文字列なら parse する", () => {
    const out = parseNarrationResponse(
      null,
      '{"text":"9時にサドヤ。","covered_event_ids":["e1"]}',
    );
    expect(out?.text).toBe("9時にサドヤ。");
    expect(out?.covered_event_ids).toEqual(["e1"]);
  });

  test("shape 不正なら null", () => {
    expect(parseNarrationResponse({ wrong: 1 }, "")).toBeNull();
    expect(parseNarrationResponse(null, "not json")).toBeNull();
    expect(parseNarrationResponse({ text: 1 }, "")).toBeNull();
    expect(parseNarrationResponse({ text: "x", covered_event_ids: "nope" }, "")).toBeNull();
  });

  test("covered_event_ids 内の非文字列は除外", () => {
    const out = parseNarrationResponse(
      { text: "x", covered_event_ids: ["e1", 2, null, "e3"] },
      "",
    );
    expect(out?.covered_event_ids).toEqual(["e1", "e3"]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// createLLMNarrationProvider
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("createLLMNarrationProvider", () => {
  test("runAI に taskType / jsonSchema / systemPrompt / prompt を渡す", async () => {
    runAIMock.mockResolvedValueOnce(
      aiSuccess("", { text: "9時にサドヤでコーヒー。", covered_event_ids: ["e1"] }),
    );
    const provider = createLLMNarrationProvider();
    const ev = mkEvent({
      event_id: "e1",
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
      where: { place_ref: "サドヤ", placeType: "exact_proper_noun", provenance: utteranceProvenance(["サドヤ"]) },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"]) },
    });
    await provider.narrate(mkNarrationInput([ev]));

    expect(runAIMock).toHaveBeenCalledTimes(1);
    const call = runAIMock.mock.calls[0][0];
    expect(call.taskType).toBe("alter_morning_narration");
    expect(call.jsonSchema).toBe(NARRATION_RESPONSE_SCHEMA);
    expect(call.systemPrompt).toBe(NARRATION_SYSTEM_PROMPT);
    expect(call.prompt).toContain("event e1");
    expect(call.requireJson).toBe(true);
  });

  test("成功: metadata に strategy=llm / model が入る", async () => {
    runAIMock.mockResolvedValueOnce(
      aiSuccess("", { text: "9時にサドヤ。", covered_event_ids: ["e1"] }),
    );
    const provider = createLLMNarrationProvider();
    const ev = mkEvent({
      event_id: "e1",
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
      where: { place_ref: "サドヤ", placeType: "exact_proper_noun", provenance: utteranceProvenance(["サドヤ"]) },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"]) },
    });
    const out = await provider.narrate(mkNarrationInput([ev]));
    expect(out.text).toBe("9時にサドヤ。");
    expect(out.covered_event_ids).toEqual(["e1"]);
    expect(out.metadata?.strategy).toBe("llm");
    expect(out.metadata?.model).toBe("gpt-4o-mini");
  });

  test("runAI.success=false → 空 narration（pipeline に retry/fallback を任せる）", async () => {
    runAIMock.mockResolvedValueOnce(aiFailure("provider_timeout"));
    const provider = createLLMNarrationProvider();
    const ev = mkEvent({
      event_id: "e1",
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
      where: { place_ref: "サドヤ", placeType: "exact_proper_noun", provenance: utteranceProvenance(["サドヤ"]) },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"]) },
    });
    const out = await provider.narrate(mkNarrationInput([ev]));
    expect(out.text).toBe("");
    expect(out.covered_event_ids).toEqual([]);
    expect(out.metadata?.strategy).toBe("llm");
  });

  test("runAI throw → 空 narration", async () => {
    runAIMock.mockRejectedValueOnce(new Error("boom"));
    const provider = createLLMNarrationProvider();
    const ev = mkEvent({
      event_id: "e1",
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
      where: { place_ref: "サドヤ", placeType: "exact_proper_noun", provenance: utteranceProvenance(["サドヤ"]) },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"]) },
    });
    const out = await provider.narrate(mkNarrationInput([ev]));
    expect(out.text).toBe("");
  });

  test("structured の shape が不正 → 空 narration", async () => {
    runAIMock.mockResolvedValueOnce(aiSuccess("not json", { unexpected: true }));
    const provider = createLLMNarrationProvider();
    const ev = mkEvent({
      event_id: "e1",
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
      where: { place_ref: "サドヤ", placeType: "exact_proper_noun", provenance: utteranceProvenance(["サドヤ"]) },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"]) },
    });
    const out = await provider.narrate(mkNarrationInput([ev]));
    expect(out.text).toBe("");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// E2E: Pipeline + LLM Provider の挙動
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("E2E: runL3Pipeline(input, createLLMNarrationProvider())", () => {
  test("成功条件 1-a: LLM が良い narration を返す → attempt=0", async () => {
    runAIMock.mockResolvedValueOnce(
      aiSuccess("", {
        text: "9時にサドヤでコーヒー。",
        covered_event_ids: ["e1"],
      }),
    );
    const ev = mkEvent({
      event_id: "e1",
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
      where: { place_ref: "サドヤ", placeType: "exact_proper_noun", provenance: utteranceProvenance(["サドヤ"]) },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"]) },
    });
    const result = await runL3Pipeline(
      mkNarrationInput([ev]),
      createLLMNarrationProvider(),
    );
    expect(result.attempt).toBe(0);
    expect(result.violations).toEqual([]);
    expect(result.narration.text).toContain("サドヤ");
    expect(result.narration.metadata?.strategy).toBe("llm");
  });

  test("成功条件 1-b: LLM が plan 外時刻を足したら → retry → LLM が修正 → attempt=1", async () => {
    // 1st: extra_time_in_text 違反
    runAIMock.mockResolvedValueOnce(
      aiSuccess("", {
        text: "14時にサドヤでコーヒー。", // plan は 09:00 なのに 14:00 を LLM が創作
        covered_event_ids: ["e1"],
      }),
    );
    // 2nd: feedback を反映して修正
    runAIMock.mockResolvedValueOnce(
      aiSuccess("", {
        text: "9時にサドヤでコーヒー。",
        covered_event_ids: ["e1"],
      }),
    );
    const ev = mkEvent({
      event_id: "e1",
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
      where: { place_ref: "サドヤ", placeType: "exact_proper_noun", provenance: utteranceProvenance(["サドヤ"]) },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"]) },
    });
    const result = await runL3Pipeline(
      mkNarrationInput([ev]),
      createLLMNarrationProvider(),
    );
    expect(result.attempt).toBe(1);
    expect(result.violations).toEqual([]);
    expect(result.narration.text).toContain("9時");
    expect(result.narration.text).not.toContain("14");
    expect(runAIMock).toHaveBeenCalledTimes(2);

    // 2 回目の呼び出しで feedback が prompt に注入されているはず
    const secondCall = runAIMock.mock.calls[1][0];
    expect(secondCall.prompt).toContain("前回の narration");
    expect(secondCall.prompt).toContain("extra_time_in_text");
  });

  test("成功条件 3: LLM が retry 後も違反 → deterministic fallback (attempt=2)", async () => {
    // 両方とも plan 外時刻を返す
    runAIMock.mockResolvedValue(
      aiSuccess("", {
        text: "14時にサドヤでコーヒー。",
        covered_event_ids: ["e1"],
      }),
    );
    const ev = mkEvent({
      event_id: "e1",
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
      where: { place_ref: "サドヤ", placeType: "exact_proper_noun", provenance: utteranceProvenance(["サドヤ"]) },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"]) },
    });
    const result = await runL3Pipeline(
      mkNarrationInput([ev]),
      createLLMNarrationProvider(),
    );
    expect(result.attempt).toBe(2);
    expect(result.narration.metadata?.strategy).toBe("deterministic_fallback");
    expect(result.narration.text).not.toContain("14");
    expect(result.narration.text).toContain("09:00");
    expect(result.violations.length).toBeGreaterThan(0);
  });

  test("成功条件 3': LLM が常に throw → deterministic fallback", async () => {
    runAIMock.mockRejectedValue(new Error("api_down"));
    const ev = mkEvent({
      event_id: "e1",
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
      where: { place_ref: "自宅", placeType: "known_base", provenance: baselineProvenance() },
      what: { activity: "朝食", activityCanonical: "朝食", provenance: utteranceProvenance(["朝食"]) },
    });
    const result = await runL3Pipeline(
      mkNarrationInput([ev]),
      createLLMNarrationProvider(),
    );
    expect(result.attempt).toBe(2);
    expect(result.narration.metadata?.strategy).toBe("deterministic_fallback");
    expect(result.narration.text).toContain("自宅");
  });

  test("成功条件 2: tentative で LLM が断定調 → retry → hedge あり → attempt=1", async () => {
    // 1st: hedge なしの断定調（missing_tentative_hedge 違反）
    runAIMock.mockResolvedValueOnce(
      aiSuccess("", {
        text: "15時にサドヤでコーヒー。",
        covered_event_ids: ["e1"],
      }),
    );
    // 2nd: feedback 反映、hedge あり
    runAIMock.mockResolvedValueOnce(
      aiSuccess("", {
        text: "15時あたりにサドヤでコーヒー（予定）。",
        covered_event_ids: ["e1"],
      }),
    );
    const ev = mkEvent({
      event_id: "e1",
      certainty: "tentative",
      when: { startTime: "15:00", timeHint: null, provenance: utteranceProvenance(["15時"]) },
      where: { place_ref: "サドヤ", placeType: "exact_proper_noun", provenance: utteranceProvenance(["サドヤ"]) },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"]) },
    });
    const result = await runL3Pipeline(
      mkNarrationInput([ev]),
      createLLMNarrationProvider(),
    );
    expect(result.attempt).toBe(1);
    expect(result.violations).toEqual([]);
    expect(result.narration.text).toContain("あたり");

    // 2 回目の prompt に tentative hedge feedback が含まれるはず
    const secondCall = runAIMock.mock.calls[1][0];
    expect(secondCall.prompt).toContain("missing_tentative_hedge");
  });

  test("成功条件 1-c: LLM が plan 外固有名 (extra_place_in_text) → retry → 修正 → attempt=1", async () => {
    runAIMock.mockResolvedValueOnce(
      aiSuccess("", {
        text: "9時にタリーズでコーヒー。", // plan は サドヤ だが LLM が タリーズ を創作
        covered_event_ids: ["e1"],
      }),
    );
    runAIMock.mockResolvedValueOnce(
      aiSuccess("", {
        text: "9時にサドヤでコーヒー。",
        covered_event_ids: ["e1"],
      }),
    );
    const ev = mkEvent({
      event_id: "e1",
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
      where: { place_ref: "サドヤ", placeType: "exact_proper_noun", provenance: utteranceProvenance(["サドヤ"]) },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"]) },
    });
    const result = await runL3Pipeline(
      mkNarrationInput([ev]),
      createLLMNarrationProvider(),
    );
    expect(result.attempt).toBe(1);
    expect(result.violations).toEqual([]);
    expect(result.narration.text).toContain("サドヤ");
    expect(result.narration.text).not.toContain("タリーズ");

    const secondCall = runAIMock.mock.calls[1][0];
    expect(secondCall.prompt).toContain("extra_place_in_text");
  });
});
