/**
 * A1-5-11-5 Capture Write Policy Live Activation — fake/no-run tests
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.62
 *
 * 目的: A1-5-11-4 で core（orchestrator + service）に入れた write policy を、本流 capture write path
 *   （fireMorningCapture）で実際に使える状態にする配線を検証する。
 *   - read client plumbing: `loadActiveCandidateEntries`（既存 active seeds → CandidateLifecycleEntry[] provider）。
 *   - dedup キー一致: write 候補（draftToCandidateEntry）と read 既存（buildLifecycleEntryFromPlacement）と
 *     surface guard が **同一 band 正規化**（anytime/未指定→null）で dedup する＝anytime の取りこぼし防止。
 *   - fireMorningCapture が policy（existingActive provider + nowMs）を runtime write path に渡す（静的配線確認）。
 *
 * 安全境界（厳守・本テストで担保）:
 *   - **実 DB read/write 0 / 実 RPC 0 / Supabase 実接続 0**（fake read client・fake write client・no-network）。deterministic（now 注入）。
 *   - fireMorningCapture 自体は fire-and-forget + PLAN_FLAGS + 実 extractor ゆえ **静的配線**で検証（実行しない＝route shell 非実行）。
 *   - production 非接触（flags off → fireMorningCapture no-op）。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  buildLifecycleEntryFromPlacement,
  candidateDedupKey,
  type CandidateLifecycleEntry,
} from "@/lib/plan/reality/integration/candidate-lifecycle-guard";
import {
  loadActiveCandidateEntries,
  type PendingCapturedRowsReadClient,
} from "@/lib/plan/reality/integration/morning-capture-surface.server";
import { runStructuredCapturePipeline } from "@/lib/plan/reality/integration/structured-capture-orchestrator";
import { createFakeCaptureWriteClient } from "@/lib/plan/reality/integration/capture-write-repository";
import type { CaptureWritePolicyDeps } from "@/lib/plan/reality/integration/capture-write-policy";
import type { SeedPlacement } from "@/lib/plan/reality/seed-placement";
import type { SeedLifecycleMeta, ColumnRestrictedSeedRow } from "@/lib/plan/reality/integration/seed-column-restricted";
import type { ColumnRestrictedDurationEvidenceRow } from "@/lib/plan/reality/integration/duration-evidence-source";

const SEED_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-06-07T10:00:00.000Z");
const CAP = "2026-06-07T10:00:00.000Z";
const DAY = 24 * 60 * 60 * 1000;

function placement(p: Partial<SeedPlacement> = {}): SeedPlacement {
  return { seedRef: SEED_ID, date: undefined, window: undefined, durationMin: 60, durationSource: "seed_explicit", dispositionHint: "place", confidence: 0.9, grounding: "strong", ...p };
}
function meta(p: Partial<SeedLifecycleMeta> = {}): SeedLifecycleMeta {
  return { actionShape: "full_go", capturedAtMs: NOW - 60_000, expiresAtMs: null, ...p };
}

// ── 1. buildLifecycleEntryFromPlacement（共有 builder・pure・band 正規化） ──
describe("A1-5-11-5 buildLifecycleEntryFromPlacement（共有 entry builder）", () => {
  it("placement + meta → entry（band=morning / durationMin / lifecycle from meta）", () => {
    const e = buildLifecycleEntryFromPlacement(placement({ window: { band: "morning" }, date: "2026-06-08" }), meta(), NOW);
    expect(e).toEqual({
      seedRef: SEED_ID,
      status: "active",
      capturedAtMs: NOW - 60_000,
      expiresAtMs: null,
      actionShape: "full_go",
      desiredDate: "2026-06-08",
      desiredTimeHint: "morning",
      durationMin: 60,
      confidence: 0.9,
    });
  });
  it("window 未指定（anytime 相当）→ desiredTimeHint null（band 正規化）", () => {
    expect(buildLifecycleEntryFromPlacement(placement({ window: undefined }), meta(), NOW).desiredTimeHint).toBeNull();
  });
  it("window evening → desiredTimeHint evening", () => {
    expect(buildLifecycleEntryFromPlacement(placement({ window: { band: "evening" } }), meta(), NOW).desiredTimeHint).toBe("evening");
  });
  it("meta 欠落 → fail-open（capturedAtMs=nowMs / expiresAtMs=null / actionShape=null）", () => {
    const e = buildLifecycleEntryFromPlacement(placement(), undefined, NOW);
    expect(e.capturedAtMs).toBe(NOW);
    expect(e.expiresAtMs).toBeNull();
    expect(e.actionShape).toBeNull();
  });
  it("deterministic（同入力→同出力・Date.now 非使用）", () => {
    expect(buildLifecycleEntryFromPlacement(placement(), meta(), NOW)).toEqual(buildLifecycleEntryFromPlacement(placement(), meta(), NOW));
  });
});

// ── 2. loadActiveCandidateEntries（read provider・fake client・fail-open） ──
function seedRow(p: Partial<ColumnRestrictedSeedRow> = {}): ColumnRestrictedSeedRow {
  return { id: SEED_ID, user_id: USER_ID, desired_date: null, desired_time_hint: "morning", action_shape: "full_go", confidence: 0.9, status: "active", captured_at: CAP, expires_at: null, ...p };
}
function evRow(p: Partial<ColumnRestrictedDurationEvidenceRow> = {}): ColumnRestrictedDurationEvidenceRow {
  return { id: "33333333-3333-4333-8333-333333333333", user_id: USER_ID, seed_id: SEED_ID, duration_min: 60, source: "seed_explicit", confidence: "high", ...p };
}
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

describe("A1-5-11-5 loadActiveCandidateEntries（read-before-write provider・fake client）", () => {
  it("active seed + evidence → entry[1]（status active / durationMin 60 / band morning）", async () => {
    const entries = await loadActiveCandidateEntries(fakeClient({ seedData: [seedRow()], evData: [evRow()] }), USER_ID, NOW);
    expect(entries).toHaveLength(1);
    expect(entries[0].seedRef).toBe(SEED_ID);
    expect(entries[0].status).toBe("active");
    expect(entries[0].durationMin).toBe(60);
    expect(entries[0].desiredTimeHint).toBe("morning");
    expect(entries[0].actionShape).toBe("full_go");
  });
  it("desired_time_hint=anytime → entry.desiredTimeHint null（read 側も band 正規化）", async () => {
    const entries = await loadActiveCandidateEntries(fakeClient({ seedData: [seedRow({ desired_time_hint: "anytime" })], evData: [evRow()] }), USER_ID, NOW);
    expect(entries[0].desiredTimeHint).toBeNull();
  });
  it("seed 0 → []（fail-open）", async () => {
    expect(await loadActiveCandidateEntries(fakeClient({ seedData: [] }), USER_ID, NOW)).toEqual([]);
  });
  it("seed read error → []（fail-open・loadPendingProjected null）", async () => {
    expect(await loadActiveCandidateEntries(fakeClient({ seedErr: true }), USER_ID, NOW)).toEqual([]);
  });
  it("entry に raw/source_ref/UUID(source_ref) を持たない（構造のみ・seedRef は内部 tie-break）", async () => {
    const entries = await loadActiveCandidateEntries(fakeClient({ seedData: [seedRow()], evData: [evRow()] }), USER_ID, NOW);
    const json = JSON.stringify(entries);
    for (const leak of ["source_ref", "signal", "desired_action"]) expect(json).not.toContain(leak);
  });
});

// ── 3. dedup キー一致（write 候補 band 正規化 ↔ read 既存 band）= anytime suppress ──
const EXTRACTED_ANYTIME = { confidence: 0.9, source: "chat", desiredTimeHint: "anytime", actionShape: "full_go", explicitDuration: { durationMin: 60, confidence: "high" } };
const EXTRACTED_MORNING = { confidence: 0.9, source: "chat", desiredTimeHint: "morning", actionShape: "full_go", explicitDuration: { durationMin: 60, confidence: "high" } };

function pipeInput(extracted: unknown) {
  return { seedId: SEED_ID, userId: USER_ID, capturedAt: CAP, extracted };
}
function policy(existing: readonly CandidateLifecycleEntry[]): CaptureWritePolicyDeps {
  return { existingActive: async () => existing, nowMs: NOW };
}
function existingEntry(p: Partial<CandidateLifecycleEntry> = {}): CandidateLifecycleEntry {
  return { seedRef: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", status: "active", capturedAtMs: NOW - 60_000, expiresAtMs: null, actionShape: "full_go", desiredDate: null, desiredTimeHint: null, durationMin: 60, confidence: 0.8, ...p };
}

describe("A1-5-11-5 dedup キー一致（band 正規化で anytime も suppress）", () => {
  it("buildLifecycleEntryFromPlacement(anytime) と read entry(timeHint null) の dedup キーが一致", () => {
    const read = buildLifecycleEntryFromPlacement(placement({ window: undefined }), meta(), NOW); // anytime→null
    expect(candidateDedupKey(read)).toBe(candidateDedupKey(existingEntry({ durationMin: 60 })));
  });
  it("extracted anytime + 既存 active(timeHint null・同構造) → suppress（write 候補も band null＝一致）", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runStructuredCapturePipeline(pipeInput(EXTRACTED_ANYTIME), fake, policy([existingEntry({ desiredTimeHint: null })]));
    expect(r).toEqual({ ok: true, stage: "suppressed", wroteEvidence: false });
    expect(fake.writes.length).toBe(0);
  });
  it("extracted morning + 既存 active(timeHint morning) → suppress（特定 band も従来どおり）", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runStructuredCapturePipeline(pipeInput(EXTRACTED_MORNING), fake, policy([existingEntry({ desiredTimeHint: "morning" })]));
    expect(r).toEqual({ ok: true, stage: "suppressed", wroteEvidence: false });
    expect(fake.writes.length).toBe(0);
  });
  it("extracted anytime + 既存 active(timeHint morning) → insert（band 不一致は別構造）", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runStructuredCapturePipeline(pipeInput(EXTRACTED_ANYTIME), fake, policy([existingEntry({ desiredTimeHint: "morning" })]));
    expect(r).toMatchObject({ ok: true, stage: "write" });
    expect(fake.writes.length).toBe(1);
  });
  it("policy 未指定 → 既存挙動不変（write 1・dedup なし）", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runStructuredCapturePipeline(pipeInput(EXTRACTED_ANYTIME), fake);
    expect(r).toMatchObject({ ok: true, stage: "write" });
    expect(fake.writes.length).toBe(1);
  });
});

// ── 4. fireMorningCapture / route 静的配線（実行しない＝route shell 非実行） ──
function stripped(rel: string): string {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
}

describe("A1-5-11-5 fireMorningCapture 静的配線（policy を runtime write path に渡す）", () => {
  const code = stripped("lib/plan/reality/integration/alter-morning-capture-observe.ts");
  it("policy を構築し deps に渡す（existingActive provider + nowMs 注入）", () => {
    expect(code).toContain("loadActiveCandidateEntries");
    expect(code).toContain("existingActive");
    expect(code).toContain("CaptureWritePolicyDeps");
    expect(code).toContain("writeClient, policy"); // deps に policy を載せる
    expect(code).toContain("Date.now()"); // server で nowMs を 1 回注入
  });
  it("MorningCaptureClient（write=RPC + read provider）を export し fireMorningCapture が受ける", () => {
    expect(code).toContain("export type MorningCaptureClient");
    expect(code).toContain("client: MorningCaptureClient");
  });
  it("既存 static 安全を維持（本 module に createClient/@supabase/.from/.rpc/.insert 不在）", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert("]) expect(code).not.toContain(t);
  });
  it("mode null（flags off）→ policy/extractor 構築前に return（production no-op の配置）", () => {
    // decideCaptureMode の null 早期 return が policy 構築より前にある（source 順序）。
    //   policy 構築は object literal の `existingActive:`（import の loadActiveCandidateEntries ではなく usage）で位置特定する。
    const idxReturn = code.indexOf("if (mode === null) return");
    const idxPolicy = code.indexOf("existingActive:");
    expect(idxReturn).toBeGreaterThan(0);
    expect(idxPolicy).toBeGreaterThan(idxReturn); // policy 構築は mode null return より後
  });
});

describe("A1-5-11-5 route 静的配線（read+write client を渡す・RpcCapableClient cast 廃止）", () => {
  for (const rel of ["app/api/alter-morning/plan/route.ts", "app/api/stargazer/alter/route.ts"]) {
    it(`${rel} は MorningCaptureClient を渡す（RpcCapableClient cast なし）`, () => {
      const code = stripped(rel);
      expect(code).toContain("as unknown as MorningCaptureClient");
      expect(code).not.toContain("as unknown as RpcCapableClient");
    });
  }
});
