import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  runCaptureService,
  type CaptureServiceInput,
  type CaptureServiceDeps,
} from "@/lib/plan/reality/integration/capture-service";
import {
  createExtractedFakeExtractor,
  createNoIntentExtractor,
  type SeedExtractor,
  type ExtractorResult,
} from "@/lib/plan/reality/seed-extractor-contract";
import {
  createFakeCaptureWriteClient,
  createNoRunCaptureWriteClient,
  type FakeCaptureWriteClient,
} from "@/lib/plan/reality/integration/capture-write-repository";
import type { CaptureGateInput } from "@/lib/plan/reality/capture-gate";

const STAGING_URL = "https://hjcrvndumgiovyfdacwc.supabase.co";
const PROD_URL = "https://aljavfujeqcwnqryjmhl.supabase.co";
const USER = "11111111-1111-1111-1111-111111111111";
const SEED = "22222222-2222-2222-2222-222222222222";
const CAP = "2026-06-05T10:00:00Z";
const RAW_UTTERANCE = "RAW_UTTERANCE_SENTINEL_発話本文";

function gate(p: Partial<CaptureGateInput> = {}): CaptureGateInput {
  return { liveEnabled: true, killed: false, nodeEnv: "development", supabaseUrl: STAGING_URL, requestedUserId: USER, canaryUserIds: [USER], ...p };
}
function input(gateP: Partial<CaptureGateInput> = {}): CaptureServiceInput {
  return { gate: gate(gateP), extraction: { utterance: RAW_UTTERANCE, nowIso: CAP, sourceRef: "chat-msg_1" }, seedId: SEED, capturedAt: CAP };
}
// extractor の呼び出し回数を数える wrapper
function counting(result: ExtractorResult): { extractor: SeedExtractor; calls: () => number } {
  let calls = 0;
  return { extractor: { async extract() { calls++; return result; } }, calls: () => calls };
}
const VALID_HIGH = { confidence: 0.9, source: "chat", desiredDate: "2026-06-06", desiredTimeHint: "morning", actionShape: "full_go", explicitDuration: { durationMin: 60, confidence: "high" } };
const VALID_NONE = { confidence: 0.9, source: "chat", desiredDate: "2026-06-06", desiredTimeHint: "morning", actionShape: "full_go" };
const VALID_LOW = { ...VALID_NONE, explicitDuration: { durationMin: 60, confidence: "low" } };

const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/capture-service.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-5c capture service — gate block → extractor call 0 / write 0", () => {
  const cases: Array<[string, Partial<CaptureGateInput>, string]> = [
    ["flag off", { liveEnabled: false }, "FLAG_OFF"],
    ["kill switch", { killed: true, liveEnabled: true }, "KILLED"],
    ["production nodeEnv", { nodeEnv: "production" }, "PRODUCTION_NODE_ENV"],
    ["non-staging(prod) ref", { supabaseUrl: PROD_URL }, "PRODUCTION_PROJECT_REF"],
    ["non-staging(other) ref", { supabaseUrl: "https://abcdefghij0123456789.supabase.co" }, "NON_STAGING_PROJECT_REF"],
    ["canary 外", { canaryUserIds: ["99999999-9999-9999-9999-999999999999"] }, "USER_NOT_CANARY"],
  ];
  for (const [name, gateP, reason] of cases) {
    it(`${name} → extractor 0 / write 0 / gate_blocked(${reason})`, async () => {
      const ext = counting({ kind: "extracted", raw: VALID_HIGH });
      const fake = createFakeCaptureWriteClient();
      const r = await runCaptureService(input(gateP), { extractor: ext.extractor, writeClient: fake });
      expect(r.outcome).toBe("gate_blocked");
      if (r.outcome === "gate_blocked") expect(r.reason).toBe(reason);
      expect(ext.calls()).toBe(0); // extractor 未呼出
      expect(fake.writes.length).toBe(0); // write 0
    });
  }
});

describe("A1-5-5c capture service — gate allow + no-op（write 0）", () => {
  it("no_intent → extractor 1 / write 0", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureService(input(), { extractor: createNoIntentExtractor(), writeClient: fake });
    expect(r.outcome).toBe("no_intent");
    expect(fake.writes.length).toBe(0);
  });
  it("invalid output（confidence 範囲外）→ write 0 / invalid_extraction", async () => {
    const ext = counting({ kind: "extracted", raw: { confidence: 5, source: "chat" } });
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureService(input(), { extractor: ext.extractor, writeClient: fake });
    expect(r.outcome).toBe("invalid_extraction");
    expect(ext.calls()).toBe(1);
    expect(fake.writes.length).toBe(0);
  });
  it("raw field 混入 → write 0 / invalid_extraction(raw_field_present)・result に field 名出さない", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureService(input(), { extractor: createExtractedFakeExtractor({ ...VALID_NONE, signal: "RAW値" }), writeClient: fake });
    expect(r.outcome).toBe("invalid_extraction");
    if (r.outcome === "invalid_extraction") expect(r.reason).toBe("raw_field_present");
    expect(fake.writes.length).toBe(0);
    expect(JSON.stringify(r)).not.toContain("signal");
  });
});

