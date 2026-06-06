import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  resolveSurfaceGate,
  loadPendingProjected,
  buildCaptureSurfaceFromProjected,
  resolveMorningProtocolCaptureFragment,
  type PendingProjected,
  type PendingCapturedRowsReadClient,
} from "@/lib/plan/reality/integration/morning-capture-surface.server";
import type { CandidateSurfaceDTO } from "@/lib/plan/reality/integration/candidate-surface";
import type { ColumnRestrictedSeedRow } from "@/lib/plan/reality/integration/seed-column-restricted";
import type { ColumnRestrictedDurationEvidenceRow } from "@/lib/plan/reality/integration/duration-evidence-source";
import type { SeedPlacement } from "@/lib/plan/reality/seed-placement";
import type { DurationEvidence } from "@/lib/plan/reality/seed-placement-enrich";

const SEED_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const STAGING_URL = "https://hjcrvndumgiovyfdacwc.supabase.co";

// undated/anytime seed placement（canonical source 由来・durationMin=null）→ context date 非依存で候補化
function placement(p: Partial<SeedPlacement> = {}): SeedPlacement {
  return { seedRef: SEED_ID, date: undefined, window: undefined, durationMin: null, durationSource: "unknown", dispositionHint: "place", confidence: 0.9, grounding: "strong", ...p };
}
function evidence(p: Partial<DurationEvidence> = {}): DurationEvidence {
  return { seedRef: SEED_ID, durationMin: 60, source: "seed_explicit", confidence: "high", ...p };
}
const CTX = { date: undefined, activeWindow: { startMin: 0, endMin: 1440 }, bandBounds: {}, existing: [] };

// canonical source 用 column-restricted row（read fake client が返す）
function seedRow(p: Partial<ColumnRestrictedSeedRow> = {}): ColumnRestrictedSeedRow {
  return { id: SEED_ID, user_id: USER_ID, desired_date: null, desired_time_hint: null, action_shape: "full_go", confidence: 0.9, status: "active", ...p };
}
function evRow(p: Partial<ColumnRestrictedDurationEvidenceRow> = {}): ColumnRestrictedDurationEvidenceRow {
  return { id: "33333333-3333-4333-8333-333333333333", user_id: USER_ID, seed_id: SEED_ID, duration_min: 60, source: "seed_explicit", confidence: "high", ...p };
}

// read-only fake client（seed/evidence の canonical source を満たす・error 注入可）
function fakeClient(opts: { seedData?: unknown[]; evData?: unknown[]; seedErr?: boolean; evErr?: boolean } = {}): PendingCapturedRowsReadClient {
  return {
    from(table: string) {
      const isSeed = table === "plan_seeds";
      const data = isSeed ? opts.seedData ?? [] : opts.evData ?? [];
      const error = isSeed ? opts.seedErr : opts.evErr;
      const q: any = {
        eq: () => q,
        in: () => q,
        or: () => q,
        limit: () => Promise.resolve({ data: error ? null : data, error: error ? { message: "x" } : null }),
      };
      return { select: () => q };
    },
  } as unknown as PendingCapturedRowsReadClient;
}

const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/morning-capture-surface.server.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-7-5 resolveSurfaceGate（pure）", () => {
  it("surfaceEnabled → liveEnabled / 透過", () => {
    const g = resolveSurfaceGate({ surfaceEnabled: true, killed: false, nodeEnv: "test", supabaseUrl: STAGING_URL, userId: USER_ID, canaryUserIds: [USER_ID] });
    expect(g).toEqual({ liveEnabled: true, killed: false, nodeEnv: "test", supabaseUrl: STAGING_URL, requestedUserId: USER_ID, canaryUserIds: [USER_ID] });
  });
  it("surfaceEnabled false → liveEnabled false", () => {
    expect(resolveSurfaceGate({ surfaceEnabled: false, killed: false, nodeEnv: "test", supabaseUrl: undefined, userId: USER_ID, canaryUserIds: [] }).liveEnabled).toBe(false);
  });
});

describe("A1-5-7-5 loadPendingProjected（canonical source 委譲・read-only・fail-open）", () => {
  it("normal → placements + evidenceMap（canonical source 由来）", async () => {
    const r = await loadPendingProjected(fakeClient({ seedData: [seedRow()], evData: [evRow()] }), USER_ID);
    expect(r?.placements).toHaveLength(1);
    expect(Object.keys(r?.evidenceMap ?? {})).toContain(SEED_ID);
  });
  it("seed read error → null（fail-open）", async () => {
    expect(await loadPendingProjected(fakeClient({ seedErr: true }), USER_ID)).toBeNull();
  });
  it("evidence read error → null（fail-open）", async () => {
    expect(await loadPendingProjected(fakeClient({ seedData: [seedRow()], evErr: true }), USER_ID)).toBeNull();
  });
  it("seed 0 → evidenceMap 空（evidence read しない）", async () => {
    expect(await loadPendingProjected(fakeClient({ seedData: [] }), USER_ID)).toEqual({ placements: [], evidenceMap: {} });
  });
});

