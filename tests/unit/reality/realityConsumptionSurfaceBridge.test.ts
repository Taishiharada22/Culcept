import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { runCapturedSeedConsumptionWithSurface } from "@/lib/plan/reality/integration/consumption-surface-bridge";
import { runCapturedSeedConsumptionShadow } from "@/lib/plan/reality/integration/captured-seed-consumption";
import { appendCaptureCandidateToMorningResult } from "@/lib/plan/reality/integration/candidate-response-assembler";
import { collectStringValues } from "@/lib/plan/reality/integration/redaction-guard";
import type { ColumnRestrictedSeedRow } from "@/lib/plan/reality/integration/seed-column-restricted";
import type { ColumnRestrictedDurationEvidenceRow } from "@/lib/plan/reality/integration/duration-evidence-source";

const SEED_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const EV_ID = "33333333-3333-4333-8333-333333333333";

function seed(p: Partial<ColumnRestrictedSeedRow> = {}): ColumnRestrictedSeedRow {
  return { id: SEED_ID, user_id: USER_ID, desired_date: "2026-06-07", desired_time_hint: null, action_shape: "full_go", confidence: 0.9, status: "active", ...p };
}
function evidence(p: Partial<ColumnRestrictedDurationEvidenceRow> = {}): ColumnRestrictedDurationEvidenceRow {
  return { id: EV_ID, user_id: USER_ID, seed_id: SEED_ID, duration_min: 60, source: "seed_explicit", confidence: "high", ...p };
}
const CTX = { date: "2026-06-07", activeWindow: { startMin: 0, endMin: 1440 }, existing: [] };
function run(seedRows: ColumnRestrictedSeedRow[], evidenceRows: ColumnRestrictedDurationEvidenceRow[]) {
  return runCapturedSeedConsumptionWithSurface({ seedRows, evidenceRows, context: CTX });
}

const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/consumption-surface-bridge.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-7-4 bridge — candidateCount と surface を同一 canonical 計算から出す", () => {
  it("seed_explicit high → candidateCount=1 + surface.hasCandidate=true（同一 core 由来）", () => {
    const r = run([seed()], [evidence({ source: "seed_explicit" })]);
    expect(r.summary.candidateCount).toBe(1);
    expect(r.surface.hasCandidate).toBe(true);
    expect(r.surface.candidateCount).toBe(1);
    expect(r.surface.items).toHaveLength(1);
    expect(r.surface.items[0].evidenceSource).toBe("seed_explicit");
    expect(r.summary.candidateCount).toBe(r.surface.candidateCount); // drift 防止: 一致
  });
  it("correction high → candidateCount=1 + surface.hasCandidate=true", () => {
    const r = run([seed()], [evidence({ source: "correction" })]);
    expect(r.summary.candidateCount).toBe(1);
    expect(r.surface.hasCandidate).toBe(true);
    expect(r.surface.items[0].evidenceSource).toBe("correction");
  });
  it("prm_typical → candidateCount=0 + surface なし", () => {
    const r = run([seed()], [evidence({ source: "prm_typical" })]);
    expect(r.summary.candidateCount).toBe(0);
    expect(r.surface.hasCandidate).toBe(false);
    expect(r.surface.items).toEqual([]);
  });
  it("no evidence → candidateCount=0 + surface なし", () => {
    const r = run([seed()], []);
    expect(r.summary.candidateCount).toBe(0);
    expect(r.surface.hasCandidate).toBe(false);
  });
  it("low confidence evidence → candidateCount=0 + surface なし", () => {
    const r = run([seed()], [evidence({ confidence: "low" })]);
    expect(r.summary.candidateCount).toBe(0);
    expect(r.surface.hasCandidate).toBe(false);
  });
  it("inactive seed / skip disposition → candidateCount=0 + surface なし", () => {
    expect(run([seed({ status: "consumed" })], [evidence()]).surface.hasCandidate).toBe(false);
    expect(run([seed({ action_shape: "skip" })], [evidence()]).surface.hasCandidate).toBe(false);
  });
});

