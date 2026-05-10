/**
 * Stage 4 L4-pre-3 — instrumentation startup wiring 構造検証
 *
 * 不可侵 (本書 + plan v0.3 §0.4):
 *   - flag OFF + API key 未設定 で 全ゼロ動作 (API call / Sentry send / startup error 全てゼロ)
 *   - createAnthropicLlmCallFromEnv() が null 返す場合は setLlmCall を **呼ばない**
 *     (null injection で誤動作させない、speechBuilder default fallback 維持)
 *   - wireSentryTelemetry は sink injection のみ、実 send は telemetry.safeEmit gate
 *   - ChatClient.tsx は touch しない
 *
 * test strategy:
 *   - instrumentation.ts / instrumentation-client.ts を実 import / register せず、
 *     ファイル content を構造的に検証 (server runtime register は環境依存で test しにくい)
 *   - createAnthropicLlmCallFromEnv の null 返却を実 invoke で確認
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createAnthropicLlmCallFromEnv } from "@/lib/coalter/presence/llmCall";

const ENV_KEY = "ANTHROPIC_API_KEY";
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
});

describe("L4-pre-3 instrumentation.ts (server) — register() の構造検証", () => {
  it("instrumentation.ts に CoAlter startup wiring が含まれる (NEXT_RUNTIME === nodejs gate 内)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, "../../../instrumentation.ts");
    const content = fs.readFileSync(file, "utf8");
    // 既存 sentry.server.config import + 新 wiring
    expect(content).toMatch(/sentry\.server\.config/);
    expect(content).toMatch(/setLlmCall/);
    expect(content).toMatch(/createAnthropicLlmCallFromEnv/);
    expect(content).toMatch(/wireSentryTelemetry/);
    // nodejs runtime gate 内に wiring がある
    expect(content).toMatch(/NEXT_RUNTIME\s*===\s*["']nodejs["']/);
  });

  it("llmFn が null の場合 setLlmCall を呼ばない (null injection 防止)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, "../../../instrumentation.ts");
    const content = fs.readFileSync(file, "utf8");
    // if (llmFn) gate が入っている
    expect(content).toMatch(/if\s*\(\s*llmFn\s*\)/);
    // null 防止コメントがある
    expect(content).toMatch(/null\s*injection|誤\s*injection/i);
  });

  it("Promise.all で 3 module を並列 import (initial load 効率化)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, "../../../instrumentation.ts");
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/Promise\.all/);
    expect(content).toMatch(/speechBuilder/);
    expect(content).toMatch(/llmCall/);
    expect(content).toMatch(/sentryTelemetry/);
  });

  it("edge runtime には CoAlter wiring を入れない (Anthropic SDK は nodejs 専用)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, "../../../instrumentation.ts");
    const content = fs.readFileSync(file, "utf8");
    // edge gate 内には sentry.edge.config のみ、CoAlter wiring が入っていないことを検証
    const edgeBlock = content.match(/NEXT_RUNTIME\s*===\s*["']edge["'][\s\S]*?(?=\n\s*\}\s*\n)/);
    expect(edgeBlock).not.toBeNull();
    if (edgeBlock) {
      expect(edgeBlock[0]).not.toMatch(/setLlmCall/);
      expect(edgeBlock[0]).not.toMatch(/wireSentryTelemetry/);
    }
  });
});

describe("L4-pre-3 instrumentation-client.ts — client side wiring", () => {
  it("client 側で wireSentryTelemetry が呼ばれる (sink injection 統一)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, "../../../instrumentation-client.ts");
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/wireSentryTelemetry/);
    expect(content).toMatch(/import.*sentryTelemetry/);
  });

  it("client 側に setLlmCall は不在 (Anthropic SDK は server 専用、API key 漏洩防止)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, "../../../instrumentation-client.ts");
    const content = fs.readFileSync(file, "utf8");
    expect(content).not.toMatch(/setLlmCall/);
    expect(content).not.toMatch(/createAnthropicLlmCallFromEnv/);
  });

  it("L4-i Phase 2 Stage 2.1 (CEO 確定 2026-05-03): maxBreadcrumbs 拡張 (default 100 → 500)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, "../../../instrumentation-client.ts");
    const content = fs.readFileSync(file, "utf8");
    // talk page polling chatter (~24 fetch/min) で default 100 buffer が ~4 分で
    // overflow し coalter.* breadcrumb が消失する事案への対策。
    expect(content).toMatch(/maxBreadcrumbs:\s*500/);
    // Sentry.init 内に存在 (init option として有効)
    expect(content).toMatch(
      /Sentry\.init\([\s\S]*?maxBreadcrumbs:\s*500[\s\S]*?\}\s*\)/,
    );
  });
});

describe("L4-pre-3 null injection 防止 — createAnthropicLlmCallFromEnv 実挙動", () => {
  it("ANTHROPIC_API_KEY 未設定で null (instrumentation.ts は setLlmCall を呼ばない経路)", () => {
    delete process.env[ENV_KEY];
    expect(createAnthropicLlmCallFromEnv()).toBeNull();
  });

  it("ANTHROPIC_API_KEY 設定で関数返却 (instrumentation.ts は setLlmCall(llmFn) 経路)", () => {
    process.env[ENV_KEY] = "test-key-not-real";
    expect(createAnthropicLlmCallFromEnv()).not.toBeNull();
  });
});

describe("L4-pre-3 不可侵 — ChatClient.tsx 非 touch 維持", () => {
  it("ChatClient.tsx の Stage 4 期間中の累積 diff が想定範囲内 (L4-a/b/c 由来のみ)", async () => {
    // 静的検査: ChatClient.tsx に setLlmCall / wireSentryTelemetry import が無いこと
    // (instrumentation.ts / -client.ts 経由で startup wiring されるため、ChatClient は touch しない)
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/(culcept)/talk/[threadId]/ChatClient.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).not.toMatch(/setLlmCall/);
    expect(content).not.toMatch(/wireSentryTelemetry/);
    expect(content).not.toMatch(/createAnthropicLlmCallFromEnv/);
  });
});
