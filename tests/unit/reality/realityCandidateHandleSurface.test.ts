/**
 * A1-6-2 Candidate Handle Surface Propagation — pure/no-run tests
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.2
 *
 * opaque handle（A1-6-1）を surface DTO → client request まで安全に流す:
 *   - server-side で seedRef → handle（一方向 sha256・deriveCandidateHandle 注入）。surface item に handle・**seedRef は出さない**。
 *   - redaction が handle を**形式一致時のみ保持**・seedRef/UUID/source_ref を drop（defense-in-depth）。
 *   - client action request builder（pure・handle opaque・seedRef なし）。
 *   - surface の handle は A1-6-1 resolveCandidateHandle で解決可能（往復整合＝後の action route の前提）。
 *   DB write 0 / production 0 / UI 変更 0 / route 0 / live wiring 0（banner dormant）。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  presentCandidateSurface,
  toCandidateSurfaceItem,
  type CandidateSurfaceItem,
  type CandidateSurfaceDTO,
} from "@/lib/plan/reality/integration/candidate-surface";
import { redactCaptureCandidateSurface } from "@/lib/plan/reality/integration/candidate-response-assembler";
import {
  deriveCandidateHandle,
  resolveCandidateHandle,
  CANDIDATE_HANDLE_RE,
} from "@/lib/plan/reality/integration/candidate-action-handle";
import { buildCandidateActionRequest } from "@/components/home/morning/captureCandidateClient";
import type { CapturedSeedConsumptionSummary } from "@/lib/plan/reality/integration/captured-seed-consumption";
import type { SeedPlacement } from "@/lib/plan/reality/seed-placement";

const SEED_UUID = "11111111-1111-4111-8111-111111111111";
const SEED_B = "22222222-2222-4222-8222-222222222222";

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

describe("A1-6-2 presentCandidateSurface — deriveHandle 注入で handle 付与（seedRef 非搬送）", () => {
  it("deriveHandle 注入 → item.handle = deriveCandidateHandle(seedRef)・形式一致", () => {
    const dto = presentCandidateSurface({ summary: summary(1), candidatePlacements: [placement()] }, deriveCandidateHandle);
    expect(dto.items).toHaveLength(1);
    expect(dto.items[0].handle).toBe(deriveCandidateHandle(SEED_UUID));
    expect(dto.items[0].handle).toMatch(CANDIDATE_HANDLE_RE);
  });
  it("item に seedRef(UUID) を持たない（handle は一方向・JSON 全体に seedRef 非出）", () => {
    const dto = presentCandidateSurface({ summary: summary(1), candidatePlacements: [placement()] }, deriveCandidateHandle);
    const json = JSON.stringify(dto);
    expect(json).not.toContain(SEED_UUID);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // UUID 形を含まない
    expect(Object.keys(dto.items[0]).sort()).toEqual(["band", "confidenceBand", "date", "durationMin", "evidenceSource", "handle"]);
  });
  it("deriveHandle 未注入 → handle 無（既存 surface 完全不変）", () => {
    const dto = presentCandidateSurface({ summary: summary(1), candidatePlacements: [placement()] });
    expect(dto.items[0].handle).toBeUndefined();
    expect("handle" in dto.items[0]).toBe(false);
  });
});

describe("A1-6-2 toCandidateSurfaceItem — handle 注入（任意・pure 維持）", () => {
  it("deriveHandle 注入 → handle 付与", () => {
    expect(toCandidateSurfaceItem(placement(), deriveCandidateHandle).handle).toBe(deriveCandidateHandle(SEED_UUID));
  });
  it("deriveHandle 未注入 → handle 無", () => {
    expect("handle" in toCandidateSurfaceItem(placement())).toBe(false);
  });
});

describe("A1-6-2 往復整合 — surface handle は A1-6-1 resolveCandidateHandle で解決可能", () => {
  it("surface の handle → resolveCandidateHandle で元 seedRef に解決（client→server action の前提）", () => {
    const dto = presentCandidateSurface({ summary: summary(1), candidatePlacements: [placement()] }, deriveCandidateHandle);
    const handle = dto.items[0].handle as string;
    expect(resolveCandidateHandle(handle, [{ seedRef: SEED_UUID, status: "active" }])).toEqual({ seedRef: SEED_UUID, status: "active" });
  });
  it("異なる seed の surfaceable のみ → 解決不可（fail-closed）", () => {
    const dto = presentCandidateSurface({ summary: summary(1), candidatePlacements: [placement()] }, deriveCandidateHandle);
    const handle = dto.items[0].handle as string;
    expect(resolveCandidateHandle(handle, [{ seedRef: SEED_B, status: "active" }])).toBeNull();
  });
});

describe("A1-6-2 redactCaptureCandidateSurface — handle は形式一致時のみ保持・汚染 drop", () => {
  const baseItem: CandidateSurfaceItem = { durationMin: 60, evidenceSource: "seed_explicit", date: "2026-06-07", band: "morning", confidenceBand: "high" };
  const dto = (item: Record<string, unknown>): CandidateSurfaceDTO =>
    ({ hasCandidate: true, candidateCount: 1, status: "has_candidate", items: [item as unknown as CandidateSurfaceItem] });

  it("valid handle → 保持", () => {
    const handle = deriveCandidateHandle(SEED_UUID);
    expect(redactCaptureCandidateSurface(dto({ ...baseItem, handle })).items[0].handle).toBe(handle);
  });
  it("seedRef(UUID) が handle field に紛れる → drop（defense-in-depth・形式不一致）", () => {
    const r = redactCaptureCandidateSurface(dto({ ...baseItem, handle: SEED_UUID }));
    expect(r.items[0].handle).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain(SEED_UUID);
  });
  it("source_ref / seedRef / raw 等の extra key → drop（allowlist 再構築）", () => {
    const r = redactCaptureCandidateSurface(dto({ ...baseItem, handle: deriveCandidateHandle(SEED_UUID), seedRef: SEED_UUID, source_ref: "SREF", raw_text: "RAW" }));
    const json = JSON.stringify(r);
    for (const leak of [SEED_UUID, "source_ref", "SREF", "raw_text", "seedRef"]) expect(json).not.toContain(leak);
    expect(Object.keys(r.items[0]).sort()).toEqual(["band", "confidenceBand", "date", "durationMin", "evidenceSource", "handle"]);
  });
  it("handle 無 item → handle key を足さない（既存 redaction 不変）", () => {
    expect("handle" in redactCaptureCandidateSurface(dto({ ...baseItem })).items[0]).toBe(false);
  });
});

describe("A1-6-2 buildCandidateActionRequest — pure action request（handle opaque・seedRef なし）", () => {
  it("{ handle, action } を返す・余計な field なし", () => {
    const handle = deriveCandidateHandle(SEED_UUID);
    expect(buildCandidateActionRequest(handle, "accept")).toEqual({ handle, action: "accept" });
    expect(buildCandidateActionRequest(handle, "dismiss")).toEqual({ handle, action: "dismiss" });
    expect(buildCandidateActionRequest(handle, "later")).toEqual({ handle, action: "later" });
  });
  it("request body に seedRef を持たない（handle は一方向 hash）", () => {
    const json = JSON.stringify(buildCandidateActionRequest(deriveCandidateHandle(SEED_UUID), "accept"));
    expect(json).not.toContain(SEED_UUID);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
});

describe("A1-6-2 静的安全 — pure pipeline（crypto は注入・client-safe module は server-only 化しない）", () => {
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("candidate-surface.ts は node:crypto / createHash / server-only を持たない（derive は注入・pure 維持）", () => {
    const code = strip(fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/candidate-surface.ts"), "utf8"));
    for (const t of ["node:crypto", "createHash", "server-only"]) expect(code).not.toContain(t);
  });
  it("candidate-response-assembler.ts は crypto / server-only / candidate-action-handle import を持たない（client-safe・inline regex）", () => {
    const code = strip(fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/candidate-response-assembler.ts"), "utf8"));
    for (const t of ["node:crypto", "createHash", "server-only", "candidate-action-handle"]) expect(code).not.toContain(t);
  });
});