describe("A1-5-7-4 bridge — raw / source_ref / seedRef / UUID non-surface", () => {
  it("raw 列 / source_ref / seedRef 混入 → surface output に出ない（presentCandidateSurface が redact）", () => {
    const cSeed = { ...seed(), signal: "RAW_SIGNAL", desired_action: "RAW_ACTION", source_ref: "RAW_SREF" } as unknown as ColumnRestrictedSeedRow;
    const cEv = { ...evidence(), source_ref: "RAW_EV_SREF", raw_text: "RAW_TEXT" } as unknown as ColumnRestrictedDurationEvidenceRow;
    const r = run([cSeed], [cEv]);
    expect(r.surface.hasCandidate).toBe(true); // 構造化値で候補化
    const json = JSON.stringify(r.surface);
    for (const leak of ["RAW_SIGNAL", "RAW_ACTION", "RAW_SREF", "RAW_EV_SREF", "RAW_TEXT", "signal", "desired_action", "source_ref", "seedRef", SEED_ID]) {
      expect(json).not.toContain(leak);
    }
  });
  it("surface の全 string は安全語彙のみ（UUID/source_ref 非含有・collectStringValues）", () => {
    const r = run([seed()], [evidence()]);
    for (const s of collectStringValues(r.surface).map((l) => l.value)) {
      expect(s).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
      expect(s).not.toContain("source_ref");
    }
    expect(JSON.stringify(r.surface)).not.toContain(SEED_ID);
  });
});

describe("A1-5-7-4 bridge — response assembler 連携", () => {
  const FAKE_RESULT = { status: "ok", comprehension: { events: [] }, narration: { narration: { text: "x" } } };
  it("candidate あり → appendCaptureCandidateToMorningResult で captureCandidate additive", () => {
    const r = run([seed()], [evidence()]);
    const assembled = appendCaptureCandidateToMorningResult(FAKE_RESULT, r.surface) as Record<string, unknown>;
    expect("captureCandidate" in assembled).toBe(true);
    expect(assembled.captureCandidate).toEqual(r.surface);
    expect(assembled.status).toBe("ok"); // 既存 keys 維持
  });
  it("candidate なし → original result deep-equal（captureCandidate 無）", () => {
    const r = run([seed()], []); // candidateCount=0
    const assembled = appendCaptureCandidateToMorningResult(FAKE_RESULT, r.surface);
    expect(assembled).toEqual(FAKE_RESULT);
    expect("captureCandidate" in assembled).toBe(false);
  });
});

describe("A1-5-7-4 bridge — canonical 一致 / deterministic / 静的安全", () => {
  it("bridge.summary は既存 summary-only runner と一致（同一 core・既存 runner 不変）", () => {
    const input = { seedRows: [seed()], evidenceRows: [evidence()], context: CTX };
    expect(runCapturedSeedConsumptionWithSurface(input).summary).toEqual(runCapturedSeedConsumptionShadow(input));
  });
  it("同一入力 → 同一出力", () => {
    const input = { seedRows: [seed()], evidenceRows: [evidence()], context: CTX };
    expect(runCapturedSeedConsumptionWithSurface(input)).toEqual(runCapturedSeedConsumptionWithSurface(input));
  });
  it("DB / Supabase / route / UI / fetch を持たない", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert(", "fetch(", 'from "next/', 'from "@/app/', 'from "react"', "PlanClient", "supabaseServer", "process.env"]) {
      expect(CODE).not.toContain(t);
    }
  });
  it("CandidateDraft を入力にしない（candidate-evaluator/complete-generator 非 import）", () => {
    expect(CODE).not.toContain("CandidateDraft");
    expect(CODE).not.toContain("candidate-evaluator");
    expect(CODE).not.toContain("complete-generator");
  });
  it("barrel(integration/index.ts) が consumption-surface-bridge を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("consumption-surface-bridge");
  });
});
