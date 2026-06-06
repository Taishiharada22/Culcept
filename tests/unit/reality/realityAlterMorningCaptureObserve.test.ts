import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  resolveMorningObserveGate,
  runMorningCaptureObserve,
  decideCaptureMode,
  setCaptureObserveSink,
  resetCaptureObserveSink,
  emitCaptureObserve,
} from "@/lib/plan/reality/integration/alter-morning-capture-observe";
import type { CaptureRouteRunnerResult } from "@/lib/plan/reality/integration/capture-route-runner";
import { createFakeCaptureWriteClient } from "@/lib/plan/reality/integration/capture-write-repository";
import { createRpcCaptureWriteClient, createFakeRpcClient, CAPTURE_RPC_NAME } from "@/lib/plan/reality/integration/capture-rpc-adapter";
import type { SeedExtractor, ExtractorResult } from "@/lib/plan/reality/seed-extractor-contract";
import type { CaptureGateInput } from "@/lib/plan/reality/capture-gate";
import type { CaptureServiceDeps } from "@/lib/plan/reality/integration/capture-service";

const STAGING_URL = "https://hjcrvndumgiovyfdacwc.supabase.co";
const PROD_URL = "https://aljavfujeqcwnqryjmhl.supabase.co";
const USER = "11111111-1111-1111-1111-111111111111";
const RAW = "RAW_UTTERANCE_SENTINEL_発話本文";
const OPTS = { seedId: "22222222-2222-2222-2222-222222222222", nowIso: "2026-06-06T10:00:00Z" };

function gate(p: Partial<CaptureGateInput> = {}): CaptureGateInput {
  return { liveEnabled: true, killed: false, nodeEnv: "development", supabaseUrl: STAGING_URL, requestedUserId: USER, canaryUserIds: [USER], ...p };
}
function counting(result: ExtractorResult): { extractor: SeedExtractor; calls: () => number } {
  let calls = 0;
  return { extractor: { async extract() { calls++; return result; } }, calls: () => calls };
}
function deps(extractor: SeedExtractor, fake = createFakeCaptureWriteClient()): { deps: CaptureServiceDeps; fake: ReturnType<typeof createFakeCaptureWriteClient> } {
  return { deps: { extractor, writeClient: fake }, fake };
}
const VALID_HIGH = { confidence: 0.9, source: "chat", desiredDate: "2026-06-07", desiredTimeHint: "morning", actionShape: "full_go", explicitDuration: { durationMin: 60, confidence: "high" } };

const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/alter-morning-capture-observe.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-5g-2 resolveMorningObserveGate（pure）", () => {
  it("flagEnabled → liveEnabled / 他フィールド透過", () => {
    const g = resolveMorningObserveGate({ flagEnabled: true, killed: false, nodeEnv: "development", supabaseUrl: STAGING_URL, userId: USER, canaryUserIds: [USER] });
    expect(g).toEqual({ liveEnabled: true, killed: false, nodeEnv: "development", supabaseUrl: STAGING_URL, requestedUserId: USER, canaryUserIds: [USER] });
  });
  it("flagEnabled false → liveEnabled false / killed 透過", () => {
    const g = resolveMorningObserveGate({ flagEnabled: false, killed: true, nodeEnv: "production", supabaseUrl: PROD_URL, userId: USER, canaryUserIds: [] });
    expect(g.liveEnabled).toBe(false);
    expect(g.killed).toBe(true);
  });
});

describe("A1-5-5g-4 decideCaptureMode（pure・kill>LIVE>OBSERVE>none）", () => {
  it("kill 最優先 → null（LIVE/OBSERVE 無視）", () => {
    expect(decideCaptureMode({ killed: true, live: true, observe: true })).toBeNull();
  });
  it("LIVE（kill なし）→ write", () => {
    expect(decideCaptureMode({ killed: false, live: true, observe: false })).toBe("write");
  });
  it("LIVE 優先（LIVE+OBSERVE）→ write", () => {
    expect(decideCaptureMode({ killed: false, live: true, observe: true })).toBe("write");
  });
  it("OBSERVE のみ → observe", () => {
    expect(decideCaptureMode({ killed: false, live: false, observe: true })).toBe("observe");
  });
  it("両 flag off → null（no-op・production default）", () => {
    expect(decideCaptureMode({ killed: false, live: false, observe: false })).toBeNull();
  });
});

