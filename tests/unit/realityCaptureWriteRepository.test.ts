import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  writeStructuredCapture,
  buildCaptureWritePayload,
  createFakeCaptureWriteClient,
  createNoRunCaptureWriteClient,
} from "@/lib/plan/reality/integration/capture-write-repository";
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
const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/capture-write-repository.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-4b-1 write seam — payload shape（structured-only）", () => {
  it("plan seed insert payload が structured-only（plan_seeds 列のみ・raw なし）", () => {
    const p = buildCaptureWritePayload(captureToDrafts(input()));
    expect(Object.keys(p.seed).sort()).toEqual([
      "action_shape", "captured_at", "confidence", "desired_date", "desired_time_hint", "expires_at", "id", "source", "source_ref", "status", "user_id",
    ]);
  });
  it("evidence insert payload が structured-only（evidence 列のみ）", () => {
    const p = buildCaptureWritePayload(captureToDrafts(input({ explicitDuration: { durationMin: 60, confidence: "high" } })));
    expect(p.evidence).not.toBeNull();
    expect(Object.keys(p.evidence!).sort()).toEqual(["confidence", "duration_min", "seed_id", "source", "source_ref", "user_id"]);
  });
  it("raw fields 0（signal/desiredAction/desired_action/raw_text/title/location）", () => {
    const json = JSON.stringify(buildCaptureWritePayload(captureToDrafts(input({ sourceRef: "ref-1", explicitDuration: { durationMin: 60, confidence: "high" } }))));
    for (const raw of ["signal", "desiredAction", "desired_action", "raw_text", "title", "location"]) expect(json).not.toContain(raw);
  });
  it("source_ref は opaque として保持（raw 本文でない）", () => {
    const p = buildCaptureWritePayload(captureToDrafts(input({ sourceRef: "chatmsg-xyz", explicitDuration: { durationMin: 60, confidence: "high" } })));
    expect(p.seed.source_ref).toBe("chatmsg-xyz");
    expect(p.evidence?.source_ref).toBe("chatmsg-xyz");
  });
});

describe("A1-5-4b-1 write seam — evidence 有無 / 整合", () => {
  it("duration なし → evidence payload なし（seed のみ）", () => {
    const p = buildCaptureWritePayload(captureToDrafts(input()));
    expect(p.evidence).toBeNull();
  });
  it("duration あり → seed_explicit evidence payload あり", () => {
    const p = buildCaptureWritePayload(captureToDrafts(input({ explicitDuration: { durationMin: 60, confidence: "high" } })));
    expect(p.evidence?.source).toBe("seed_explicit");
    expect(p.evidence?.duration_min).toBe(60);
  });
  it("invalid evidence（mapper が弾く）→ payload 化されない", () => {
    expect(buildCaptureWritePayload(captureToDrafts(input({ explicitDuration: { durationMin: 2000, confidence: "high" } }))).evidence).toBeNull();
    expect(buildCaptureWritePayload(captureToDrafts(input({ explicitDuration: { durationMin: 60, confidence: "low" } }))).evidence).toBeNull();
  });
  it("user_id が seed/evidence で一致", () => {
    const p = buildCaptureWritePayload(captureToDrafts(input({ explicitDuration: { durationMin: 60, confidence: "high" } })));
    expect(p.evidence?.user_id).toBe(p.seed.user_id);
  });
  it("seed_id が evidence.seed_id に入る", () => {
    const p = buildCaptureWritePayload(captureToDrafts(input({ seedId: "seedX", explicitDuration: { durationMin: 60, confidence: "high" } })));
    expect(p.evidence?.seed_id).toBe("seedX");
    expect(p.seed.id).toBe("seedX");
  });
});

describe("A1-5-4b-1 write seam — atomic write（fake / no-run・DB write 0）", () => {
  it("fake client: seed+evidence を 1 回の atomic payload で渡す（DB write 0）", async () => {
    const drafts = captureToDrafts(input({ explicitDuration: { durationMin: 60, confidence: "high" } }));
    const fake = createFakeCaptureWriteClient();
    const out = await writeStructuredCapture(drafts, fake);
    expect(out).toEqual({ ok: true, code: "ok" });
    expect(fake.writes.length).toBe(1); // atomic: seed+evidence を 1 payload
    expect(fake.writes[0]?.seed.id).toBe("s1");
    expect(fake.writes[0]?.evidence?.seed_id).toBe("s1");
  });
  it("evidence なしでも atomic payload は 1 回（seed のみ）", async () => {
    const fake = createFakeCaptureWriteClient();
    await writeStructuredCapture(captureToDrafts(input()), fake);
    expect(fake.writes.length).toBe(1);
    expect(fake.writes[0]?.evidence).toBeNull();
  });
  it("no-run client: 一切書かず no_run（実 DB 接続 0）", async () => {
    const out = await writeStructuredCapture(captureToDrafts(input()), createNoRunCaptureWriteClient());
    expect(out).toEqual({ ok: false, code: "no_run" });
  });
  it("owner 不一致（seed.user_id != evidence.user_id）→ owner_mismatch・write されない", async () => {
    const fake = createFakeCaptureWriteClient();
    const out = await writeStructuredCapture({ seedDraft: seedDraft({ user_id: "u1" }), evidenceDraft: evidenceDraft({ user_id: "u2" }) }, fake);
    expect(out.code).toBe("owner_mismatch");
    expect(fake.writes.length).toBe(0);
  });
  it("seed linkage 不一致（evidence.seed_id != seed.id）→ seed_link_mismatch・write されない", async () => {
    const fake = createFakeCaptureWriteClient();
    const out = await writeStructuredCapture({ seedDraft: seedDraft({ id: "s1" }), evidenceDraft: evidenceDraft({ seed_id: "OTHER" }) }, fake);
    expect(out.code).toBe("seed_link_mismatch");
    expect(fake.writes.length).toBe(0);
  });
});

describe("A1-5-4b-1 write seam — 静的安全", () => {
  it("Supabase client / .from / .insert / service_role / createClient を持たない（実 DB write 0）", () => {
    expect(CODE).not.toContain("createClient");
    expect(CODE).not.toContain(".from(");
    expect(CODE).not.toContain(".insert(");
    expect(CODE).not.toContain(".update(");
    expect(CODE).not.toContain(".delete(");
    expect(CODE).not.toContain(".upsert(");
    expect(CODE).not.toContain("service_role");
    expect(CODE).not.toContain("supabase");
  });
  it("raw fields を持たない", () => {
    expect(CODE).not.toContain("signal");
    expect(CODE).not.toContain("desiredAction");
  });
  it("barrel(integration/index.ts) が capture-write-repository を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("capture-write-repository");
  });
});
