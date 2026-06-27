/**
 * SR B1b-2C-7 — runExtractShiftDraft の契約
 *
 * 不変条件:
 *   - flag off / unauth / prod ref / missing env / invalid file → adapter 未呼出 / safe error
 *   - success → cells + perChunkCounts（safe summary のみ）
 *   - adapter throw → safe error mapping（raw / API key 非露出）
 *   - result に Blob / base64 / dataURL / raw response / API key が出ない
 *   - DB / Supabase / fetch を本 module は import しない（grep で別途確認）
 *   - VLM 実行なし（fake adapter のみ）
 */
import { describe, it, expect, vi } from "vitest";
import {
  runExtractShiftDraft,
  type ExtractShiftDraftDeps,
} from "@/lib/plan/shift/runExtractShiftDraft";
import {
  DraftExtractionError,
  type DraftExtractionAdapter,
} from "@/lib/plan/shift/draftExtractionAdapter";

// ── fixtures ──
const STAGING_REF = "stage123abc";
const PROD_REF = "prod456xyz";
const API_KEY_CANARY = "fake-test-api-key-LEAK-CANARY-SECRET";

function makeWorkingAdapter(): DraftExtractionAdapter {
  return {
    extractChunk: async (input) => {
      const { from, to } = input.dayRange;
      return Array.from({ length: to - from + 1 }, (_, i) => ({
        day: from + i,
        rawCode: "H",
        rowLabel: "本人",
        confidence: 0.9,
      }));
    },
  };
}

interface SpyAdapter {
  createAdapter: ExtractShiftDraftDeps["createAdapter"];
  callCount: { value: number };
}
function makeSpyAdapter(): SpyAdapter {
  const callCount = { value: 0 };
  const createAdapter: ExtractShiftDraftDeps["createAdapter"] = () => {
    callCount.value++;
    // gate 通過テストでは到達しない前提だが、安全のため明示的に throw
    throw new Error("createAdapter must not be called in gate-failure tests");
  };
  return { createAdapter, callCount };
}

function defaultDeps(
  overrides: Partial<ExtractShiftDraftDeps> = {}
): ExtractShiftDraftDeps {
  return {
    env: {
      flagOn: true,
      supabaseUrl: `https://${STAGING_REF}.supabase.co`,
      geminiApiKey: API_KEY_CANARY,
      vlmModel: "gemini-2.5-pro",
    },
    stagingRef: STAGING_REF,
    productionRef: PROD_REF,
    getUserId: async () => "user-abc",
    createAdapter: () => makeWorkingAdapter(),
    ...overrides,
  };
}

function validFormData(): FormData {
  const fd = new FormData();
  fd.set("header", new Blob([new Uint8Array(128)], { type: "image/png" }));
  fd.set("personRow", new Blob([new Uint8Array(128)], { type: "image/png" }));
  fd.set("year", "2026");
  fd.set("month", "5");
  fd.set("daysInMonth", "31");
  return fd;
}

// ─────────────────────────────────────────────────────────────
describe("runExtractShiftDraft — success", () => {
  it("flag/staging/env/auth/valid FormData → cells 31/31, perChunkCounts [15,16]", async () => {
    const result = await runExtractShiftDraft(validFormData(), defaultDeps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cells).toHaveLength(31);
      expect(result.cells[0].day).toBe(1);
      expect(result.cells[30].day).toBe(31);
      expect(result.cells[0].date).toBe("2026-05-01");
      expect(result.chunkSummary.perChunkCounts).toEqual([15, 16]);
    }
  });

  it("result に Blob / base64 / dataURL / raw response / API key が出ない", async () => {
    const result = await runExtractShiftDraft(validFormData(), defaultDeps());
    const json = JSON.stringify(result);
    expect(json).not.toContain(API_KEY_CANARY);
    expect(json).not.toMatch(/Blob|base64|data:image|dataUri|blob:|rawResponse|raw_response/i);
  });
});

