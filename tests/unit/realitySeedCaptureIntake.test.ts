import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  buildStructuredCaptureInput,
  FORBIDDEN_INTAKE_FIELDS,
} from "@/lib/plan/reality/seed-capture-intake";
import { captureToDrafts } from "@/lib/plan/reality/seed-capture-mapper";
import { projectSeedRowsToPlacements } from "@/lib/plan/reality/integration/seed-column-restricted";
import { projectDurationEvidenceRowsToMap } from "@/lib/plan/reality/integration/duration-evidence-source";
import { enrichSeedPlacementsFromEvidences } from "@/lib/plan/reality/seed-placement-enrich";
import { generateComplete } from "@/lib/plan/reality/complete-generator";

const SEED_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";
const CAPTURED = "2026-06-05T10:00:00Z";
function extracted(p: Record<string, unknown> = {}): Record<string, unknown> {
  return { confidence: 0.9, source: "chat", desiredDate: "2026-06-06", desiredTimeHint: "morning", actionShape: "full_go", ...p };
}
function build(p: Record<string, unknown> = {}) {
  return buildStructuredCaptureInput(SEED_ID, USER_ID, CAPTURED, extracted(p));
}
function candidate(res: ReturnType<typeof build>) {
  if (!res.ok) throw new Error("intake rejected");
  const drafts = captureToDrafts(res.input);
  const placements = projectSeedRowsToPlacements([drafts.seedDraft]);
  let map: ReturnType<typeof projectDurationEvidenceRowsToMap> = {};
  if (drafts.evidenceDraft) {
    const ev = drafts.evidenceDraft;
    map = projectDurationEvidenceRowsToMap([{ id: "ev1", user_id: ev.user_id, seed_id: ev.seed_id, duration_min: ev.duration_min, source: ev.source, confidence: ev.confidence }]);
  }
  const enriched = enrichSeedPlacementsFromEvidences(placements, map);
  return generateComplete({ placements: enriched, existing: [], activeWindow: { startMin: 480, endMin: 1080 }, date: "2026-06-06", bandBounds: { morning: { startMin: 480, endMin: 720 } } });
}
const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/seed-capture-intake.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-4c-1 intake — valid build / 外部注入", () => {
  it("structured input から StructuredCaptureInput を作れる", () => {
    const r = build();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.confidence).toBe(0.9);
    expect(r.input.source).toBe("chat");
    expect(r.input.desiredDate).toBe("2026-06-06");
    expect(r.input.desiredTimeHint).toBe("morning");
    expect(r.input.actionShape).toBe("full_go");
  });
  it("seedId / userId / capturedAt は外部注入（extracted の同名 key は無視）", () => {
    const r = buildStructuredCaptureInput(SEED_ID, USER_ID, CAPTURED, { confidence: 0.9, source: "chat", seedId: "EVIL", userId: "EVIL", capturedAt: "EVIL" } as unknown);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.seedId).toBe(SEED_ID);
    expect(r.input.userId).toBe(USER_ID);
    expect(r.input.capturedAt).toBe(CAPTURED);
  });
  it("not_object（null/string/number）は reject", () => {
    expect(buildStructuredCaptureInput(SEED_ID, USER_ID, CAPTURED, null).ok).toBe(false);
    expect(buildStructuredCaptureInput(SEED_ID, USER_ID, CAPTURED, "raw utterance").ok).toBe(false);
    expect(buildStructuredCaptureInput(SEED_ID, USER_ID, CAPTURED, 123).ok).toBe(false);
  });
});

describe("A1-5-4c-1 intake — raw field fail-closed reject", () => {
  it("raw field（signal/desiredAction/desired_action/raw_text/title/location/prompt/transcript）が在れば reject", () => {
    for (const f of FORBIDDEN_INTAKE_FIELDS) {
      const r = build({ [f]: "RAW値" });
      expect(r.ok).toBe(false);
      if (!r.ok) { expect(r.reason).toBe("raw_field_present"); expect(r.field).toBe(f); }
    }
  });
});

