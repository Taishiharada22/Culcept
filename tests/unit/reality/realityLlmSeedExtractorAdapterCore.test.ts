import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  createLlmSeedExtractorAdapterCore,
  buildSeedExtractionPrompt,
  SEED_EXTRACTION_JSON_SCHEMA,
  type LlmSeedExtractorAdapterConfig,
  type RedactedExtractionObservation,
} from "@/lib/plan/reality/llm-seed-extractor-adapter-core";
import { validateExtractorOutput } from "@/lib/plan/reality/seed-extractor-contract";

function input(p: Record<string, unknown> = {}) {
  return { utterance: "今日カフェで仕事したい", nowIso: "2026-06-05T10:00:00Z", sourceRef: "chat-msg_1", ...p };
}
function geminiResponse(textObj: unknown, usageTokens = 42) {
  return {
    candidates: [{ content: { parts: [{ text: typeof textObj === "string" ? textObj : JSON.stringify(textObj) }] } }],
    usageMetadata: { totalTokenCount: usageTokens },
  };
}
function okFetch(textObj: unknown, usageTokens?: number): typeof globalThis.fetch {
  return (async () => ({ ok: true, status: 200, json: async () => geminiResponse(textObj, usageTokens) })) as unknown as typeof globalThis.fetch;
}
function statusFetch(status: number): typeof globalThis.fetch {
  return (async () => ({ ok: status >= 200 && status < 300, status, json: async () => ({}) })) as unknown as typeof globalThis.fetch;
}
function throwFetch(name?: string): typeof globalThis.fetch {
  return (async () => { const e = new Error("boom"); if (name) e.name = name; throw e; }) as unknown as typeof globalThis.fetch;
}
function jsonThrowFetch(): typeof globalThis.fetch {
  return (async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } })) as unknown as typeof globalThis.fetch;
}
function sequenceFetch(...responses: Array<{ status?: number; textObj?: unknown }>): { fetchImpl: typeof globalThis.fetch; calls: () => number } {
  let i = 0;
  const fetchImpl = (async () => {
    const r = responses[Math.min(i, responses.length - 1)]!;
    i++;
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => geminiResponse(r.textObj ?? {}) };
  }) as unknown as typeof globalThis.fetch;
  return { fetchImpl, calls: () => i };
}
function adapter(fetchImpl: typeof globalThis.fetch, extra: Partial<LlmSeedExtractorAdapterConfig> = {}) {
  return createLlmSeedExtractorAdapterCore({ apiKey: "k", model: "gemini-x", fetchImpl, sleep: async () => {}, now: () => 0, retryBackoffMs: 0, ...extra });
}

const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/llm-seed-extractor-adapter-core.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-5d-1 adapter core — outcome 分岐", () => {
  it("valid LLM JSON → extracted", async () => {
    const r = await adapter(okFetch({ hasActionableIntent: true, confidence: 0.9, desiredDate: "2026-06-06", desiredTimeHint: "morning", actionShape: "full_go" })).extract(input());
    expect(r.kind).toBe("extracted");
  });
  it("no actionable intent → no_intent", async () => {
    expect((await adapter(okFetch({ hasActionableIntent: false, confidence: 0.9 })).extract(input())).kind).toBe("no_intent");
  });
  it("low confidence（<閾値）→ no_intent", async () => {
    expect((await adapter(okFetch({ hasActionableIntent: true, confidence: 0.3 })).extract(input())).kind).toBe("no_intent");
  });
  it("malformed JSON → no_intent", async () => {
    expect((await adapter(okFetch("not json {{{")).extract(input())).kind).toBe("no_intent");
  });
  it("empty text → no_intent", async () => {
    expect((await adapter(okFetch("")).extract(input())).kind).toBe("no_intent");
  });
  it("res.json() throws → no_intent（invalid_response）", async () => {
    expect((await adapter(jsonThrowFetch()).extract(input())).kind).toBe("no_intent");
  });
  it("network error → no_intent（throw しない）", async () => {
    expect((await adapter(throwFetch()).extract(input())).kind).toBe("no_intent");
  });
  it("timeout（AbortError）→ no_intent（throw しない）", async () => {
    expect((await adapter(throwFetch("AbortError")).extract(input())).kind).toBe("no_intent");
  });
  it("model error（500）→ no_intent", async () => {
    expect((await adapter(statusFetch(500)).extract(input())).kind).toBe("no_intent");
  });
});

