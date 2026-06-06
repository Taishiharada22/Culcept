import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  appendCaptureCandidateToMorningResult,
  redactCaptureCandidateSurface,
  CAPTURE_CANDIDATE_RESPONSE_KEY,
} from "@/lib/plan/reality/integration/candidate-response-assembler";
import type { CandidateSurfaceDTO } from "@/lib/plan/reality/integration/candidate-surface";
import { collectStringValues } from "@/lib/plan/reality/integration/redaction-guard";

// MorningPipelineResult 風の fake result（既存 response data 形）
const RESULT = {
  status: "ok",
  comprehension: { events: [] },
  timeline: null,
  grounded: [],
  gapResolution: null,
  annotations: { body: {}, weather: {}, party: {} },
  narration: { narration: { text: "x" } },
  hints: {},
};
const SURFACE: CandidateSurfaceDTO = {
  hasCandidate: true,
  candidateCount: 1,
  status: "has_candidate",
  items: [{ durationMin: 60, evidenceSource: "seed_explicit", date: "2026-06-07", band: "morning", confidenceBand: "high" }],
};
const EMPTY: CandidateSurfaceDTO = { hasCandidate: false, candidateCount: 0, status: "none", items: [] };

const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/candidate-response-assembler.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-7-2 assembler — candidate 無 → 元 result 完全一致（fail-open）", () => {
  it("surface=null → 元 result deep-equal・captureCandidate 無", () => {
    const out = appendCaptureCandidateToMorningResult(RESULT, null);
    expect(out).toEqual(RESULT);
    expect(CAPTURE_CANDIDATE_RESPONSE_KEY in out).toBe(false);
    expect(Object.keys(out).sort()).toEqual(Object.keys(RESULT).sort());
  });
  it("surface=undefined → 元 result deep-equal", () => {
    expect(appendCaptureCandidateToMorningResult(RESULT, undefined)).toEqual(RESULT);
  });
  it("hasCandidate=false → 元 result deep-equal（key 足さない）", () => {
    const out = appendCaptureCandidateToMorningResult(RESULT, EMPTY);
    expect(out).toEqual(RESULT);
    expect("captureCandidate" in out).toBe(false);
  });
});

describe("A1-5-7-2 assembler — candidate 有 → additive（既存 keys 維持）", () => {
  it("hasCandidate=true → captureCandidate を 1 key 追加", () => {
    const out = appendCaptureCandidateToMorningResult(RESULT, SURFACE);
    expect("captureCandidate" in out).toBe(true);
    expect((out as Record<string, unknown>).captureCandidate).toEqual(SURFACE);
  });
  it("既存 keys を消さない（全 key 維持）", () => {
    const out = appendCaptureCandidateToMorningResult(RESULT, SURFACE) as Record<string, unknown>;
    for (const k of Object.keys(RESULT)) expect(out[k]).toEqual((RESULT as Record<string, unknown>)[k]);
    expect(out.status).toBe("ok");
    expect((out.narration as { narration: { text: string } }).narration.text).toBe("x");
  });
  it("追加 key は captureCandidate のみ（CandidateSurfaceDTO 以外を混ぜない）", () => {
    const out = appendCaptureCandidateToMorningResult(RESULT, SURFACE) as Record<string, unknown>;
    expect(Object.keys(out).filter((k) => !(k in RESULT))).toEqual(["captureCandidate"]);
    expect(Object.keys(out.captureCandidate as object).sort()).toEqual(["candidateCount", "hasCandidate", "items", "status"]);
  });
});

describe("A1-5-7-2 assembler — ok/data envelope 不変", () => {
  it("candidate 有: {ok,data} envelope を壊さない", () => {
    const data = appendCaptureCandidateToMorningResult(RESULT, SURFACE);
    const envelope = { ok: true, data };
    expect(envelope.ok).toBe(true);
    expect((envelope.data as Record<string, unknown>).status).toBe("ok");
    expect((envelope.data as Record<string, unknown>).captureCandidate).toEqual(SURFACE);
  });
  it("candidate 無: {ok,data} が元と完全一致", () => {
    const data = appendCaptureCandidateToMorningResult(RESULT, null);
    expect({ ok: true, data }).toEqual({ ok: true, data: RESULT });
  });
});

