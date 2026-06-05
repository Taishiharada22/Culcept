import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  validateExtractorOutput,
  createExtractedFakeExtractor,
  createNoIntentExtractor,
  type ExtractorStructuredOutput,
  type ValidatedExtractorOutput,
} from "@/lib/plan/reality/seed-extractor-contract";
import { buildStructuredCaptureInput, FORBIDDEN_INTAKE_FIELDS } from "@/lib/plan/reality/seed-capture-intake";
import { captureToDrafts } from "@/lib/plan/reality/seed-capture-mapper";
import { projectSeedRowsToPlacements } from "@/lib/plan/reality/integration/seed-column-restricted";
import { projectDurationEvidenceRowsToMap } from "@/lib/plan/reality/integration/duration-evidence-source";
import { enrichSeedPlacementsFromEvidences } from "@/lib/plan/reality/seed-placement-enrich";
import { generateComplete } from "@/lib/plan/reality/complete-generator";

const SEED = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const CAP = "2026-06-05T10:00:00Z";

function raw(p: Record<string, unknown> = {}): Record<string, unknown> {
  return { confidence: 0.9, source: "chat", desiredDate: "2026-06-06", desiredTimeHint: "morning", actionShape: "full_go", ...p };
}
// validated output → intake → mapper → projection → enrich → generateComplete（候補化確認）
function candidateOf(output: ValidatedExtractorOutput) {
  const intake = buildStructuredCaptureInput(SEED, USER, CAP, output);
  if (!intake.ok) throw new Error("intake rejected validated output");
  const drafts = captureToDrafts(intake.input);
  const placements = projectSeedRowsToPlacements([drafts.seedDraft]);
  let map: ReturnType<typeof projectDurationEvidenceRowsToMap> = {};
  if (drafts.evidenceDraft) {
    const e = drafts.evidenceDraft;
    map = projectDurationEvidenceRowsToMap([{ id: "ev1", user_id: e.user_id, seed_id: e.seed_id, duration_min: e.duration_min, source: e.source, confidence: e.confidence }]);
  }
  const enriched = enrichSeedPlacementsFromEvidences(placements, map);
  return generateComplete({ placements: enriched, existing: [], activeWindow: { startMin: 480, endMin: 1080 }, date: "2026-06-06", bandBounds: { morning: { startMin: 480, endMin: 720 } } });
}

const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/seed-extractor-contract.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-5b extractor contract — validateExtractorOutput valid/invalid", () => {
  it("valid output を validate でき output を返す（raw 本文なし）", () => {
    const v = validateExtractorOutput(raw({ sourceRef: "chat-msg_1", explicitDuration: { durationMin: 60, confidence: "high" } }));
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.output.confidence).toBe(0.9);
      expect(v.output.source).toBe("chat");
      expect(v.output.desiredTimeHint).toBe("morning");
      expect(v.output.actionShape).toBe("full_go");
      expect(v.output.sourceRef).toBe("chat-msg_1");
      // output は allowed key のみ（seedId/userId/capturedAt/raw を含まない）
      expect(Object.keys(v.output).sort()).toEqual(
        ["actionShape", "confidence", "desiredDate", "desiredTimeHint", "explicitDuration", "source", "sourceRef"].sort()
      );
    }
  });
  it("raw field（8 種）がある output は reject（raw_field_present）", () => {
    for (const f of FORBIDDEN_INTAKE_FIELDS) {
      const v = validateExtractorOutput(raw({ [f]: "RAW値" }));
      expect(v.ok).toBe(false);
      if (!v.ok) {
        expect(v.reason).toBe("raw_field_present");
        expect(v.field).toBe(f);
      }
    }
  });
  it("invalid date / time_hint / action_shape / confidence / source / source_ref を reject", () => {
    expect(validateExtractorOutput(raw({ desiredDate: "2026-13-45" })).ok).toBe(false);
    expect(validateExtractorOutput(raw({ desiredTimeHint: "midnight" })).ok).toBe(false);
    expect(validateExtractorOutput(raw({ actionShape: "bogus" })).ok).toBe(false);
    expect(validateExtractorOutput(raw({ confidence: 1.5 })).ok).toBe(false);
    expect(validateExtractorOutput(raw({ source: "email" })).ok).toBe(false);
    expect(validateExtractorOutput(raw({ sourceRef: "カフェで仕事したい" })).ok).toBe(false);
  });
  it("explicitDuration は 1<min<=1440 のみ許可（<=1 / >1440 / 非数値 → reject）", () => {
    expect(validateExtractorOutput(raw({ explicitDuration: { durationMin: 1, confidence: "high" } })).ok).toBe(false);
    expect(validateExtractorOutput(raw({ explicitDuration: { durationMin: 2000, confidence: "high" } })).ok).toBe(false);
    expect(validateExtractorOutput(raw({ explicitDuration: { durationMin: "60", confidence: "high" } })).ok).toBe(false);
    expect(validateExtractorOutput(raw({ explicitDuration: { durationMin: 60, confidence: "medium" } })).ok).toBe(false);
    expect(validateExtractorOutput(raw({ explicitDuration: { durationMin: 60, confidence: "high" } })).ok).toBe(true);
  });
});

