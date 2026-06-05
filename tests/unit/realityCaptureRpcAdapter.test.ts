import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  buildCaptureRpcArgs,
  createRpcCaptureWriteClient,
  createFakeRpcClient,
  createNoRunRpcClient,
  CAPTURE_RPC_NAME,
} from "@/lib/plan/reality/integration/capture-rpc-adapter";
import { writeStructuredCapture } from "@/lib/plan/reality/integration/capture-write-repository";
import {
  captureToDrafts,
  type StructuredCaptureInput,
  type PlanSeedInsertDraft,
  type DurationEvidenceInsertDraft,
} from "@/lib/plan/reality/seed-capture-mapper";

function input(p: Partial<StructuredCaptureInput> = {}): StructuredCaptureInput {
  return { seedId: "s1", userId: "u1", desiredDate: "2026-06-06", desiredTimeHint: "morning", actionShape: "full_go", confidence: 0.9, source: "chat", capturedAt: "2026-06-05T10:00:00Z", ...p };
}
function seedDraft(p: Partial<PlanSeedInsertDraft> = {}): PlanSeedInsertDraft {
  return { id: "s1", user_id: "u1", desired_date: null, desired_time_hint: null, action_shape: null, confidence: 0.9, status: "active", source: "chat", captured_at: "t", expires_at: null, source_ref: null, ...p };
}
function evidenceDraft(p: Partial<DurationEvidenceInsertDraft> = {}): DurationEvidenceInsertDraft {
  return { user_id: "u1", seed_id: "s1", duration_min: 60, source: "seed_explicit", confidence: "high", source_ref: null, ...p };
}
const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/capture-rpc-adapter.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-4b-4 RPC adapter — args shape", () => {
  it("RPC 名が create_plan_seed_capture_bundle", () => {
    expect(CAPTURE_RPC_NAME).toBe("create_plan_seed_capture_bundle");
  });
  it("args が p_user_id / p_seed / p_evidence（p_user_id = seed.user_id）", () => {
    const args = buildCaptureRpcArgs({ seed: seedDraft({ user_id: "u9" }), evidence: evidenceDraft({ user_id: "u9" }) });
    expect(Object.keys(args).sort()).toEqual(["p_evidence", "p_seed", "p_user_id"]);
    expect(args.p_user_id).toBe("u9");
  });
  it("p_seed は structured-only（plan_seeds 11 列）", () => {
    const args = buildCaptureRpcArgs({ seed: seedDraft(), evidence: null });
    expect(Object.keys(args.p_seed).sort()).toEqual([
      "action_shape", "captured_at", "confidence", "desired_date", "desired_time_hint", "expires_at", "id", "source", "source_ref", "status", "user_id",
    ]);
  });
  it("p_evidence は structured-only（evidence 6 列）or null", () => {
    expect(buildCaptureRpcArgs({ seed: seedDraft(), evidence: null }).p_evidence).toBeNull();
    const args = buildCaptureRpcArgs({ seed: seedDraft(), evidence: evidenceDraft() });
    expect(Object.keys(args.p_evidence!).sort()).toEqual(["confidence", "duration_min", "seed_id", "source", "source_ref", "user_id"]);
  });
  it("raw fields 0（signal/desiredAction/desired_action/raw_text/title/location）", () => {
    const json = JSON.stringify(buildCaptureRpcArgs(buildPayload({ explicitDuration: { durationMin: 60, confidence: "high" }, sourceRef: "ref-1" })));
    for (const raw of ["signal", "desiredAction", "desired_action", "raw_text", "title", "location"]) expect(json).not.toContain(raw);
  });
  it("source_ref は opaque として保持", () => {
    const args = buildCaptureRpcArgs(buildPayload({ explicitDuration: { durationMin: 60, confidence: "high" }, sourceRef: "chatmsg-z" }));
    expect(args.p_seed.source_ref).toBe("chatmsg-z");
    expect(args.p_evidence?.source_ref).toBe("chatmsg-z");
  });
});

// captureToDrafts -> payload helper
function buildPayload(p: Partial<StructuredCaptureInput> = {}) {
  const d = captureToDrafts(input(p));
  return { seed: d.seedDraft, evidence: d.evidenceDraft };
}

describe("A1-5-4b-4 RPC adapter — 1 回の RPC call / 失敗分類（fake / no-run）", () => {
  it("seed + evidence が 1 回の RPC call にまとまる（fn + args 検証・DB write 0）", async () => {
    const fake = createFakeRpcClient();
    const out = await writeStructuredCapture(captureToDrafts(input({ explicitDuration: { durationMin: 60, confidence: "high" } })), createRpcCaptureWriteClient(fake));
    expect(out).toEqual({ ok: true, code: "ok" });
    expect(fake.calls.length).toBe(1);
    expect(fake.calls[0]?.fn).toBe(CAPTURE_RPC_NAME);
    expect(fake.calls[0]?.args.p_seed.id).toBe("s1");
    expect(fake.calls[0]?.args.p_evidence?.seed_id).toBe("s1");
  });
  it("evidence なしなら p_evidence=null（call は 1 回）", async () => {
    const fake = createFakeRpcClient();
    await writeStructuredCapture(captureToDrafts(input()), createRpcCaptureWriteClient(fake));
    expect(fake.calls.length).toBe(1);
    expect(fake.calls[0]?.args.p_evidence).toBeNull();
  });
  it("owner mismatch は RPC 前に reject（rpc call 0）", async () => {
    const fake = createFakeRpcClient();
    const out = await writeStructuredCapture({ seedDraft: seedDraft({ user_id: "u1" }), evidenceDraft: evidenceDraft({ user_id: "u2" }) }, createRpcCaptureWriteClient(fake));
    expect(out.code).toBe("owner_mismatch");
    expect(fake.calls.length).toBe(0);
  });
  it("seed linkage mismatch は RPC 前に reject（rpc call 0）", async () => {
    const fake = createFakeRpcClient();
    const out = await writeStructuredCapture({ seedDraft: seedDraft({ id: "s1" }), evidenceDraft: evidenceDraft({ seed_id: "OTHER" }) }, createRpcCaptureWriteClient(fake));
    expect(out.code).toBe("seed_link_mismatch");
    expect(fake.calls.length).toBe(0);
  });
  it("RPC error → write_failed（失敗分類）", async () => {
    const fake = createFakeRpcClient({ error: { message: "boom", code: "23514" } });
    const out = await writeStructuredCapture(captureToDrafts(input()), createRpcCaptureWriteClient(fake));
    expect(out).toEqual({ ok: false, code: "write_failed" });
    expect(fake.calls.length).toBe(1); // RPC は試行された
  });
  it("no-run client → no_run（実 DB 接続 0・実 RPC 実行 0）", async () => {
    const out = await writeStructuredCapture(captureToDrafts(input()), createRpcCaptureWriteClient(createNoRunRpcClient()));
    expect(out).toEqual({ ok: false, code: "no_run" });
  });
});

describe("A1-5-4b-4 RPC adapter — 静的安全", () => {
  it("createClient / @supabase / .from / .insert を持たない（実接続・実 write 0）", () => {
    expect(CODE).not.toContain("createClient");
    expect(CODE).not.toContain("@supabase");
    expect(CODE).not.toContain(".from(");
    expect(CODE).not.toContain(".insert(");
  });
  it("service_role を持たない", () => {
    expect(CODE).not.toContain("service_role");
  });
  it("barrel(integration/index.ts) が capture-rpc-adapter を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("capture-rpc-adapter");
  });
});