describe("A1-5-5g-4 runMorningCaptureObserve（write mode・real RPC client は fake で DB 0）", () => {
  it("mode=write + RPC client(fake) + valid → captured / RPC 1 回 / DB write 0", async () => {
    const rpc = createFakeRpcClient();
    const writeClient = createRpcCaptureWriteClient(rpc);
    const ext = counting({ kind: "extracted", raw: VALID_HIGH });
    const r = await runMorningCaptureObserve(RAW, gate(), { extractor: ext.extractor, writeClient }, { ...OPTS, mode: "write" });
    expect(r.mode).toBe("write");
    expect(r.summary?.outcome).toBe("captured");
    expect(r.summary?.wouldEvidence).toBe(true);
    expect(ext.calls()).toBe(1);
    expect(rpc.calls).toHaveLength(1); // create_plan_seed_capture_bundle 1 回（fake=実 DB 0）
    expect(rpc.calls[0].fn).toBe(CAPTURE_RPC_NAME);
    expect(rpc.calls[0].args.p_seed.id).toBe(OPTS.seedId); // seed draft に seedId
  });
  it("mode=write + gate block（production ref）→ RPC 0 / extractor 0（production hard block）", async () => {
    const rpc = createFakeRpcClient();
    const writeClient = createRpcCaptureWriteClient(rpc);
    const ext = counting({ kind: "extracted", raw: VALID_HIGH });
    const r = await runMorningCaptureObserve(RAW, gate({ supabaseUrl: PROD_URL }), { extractor: ext.extractor, writeClient }, { ...OPTS, mode: "write" });
    expect(r.summary?.outcome).toBe("gate_blocked");
    expect(ext.calls()).toBe(0);
    expect(rpc.calls).toHaveLength(0); // production → RPC 0
  });
  it("mode=write + RPC client(fake) でも result に raw/seedId が出ない", async () => {
    const rpc = createFakeRpcClient();
    const r = await runMorningCaptureObserve(RAW, gate(), { extractor: counting({ kind: "extracted", raw: { ...VALID_HIGH, signal: RAW } }).extractor, writeClient: createRpcCaptureWriteClient(rpc) }, { ...OPTS, mode: "write" });
    const json = JSON.stringify(r);
    for (const leak of [RAW, "signal", OPTS.seedId]) expect(json).not.toContain(leak);
  });
});

describe("A1-5-5g-2 runMorningCaptureObserve（DI・observe-only）", () => {
  it("observe ON + canary + staging + valid → wouldCapture true / wouldEvidence true / dry-run write 1 / extractor 1", async () => {
    const ext = counting({ kind: "extracted", raw: VALID_HIGH });
    const { deps: d, fake } = deps(ext.extractor);
    const r = await runMorningCaptureObserve(RAW, gate(), d, OPTS);
    expect(r.mode).toBe("observe");
    expect(r.summary?.wouldCapture).toBe(true);
    expect(r.summary?.wouldEvidence).toBe(true);
    expect(ext.calls()).toBe(1);
    expect(fake.writes.length).toBe(1); // dry-run（実 DB 0）
  });
  it("flag off（liveEnabled false）→ extractor 0 / write 0 / wouldCapture false", async () => {
    const ext = counting({ kind: "extracted", raw: VALID_HIGH });
    const { deps: d, fake } = deps(ext.extractor);
    const r = await runMorningCaptureObserve(RAW, gate({ liveEnabled: false }), d, OPTS);
    expect(r.summary?.outcome).toBe("gate_blocked");
    expect(r.summary?.wouldCapture).toBe(false);
    expect(ext.calls()).toBe(0);
    expect(fake.writes.length).toBe(0);
  });
  it("production ref（aljav）→ extractor 0 / write 0（production hard block）", async () => {
    const ext = counting({ kind: "extracted", raw: VALID_HIGH });
    const { deps: d, fake } = deps(ext.extractor);
    const r = await runMorningCaptureObserve(RAW, gate({ supabaseUrl: PROD_URL }), d, OPTS);
    expect(r.summary?.outcome).toBe("gate_blocked");
    expect(ext.calls()).toBe(0);
    expect(fake.writes.length).toBe(0);
  });
  it("canary 外 → extractor 0 / write 0", async () => {
    const ext = counting({ kind: "extracted", raw: VALID_HIGH });
    const { deps: d, fake } = deps(ext.extractor);
    const r = await runMorningCaptureObserve(RAW, gate({ canaryUserIds: ["99999999-9999-9999-9999-999999999999"] }), d, OPTS);
    expect(r.summary?.wouldCapture).toBe(false);
    expect(ext.calls()).toBe(0);
    expect(fake.writes.length).toBe(0);
  });
  it("kill ON → extractor 0 / write 0", async () => {
    const ext = counting({ kind: "extracted", raw: VALID_HIGH });
    const { deps: d, fake } = deps(ext.extractor);
    const r = await runMorningCaptureObserve(RAW, gate({ killed: true }), d, OPTS);
    expect(r.summary?.outcome).toBe("gate_blocked");
    expect(ext.calls()).toBe(0);
    expect(fake.writes.length).toBe(0);
  });
  it("no_intent → wouldCapture false / write 0", async () => {
    const { deps: d, fake } = deps({ async extract() { return { kind: "no_intent" }; } });
    const r = await runMorningCaptureObserve(RAW, gate(), d, OPTS);
    expect(r.summary?.outcome).toBe("no_intent");
    expect(fake.writes.length).toBe(0);
  });
  it("raw field 混入 → invalid_extraction / write 0", async () => {
    const { deps: d, fake } = deps(counting({ kind: "extracted", raw: { confidence: 0.9, source: "chat", signal: "RAW" } }).extractor);
    const r = await runMorningCaptureObserve(RAW, gate(), d, OPTS);
    expect(r.summary?.outcome).toBe("invalid_extraction");
    expect(fake.writes.length).toBe(0);
  });
  it("extractor throw でも runner never-throw（observer_error・raw 非含有）", async () => {
    const throwing: SeedExtractor = { async extract() { throw new Error("boom " + RAW); } };
    const { deps: d } = deps(throwing);
    const r = await runMorningCaptureObserve(RAW, gate(), d, OPTS);
    expect(r.observed).toBe(false);
    expect(r.note).toBe("observer_error");
    expect(JSON.stringify(r)).not.toContain(RAW);
  });
  it("result に raw utterance / signal / prompt が出ない", async () => {
    const { deps: d } = deps(counting({ kind: "extracted", raw: { ...VALID_HIGH, signal: RAW, prompt: "p" } }).extractor);
    const r = await runMorningCaptureObserve(RAW, gate(), d, OPTS);
    const json = JSON.stringify(r);
    for (const leak of [RAW, "signal", "prompt", "transcript", "desiredAction"]) expect(json).not.toContain(leak);
  });
});

