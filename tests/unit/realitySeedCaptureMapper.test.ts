import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  captureToDrafts,
  type StructuredCaptureInput,
} from "@/lib/plan/reality/seed-capture-mapper";
import { projectSeedRowsToPlacements } from "@/lib/plan/reality/integration/seed-column-restricted";
import { projectDurationEvidenceRowsToMap, type ColumnRestrictedDurationEvidenceRow } from "@/lib/plan/reality/integration/duration-evidence-source";
import { enrichSeedPlacementsFromEvidences } from "@/lib/plan/reality/seed-placement-enrich";
import { generateComplete } from "@/lib/plan/reality/complete-generator";

function input(p: Partial<StructuredCaptureInput> = {}): StructuredCaptureInput {
  return { seedId: "s1", userId: "u1", desiredDate: "2026-06-06", desiredTimeHint: "morning", actionShape: "full_go", confidence: 0.9, source: "chat", capturedAt: "2026-06-05T10:00:00Z", ...p };
}
// drafts -> pipeline（既存 projection 再利用）-> candidate
function candidateFrom(d: ReturnType<typeof captureToDrafts>) {
  const placements = projectSeedRowsToPlacements([d.seedDraft]); // PlanSeedInsertDraft は ColumnRestrictedSeedRow の superset
  let map: Record<string, ReturnType<typeof projectDurationEvidenceRowsToMap>[string]> = {};
  if (d.evidenceDraft) {
    const ev = d.evidenceDraft;
    const evRow: ColumnRestrictedDurationEvidenceRow = { id: "ev1", user_id: ev.user_id, seed_id: ev.seed_id, duration_min: ev.duration_min, source: ev.source, confidence: ev.confidence };
    map = projectDurationEvidenceRowsToMap([evRow]);
  }
  const enriched = enrichSeedPlacementsFromEvidences(placements, map);
  return { enriched, draft: generateComplete({ placements: enriched, existing: [], activeWindow: { startMin: 480, endMin: 1080 }, date: "2026-06-06", bandBounds: { morning: { startMin: 480, endMin: 720 } } }) };
}
const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/seed-capture-mapper.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-4a capture mapper — seed draft（structured-only）", () => {
  it("structured input から plan seed draft が作れる（structured-only schema 一致）", () => {
    const { seedDraft } = captureToDrafts(input());
    expect(seedDraft).toEqual({
      id: "s1", user_id: "u1", desired_date: "2026-06-06", desired_time_hint: "morning", action_shape: "full_go",
      confidence: 0.9, status: "active", source: "chat", captured_at: "2026-06-05T10:00:00Z", expires_at: null, source_ref: null,
    });
    expect(Object.keys(seedDraft).sort()).toEqual([
      "action_shape", "captured_at", "confidence", "desired_date", "desired_time_hint", "expires_at", "id", "source", "source_ref", "status", "user_id",
    ]);
  });
  it("任意フィールド未指定は null（desired_date/time_hint/action_shape/expires_at/source_ref）", () => {
    const { seedDraft } = captureToDrafts(input({ desiredDate: undefined, desiredTimeHint: undefined, actionShape: undefined, expiresAt: undefined, sourceRef: undefined }));
    expect(seedDraft.desired_date).toBeNull();
    expect(seedDraft.desired_time_hint).toBeNull();
    expect(seedDraft.action_shape).toBeNull();
    expect(seedDraft.expires_at).toBeNull();
    expect(seedDraft.source_ref).toBeNull();
  });
  it("raw fields を型に持たない（input / draft）", () => {
    const i = input();
    // @ts-expect-error signal は StructuredCaptureInput に存在しない
    void i.signal;
    // @ts-expect-error desiredAction は存在しない
    void i.desiredAction;
    // @ts-expect-error raw_text は存在しない
    void i.raw_text;
    const { seedDraft } = captureToDrafts(i);
    // @ts-expect-error seedDraft に signal はない
    void seedDraft.signal;
    // @ts-expect-error seedDraft に desired_action はない
    void seedDraft.desired_action;
    expect(true).toBe(true);
  });
});

