/**
 * Router failover prefix tests — W3-PR-5 Commit 1
 *
 * `alter_morning_` prefix を failover eligible にしたことで、
 * Gemini 503 時に OpenAI fallback に落ちることを担保する。
 */
import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveRouterDecision } from "@/lib/ai/router";

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  process.env.OPENAI_API_KEY = "sk-test-dummy";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
});

describe("resolveRouterDecision — alter_morning_ failover (W3-PR-5)", () => {
  test("alter_morning_comprehension は OpenAI fallback eligible", () => {
    const d = resolveRouterDecision({
      taskType: "alter_morning_comprehension",
      prompt: "x",
    });
    expect(d.fallbackEnabled).toBe(true);
    expect(d.fallback).toBe("openai");
  });

  test("alter_morning_narration は OpenAI fallback eligible", () => {
    const d = resolveRouterDecision({
      taskType: "alter_morning_narration",
      prompt: "x",
    });
    expect(d.fallbackEnabled).toBe(true);
    expect(d.fallback).toBe("openai");
  });

  test("OPENAI_API_KEY 未設定時は fallback 無効", () => {
    delete process.env.OPENAI_API_KEY;
    const d = resolveRouterDecision({
      taskType: "alter_morning_comprehension",
      prompt: "x",
    });
    expect(d.fallbackEnabled).toBe(false);
    expect(d.fallback).toBeNull();
  });

  test("無関係な prefix は fallback 対象外（回帰防止）", () => {
    const d = resolveRouterDecision({
      taskType: "random_unrelated_task",
      prompt: "x",
    });
    expect(d.fallbackEnabled).toBe(false);
  });
});
