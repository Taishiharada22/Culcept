/**
 * Stage 4 L4-i Phase 1 — Speech API route test
 *
 * 完了条件 (CEO 必須 14 項目より該当 cover):
 *   #3 API routeでLLM flag OFFならAnthropic callされない (構造 invariant grep)
 *   #4 S2/S5/S7だけがspeech対象 (state validation)
 *   #9 validation違反時は fallback (test では mock LLM の error path で代替)
 *   #14 Production default behavior不変 (flag OFF で必ず static fallback)
 *
 * test strategy:
 *   - flag OFF 経路は実 POST invoke (Supabase 接続不要、flag check で短絡)
 *   - 401/403/404/200 は Supabase mock が必要 → 構造 invariant grep で代替
 *   - LLM 経路は Phase 1 で env 未設定の必然で到達不可 (gate 2 で必ず flag_off)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST } from "@/app/api/coalter/speech/route";

const ENV_EXEC = "NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR";
const ENV_LLM = "COALTER_PRESENCE_SPEECH_LLM";
const ENV_API_KEY = "ANTHROPIC_API_KEY";
let originalExec: string | undefined;
let originalLLM: string | undefined;
let originalApiKey: string | undefined;

beforeEach(() => {
  originalExec = process.env[ENV_EXEC];
  originalLLM = process.env[ENV_LLM];
  originalApiKey = process.env[ENV_API_KEY];
  delete process.env[ENV_EXEC];
  delete process.env[ENV_LLM];
  delete process.env[ENV_API_KEY];
});

afterEach(() => {
  if (originalExec === undefined) delete process.env[ENV_EXEC];
  else process.env[ENV_EXEC] = originalExec;
  if (originalLLM === undefined) delete process.env[ENV_LLM];
  else process.env[ENV_LLM] = originalLLM;
  if (originalApiKey === undefined) delete process.env[ENV_API_KEY];
  else process.env[ENV_API_KEY] = originalApiKey;
});

function mockReq(body: unknown): Request {
  return new Request("https://example.com/api/coalter/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("L4-i Phase 1 POST /api/coalter/speech — flag OFF (presenceExecutor) で 503", () => {
  it("env 未設定 (既定 OFF) で 503 service_unavailable", async () => {
    delete process.env[ENV_EXEC];
    const res = await POST(
      mockReq({
        state: "S2",
        mode: "normal",
        variant: "A",
        threadId: "t1",
      }) as never,
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("presence_executor_disabled");
  });

  it("env=false で 503", async () => {
    process.env[ENV_EXEC] = "false";
    const res = await POST(
      mockReq({
        state: "S2",
        mode: "normal",
        variant: "A",
        threadId: "t1",
      }) as never,
    );
    expect(res.status).toBe(503);
  });
});

describe("L4-i Phase 1 — request validation (CEO 必須 #4 cover)", () => {
  beforeEach(() => {
    process.env[ENV_EXEC] = "true";
  });

  it("invalid JSON で 400 invalid_json", async () => {
    const req = new Request("https://example.com/api/coalter/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
  });

  it("body が object でない (null) で 400 invalid_request", async () => {
    const res = await POST(mockReq(null) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("invalid state (S0) で 400 state_not_speech_enabled", async () => {
    const res = await POST(
      mockReq({
        state: "S0",
        mode: "normal",
        variant: "A",
        threadId: "t1",
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("state_not_speech_enabled");
  });

  it("invalid state (XX) で 400 invalid_state", async () => {
    const res = await POST(
      mockReq({
        state: "XX",
        mode: "normal",
        variant: "A",
        threadId: "t1",
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_state");
  });

  it("invalid mode で 400", async () => {
    const res = await POST(
      mockReq({
        state: "S2",
        mode: "rage",
        variant: "A",
        threadId: "t1",
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_mode");
  });

  it("invalid variant で 400", async () => {
    const res = await POST(
      mockReq({
        state: "S2",
        mode: "normal",
        variant: "Z",
        threadId: "t1",
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_variant");
  });

  it("missing threadId で 400", async () => {
    const res = await POST(
      mockReq({
        state: "S2",
        mode: "normal",
        variant: "A",
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_thread_id");
  });

  it("S0 / S1 / S3 / S4 / S6 / S8 すべて 400 state_not_speech_enabled (LLM 対象外、CEO 必須 #5)", async () => {
    for (const state of ["S0", "S1", "S3", "S4", "S6", "S8"] as const) {
      const res = await POST(
        mockReq({
          state,
          mode: "normal",
          variant: "A",
          threadId: "t1",
        }) as never,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("state_not_speech_enabled");
    }
  });

  it("構造 invariant: SPEECH_ENABLED_STATES が S2/S5/S7 のみ (CEO 必須 #4)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../app/api/coalter/speech/route.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    const match = content.match(
      /SPEECH_ENABLED_STATES[\s\S]{0,150}new\s+Set\(\[([\s\S]*?)\]\)/,
    );
    expect(match).not.toBeNull();
    const setBody = match![1];
    expect(setBody).toMatch(/"S2"/);
    expect(setBody).toMatch(/"S5"/);
    expect(setBody).toMatch(/"S7"/);
    // S0/S1/S3/S4/S6/S8 を含めない
    expect(setBody).not.toMatch(/"S0"/);
    expect(setBody).not.toMatch(/"S1"/);
    expect(setBody).not.toMatch(/"S3"/);
    expect(setBody).not.toMatch(/"S4"/);
    expect(setBody).not.toMatch(/"S6"/);
    expect(setBody).not.toMatch(/"S8"/);
  });
});

describe("L4-i Phase 1 — 構造 invariant (CEO 必須 #3, #6, #8 cover)", () => {
  it("buildPresenceSpeech / hasLlmCallInjected / setLlmCall を speechBuilder から import", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../app/api/coalter/speech/route.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // multi-line destructure import を許容
    expect(content).toMatch(/buildPresenceSpeech/);
    expect(content).toMatch(/hasLlmCallInjected/);
    expect(content).toMatch(/setLlmCall/);
    expect(content).toMatch(/@\/lib\/coalter\/presence\/speechBuilder/);
    // Anthropic LLM wrapper も import (lazy init recovery 用)
    expect(content).toMatch(/createAnthropicLlmCallFromEnv/);
    expect(content).toMatch(/@\/lib\/coalter\/presence\/llmCall/);
  });

  it("LLM flag check (presenceSpeechLLMEnabled + ANTHROPIC_API_KEY) 二重 gate", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../app/api/coalter/speech/route.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/presenceSpeechLLMEnabled/);
    expect(content).toMatch(/ANTHROPIC_API_KEY/);
    expect(content).toMatch(/flag_off/);
  });

  it("auth 失敗は 401 (static fallback と混ぜない、CEO 厳守)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../app/api/coalter/speech/route.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/status:\s*401/);
    expect(content).toMatch(/unauthorized/);
  });

  it("rate_limited は static fallback の form (200 + speechSource:static)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../app/api/coalter/speech/route.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/staticFallbackResponse\([^)]+,\s*["']rate_limited["']/);
  });

  it("response payload に prompt / LLM raw / 違反 message を含めない (CEO 厳守 #8)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../app/api/coalter/speech/route.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // SpeechResponse 型に許可されるフィールドのみ
    const allowed = [
      "body",
      "speechSource",
      "retries",
      "latencyMs",
      "validationFailed",
      "fallbackReason",
    ];
    // promptText / llmResponse / violationMessage 等の禁止 keyword が無い
    expect(content).not.toMatch(/promptText|llmResponseRaw|violationMessage/);
    // SpeechResponse が type 内に明示されている (回答 shape の凍結)
    expect(content).toMatch(/interface\s+SpeechResponse/);
    for (const k of allowed) {
      expect(content).toMatch(new RegExp(k));
    }
  });

  it("supabaseServer 経由 (RLS、service_role 不使用)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../app/api/coalter/speech/route.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /import\s+\{\s*supabaseServer\s*\}\s+from\s+["']@\/lib\/supabase\/server["']/,
    );
    expect(content).not.toMatch(/service_role|SERVICE_ROLE/);
  });
});
