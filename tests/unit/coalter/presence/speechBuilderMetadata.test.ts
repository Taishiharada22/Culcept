/**
 * Stage 4 L4-i Phase 2 — speechBuilder source metadata propagation test
 *
 * 完了条件 (CEO 確定 2026-05-01 mislabel fix):
 *   - flag OFF: source="static", latencyMs=0, fallbackReason=null
 *   - flag ON + 注入なし: source="fallback", fallbackReason="llm_error"
 *   - flag ON + LLM 成功: source="llm", retries>=0, latencyMs>=0, fallbackReason=null
 *   - flag ON + LLM throw: source="fallback", fallbackReason="llm_error"
 *   - flag ON + validator 全 retry 失敗: source="fallback", fallbackReason="validation_failed",
 *     validationFailed=true
 *
 * test strategy:
 *   - injectedLlmCall は setLlmCall(mockFn) で test 用 mock を注入
 *   - flag は process.env.COALTER_PRESENCE_SPEECH_LLM で制御
 *   - 各 path を invoke して SpeechOutput metadata の各 field を assert
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  buildPresenceSpeech,
  setLlmCall,
  hasLlmCallInjected,
} from "@/lib/coalter/presence/speechBuilder";

const ENV_KEY = "COALTER_PRESENCE_SPEECH_LLM";
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
  setLlmCall(null);
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
  setLlmCall(null);
});

describe("L4-i Phase 2 — speechBuilder source metadata (CEO mislabel fix 2026-05-01)", () => {
  describe("flag OFF path → source='static'", () => {
    it("env 未設定で source='static', latencyMs=0, fallbackReason=null", async () => {
      delete process.env[ENV_KEY];
      const result = await buildPresenceSpeech({
        variant: "A",
        state: "S2",
        mode: "normal",
      });
      expect(result.source).toBe("static");
      expect(result.latencyMs).toBe(0);
      expect(result.retries).toBe(0);
      expect(result.validationFailed).toBe(false);
      expect(result.fallbackReason).toBeNull();
      // body は static fallback (variant A の文面)
      expect(result.body).toBe("今、間に入れそうな間が少しありそう。");
    });

    it("env=false で同様", async () => {
      process.env[ENV_KEY] = "false";
      const result = await buildPresenceSpeech({
        variant: "B",
        state: "S2",
        mode: "normal",
      });
      expect(result.source).toBe("static");
      expect(result.latencyMs).toBe(0);
      expect(result.fallbackReason).toBeNull();
    });
  });

  describe("flag ON + 注入なし path → source='fallback', fallbackReason='llm_error'", () => {
    it("env=true + setLlmCall(null) で source='fallback', fallbackReason='llm_error'", async () => {
      process.env[ENV_KEY] = "true";
      setLlmCall(null);
      const result = await buildPresenceSpeech({
        variant: "A",
        state: "S2",
        mode: "normal",
      });
      expect(result.source).toBe("fallback");
      expect(result.latencyMs).toBe(0);
      expect(result.retries).toBe(0);
      expect(result.validationFailed).toBe(false);
      expect(result.fallbackReason).toBe("llm_error");
      // body は variant A の static fallback
      expect(result.body).toBe("今、間に入れそうな間が少しありそう。");
    });
  });

  describe("flag ON + LLM 成功 path → source='llm', retries>=0", () => {
    it("LLM mock が valid 文面を 1 発で返す → source='llm', retries=0, latencyMs>=0", async () => {
      process.env[ENV_KEY] = "true";
      // 14-40 文字、§2/§1.3 違反なしの valid 文面
      const validText = "今、二人の間に少し温度差があるかもしれません。";
      const llmMock = vi.fn().mockResolvedValue(validText);
      setLlmCall(llmMock);
      const result = await buildPresenceSpeech({
        variant: "B",
        state: "S2",
        mode: "normal",
      });
      expect(result.source).toBe("llm");
      expect(result.retries).toBe(0);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.validationFailed).toBe(false);
      expect(result.fallbackReason).toBeNull();
      expect(result.body).toBe(validText);
      expect(llmMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("flag ON + LLM throw path → source='fallback', fallbackReason='llm_error'", () => {
    it("LLM mock が throw → source='fallback', latencyMs>=0", async () => {
      process.env[ENV_KEY] = "true";
      const llmMock = vi
        .fn()
        .mockRejectedValue(new Error("Anthropic API 5xx"));
      setLlmCall(llmMock);
      const result = await buildPresenceSpeech({
        variant: "A",
        state: "S2",
        mode: "normal",
      });
      expect(result.source).toBe("fallback");
      expect(result.fallbackReason).toBe("llm_error");
      expect(result.retries).toBe(0);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.validationFailed).toBe(false);
      expect(result.body).toBe("今、間に入れそうな間が少しありそう。");
    });
  });

  describe("flag ON + validator 全 retry 失敗 path → source='fallback', fallbackReason='validation_failed'", () => {
    it("LLM mock が常に違反文面を返す → source='fallback', validationFailed=true, retries=-1", async () => {
      process.env[ENV_KEY] = "true";
      // §2.5 尋問 (連続疑問符)、§1.3 感嘆符等の違反文面 → validator が reject
      const violatingText = "本当に？それで？";
      const llmMock = vi.fn().mockResolvedValue(violatingText);
      setLlmCall(llmMock);
      const result = await buildPresenceSpeech({
        variant: "A",
        state: "S2",
        mode: "normal",
      });
      expect(result.source).toBe("fallback");
      expect(result.fallbackReason).toBe("validation_failed");
      expect(result.validationFailed).toBe(true);
      // postValidator は maxRetries=2 → 全 retry 失敗で retries=-1
      expect(result.retries).toBe(-1);
      // fallback として variant A の static 文面が採用される
      expect(result.body).toBe("今、間に入れそうな間が少しありそう。");
    });
  });

  describe("hasLlmCallInjected helper", () => {
    it("setLlmCall(null) で false", () => {
      setLlmCall(null);
      expect(hasLlmCallInjected()).toBe(false);
    });

    it("setLlmCall(fn) で true", () => {
      setLlmCall(vi.fn().mockResolvedValue("test"));
      expect(hasLlmCallInjected()).toBe(true);
    });
  });
});

describe("L4-i Phase 2 — SpeechOutput type 構造 invariant", () => {
  it("speechTypes.ts に SpeechSource / SpeechFallbackReason / SpeechOutput metadata field が定義済", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../lib/coalter/presence/speechTypes.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/export\s+type\s+SpeechSource/);
    expect(content).toMatch(/"static"\s*\|\s*"llm"\s*\|\s*"fallback"/);
    expect(content).toMatch(/export\s+type\s+SpeechFallbackReason/);
    expect(content).toMatch(/"llm_error"/);
    expect(content).toMatch(/"validation_failed"/);
    // SpeechOutput interface 内に必須 metadata field
    const outputMatch = content.match(
      /export\s+interface\s+SpeechOutput\s*\{[\s\S]*?\n\}/,
    );
    expect(outputMatch).not.toBeNull();
    const block = outputMatch![0];
    expect(block).toMatch(/\bsource\s*:/);
    expect(block).toMatch(/\bretries\s*:/);
    expect(block).toMatch(/\blatencyMs\s*:/);
    expect(block).toMatch(/\bvalidationFailed\s*:/);
    expect(block).toMatch(/\bfallbackReason\s*:/);
  });
});
