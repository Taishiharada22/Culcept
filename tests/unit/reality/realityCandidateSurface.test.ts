import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  presentCandidateSurface,
  isSurfaceableCandidate,
  toCandidateSurfaceItem,
  confidenceBand,
} from "@/lib/plan/reality/integration/candidate-surface";
import type { CapturedSeedConsumptionSummary } from "@/lib/plan/reality/integration/captured-seed-consumption";
import type { SeedPlacement } from "@/lib/plan/reality/seed-placement";
import { collectStringValues } from "@/lib/plan/reality/integration/redaction-guard";

const SEED_UUID = "11111111-1111-4111-8111-111111111111";

function placement(p: Partial<SeedPlacement> = {}): SeedPlacement {
  return {
    seedRef: SEED_UUID,
    date: "2026-06-07",
    window: { band: "morning" },
    durationMin: 60,
    durationSource: "seed_explicit",
    dispositionHint: "place",
    confidence: 0.9,
    grounding: "strong",
    ...p,
  };
}
function summary(candidateCount: number): CapturedSeedConsumptionSummary {
  return {
    seedCount: 1,
    adoptableEvidenceCount: candidateCount > 0 ? 1 : 0,
    candidateCount,
    wouldCandidate: candidateCount > 0,
    reason: candidateCount > 0 ? "candidate" : "no_candidate",
  };
}

const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/candidate-surface.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-7-0/1 surface — DTO 生成 / no-surface", () => {
  it("candidateCount=1 + placement → safe DTO（item 1）", () => {
    const dto = presentCandidateSurface({ summary: summary(1), candidatePlacements: [placement()] });
    expect(dto.hasCandidate).toBe(true);
    expect(dto.candidateCount).toBe(1);
    expect(dto.status).toBe("has_candidate");
    expect(dto.items).toHaveLength(1);
    expect(dto.items[0]).toEqual({ durationMin: 60, evidenceSource: "seed_explicit", date: "2026-06-07", band: "morning", confidenceBand: "high" });
  });
  it("candidateCount=1 + placements 未提供 → count-level（items 空・hasCandidate true）", () => {
    const dto = presentCandidateSurface({ summary: summary(1) });
    expect(dto.hasCandidate).toBe(true);
    expect(dto.status).toBe("has_candidate");
    expect(dto.items).toEqual([]);
  });
  it("candidateCount=0 → no surface / empty DTO", () => {
    const dto = presentCandidateSurface({ summary: summary(0), candidatePlacements: [placement()] });
    expect(dto.hasCandidate).toBe(false);
    expect(dto.candidateCount).toBe(0);
    expect(dto.status).toBe("none");
    expect(dto.items).toEqual([]);
  });
});

describe("A1-5-7-0/1 surface — evidence source 区別 / prm_typical 非surface", () => {
  it("seed_explicit / correction を安全に区別", () => {
    expect(presentCandidateSurface({ summary: summary(1), candidatePlacements: [placement({ durationSource: "seed_explicit" })] }).items[0].evidenceSource).toBe("seed_explicit");
    expect(presentCandidateSurface({ summary: summary(1), candidatePlacements: [placement({ durationSource: "correction" })] }).items[0].evidenceSource).toBe("correction");
  });
  it("prm_typical → candidateCount=0 で empty（消費が候補化しない）", () => {
    const dto = presentCandidateSurface({ summary: summary(0), candidatePlacements: [placement({ durationSource: "prm_typical", grounding: "weak" })] });
    expect(dto.items).toEqual([]);
  });
  it("prm_typical placement は candidateCount>0(不整合)でも surface しない（isSurfaceableCandidate fail-closed）", () => {
    const dto = presentCandidateSurface({ summary: summary(1), candidatePlacements: [placement({ durationSource: "prm_typical", grounding: "weak" })] });
    expect(dto.items).toEqual([]); // filter で除外
    expect(dto.hasCandidate).toBe(true); // count-level は維持
  });
});