// ─────────────────────────────────────────────────────────────
describe("runExtractShiftDraft — gates（adapter 未呼出）", () => {
  it("flag off → flag_disabled / adapter 未呼出", async () => {
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        env: { ...defaultDeps().env, flagOn: false },
        createAdapter,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("flag_disabled");
    expect(callCount.value).toBe(0);
  });

  it("staging ref を含まない → env_misconfigured / adapter 未呼出", async () => {
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        env: { ...defaultDeps().env, supabaseUrl: "https://other.supabase.co" },
        createAdapter,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("env_misconfigured");
    expect(callCount.value).toBe(0);
  });

  it("production ref を含む → env_misconfigured / adapter 未呼出", async () => {
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        env: {
          ...defaultDeps().env,
          supabaseUrl: `https://${PROD_REF}.supabase.co`,
        },
        createAdapter,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("env_misconfigured");
    expect(callCount.value).toBe(0);
  });

  it("supabaseUrl 未設定 → env_misconfigured / adapter 未呼出", async () => {
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        env: { ...defaultDeps().env, supabaseUrl: undefined },
        createAdapter,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("env_misconfigured");
    expect(callCount.value).toBe(0);
  });

  it("GEMINI_API_KEY 未設定 → env_misconfigured / adapter 未呼出", async () => {
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        env: { ...defaultDeps().env, geminiApiKey: "" },
        createAdapter,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("env_misconfigured");
    expect(callCount.value).toBe(0);
  });

  it("GEMINI_API_KEY 空白のみ → env_misconfigured", async () => {
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        env: { ...defaultDeps().env, geminiApiKey: "   " },
        createAdapter,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("env_misconfigured");
    expect(callCount.value).toBe(0);
  });

  it("B1B_VLM_MODEL 未設定 → env_misconfigured / adapter 未呼出", async () => {
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        env: { ...defaultDeps().env, vlmModel: "" },
        createAdapter,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("env_misconfigured");
    expect(callCount.value).toBe(0);
  });

  it("unauthenticated（getUserId null）→ unauthenticated / adapter 未呼出", async () => {
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        getUserId: async () => null,
        createAdapter,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unauthenticated");
    expect(callCount.value).toBe(0);
  });

  it("unauthenticated（getUserId 空文字）→ unauthenticated", async () => {
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        getUserId: async () => "",
        createAdapter,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unauthenticated");
    expect(callCount.value).toBe(0);
  });

  it("flag off + unauth: flag_disabled が先（getUserId 未呼出）", async () => {
    const getUserId = vi.fn(async () => null);
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        env: { ...defaultDeps().env, flagOn: false },
        getUserId,
        createAdapter,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("flag_disabled");
    expect(getUserId).not.toHaveBeenCalled();
    expect(callCount.value).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
describe("runExtractShiftDraft — P15-C production canary lane", () => {
  const CANARY = "canary-user-1";
  const NON_CANARY = "other-user";
  const prodUrl = `https://${PROD_REF}.supabase.co`;

  it("production URL + canary user → 全 gate 通過し成功（既存 staging 成功と同じ result.ok=true）", async () => {
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        env: { ...defaultDeps().env, supabaseUrl: prodUrl },
        getUserId: async () => CANARY,
        canaryUserIds: [CANARY],
        // createAdapter は default の makeWorkingAdapter（成功固定）に任せる
      })
    );
    expect(result.ok).toBe(true);
  });

  it("production URL + non-canary user → env_misconfigured / adapter 未呼出", async () => {
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        env: { ...defaultDeps().env, supabaseUrl: prodUrl },
        getUserId: async () => NON_CANARY,
        canaryUserIds: [CANARY],
        createAdapter,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("env_misconfigured");
    expect(callCount.value).toBe(0);
  });

  it("production URL + canaryUserIds 未指定（default 空）→ env_misconfigured（事故で全開しない）", async () => {
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        env: { ...defaultDeps().env, supabaseUrl: prodUrl },
        // canaryUserIds 渡さない（optional default 空配列）
        getUserId: async () => CANARY,
        createAdapter,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("env_misconfigured");
    expect(callCount.value).toBe(0);
  });

  it("staging URL + canary user → 全 gate 通過し成功（canary 判定は production 専用・staging を退化させない）", async () => {
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        // default staging URL のまま
        canaryUserIds: [CANARY],
        getUserId: async () => CANARY,
      })
    );
    expect(result.ok).toBe(true);
  });

  it("staging URL + non-canary user → 全 gate 通過し成功（既存 staging 挙動は canary list と独立）", async () => {
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        canaryUserIds: [CANARY],
        getUserId: async () => NON_CANARY,
      })
    );
    expect(result.ok).toBe(true);
  });

  it("production URL + canary user + auth fail → unauthenticated が先（canary 判定に到達しない）", async () => {
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        env: { ...defaultDeps().env, supabaseUrl: prodUrl },
        canaryUserIds: [CANARY],
        getUserId: async () => null,
        createAdapter,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unauthenticated");
    expect(callCount.value).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
describe("runExtractShiftDraft — invalid input（adapter 未呼出）", () => {
  it("header 未設定 → invalid_input", async () => {
    const fd = validFormData();
    fd.delete("header");
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(fd, defaultDeps({ createAdapter }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_input");
    expect(callCount.value).toBe(0);
  });

  it("personRow 未設定 → invalid_input", async () => {
    const fd = validFormData();
    fd.delete("personRow");
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(fd, defaultDeps({ createAdapter }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_input");
    expect(callCount.value).toBe(0);
  });

  it("invalid mime（text/plain）→ invalid_input", async () => {
    const fd = validFormData();
    fd.set("header", new Blob([new Uint8Array(128)], { type: "text/plain" }));
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(fd, defaultDeps({ createAdapter }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_input");
    expect(callCount.value).toBe(0);
  });

  it("image/png + image/jpeg は許可", async () => {
    const fd = validFormData();
    fd.set("personRow", new Blob([new Uint8Array(128)], { type: "image/jpeg" }));
    const result = await runExtractShiftDraft(fd, defaultDeps());
    expect(result.ok).toBe(true);
  });

  it("file size 超過（> 5MB）→ invalid_input", async () => {
    const fd = validFormData();
    fd.set(
      "header",
      new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "image/png" })
    );
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(fd, defaultDeps({ createAdapter }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_input");
    expect(callCount.value).toBe(0);
  });

  it("file size 0 → invalid_input", async () => {
    const fd = validFormData();
    fd.set("header", new Blob([], { type: "image/png" }));
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(fd, defaultDeps({ createAdapter }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_input");
    expect(callCount.value).toBe(0);
  });

  it("year 範囲外（2019）→ invalid_input", async () => {
    const fd = validFormData();
    fd.set("year", "2019");
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(fd, defaultDeps({ createAdapter }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_input");
    expect(callCount.value).toBe(0);
  });

  it("month 範囲外（13）→ invalid_input", async () => {
    const fd = validFormData();
    fd.set("month", "13");
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(fd, defaultDeps({ createAdapter }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_input");
    expect(callCount.value).toBe(0);
  });

  it("daysInMonth 範囲外（32）→ invalid_input", async () => {
    const fd = validFormData();
    fd.set("daysInMonth", "32");
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(fd, defaultDeps({ createAdapter }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_input");
    expect(callCount.value).toBe(0);
  });

  it("metadata が数値でない（year=abc）→ invalid_input", async () => {
    const fd = validFormData();
    fd.set("year", "abc");
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(fd, defaultDeps({ createAdapter }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_input");
    expect(callCount.value).toBe(0);
  });

  it("metadata に小数（month=5.5）→ invalid_input", async () => {
    const fd = validFormData();
    fd.set("month", "5.5");
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(fd, defaultDeps({ createAdapter }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_input");
    expect(callCount.value).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
describe("runExtractShiftDraft — adapter error mapping（safe）", () => {
  it("adapter throws DraftExtractionError(timeout) → timeout safe error", async () => {
    const RAW = "RAW_TIMEOUT_LEAK_SECRET";
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        createAdapter: () => ({
          extractChunk: async () => {
            throw new DraftExtractionError("timeout", RAW);
          },
        }),
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("timeout");
      expect(result.error.message).not.toContain(RAW);
      expect(result.error.message).not.toContain(API_KEY_CANARY);
    }
  });

  it("adapter throws DraftExtractionError(rate_limited) → rate_limited", async () => {
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        createAdapter: () => ({
          extractChunk: async () => {
            throw new DraftExtractionError("rate_limited", "x");
          },
        }),
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("rate_limited");
  });

  it("adapter throws DraftExtractionError(invalid_response) → invalid_response", async () => {
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        createAdapter: () => ({
          extractChunk: async () => {
            throw new DraftExtractionError("invalid_response", "x");
          },
        }),
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_response");
  });

  it("adapter throws DraftExtractionError(model_error) → model_error", async () => {
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        createAdapter: () => ({
          extractChunk: async () => {
            throw new DraftExtractionError("model_error", "x");
          },
        }),
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("model_error");
  });

  it("adapter が partial cells → runDraftExtraction が chunk_range_violation → safe error", async () => {
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        createAdapter: () => ({
          extractChunk: async (input) => {
            // dayRange の半分だけ返す → orchestrator が fail-hard
            const { from, to } = input.dayRange;
            const count = Math.max(1, Math.floor((to - from + 1) / 2));
            return Array.from({ length: count }, (_, i) => ({
              day: from + i,
              rawCode: "H",
              rowLabel: "本人",
            }));
          },
        }),
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("chunk_range_violation");
  });

  it("adapter throws non-DraftExtractionError → unknown safe error（raw 非露出）", async () => {
    const RAW = "RAW_DB_PASSWORD_LEAK_SECRET";
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        createAdapter: () => ({
          extractChunk: async () => {
            throw new Error(RAW);
          },
        }),
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("unknown");
      expect(result.error.message).not.toContain(RAW);
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe("runExtractShiftDraft — gate 順序の固定", () => {
  it("env_misconfigured（staging ref 不在）が先で、auth まで進まない", async () => {
    const getUserId = vi.fn(async () => "user-abc");
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(
      validFormData(),
      defaultDeps({
        env: { ...defaultDeps().env, supabaseUrl: "https://other.supabase.co" },
        getUserId,
        createAdapter,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("env_misconfigured");
    expect(getUserId).not.toHaveBeenCalled();
    expect(callCount.value).toBe(0);
  });

  it("auth が先で、FormData parse まで進まない（invalid FormData でも unauthenticated を返す）", async () => {
    const fd = validFormData();
    fd.delete("header"); // invalid input
    const { createAdapter, callCount } = makeSpyAdapter();
    const result = await runExtractShiftDraft(
      fd,
      defaultDeps({
        getUserId: async () => null,
        createAdapter,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unauthenticated");
    expect(callCount.value).toBe(0);
  });
});
