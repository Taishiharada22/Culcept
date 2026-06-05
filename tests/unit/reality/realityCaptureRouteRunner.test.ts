import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  runCaptureRouteObserver,
  type CaptureRouteRunnerInput,
} from "@/lib/plan/reality/integration/capture-route-runner";
import { createFakeCaptureWriteClient } from "@/lib/plan/reality/integration/capture-write-repository";
import type { SeedExtractor, ExtractorResult } from "@/lib/plan/reality/seed-extractor-contract";
import type { CaptureGateInput } from "@/lib/plan/reality/capture-gate";

const STAGING_URL = "https://hjcrvndumgiovyfdacwc.supabase.co";
const USER = "11111111-1111-1111-1111-111111111111";
const SEED = "22222222-2222-2222-2222-222222222222";
const CAP = "2026-06-06T10:00:00Z";
const RAW_UTTERANCE = "RAW_UTTERANCE_SENTINEL_発話本文";

function gate(p: Partial<CaptureGateInput> = {}): CaptureGateInput {
  return { liveEnabled: true, killed: false, nodeEnv: "development", supabaseUrl: STAGING_URL, requestedUserId: USER, canaryUserIds: [USER], ...p };
}
function input(mode: "observe" | "write", gateP: Partial<CaptureGateInput> = {}): CaptureRouteRunnerInput {
  return { mode, gate: gate(gateP), extraction: { utterance: RAW_UTTERANCE, nowIso: CAP, sourceRef: "route-msg_1" }, seedId: SEED, capturedAt: CAP };
}
function counting(result: ExtractorResult): { extractor: SeedExtractor; calls: () => number } {
  let calls = 0;
  return { extractor: { async extract() { calls++; return result; } }, calls: () => calls };
}
const VALID_HIGH = { confidence: 0.9, source: "chat", desiredDate: "2026-06-07", desiredTimeHint: "morning", actionShape: "full_go", explicitDuration: { durationMin: 60, confidence: "high" } };
const VALID_NONE = { confidence: 0.9, source: "chat", desiredDate: "2026-06-07", desiredTimeHint: "morning", actionShape: "full_go" };

const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/capture-route-runner.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-5g-0/1 route runner — write mode は fail-closed（未接続）", () => {
  it("write mode → extract 0 / write 0 / write_mode_not_connected", async () => {
    const ext = counting({ kind: "extracted", raw: VALID_HIGH });
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureRouteObserver(input("write"), { extractor: ext.extractor, writeClient: fake });
    expect(r).toEqual({ mode: "write", observed: false, summary: null, note: "write_mode_not_connected" });
    expect(ext.calls()).toBe(0);
    expect(fake.writes.length).toBe(0);
  });
});