describe("A1-5-5d-1 adapter core — duration map（explicit/inferred/strip）", () => {
  it("explicit duration → explicitDuration.confidence=high", async () => {
    const r = await adapter(okFetch({ hasActionableIntent: true, confidence: 0.9, duration: { durationMin: 60, kind: "explicit" } })).extract(input());
    expect(r.kind).toBe("extracted");
    if (r.kind === "extracted") {
      expect((r.raw as { explicitDuration?: unknown }).explicitDuration).toEqual({ durationMin: 60, confidence: "high" });
      expect(JSON.stringify(r.raw)).not.toContain("kind"); // durationKind は strip
    }
  });
  it("inferred duration → confidence=low（evidence 化されない）", async () => {
    const r = await adapter(okFetch({ hasActionableIntent: true, confidence: 0.9, duration: { durationMin: 60, kind: "inferred" } })).extract(input());
    if (r.kind === "extracted") expect((r.raw as { explicitDuration?: { confidence: string } }).explicitDuration?.confidence).toBe("low");
  });
  it("kind 欠落/不明 → 保守的に low（explicit のみ high）", async () => {
    const r = await adapter(okFetch({ hasActionableIntent: true, confidence: 0.9, duration: { durationMin: 60 } })).extract(input());
    if (r.kind === "extracted") expect((r.raw as { explicitDuration?: { confidence: string } }).explicitDuration?.confidence).toBe("low");
  });
  it("invalid duration（>1440 explicit）→ adapter は出すが validateExtractorOutput が落とす", async () => {
    const r = await adapter(okFetch({ hasActionableIntent: true, confidence: 0.9, duration: { durationMin: 2000, kind: "explicit" } })).extract(input());
    expect(r.kind).toBe("extracted");
    if (r.kind === "extracted") expect(validateExtractorOutput(r.raw).ok).toBe(false);
  });
});

describe("A1-5-5d-1 adapter core — raw 非漏洩 / validateExtractorOutput 通過", () => {
  it("LLM 余剰 raw field は出力に混入しない（contract フィールドのみ）", async () => {
    const r = await adapter(okFetch({ hasActionableIntent: true, confidence: 0.9, signal: "SIGNAL_LEAK", title: "TITLE_LEAK", prompt: "PROMPT_LEAK", transcript: "TRANSCRIPT_LEAK", desiredAction: "ACTION_LEAK" })).extract(input());
    expect(r.kind).toBe("extracted");
    if (r.kind === "extracted") {
      const json = JSON.stringify(r.raw);
      for (const leak of ["SIGNAL_LEAK", "TITLE_LEAK", "PROMPT_LEAK", "TRANSCRIPT_LEAK", "ACTION_LEAK", "signal", "desiredAction", "transcript"]) {
        expect(json).not.toContain(leak);
      }
      expect(validateExtractorOutput(r.raw).ok).toBe(true); // raw なし → 通過
    }
  });
  it("adapter output が validateExtractorOutput を通る（valid 構造）", async () => {
    const r = await adapter(okFetch({ hasActionableIntent: true, confidence: 0.9, desiredDate: "2026-06-06", desiredTimeHint: "morning", actionShape: "full_go", duration: { durationMin: 60, kind: "explicit" } })).extract(input());
    expect(r.kind).toBe("extracted");
    if (r.kind === "extracted") {
      const v = validateExtractorOutput(r.raw);
      expect(v.ok).toBe(true);
      if (v.ok) {
        expect(v.output.source).toBe("chat");
        expect(v.output.sourceRef).toBe("chat-msg_1"); // opaque を input から注入
        expect(v.output.explicitDuration).toEqual({ durationMin: 60, confidence: "high" });
      }
    }
  });
  it("utterance(raw) が result / observation に出ない", async () => {
    const SENTINEL = "RAW_UTTERANCE_SENTINEL_xyz";
    const obs: RedactedExtractionObservation[] = [];
    const r = await adapter(okFetch({ hasActionableIntent: true, confidence: 0.9 }), { onObservation: (o) => obs.push(o) }).extract(input({ utterance: SENTINEL }));
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
    expect(JSON.stringify(obs)).not.toContain(SENTINEL);
  });
});

