import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  resolveCaptureLlmConfig,
  buildServerLlmSeedExtractor,
  createUnavailableSeedExtractor,
  CAPTURE_LLM_ENV,
} from "@/lib/plan/reality/llm-seed-extractor-adapter.server";

const PRESENT_ENV = { [CAPTURE_LLM_ENV.apiKey]: "SECRET_API_KEY_xyz", [CAPTURE_LLM_ENV.model]: "gemini-x" };
// extract を呼ぶと throw する spy fetch（注入されるが呼ばれないことの実証用）
function throwingFetch(): { fetchImpl: typeof globalThis.fetch; called: () => boolean } {
  let called = false;
  const fetchImpl = (async () => { called = true; throw new Error("fetch must not be called in A1-5-5d-2a"); }) as unknown as typeof globalThis.fetch;
  return { fetchImpl, called: () => called };
}

const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/llm-seed-extractor-adapter.server.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-5d-2a host — resolveCaptureLlmConfig（env 解決・fail-closed）", () => {
  it("apiKey/model 両方欠落 → null（fail-closed）", () => {
    expect(resolveCaptureLlmConfig({})).toBeNull();
  });
  it("apiKey のみ / model のみ → null（両方必須）", () => {
    expect(resolveCaptureLlmConfig({ [CAPTURE_LLM_ENV.apiKey]: "k" })).toBeNull();
    expect(resolveCaptureLlmConfig({ [CAPTURE_LLM_ENV.model]: "m" })).toBeNull();
  });
  it("空白 apiKey/model → null", () => {
    expect(resolveCaptureLlmConfig({ [CAPTURE_LLM_ENV.apiKey]: "  ", [CAPTURE_LLM_ENV.model]: "m" })).toBeNull();
    expect(resolveCaptureLlmConfig({ [CAPTURE_LLM_ENV.apiKey]: "k", [CAPTURE_LLM_ENV.model]: "" })).toBeNull();
  });
  it("apiKey/model 揃う → config（apiKey/model 反映）", () => {
    const cfg = resolveCaptureLlmConfig(PRESENT_ENV);
    expect(cfg).not.toBeNull();
    expect(cfg?.apiKey).toBe("SECRET_API_KEY_xyz");
    expect(cfg?.model).toBe("gemini-x");
  });
  it("timeout / maxRetry / confidenceThreshold が config に反映される", () => {
    const cfg = resolveCaptureLlmConfig({
      ...PRESENT_ENV,
      [CAPTURE_LLM_ENV.timeoutMs]: "5000",
      [CAPTURE_LLM_ENV.maxRetry]: "1",
      [CAPTURE_LLM_ENV.confidenceThreshold]: "0.7",
    });
    expect(cfg?.timeoutMs).toBe(5000);
    expect(cfg?.maxRetry).toBe(1);
    expect(cfg?.confidenceThreshold).toBe(0.7);
  });
  it("optional が不正値 → undefined（core 既定・fail-soft）", () => {
    const cfg = resolveCaptureLlmConfig({
      ...PRESENT_ENV,
      [CAPTURE_LLM_ENV.timeoutMs]: "abc",
      [CAPTURE_LLM_ENV.confidenceThreshold]: "5", // [0,1] 外
    });
    expect(cfg?.timeoutMs).toBeUndefined();
    expect(cfg?.confidenceThreshold).toBeUndefined();
  });
  it("config の key は apiKey/model(+optional) のみ（secret は apiKey フィールドのみ）", () => {
    const cfg = resolveCaptureLlmConfig(PRESENT_ENV);
    expect(Object.keys(cfg ?? {}).sort()).toEqual(["apiKey", "model"]);
  });
});

