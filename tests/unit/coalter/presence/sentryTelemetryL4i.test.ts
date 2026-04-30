/**
 * Stage 4 L4-i Phase 1 — Sentry telemetry payload 拡張 PII 不在 test
 *
 * 完了条件 (CEO 必須 14 項目より該当 cover):
 *   #7 LLM response 本文が telemetry payload に入らない (構造 invariant grep)
 *   #8 prompt 本文が Sentry payload に入らない (構造 invariant grep)
 *
 * test strategy:
 *   - PatternUsedEvent 型定義の grep で禁止 field 不在を確認
 *   - sentryTelemetry.ts の data spread が type 経由で安全であることを確認
 *   - usePresenceExecutor.ts の emitPatternUsed call の payload を grep で確認
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Sentry SDK の addBreadcrumb をモック
const addBreadcrumbMock = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: (...args: unknown[]) => addBreadcrumbMock(...args),
}));

import { createSentryTelemetrySink } from "@/lib/coalter/presence/sentryTelemetry";

const ENV_KEY = "NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR";
let originalEnv: string | undefined;

beforeEach(() => {
  addBreadcrumbMock.mockClear();
  originalEnv = process.env[ENV_KEY];
  process.env[ENV_KEY] = "true";
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
});

describe("L4-i Phase 1 — pattern.used 拡張 payload (静的構造)", () => {
  it("PatternUsedEvent 型に禁止 field (body/promptText/llmResponseRaw) が無い", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../lib/coalter/presence/telemetryEvents.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // PatternUsedEvent block を抽出
    const match = content.match(
      /export\s+interface\s+PatternUsedEvent\s*\{[\s\S]*?\n\}/,
    );
    expect(match).not.toBeNull();
    const block = match![0];
    // 禁止 field
    expect(block).not.toMatch(/\bbody\??\s*:/);
    expect(block).not.toMatch(/\bpromptText\??\s*:/);
    expect(block).not.toMatch(/\bllmResponseRaw\??\s*:/);
    expect(block).not.toMatch(/\bspeechBody\??\s*:/);
    expect(block).not.toMatch(/\buserMessage\??\s*:/);
    expect(block).not.toMatch(/\bconversation\??\s*:/);
    // 許可された L4-i 拡張 field
    expect(block).toMatch(/speechSource\??:/);
    expect(block).toMatch(/retries\??:/);
    expect(block).toMatch(/latencyMs\??:/);
    expect(block).toMatch(/validationFailed\??:/);
    expect(block).toMatch(/fallbackReason\??:/);
  });

  it("speechSource は 3 値 enum (static / llm / fallback) 限定", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../lib/coalter/presence/telemetryEvents.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    const match = content.match(
      /speechSource\?\s*:\s*([^;]+);/,
    );
    expect(match).not.toBeNull();
    const types = match![1];
    expect(types).toMatch(/"static"/);
    expect(types).toMatch(/"llm"/);
    expect(types).toMatch(/"fallback"/);
  });

  it("fallbackReason は 5 値 + null 限定 (CEO 確定 enum)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../lib/coalter/presence/telemetryEvents.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // PatternUsedEvent ブロック内のみ抽出 (LegacyFallbackEvent と区別)
    const blockMatch = content.match(
      /export\s+interface\s+PatternUsedEvent\s*\{[\s\S]*?\n\}/,
    );
    const block = blockMatch![0];
    expect(block).toMatch(/"flag_off"/);
    expect(block).toMatch(/"rate_limited"/);
    expect(block).toMatch(/"llm_error"/);
    expect(block).toMatch(/"validation_failed"/);
    expect(block).toMatch(/"timeout"/);
  });
});

describe("L4-i Phase 1 — sentry breadcrumb data の grep (PII 不在)", () => {
  it("createSentryTelemetrySink が pattern.used 拡張 field をそのまま data に流す", () => {
    const sink = createSentryTelemetrySink();
    sink({
      type: "coalter.pattern.used",
      pairId: "p1",
      variant: "A",
      state: "S2",
      mode: "normal",
      hasSecondary: false,
      ts: 1000,
      speechSource: "static",
      retries: 0,
      latencyMs: 0,
      validationFailed: false,
      fallbackReason: null,
    });
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
    const arg = addBreadcrumbMock.mock.calls[0][0];
    expect(arg.category).toBe("coalter.pattern");
    expect(arg.data).toMatchObject({
      speechSource: "static",
      retries: 0,
      latencyMs: 0,
      validationFailed: false,
      fallbackReason: null,
    });
    // 禁止 field が data に紛れていない
    expect(arg.data.body).toBeUndefined();
    expect(arg.data.promptText).toBeUndefined();
    expect(arg.data.llmResponseRaw).toBeUndefined();
    expect(arg.data.userMessage).toBeUndefined();
  });

  it("legacy.fallback は flag_off speech の通り道として使われていない (CEO 厳守、別 semantics 維持)", () => {
    // legacy.fallback の payload は legacyAutoInsertFired / dispatcherUsed のみ
    const sink = createSentryTelemetrySink();
    sink({
      type: "coalter.legacy.fallback",
      pairId: "p1",
      legacyAutoInsertFired: true,
      dispatcherUsed: false,
      ts: 1000,
    });
    const arg = addBreadcrumbMock.mock.calls[0][0];
    expect(arg.category).toBe("coalter.legacy");
    expect(arg.level).toBe("debug");
    // legacy.fallback の data に speech 系 field が混ざらない
    expect(arg.data.speechSource).toBeUndefined();
    expect(arg.data.fallbackReason).toBeUndefined();
  });
});

describe("L4-i Phase 1 — usePresenceExecutor.ts の emit call で禁止 field 渡さない", () => {
  it("emitPatternUsed call site の payload に body / 本文 系 field を含めない", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../app/components/chat/hooks/usePresenceExecutor.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // emitPatternUsed({ ... }) を囲む block を抽出
    const match = content.match(
      /emitPatternUsed\s*\(\s*\{[\s\S]*?\}\s*\)\s*;/,
    );
    expect(match).not.toBeNull();
    const block = match![0];
    // 禁止 field
    expect(block).not.toMatch(/\bbody\s*:/);
    expect(block).not.toMatch(/\bpromptText\s*:/);
    expect(block).not.toMatch(/\bllmResponse/);
    expect(block).not.toMatch(/\buserMessage\s*:/);
    expect(block).not.toMatch(/\bconversation\s*:/);
    // 許可された L4-i 拡張 field
    expect(block).toMatch(/speechSource:\s*["']static["']/);
    expect(block).toMatch(/retries:/);
    expect(block).toMatch(/latencyMs:/);
    expect(block).toMatch(/validationFailed:/);
    expect(block).toMatch(/fallbackReason:/);
  });
});