describe("A1-5-7-5 buildCaptureSurfaceFromProjected（DI・gate block→read 0・fail-open）", () => {
  it("gateAllow=false → loadProjected を呼ばず null（surface read 0）", async () => {
    const loadProjected = vi.fn();
    expect(await buildCaptureSurfaceFromProjected(false, loadProjected, CTX)).toBeNull();
    expect(loadProjected).not.toHaveBeenCalled();
  });
  it("gateAllow=true + seed_explicit → surface.hasCandidate=true / candidateCount=1", async () => {
    const projected: PendingProjected = { placements: [placement()], evidenceMap: { [SEED_ID]: [evidence({ source: "seed_explicit" })] } };
    const r = await buildCaptureSurfaceFromProjected(true, async () => projected, CTX);
    expect(r?.hasCandidate).toBe(true);
    expect(r?.candidateCount).toBe(1);
    expect(r?.items[0].evidenceSource).toBe("seed_explicit");
  });
  it("gateAllow=true + prm_typical → surface.hasCandidate=false", async () => {
    const projected: PendingProjected = { placements: [placement()], evidenceMap: { [SEED_ID]: [evidence({ source: "prm_typical" })] } };
    expect((await buildCaptureSurfaceFromProjected(true, async () => projected, CTX))?.hasCandidate).toBe(false);
  });
  it("gateAllow=true + no evidence → surface.hasCandidate=false", async () => {
    const projected: PendingProjected = { placements: [placement()], evidenceMap: {} };
    expect((await buildCaptureSurfaceFromProjected(true, async () => projected, CTX))?.hasCandidate).toBe(false);
  });
  it("load null → null / load throw → null（fail-open）", async () => {
    expect(await buildCaptureSurfaceFromProjected(true, async () => null, CTX)).toBeNull();
    expect(await buildCaptureSurfaceFromProjected(true, async () => { throw new Error("boom"); }, CTX)).toBeNull();
  });
  it("surface output に source_ref/seedRef(UUID) 非含有", async () => {
    const projected: PendingProjected = { placements: [placement()], evidenceMap: { [SEED_ID]: [evidence()] } };
    const json = JSON.stringify(await buildCaptureSurfaceFromProjected(true, async () => projected, CTX));
    for (const leak of ["source_ref", "seedRef", SEED_ID]) expect(json).not.toContain(leak);
  });
});

describe("A1-5-7-5 morning-capture-surface — 静的安全（read-only・single-read-source 遵守・server-only）", () => {
  it("server-only 宣言", () => {
    expect(CODE).toContain("server-only");
  });
  it("本 module は .from / write を持たない（canonical source へ委譲・single-read-source 遵守）", () => {
    for (const t of [".from(", ".insert(", ".delete(", ".update(", ".rpc(", ".upsert(", "createClient", "@supabase"]) {
      expect(CODE).not.toContain(t);
    }
  });
  it("canonical read source を使う（seed-source / duration-evidence-source）", () => {
    expect(CODE).toContain("createColumnRestrictedSeedSource");
    expect(CODE).toContain("createColumnRestrictedDurationEvidenceSource");
  });
  it("route / UI を import しない", () => {
    for (const t of ['from "next/', 'from "@/app/', 'from "react"', "PlanClient"]) expect(CODE).not.toContain(t);
  });
  it("barrel(integration/index.ts) が morning-capture-surface を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("morning-capture-surface");
  });
});

// ── A1-5-8-2: resolveMorningProtocolCaptureFragment（route 用 DI fail-open seam）──
const SURFACE_DTO: CandidateSurfaceDTO = {
  hasCandidate: true,
  candidateCount: 1,
  status: "has_candidate",
  items: [{ durationMin: 60, evidenceSource: "seed_explicit", date: null, band: "morning", confidenceBand: "high" }],
};

describe("A1-5-8-2 resolveMorningProtocolCaptureFragment（DI fail-open seam・実 read は loader 内）", () => {
  it("loader → candidate surface → { captureCandidate: redacted }", async () => {
    expect(await resolveMorningProtocolCaptureFragment(async () => SURFACE_DTO)).toEqual({ captureCandidate: SURFACE_DTO });
  });
  it("loader → null（flag off / kill / gate block / no candidate）→ {}（morningProtocol 不変）", async () => {
    expect(await resolveMorningProtocolCaptureFragment(async () => null)).toEqual({});
  });
  it("loader → throws（read failure）→ {}（fail-open・response 成功を壊さない）", async () => {
    expect(await resolveMorningProtocolCaptureFragment(async () => { throw new Error("read fail"); })).toEqual({});
  });
  it("loader → hasCandidate=false → {}", async () => {
    expect(await resolveMorningProtocolCaptureFragment(async () => ({ hasCandidate: false, candidateCount: 0, status: "none", items: [] }))).toEqual({});
  });
  it("loader → 汚染 surface（source_ref/seedRef/UUID）→ fragment に leak しない（最終 redaction）", async () => {
    const contaminated = { ...SURFACE_DTO, source_ref: "SREF", items: [{ ...SURFACE_DTO.items[0], seedRef: SEED_ID }] } as unknown as CandidateSurfaceDTO;
    const json = JSON.stringify(await resolveMorningProtocolCaptureFragment(async () => contaminated));
    for (const leak of ["SREF", "source_ref", "seedRef", SEED_ID]) expect(json).not.toContain(leak);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
  it("loader を 1 回だけ await（DB/RPC/Supabase 実接続/実 LLM はテストに不在＝fake loader）", async () => {
    let called = 0;
    await resolveMorningProtocolCaptureFragment(async () => { called++; return null; });
    expect(called).toBe(1);
  });
  it("静的: resolveMorningProtocolCaptureFragment は read-only seam（write/.from/.rpc を持たない）", () => {
    expect(CODE).toContain("resolveMorningProtocolCaptureFragment");
    for (const t of [".insert(", ".rpc(", ".update(", ".upsert(", ".delete("]) expect(CODE).not.toContain(t);
  });
});