describe("A1-5-5d-2a host — buildServerLlmSeedExtractor（env missing → no-op / present → core・no-call）", () => {
  it("env missing → no-op extractor（extract→no_intent・fetch 未呼出）", async () => {
    const f = throwingFetch();
    const ext = buildServerLlmSeedExtractor({}, f.fetchImpl);
    const r = await ext.extract({ utterance: "x", nowIso: "2026-06-05T10:00:00Z", sourceRef: "y" });
    expect(r.kind).toBe("no_intent");
    expect(f.called()).toBe(false); // no-op は fetch しない
  });
  it("env present → extractor を組む（extract は呼ばない＝fetchImpl 注入されるが未呼出）", () => {
    const f = throwingFetch();
    const ext = buildServerLlmSeedExtractor(PRESENT_ENV, f.fetchImpl);
    expect(typeof ext.extract).toBe("function");
    expect(f.called()).toBe(false); // 組むだけ・extract 未呼出 → fetch 未呼出
    // present であること（= 実 core 経路）を resolver で確認
    expect(resolveCaptureLlmConfig(PRESENT_ENV)).not.toBeNull();
  });
  it("createUnavailableSeedExtractor は常に no_intent（fetch しない）", async () => {
    const r = await createUnavailableSeedExtractor().extract({ utterance: "x", nowIso: "t", sourceRef: "y" });
    expect(r.kind).toBe("no_intent");
  });
});

describe("A1-5-5d-2a host — secret 非漏洩", () => {
  it("extractor object に apiKey が出ない（JSON 化で関数のみ・secret 非出）", () => {
    const f = throwingFetch();
    const ext = buildServerLlmSeedExtractor(PRESENT_ENV, f.fetchImpl);
    expect(JSON.stringify(ext)).not.toContain("SECRET_API_KEY_xyz");
  });
  it("host source が apiKey を log/throw 文に埋め込まない（console 不在・apiKey を message 化しない）", () => {
    expect(CODE).not.toContain("console.");
    // throw は core 委譲・host は apiKey を含む文字列を組まない
    expect(CODE).not.toContain("apiKey}`");
    expect(CODE).not.toContain("${apiKey");
  });
});

describe("A1-5-5d-2a host — env 名", () => {
  it("CAPTURE_LLM_ENV は REALITY_CAPTURE_LLM_* server-side env", () => {
    expect(CAPTURE_LLM_ENV.apiKey).toBe("REALITY_CAPTURE_LLM_API_KEY");
    expect(CAPTURE_LLM_ENV.model).toBe("REALITY_CAPTURE_LLM_MODEL");
    expect(CAPTURE_LLM_ENV.timeoutMs).toBe("REALITY_CAPTURE_LLM_TIMEOUT_MS");
    expect(CAPTURE_LLM_ENV.maxRetry).toBe("REALITY_CAPTURE_LLM_MAX_RETRY");
    expect(CAPTURE_LLM_ENV.confidenceThreshold).toBe("REALITY_CAPTURE_LLM_CONFIDENCE_THRESHOLD");
    // NEXT_PUBLIC でない（client 露出しない）
    for (const v of Object.values(CAPTURE_LLM_ENV)) expect(v.startsWith("NEXT_PUBLIC")).toBe(false);
  });
});

describe("A1-5-5d-2a host — 静的安全（SDK/network/DB/route/UI 0・server-only）", () => {
  it("server-only を宣言", () => {
    expect(CODE).toContain("server-only");
  });
  it("fetchImpl=globalThis.fetch を注入する設計", () => {
    expect(CODE).toContain("globalThis.fetch");
  });
  it("LLM SDK を import しない", () => {
    for (const t of ["openai", "anthropic", "@google/generative-ai", "GoogleGenerativeAI"]) expect(CODE).not.toContain(t);
  });
  it("Supabase / DB を持たない", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert("]) expect(CODE).not.toContain(t);
  });
  it("route / UI を import しない（next/ ・app/ ・react 不在）", () => {
    for (const t of ['from "next/', 'from "@/app/', 'from "react"', "PlanClient"]) expect(CODE).not.toContain(t);
  });
  it("reality barrel(index.ts) が host を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/index.ts"), "utf8");
    expect(idx).not.toContain("llm-seed-extractor-adapter.server");
  });
  it("core 本体（llm-seed-extractor-adapter-core.ts）を import するが書き換えない（host は core を呼ぶだけ）", () => {
    expect(CODE).toContain("createLlmSeedExtractorAdapterCore");
  });
});