describe("A1-5-5d-1 adapter core — observation / retry / auth", () => {
  it("redacted observation（outcome/reason/tokenUsage/latencyMs）", async () => {
    const obs: RedactedExtractionObservation[] = [];
    let t = 1000;
    await createLlmSeedExtractorAdapterCore({ apiKey: "k", model: "m", fetchImpl: okFetch({ hasActionableIntent: true, confidence: 0.9 }, 123), sleep: async () => {}, now: () => { const v = t; t += 5; return v; }, onObservation: (o) => obs.push(o) }).extract(input());
    expect(obs.length).toBe(1);
    expect(obs[0]?.outcome).toBe("extracted");
    expect(obs[0]?.reason).toBe("ok");
    expect(obs[0]?.tokenUsage).toBe(123);
    expect(obs[0]?.latencyMs).toBe(5);
  });
  it("network error observation → reason=network_error / outcome=no_intent", async () => {
    const obs: RedactedExtractionObservation[] = [];
    await adapter(throwFetch(), { onObservation: (o) => obs.push(o) }).extract(input());
    expect(obs[0]?.outcome).toBe("no_intent");
    expect(obs[0]?.reason).toBe("network_error");
  });
  it("429 → retry → 200 → extracted（attempts=2）", async () => {
    const seq = sequenceFetch({ status: 429 }, { status: 200, textObj: { hasActionableIntent: true, confidence: 0.9 } });
    const r = await adapter(seq.fetchImpl, { maxRetry: 2 }).extract(input());
    expect(r.kind).toBe("extracted");
    expect(seq.calls()).toBe(2);
  });
  it("429 exhausted → no_intent", async () => {
    const seq = sequenceFetch({ status: 429 }, { status: 429 }, { status: 429 });
    const r = await adapter(seq.fetchImpl, { maxRetry: 1 }).extract(input());
    expect(r.kind).toBe("no_intent");
  });
  it("auth missing（apiKey 空）→ no_intent・fetch 未呼出", async () => {
    const seq = sequenceFetch({ status: 200, textObj: { hasActionableIntent: true, confidence: 0.9 } });
    const r = await createLlmSeedExtractorAdapterCore({ apiKey: "", model: "m", fetchImpl: seq.fetchImpl, now: () => 0 }).extract(input());
    expect(r.kind).toBe("no_intent");
    expect(seq.calls()).toBe(0);
  });
});

describe("A1-5-5d-1 adapter core — prompt builder / schema（pure）", () => {
  it("buildSeedExtractionPrompt は pure string・utterance/nowIso を含む", () => {
    const p = buildSeedExtractionPrompt({ utterance: "明日朝カフェ", nowIso: "2026-06-05T10:00:00Z" });
    expect(typeof p).toBe("string");
    expect(p).toContain("明日朝カフェ");
    expect(p).toContain("2026-06-05T10:00:00Z");
    expect(p).toContain("hasActionableIntent");
  });
  it("SEED_EXTRACTION_JSON_SCHEMA は required を持つ", () => {
    expect(SEED_EXTRACTION_JSON_SCHEMA.required).toContain("hasActionableIntent");
    expect(SEED_EXTRACTION_JSON_SCHEMA.required).toContain("confidence");
  });
});

describe("A1-5-5d-1 adapter core — 静的安全（SDK / network / DB 0）", () => {
  it("LLM SDK を import しない（openai/anthropic/@google/generative-ai/GoogleGenerativeAI）", () => {
    for (const t of ["openai", "anthropic", "@google/generative-ai", "GoogleGenerativeAI", "@anthropic-ai"]) {
      expect(CODE).not.toContain(t);
    }
  });
  it("Supabase / DB を持たない（createClient/@supabase/.from/.rpc/.insert）", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert("]) {
      expect(CODE).not.toContain(t);
    }
  });
  it("fetchImpl DI を持つ（network 外出し）", () => {
    expect(CODE).toContain("fetchImpl");
  });
  it("reality barrel(index.ts) が llm-seed-extractor-adapter-core を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/index.ts"), "utf8");
    expect(idx).not.toContain("llm-seed-extractor-adapter-core");
  });
});