describe("A1-5-4c-1 intake — structured validation reject", () => {
  it("invalid date（実在しない / 形式不正）→ reject", () => {
    expect(build({ desiredDate: "2026-13-45" }).ok).toBe(false);
    expect(build({ desiredDate: "2026-02-30" }).ok).toBe(false);
    expect(build({ desiredDate: "not-a-date" }).ok).toBe(false);
  });
  it("invalid time_hint → reject", () => {
    expect(build({ desiredTimeHint: "midnight" }).ok).toBe(false);
  });
  it("invalid action_shape → reject", () => {
    expect(build({ actionShape: "bogus" }).ok).toBe(false);
  });
  it("confidence 範囲外 / 非数値 → reject", () => {
    expect(build({ confidence: 1.5 }).ok).toBe(false);
    expect(build({ confidence: -0.1 }).ok).toBe(false);
    expect(build({ confidence: "high" }).ok).toBe(false);
  });
  it("invalid source → reject", () => {
    expect(build({ source: "email" }).ok).toBe(false);
    expect(build({ source: undefined }).ok).toBe(false);
  });
  it("source_ref が raw っぽい（空白 / 長文 / dashed phrase / 非 id 文字）→ reject", () => {
    expect(build({ sourceRef: "カフェで 仕事 したい" }).ok).toBe(false); // 空白 + 非 id
    expect(build({ sourceRef: "カフェで仕事したい" }).ok).toBe(false); // 非 id 文字（日本語）
    expect(build({ sourceRef: "x".repeat(200) }).ok).toBe(false); // 長文
    // adversarial probe(A1-5-4c-1): dashed ascii phrase（rawっぽい長文）も reject（64 tighten 後）
    expect(build({ sourceRef: "remember-to-buy-groceries-and-call-the-dentist-before-the-meeting-on-friday" }).ok).toBe(false);
    expect(build({ sourceRef: "a".repeat(65) }).ok).toBe(false); // >64
    expect(build({ sourceRef: "a".repeat(64) }).ok).toBe(true); // 64 境界は許可
    const ok = build({ sourceRef: "chat-msg_abc.123" });
    expect(ok.ok).toBe(true); // opaque id 形は許可
    if (ok.ok) expect(ok.input.sourceRef).toBe("chat-msg_abc.123");
  });
});

describe("A1-5-4c-1 intake — explicitDuration", () => {
  it("valid high → explicitDuration 通過（seed_explicit 経路）", () => {
    const r = build({ explicitDuration: { durationMin: 60, confidence: "high" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.explicitDuration).toEqual({ durationMin: 60, confidence: "high" });
  });
  it("explicitDuration なし → input.explicitDuration undefined", () => {
    const r = build();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.explicitDuration).toBeUndefined();
  });
  it("invalid duration（<=1 / >1440 / 非数値）→ reject", () => {
    expect(build({ explicitDuration: { durationMin: 1, confidence: "high" } }).ok).toBe(false);
    expect(build({ explicitDuration: { durationMin: 2000, confidence: "high" } }).ok).toBe(false);
    expect(build({ explicitDuration: { durationMin: "60", confidence: "high" } }).ok).toBe(false);
  });
  it("invalid explicit confidence → reject", () => {
    expect(build({ explicitDuration: { durationMin: 60, confidence: "medium" } }).ok).toBe(false);
  });
  it("low confidence → 通過するが下流 mapper で evidence 化されない（candidateCount=0）", () => {
    const r = build({ explicitDuration: { durationMin: 60, confidence: "low" } });
    expect(r.ok).toBe(true);
    expect(candidate(r)).toBeNull();
  });
});

describe("A1-5-4c-1 intake — pipeline candidateCount（intake→captureToDrafts→projection→enrich→generateComplete）", () => {
  it("valid + explicitDuration high → candidateCount>0", () => {
    expect(candidate(build({ explicitDuration: { durationMin: 60, confidence: "high" } }))).not.toBeNull();
  });
  it("duration なし → candidateCount=0", () => {
    expect(candidate(build())).toBeNull();
  });
});

describe("A1-5-4c-1 intake — 静的安全（raw parse / DB / runtime 0）", () => {
  it("DB / RPC / Supabase client を持たない（raw parse でなく検証のみ）", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(CODE).not.toContain(t);
    }
  });
  it("server-only でない（pure validation）", () => {
    expect(CODE).not.toContain("server-only");
  });
  it("LLM / prompt 実装を持たない（raw を parse せず reject）", () => {
    expect(CODE).not.toContain("openai");
    expect(CODE).not.toContain("anthropic");
    expect(CODE).not.toContain("completion");
  });
  it("reality barrel(index.ts) が seed-capture-intake を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/index.ts"), "utf8");
    expect(idx).not.toContain("seed-capture-intake");
  });
});