describe("A1-5-5g-3 redacted observation sink", () => {
  afterEach(() => resetCaptureObserveSink());
  const RESULT: CaptureRouteRunnerResult = {
    mode: "observe",
    observed: true,
    summary: { wouldCapture: true, wouldEvidence: true, outcome: "captured", reason: null },
    note: null,
  };

  it("setCaptureObserveSink → emitCaptureObserve が差し替え sink に redacted result を渡す", () => {
    const captured: CaptureRouteRunnerResult[] = [];
    setCaptureObserveSink((r) => captured.push(r));
    emitCaptureObserve(RESULT);
    expect(captured).toHaveLength(1);
    expect(captured[0].summary?.wouldCapture).toBe(true);
    expect(captured[0].summary?.wouldEvidence).toBe(true);
  });

  it("resetCaptureObserveSink → 既定 sink（redacted console.log）に戻る", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    setCaptureObserveSink(() => { throw new Error("should be replaced"); });
    resetCaptureObserveSink();
    emitCaptureObserve(RESULT);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe("[reality.capture.observe]");
    spy.mockRestore();
  });

  it("既定 sink の log payload は redacted（raw/prompt/response/apiKey なし・safe field のみ）", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    emitCaptureObserve(RESULT);
    const payload = spy.mock.calls[0][1] as string;
    expect(JSON.parse(payload)).toEqual({
      mode: "observe", observed: true, outcome: "captured", wouldCapture: true, wouldEvidence: true, reason: null, note: null,
    });
    for (const leak of ["utterance", "signal", "prompt", "response", "apiKey", "api_key", "raw"]) expect(payload).not.toContain(leak);
    spy.mockRestore();
  });

  it("emitCaptureObserve は sink が throw しても never-throw（route response 不変）", () => {
    setCaptureObserveSink(() => { throw new Error("sink boom"); });
    expect(() => emitCaptureObserve(RESULT)).not.toThrow();
  });
});

describe("A1-5-5g-2 helper — 静的安全", () => {
  it("server-only 宣言", () => {
    expect(CODE).toContain("server-only");
  });
  it("DB を直接持たない（createClient/@supabase/.from/.rpc/.insert 不在）", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert("]) expect(CODE).not.toContain(t);
  });
  it("observe write client は fake（dry-run）", () => {
    expect(CODE).toContain("createFakeCaptureWriteClient");
  });
  it("fire-and-forget（void + catch）", () => {
    expect(CODE).toContain("void runMorningCaptureObserve");
    expect(CODE).toContain(".catch(");
  });
  it("barrel(integration/index.ts) が再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("alter-morning-capture-observe");
  });
});