describe("A1-5-4a capture mapper — evidence draft（seed_explicit のみ）", () => {
  it("duration 明示あり(high・valid) → seed_explicit evidence draft（evidence schema 一致）", () => {
    const { evidenceDraft } = captureToDrafts(input({ explicitDuration: { durationMin: 60, confidence: "high" } }));
    expect(evidenceDraft).toEqual({ user_id: "u1", seed_id: "s1", duration_min: 60, source: "seed_explicit", confidence: "high", source_ref: null });
    expect(Object.keys(evidenceDraft!).sort()).toEqual(["confidence", "duration_min", "seed_id", "source", "source_ref", "user_id"]);
  });
  it("duration なし → evidence なし", () => {
    expect(captureToDrafts(input()).evidenceDraft).toBeNull();
  });
  it("invalid duration（<=1 / >1440） → evidence なし（default duration を置かない）", () => {
    expect(captureToDrafts(input({ explicitDuration: { durationMin: 1, confidence: "high" } })).evidenceDraft).toBeNull();
    expect(captureToDrafts(input({ explicitDuration: { durationMin: 0, confidence: "high" } })).evidenceDraft).toBeNull();
    expect(captureToDrafts(input({ explicitDuration: { durationMin: 2000, confidence: "high" } })).evidenceDraft).toBeNull();
  });
  it("confidence 低 → evidence なし", () => {
    expect(captureToDrafts(input({ explicitDuration: { durationMin: 60, confidence: "low" } })).evidenceDraft).toBeNull();
  });
  it("source は常に seed_explicit（prm_typical をここで作らない）", () => {
    const { evidenceDraft } = captureToDrafts(input({ explicitDuration: { durationMin: 60, confidence: "high" } }));
    expect(evidenceDraft?.source).toBe("seed_explicit");
    expect(CODE).not.toContain("prm_typical");
  });
});

describe("A1-5-4a capture mapper — source_ref opaque / raw 非出力", () => {
  it("source_ref は opaque で透過（raw 本文でない）", () => {
    const d = captureToDrafts(input({ sourceRef: "chatmsg-abc-123", explicitDuration: { durationMin: 60, confidence: "high" } }));
    expect(d.seedDraft.source_ref).toBe("chatmsg-abc-123");
    expect(d.evidenceDraft?.source_ref).toBe("chatmsg-abc-123");
  });
  it("mapper 出力に signal / desiredAction / raw_text / title / location が出ない", () => {
    const json = JSON.stringify(captureToDrafts(input({ sourceRef: "ref-1", explicitDuration: { durationMin: 60, confidence: "high" } })));
    for (const raw of ["signal", "desiredAction", "desired_action", "raw_text", "title", "location"]) {
      expect(json).not.toContain(raw);
    }
  });
});

describe("A1-5-4a capture mapper — pipeline candidateCount（既存 projection 再利用）", () => {
  it("seed_explicit fixture → candidateCount>0", () => {
    const { enriched, draft } = candidateFrom(captureToDrafts(input({ explicitDuration: { durationMin: 60, confidence: "high" } })));
    expect(enriched[0]?.durationMin).toBe(60);
    expect(enriched[0]?.durationSource).toBe("seed_explicit");
    expect(enriched[0]?.grounding).toBe("strong");
    expect(draft).not.toBeNull(); // ★ candidateCount>0
  });
  it("duration なし fixture → candidateCount=0", () => {
    const { enriched, draft } = candidateFrom(captureToDrafts(input()));
    expect(enriched[0]?.durationMin).toBeNull();
    expect(draft).toBeNull();
  });
});

describe("A1-5-4a capture mapper — 静的安全（DB/runtime/raw parse/default 不在）", () => {
  it("Supabase client / .from / service_role / createClient を持たない", () => {
    expect(CODE).not.toContain("createClient");
    expect(CODE).not.toContain(".from(");
    expect(CODE).not.toContain("service_role");
    expect(CODE).not.toContain("supabase");
  });
  it("DB write（insert/update/delete/upsert）を持たない", () => {
    for (const w of [".insert(", ".update(", ".delete(", ".upsert("]) expect(CODE).not.toContain(w);
  });
  it("raw parse（signal/desiredAction/LLM）を持たない", () => {
    expect(CODE).not.toContain("signal");
    expect(CODE).not.toContain("desiredAction");
    expect(CODE).not.toContain("llm");
    expect(CODE).not.toContain("parse");
  });
  it("default duration を置かない（|| / ?? の数値 default なし）", () => {
    expect(CODE).not.toMatch(/\?\?\s*\d/);
    expect(CODE).not.toMatch(/\|\|\s*\d/);
  });
  it("reality barrel(index.ts) が seed-capture-mapper を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/index.ts"), "utf8");
    expect(idx).not.toContain("seed-capture-mapper");
  });
});
