/**
 * Stage 4 L4-pre-1 — Anthropic LLM wrapper test
 *
 * test strategy: Anthropic SDK 実呼び出しはせず、wrapper の構造的検証のみ。
 *   - createAnthropicLlmCall が LlmCallFn 形式の関数を返す (function type)
 *   - createAnthropicLlmCallFromEnv: ANTHROPIC_API_KEY 未設定で null
 *   - speechBuilder の setLlmCall に注入できる (型互換)
 *   - prompt caching (cache_control ephemeral) が wrapper 内で設定される
 *   - L4-l flip まで実 API 呼び出しは起きない (flag OFF / API key 未設定で null)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createAnthropicLlmCall,
  createAnthropicLlmCallFromEnv,
} from "@/lib/coalter/presence/llmCall";
import { setLlmCall } from "@/lib/coalter/presence/speechBuilder";

const ENV_KEY = "ANTHROPIC_API_KEY";
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
  setLlmCall(null);
});

describe("L4-pre-1 createAnthropicLlmCall — wrapper shape", () => {
  it("createAnthropicLlmCall(options) は LlmCallFn (Promise<string> を返す関数) を返す", () => {
    const fn = createAnthropicLlmCall({ apiKey: "test-key" });
    expect(typeof fn).toBe("function");
  });

  it("speechBuilder の setLlmCall に注入できる (型互換)", () => {
    const fn = createAnthropicLlmCall({ apiKey: "test-key" });
    expect(() => setLlmCall(fn)).not.toThrow();
    setLlmCall(null);
  });
});

describe("L4-pre-1 createAnthropicLlmCallFromEnv — env-based factory", () => {
  it("ANTHROPIC_API_KEY 未設定で null を返す (L4-l flip 前の安全状態)", () => {
    delete process.env[ENV_KEY];
    expect(createAnthropicLlmCallFromEnv()).toBeNull();
  });

  it("ANTHROPIC_API_KEY 設定済で LlmCallFn を返す", () => {
    process.env[ENV_KEY] = "test-key-not-real";
    const fn = createAnthropicLlmCallFromEnv();
    expect(fn).not.toBeNull();
    expect(typeof fn).toBe("function");
  });
});

describe("L4-pre-1 構造 invariant — prompt caching (cache_control ephemeral)", () => {
  it("llmCall.ts に cache_control: ephemeral が記述済 (system prompt 5 分 cache)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../lib/coalter/presence/llmCall.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/cache_control:\s*\{\s*type:\s*["']ephemeral["']\s*\}/);
  });

  it("system prompt 投入経路 + user message が分離されている", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../lib/coalter/presence/llmCall.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/system:\s*\[/);
    expect(content).toMatch(/role:\s*["']user["']/);
  });

  it("model default は claude-sonnet-4-5 系 (CEO 採用 model 整合)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../lib/coalter/presence/llmCall.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/claude-sonnet-4-5/);
  });
});

describe("L4-pre-1 構造 invariant — L4-l flip まで実 API call ゼロ", () => {
  it("speechBuilder.ts の default 経路で setLlmCall(null) が L4-l まで維持される", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../lib/coalter/presence/speechBuilder.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // injectedLlmCall の初期値が null
    expect(content).toMatch(/injectedLlmCall[^=]*=\s*null/);
    // setLlmCall(null) で fallback 経路へ
    expect(content).toMatch(/setLlmCall/);
  });

  it("llmCall.ts は flag を直接見ない (speechBuilder 経由でのみ呼ばれる、二重 check 防止)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../lib/coalter/presence/llmCall.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).not.toMatch(/COALTER_FLAGS\.presenceSpeechLLMEnabled/);
  });
});