describe("A1-5-5b extractor contract — non-throwing fail-closed", () => {
  it("null / undefined / string / number raw は reject（not_object・throw しない）", () => {
    for (const r of [null, undefined, "raw utterance", 123, true, []]) {
      let v: ReturnType<typeof validateExtractorOutput>;
      expect(() => { v = validateExtractorOutput(r); }).not.toThrow();
      v = validateExtractorOutput(r);
      expect(v.ok).toBe(false);
    }
  });
  it("proto-pollution / 未知 key は output に複写されない（allowlist 再構築）", () => {
    const v = validateExtractorOutput(raw({ extraJunk: "x", __proto__: { polluted: true }, signalish: "y" }));
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(Object.keys(v.output)).not.toContain("extraJunk");
      expect(Object.keys(v.output)).not.toContain("signalish");
      expect(JSON.stringify(v.output)).not.toContain("x");
    }
  });
});

describe("A1-5-5b extractor contract — fake extractor（valid / no_intent / invalid）", () => {
  it("createNoIntentExtractor → no_intent（no-op）", async () => {
    const r = await createNoIntentExtractor().extract({ utterance: "今日は特に何もない", nowIso: CAP });
    expect(r.kind).toBe("no_intent");
  });
  it("createExtractedFakeExtractor(valid) → extracted → validate ok", async () => {
    const r = await createExtractedFakeExtractor(raw({ explicitDuration: { durationMin: 60, confidence: "high" } })).extract({ utterance: "x", nowIso: CAP });
    expect(r.kind).toBe("extracted");
    if (r.kind === "extracted") expect(validateExtractorOutput(r.raw).ok).toBe(true);
  });
  it("createExtractedFakeExtractor(invalid: raw field) → extracted → validate reject（no-op 扱い）", async () => {
    const r = await createExtractedFakeExtractor(raw({ signal: "raw 本文" })).extract({ utterance: "x", nowIso: CAP });
    expect(r.kind).toBe("extracted");
    if (r.kind === "extracted") {
      const v = validateExtractorOutput(r.raw);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toBe("raw_field_present");
    }
  });
});

describe("A1-5-5b extractor contract — intake guard 連携 fixture（候補化）", () => {
  it("valid + explicitDuration high → intake 通過 → candidateCount>0", () => {
    const v = validateExtractorOutput(raw({ explicitDuration: { durationMin: 60, confidence: "high" } }));
    expect(v.ok).toBe(true);
    if (v.ok) expect(candidateOf(v.output)).not.toBeNull();
  });
  it("low confidence duration は通過するが evidence 化されず candidateCount=0（mapper 方針に整合）", () => {
    const v = validateExtractorOutput(raw({ explicitDuration: { durationMin: 60, confidence: "low" } }));
    expect(v.ok).toBe(true); // validator/intake は low を通す
    if (v.ok) expect(candidateOf(v.output)).toBeNull(); // mapper が low を evidence 化しない
  });
  it("duration なし → 通過するが candidateCount=0", () => {
    const v = validateExtractorOutput(raw());
    expect(v.ok).toBe(true);
    if (v.ok) expect(candidateOf(v.output)).toBeNull();
  });
});

describe("A1-5-5b extractor contract — 静的安全（LLM SDK / Supabase / DB / runtime 0・pure）", () => {
  it("LLM SDK を import しない（openai / anthropic / gemini）", () => {
    expect(CODE).not.toContain("openai");
    expect(CODE).not.toContain("anthropic");
    expect(CODE).not.toContain("gemini");
    expect(CODE).not.toContain("generateContent");
  });
  it("Supabase / DB を持たない（createClient / @supabase / .from / .rpc / .insert）", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert(", ".update(", ".delete("]) {
      expect(CODE).not.toContain(t);
    }
  });
  it("server-only でない（pure）", () => {
    expect(CODE).not.toContain("server-only");
  });
  it("reality barrel(index.ts) が seed-extractor-contract を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/index.ts"), "utf8");
    expect(idx).not.toContain("seed-extractor-contract");
  });
  it("ExtractorStructuredOutput 型を再 export している（型レベル・annotation で確認）", () => {
    const sample: ExtractorStructuredOutput = { confidence: 0.5, source: "chat" };
    expect(sample.source).toBe("chat");
    expect(SRC).toContain('export type { ExtractorStructuredOutput }');
  });
});