describe("A1-5-7-0/1 surface — raw / source_ref / UUID non-surface", () => {
  it("raw 列混入（signal/desiredAction）→ DTO に出ない", () => {
    const contaminated = { ...placement(), signal: "RAW_SIGNAL", desiredAction: "RAW_ACTION" } as unknown as SeedPlacement;
    const dto = presentCandidateSurface({ summary: summary(1), candidatePlacements: [contaminated] });
    expect(dto.items).toHaveLength(1);
    const json = JSON.stringify(dto);
    for (const leak of ["RAW_SIGNAL", "RAW_ACTION", "signal", "desiredAction"]) expect(json).not.toContain(leak);
  });
  it("source_ref → DTO に出ない", () => {
    const withSref = { ...placement(), source_ref: "RAW_SOURCE_REF" } as unknown as SeedPlacement;
    const json = JSON.stringify(presentCandidateSurface({ summary: summary(1), candidatePlacements: [withSref] }));
    for (const leak of ["RAW_SOURCE_REF", "source_ref"]) expect(json).not.toContain(leak);
  });
  it("seedRef(UUID) → DTO に出ない", () => {
    const json = JSON.stringify(presentCandidateSurface({ summary: summary(1), candidatePlacements: [placement({ seedRef: SEED_UUID })] }));
    expect(json).not.toContain(SEED_UUID);
    expect(json).not.toContain("seedRef");
  });
  it("DTO の全 string は安全語彙のみ（enum / date・UUID/source_ref/raw/prompt/apiKey 非含有）", () => {
    const dto = presentCandidateSurface({ summary: summary(1), candidatePlacements: [placement()] });
    const allowedEnum = new Set(["has_candidate", "none", "seed_explicit", "correction", "morning", "afternoon", "evening", "high", "medium", "low"]);
    for (const s of collectStringValues(dto).map((l) => l.value)) {
      const ok = allowedEnum.has(s) || /^\d{4}-\d{2}-\d{2}$/.test(s); // enum or YYYY-MM-DD
      expect(ok).toBe(true);
      expect(s).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // UUID 非含有
    }
    const json = JSON.stringify(dto);
    for (const leak of ["prompt", "apiKey", "api_key", "response", "utterance", "signal", "desiredAction", "source_ref", "seedRef"]) {
      expect(json).not.toContain(leak);
    }
  });
});

describe("A1-5-7-0/1 surface — helpers", () => {
  it("confidenceBand: 0.9→high / 0.6→medium / 0.3→low / NaN→low", () => {
    expect(confidenceBand(0.9)).toBe("high");
    expect(confidenceBand(0.6)).toBe("medium");
    expect(confidenceBand(0.3)).toBe("low");
    expect(confidenceBand(NaN)).toBe("low");
  });
  it("isSurfaceableCandidate: surfaceable / 各除外条件", () => {
    expect(isSurfaceableCandidate(placement())).toBe(true);
    expect(isSurfaceableCandidate(placement({ durationSource: "prm_typical", grounding: "weak" }))).toBe(false);
    expect(isSurfaceableCandidate(placement({ durationMin: null, durationSource: "unknown" }))).toBe(false);
    expect(isSurfaceableCandidate(placement({ grounding: "weak" }))).toBe(false);
    expect(isSurfaceableCandidate(placement({ dispositionHint: "tentative" }))).toBe(false);
    expect(isSurfaceableCandidate(placement({ durationMin: 0 }))).toBe(false);
  });
  it("toCandidateSurfaceItem: band/date null も安全に表現", () => {
    const item = toCandidateSurfaceItem(placement({ date: undefined, window: undefined }));
    expect(item.date).toBeNull();
    expect(item.band).toBeNull();
  });
});

describe("A1-5-7-0/1 surface — deterministic / 静的安全", () => {
  it("同一入力 → 同一出力", () => {
    const input = { summary: summary(1), candidatePlacements: [placement()] };
    expect(presentCandidateSurface(input)).toEqual(presentCandidateSurface(input));
  });
  it("DB / Supabase / route / UI / fetch を持たない（pure）", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert(", "fetch(", 'from "next/', 'from "@/app/', 'from "react"', "PlanClient", "supabaseServer", "process.env"]) {
      expect(CODE).not.toContain(t);
    }
  });
  it("CandidateDraft を surface 入力にしない（candidate-evaluator/complete-generator 非 import・UUID 源を境界に入れない）", () => {
    expect(CODE).not.toContain("candidate-evaluator");
    expect(CODE).not.toContain("complete-generator");
    expect(CODE).not.toContain("CandidateDraft");
  });
  it("consumption summary / placement は import type のみ（pure・runtime 値 import なし）", () => {
    expect(CODE).toMatch(/import type \{[^}]*CapturedSeedConsumptionSummary/);
    expect(CODE).toMatch(/import type \{[^}]*SeedPlacement/);
  });
  it("barrel(integration/index.ts) が candidate-surface を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("candidate-surface");
  });
});