describe("A1-5-5c capture service — gate allow + valid → no-run write 1 回", () => {
  it("valid high duration → write 1 / wroteEvidence true / captured", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureService(input(), { extractor: createExtractedFakeExtractor(VALID_HIGH), writeClient: fake });
    expect(r.outcome).toBe("captured");
    if (r.outcome === "captured") expect(r.wroteEvidence).toBe(true);
    expect(fake.writes.length).toBe(1);
    expect(fake.writes[0]?.evidence).not.toBeNull();
    expect(fake.writes[0]?.seed.id).toBe(SEED);
    expect(fake.writes[0]?.seed.user_id).toBe(USER);
  });
  it("valid duration なし → write 1 / wroteEvidence false", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureService(input(), { extractor: createExtractedFakeExtractor(VALID_NONE), writeClient: fake });
    expect(r.outcome).toBe("captured");
    if (r.outcome === "captured") expect(r.wroteEvidence).toBe(false);
    expect(fake.writes.length).toBe(1);
    expect(fake.writes[0]?.evidence).toBeNull();
  });
  it("valid low duration → write 1 / wroteEvidence false（mapper が low を evidence 化しない）", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureService(input(), { extractor: createExtractedFakeExtractor(VALID_LOW), writeClient: fake });
    expect(r.outcome).toBe("captured");
    if (r.outcome === "captured") expect(r.wroteEvidence).toBe(false);
    expect(fake.writes.length).toBe(1);
    expect(fake.writes[0]?.evidence).toBeNull();
  });
  it("no-run write client → write_failed(no_run)（実 DB 接続 0）", async () => {
    const r = await runCaptureService(input(), { extractor: createExtractedFakeExtractor(VALID_HIGH), writeClient: createNoRunCaptureWriteClient() });
    expect(r.outcome).toBe("write_failed");
    if (r.outcome === "write_failed") expect(r.code).toBe("no_run");
  });
});

describe("A1-5-5c capture service — raw 非漏洩 / redacted result", () => {
  it("service result に raw utterance / signal / desiredAction / prompt / transcript が出ない", async () => {
    const fake: FakeCaptureWriteClient = createFakeCaptureWriteClient();
    // raw utterance + raw field 混入 input
    const inp: CaptureServiceInput = { ...input(), extraction: { utterance: RAW_UTTERANCE, nowIso: CAP } };
    const r1 = await runCaptureService(inp, { extractor: createExtractedFakeExtractor({ ...VALID_HIGH, signal: RAW_UTTERANCE, prompt: "p", transcript: "t", desiredAction: "x" }), writeClient: fake });
    const r2 = await runCaptureService(input(), { extractor: createExtractedFakeExtractor(VALID_HIGH), writeClient: fake });
    for (const r of [r1, r2]) {
      const json = JSON.stringify(r);
      for (const leak of [RAW_UTTERANCE, "signal", "desiredAction", "prompt", "transcript", "utterance", "raw_text"]) {
        expect(json).not.toContain(leak);
      }
    }
  });
  it("captured result は { outcome, wroteEvidence } のみ（seedId/userId/raw を含まない）", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureService(input(), { extractor: createExtractedFakeExtractor(VALID_HIGH), writeClient: fake });
    expect(Object.keys(r).sort()).toEqual(["outcome", "wroteEvidence"]);
    expect(JSON.stringify(r)).not.toContain(SEED);
    expect(JSON.stringify(r)).not.toContain(USER);
  });
});

describe("A1-5-5c capture service — 静的安全（LLM SDK / Supabase / DB / runtime 0）", () => {
  it("LLM SDK を import しない（openai / anthropic / gemini）", () => {
    expect(CODE).not.toContain("openai");
    expect(CODE).not.toContain("anthropic");
    expect(CODE).not.toContain("gemini");
  });
  it("Supabase createClient / 実 DB を持たない（createClient / @supabase / .from / .rpc / .insert）", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert(", ".update(", ".delete("]) {
      expect(CODE).not.toContain(t);
    }
  });
  it("service_role を持たない", () => {
    expect(CODE).not.toContain("service_role");
  });
  it("server-only 境界を宣言（orchestrator と同じ server 境界）", () => {
    expect(CODE).toContain("server-only");
  });
  it("barrel(integration/index.ts) が capture-service を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("capture-service");
  });
});