describe("A1-5-7-2 assembler — 最終 redaction（raw/source_ref/UUID non-surface）", () => {
  it("item に raw/source_ref/seedRef 混入 → response DTO に出ない（allowlist 再構築）", () => {
    const contaminated = {
      ...SURFACE,
      items: [{ ...SURFACE.items[0], source_ref: "SREF", seedRef: "11111111-1111-4111-8111-111111111111", signal: "RAW_SIGNAL" }],
    } as unknown as CandidateSurfaceDTO;
    const out = appendCaptureCandidateToMorningResult(RESULT, contaminated);
    const json = JSON.stringify(out);
    for (const leak of ["SREF", "source_ref", "seedRef", "RAW_SIGNAL", "11111111-1111"]) expect(json).not.toContain(leak);
  });
  it("DTO 直下に extra raw key 混入 → response DTO に出ない", () => {
    const contaminated = { ...SURFACE, rawNote: "歯医者に行きたい", sourceRef: "X" } as unknown as CandidateSurfaceDTO;
    const out = appendCaptureCandidateToMorningResult(RESULT, contaminated);
    const json = JSON.stringify(out);
    for (const leak of ["歯医者", "rawNote", "sourceRef"]) expect(json).not.toContain(leak);
  });
  it("captureCandidate の全 string が安全（collectStringValues・UUID/source_ref/prompt/apiKey 非含有）", () => {
    const out = appendCaptureCandidateToMorningResult(RESULT, SURFACE) as Record<string, unknown>;
    for (const s of collectStringValues(out.captureCandidate).map((l) => l.value)) {
      expect(s).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
      expect(s).not.toContain("source_ref");
    }
    const json = JSON.stringify(out.captureCandidate);
    for (const leak of ["prompt", "apiKey", "api_key", "utterance", "signal", "seedRef"]) expect(json).not.toContain(leak);
  });
});

describe("A1-5-7-2 redactCaptureCandidateSurface — allowlist 再構築 / drift 検出", () => {
  it("clean DTO → deep-equal（no-op・全 field 保持＝drift 検出）", () => {
    expect(redactCaptureCandidateSurface(SURFACE)).toEqual(SURFACE);
    expect(redactCaptureCandidateSurface(EMPTY)).toEqual(EMPTY);
  });
  it("汚染 DTO（extra key）→ sanitized（既知 field のみ）", () => {
    const dirty = { ...SURFACE, extra: "X", items: [{ ...SURFACE.items[0], rawX: "Y" }] } as unknown as CandidateSurfaceDTO;
    const clean = redactCaptureCandidateSurface(dirty);
    expect((clean as unknown as Record<string, unknown>).extra).toBeUndefined();
    expect((clean.items[0] as unknown as Record<string, unknown>).rawX).toBeUndefined();
    expect(clean).toEqual(SURFACE);
  });
});

describe("A1-5-7-2 assembler — deterministic / 静的安全", () => {
  it("同一入力 → 同一出力", () => {
    expect(appendCaptureCandidateToMorningResult(RESULT, SURFACE)).toEqual(appendCaptureCandidateToMorningResult(RESULT, SURFACE));
  });
  it("pure・DB/Supabase/route/UI/fetch を持たない", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert(", "fetch(", 'from "next/', 'from "@/app/', 'from "react"', "PlanClient", "supabaseServer", "process.env", "MorningPipelineResult"]) {
      expect(CODE).not.toContain(t);
    }
  });
  it("CandidateSurfaceDTO は import type のみ（pure・decoupled）", () => {
    expect(CODE).toMatch(/import type \{[^}]*CandidateSurfaceDTO/);
  });
  it("barrel(integration/index.ts) が candidate-response-assembler を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("candidate-response-assembler");
  });
});