describe("A1-5-5g-0/1 route runner — observe mode（gate / valid / no_intent / invalid）", () => {
  it("gate block（flag off）→ extractor 0 / write 0 / wouldCapture false", async () => {
    const ext = counting({ kind: "extracted", raw: VALID_HIGH });
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureRouteObserver(input("observe", { liveEnabled: false }), { extractor: ext.extractor, writeClient: fake });
    expect(r.mode).toBe("observe");
    expect(r.observed).toBe(true);
    expect(r.summary?.outcome).toBe("gate_blocked");
    expect(r.summary?.wouldCapture).toBe(false);
    expect(ext.calls()).toBe(0); // gate block → extractor 未呼出
    expect(fake.writes.length).toBe(0); // write 0
  });
  it("gate block（non-staging ref）→ extractor 0 / write 0", async () => {
    const ext = counting({ kind: "extracted", raw: VALID_HIGH });
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureRouteObserver(input("observe", { supabaseUrl: "https://aljavfujeqcwnqryjmhl.supabase.co" }), { extractor: ext.extractor, writeClient: fake });
    expect(r.summary?.outcome).toBe("gate_blocked"); // production project ref → block（production hard block 維持）
    expect(r.summary?.wouldCapture).toBe(false);
    expect(ext.calls()).toBe(0);
    expect(fake.writes.length).toBe(0);
  });
  it("valid high → wouldCapture true / wouldEvidence true / dry-run write 1", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureRouteObserver(input("observe"), { extractor: counting({ kind: "extracted", raw: VALID_HIGH }).extractor, writeClient: fake });
    expect(r.summary?.wouldCapture).toBe(true);
    expect(r.summary?.wouldEvidence).toBe(true);
    expect(fake.writes.length).toBe(1); // dry-run write 1 回まで（実 DB 0）
  });
  it("valid なし → wouldCapture true / wouldEvidence false", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureRouteObserver(input("observe"), { extractor: counting({ kind: "extracted", raw: VALID_NONE }).extractor, writeClient: fake });
    expect(r.summary?.wouldCapture).toBe(true);
    expect(r.summary?.wouldEvidence).toBe(false);
  });
  it("no_intent → wouldCapture false / write 0", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureRouteObserver(input("observe"), { extractor: { async extract() { return { kind: "no_intent" }; } }, writeClient: fake });
    expect(r.summary?.outcome).toBe("no_intent");
    expect(r.summary?.wouldCapture).toBe(false);
    expect(fake.writes.length).toBe(0);
  });
  it("raw field 混入 → invalid_extraction / wouldCapture false / write 0", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureRouteObserver(input("observe"), { extractor: counting({ kind: "extracted", raw: { ...VALID_NONE, signal: "RAW" } }).extractor, writeClient: fake });
    expect(r.summary?.outcome).toBe("invalid_extraction");
    expect(r.summary?.wouldCapture).toBe(false);
    expect(fake.writes.length).toBe(0);
  });
});

describe("A1-5-5g-0/1 route runner — never-throw（response 不変）/ raw 非漏洩", () => {
  it("extractor が throw しても runner は throw しない（observer_error・redacted）", async () => {
    const throwing: SeedExtractor = { async extract() { throw new Error("boom raw " + RAW_UTTERANCE); } };
    let r;
    await expect(async () => { r = await runCaptureRouteObserver(input("observe"), { extractor: throwing, writeClient: createFakeCaptureWriteClient() }); }).not.toThrow();
    r = await runCaptureRouteObserver(input("observe"), { extractor: throwing, writeClient: createFakeCaptureWriteClient() });
    expect(r.observed).toBe(false);
    expect(r.note).toBe("observer_error");
    expect(JSON.stringify(r)).not.toContain(RAW_UTTERANCE); // error message の raw を含めない
  });
  it("result に raw utterance / signal / desiredAction / prompt が出ない", async () => {
    const r1 = await runCaptureRouteObserver(input("observe"), { extractor: counting({ kind: "extracted", raw: { ...VALID_HIGH, signal: RAW_UTTERANCE, prompt: "p", desiredAction: "x" } }).extractor, writeClient: createFakeCaptureWriteClient() });
    const r2 = await runCaptureRouteObserver(input("observe"), { extractor: counting({ kind: "extracted", raw: VALID_HIGH }).extractor, writeClient: createFakeCaptureWriteClient() });
    for (const r of [r1, r2]) {
      const json = JSON.stringify(r);
      for (const leak of [RAW_UTTERANCE, "signal", "desiredAction", "prompt", "transcript", "utterance"]) {
        expect(json).not.toContain(leak);
      }
    }
  });
});

describe("A1-5-5g-0/1 route runner — 静的安全（server-only・SDK/DB/runtime 0）", () => {
  it("server-only 宣言", () => {
    expect(CODE).toContain("server-only");
  });
  it("LLM SDK / Supabase / DB / fetch を持たない", () => {
    for (const t of ["openai", "anthropic", "@google", "createClient", "@supabase", ".from(", ".rpc(", ".insert(", "fetch(", "process.env"]) {
      expect(CODE).not.toContain(t);
    }
  });
  it("route / UI を import しない（next/ ・app/ ・react ・PlanClient 不在）", () => {
    for (const t of ['from "next/', 'from "@/app/', 'from "react"', "PlanClient"]) expect(CODE).not.toContain(t);
  });
  it("barrel(integration/index.ts) が capture-route-runner を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("capture-route-runner");
  });
});
