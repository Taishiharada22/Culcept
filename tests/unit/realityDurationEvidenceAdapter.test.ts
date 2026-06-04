import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  toDurationEvidence,
  seedExplicitToEvidence,
  correctionToEvidence,
  prmTypicalToEvidence,
  assembleDurationEvidenceMap,
} from "@/lib/plan/reality/duration-evidence-adapter";
import { enrichSeedPlacementsFromEvidences } from "@/lib/plan/reality/seed-placement-enrich";
import { projectSeedRowsToPlacements, type ColumnRestrictedSeedRow } from "@/lib/plan/reality/integration/seed-column-restricted";
import { generateComplete } from "@/lib/plan/reality/complete-generator";
import { isPlaceable, type SeedPlacement } from "@/lib/plan/reality/seed-placement";

// fixture: structured plan_seeds row -> canonical placement（grounding strong / disposition place / durationMin null）
function placement(seedRef = "s1"): readonly SeedPlacement[] {
  const rows: ColumnRestrictedSeedRow[] = [
    { id: seedRef, user_id: "u1", desired_date: "2026-06-06", desired_time_hint: "morning", action_shape: "full_go", confidence: 0.9, status: "active" },
  ];
  return projectSeedRowsToPlacements(rows);
}
// morning band に 240 分の空き → 60 分は一意 gap で配置可
function complete(placements: readonly SeedPlacement[]) {
  return generateComplete({
    placements,
    existing: [],
    activeWindow: { startMin: 480, endMin: 1080 },
    date: "2026-06-06",
    bandBounds: { morning: { startMin: 480, endMin: 720 } },
  });
}

describe("A1-5-3a adapter — source 別整形", () => {
  it("seed_explicit high valid → DurationEvidence化", () => {
    expect(seedExplicitToEvidence({ seedRef: "s1", durationMin: 60, confidence: "high" })).toEqual({
      seedRef: "s1", durationMin: 60, source: "seed_explicit", confidence: "high",
    });
  });
  it("correction high valid → DurationEvidence化", () => {
    expect(correctionToEvidence({ seedRef: "s1", correctedMin: 45, confidence: "high" })).toEqual({
      seedRef: "s1", durationMin: 45, source: "correction", confidence: "high",
    });
  });
  it("prm_typical high valid → DurationEvidence化（source prm_typical・confidence high）", () => {
    expect(prmTypicalToEvidence({ seedRef: "s1", typicalMin: 30, typicalConfidence: "high" })).toEqual({
      seedRef: "s1", durationMin: 30, source: "prm_typical", confidence: "high",
    });
  });
  it("prm_typical の medium / low → confidence low に写像", () => {
    expect(prmTypicalToEvidence({ seedRef: "s1", typicalMin: 30, typicalConfidence: "medium" })?.confidence).toBe("low");
    expect(prmTypicalToEvidence({ seedRef: "s1", typicalMin: 30, typicalConfidence: "low" })?.confidence).toBe("low");
  });
});

describe("A1-5-3a adapter — well-formed reject（null）", () => {
  it("duration 範囲外（>1440 / <=1 / 非有限）→ null", () => {
    expect(seedExplicitToEvidence({ seedRef: "s1", durationMin: 2000, confidence: "high" })).toBeNull();
    expect(seedExplicitToEvidence({ seedRef: "s1", durationMin: 1, confidence: "high" })).toBeNull(); // d>1 必須
    expect(seedExplicitToEvidence({ seedRef: "s1", durationMin: 0, confidence: "high" })).toBeNull();
    expect(seedExplicitToEvidence({ seedRef: "s1", durationMin: Number.NaN, confidence: "high" })).toBeNull();
    expect(seedExplicitToEvidence({ seedRef: "s1", durationMin: Number.POSITIVE_INFINITY, confidence: "high" })).toBeNull();
  });
  it("seedRef 空 → null", () => {
    expect(seedExplicitToEvidence({ seedRef: "", durationMin: 60, confidence: "high" })).toBeNull();
  });
  it("unknown / invalid source → null（generic toDurationEvidence）", () => {
    expect(toDurationEvidence({ seedRef: "s1", durationMin: 60, source: "garbage", confidence: "high" })).toBeNull();
    expect(toDurationEvidence({ seedRef: "s1", durationMin: 60, source: "unknown", confidence: "high" })).toBeNull();
    // 正当 source は通る
    expect(toDurationEvidence({ seedRef: "s1", durationMin: 60, source: "seed_explicit", confidence: "high" })).not.toBeNull();
  });
});

describe("A1-5-3a assembler — seedRef → DurationEvidence[]", () => {
  it("null 除外・seedRef ごとに集約", () => {
    const map = assembleDurationEvidenceMap([
      seedExplicitToEvidence({ seedRef: "a", durationMin: 60, confidence: "high" }),
      prmTypicalToEvidence({ seedRef: "a", typicalMin: 30, typicalConfidence: "high" }),
      correctionToEvidence({ seedRef: "b", correctedMin: 45, confidence: "high" }),
      seedExplicitToEvidence({ seedRef: "s1", durationMin: 2000, confidence: "high" }), // null → 除外
    ]);
    expect(Object.keys(map).sort()).toEqual(["a", "b"]);
    expect(map["a"]?.length).toBe(2);
    expect(map["b"]?.length).toBe(1);
  });
});

describe("A1-5-3a pipeline — candidateCount 実証（adapter→assemble→enrich→generateComplete）", () => {
  it("seed_explicit high + fixture placement + gap → candidateCount>0", () => {
    const map = assembleDurationEvidenceMap([seedExplicitToEvidence({ seedRef: "s1", durationMin: 60, confidence: "high" })]);
    const enriched = enrichSeedPlacementsFromEvidences(placement("s1"), map);
    expect(enriched[0]?.durationMin).toBe(60);
    expect(enriched[0]?.durationSource).toBe("seed_explicit");
    expect(enriched[0]?.grounding).toBe("strong"); // seed_explicit は strong 維持
    expect(isPlaceable(enriched[0]!)).toBe(true);
    const draft = complete(enriched);
    expect(draft).not.toBeNull(); // ★ candidateCount>0
    expect(draft?.changeSet.ops.length).toBe(1);
  });

  it("correction high（strong 維持）→ candidateCount>0", () => {
    const map = assembleDurationEvidenceMap([correctionToEvidence({ seedRef: "s1", correctedMin: 60, confidence: "high" })]);
    const enriched = enrichSeedPlacementsFromEvidences(placement("s1"), map);
    expect(enriched[0]?.durationSource).toBe("correction");
    expect(enriched[0]?.grounding).toBe("strong");
    expect(complete(enriched)).not.toBeNull();
  });

  it("prm_typical high + fixture placement + gap → grounding weak → candidateCount=0（安全床）", () => {
    const map = assembleDurationEvidenceMap([prmTypicalToEvidence({ seedRef: "s1", typicalMin: 60, typicalConfidence: "high" })]);
    const enriched = enrichSeedPlacementsFromEvidences(placement("s1"), map);
    expect(enriched[0]?.durationMin).toBe(60); // enrich はされる
    expect(enriched[0]?.durationSource).toBe("prm_typical");
    expect(enriched[0]?.grounding).toBe("weak"); // ★ prm_typical → weak
    expect(complete(enriched)).toBeNull(); // ★ candidateCount=0（grounding weak で候補化されない）
  });

  it("low confidence → 採用されず candidateCount=0", () => {
    const map = assembleDurationEvidenceMap([seedExplicitToEvidence({ seedRef: "s1", durationMin: 60, confidence: "low" })]);
    const enriched = enrichSeedPlacementsFromEvidences(placement("s1"), map);
    expect(enriched[0]?.durationMin).toBeNull(); // low → enrich reject
    expect(complete(enriched)).toBeNull();
  });

  it("seedRef mismatch → 採用されず candidateCount=0", () => {
    const map = assembleDurationEvidenceMap([seedExplicitToEvidence({ seedRef: "OTHER", durationMin: 60, confidence: "high" })]);
    const enriched = enrichSeedPlacementsFromEvidences(placement("s1"), map);
    expect(enriched[0]?.durationMin).toBeNull(); // s1 への evidence なし
    expect(complete(enriched)).toBeNull();
  });

  it("same priority duration conflict → no enrich → candidateCount=0", () => {
    const map = assembleDurationEvidenceMap([
      seedExplicitToEvidence({ seedRef: "s1", durationMin: 60, confidence: "high" }),
      seedExplicitToEvidence({ seedRef: "s1", durationMin: 90, confidence: "high" }),
    ]);
    const enriched = enrichSeedPlacementsFromEvidences(placement("s1"), map);
    expect(enriched[0]?.durationMin).toBeNull(); // 同 priority 不一致 → no enrich
    expect(complete(enriched)).toBeNull();
  });

  it("priority: seed_explicit > correction > prm_typical（seed_explicit 採用・strong 維持・候補化）", () => {
    const map = assembleDurationEvidenceMap([
      prmTypicalToEvidence({ seedRef: "s1", typicalMin: 30, typicalConfidence: "high" }),
      correctionToEvidence({ seedRef: "s1", correctedMin: 45, confidence: "high" }),
      seedExplicitToEvidence({ seedRef: "s1", durationMin: 90, confidence: "high" }),
    ]);
    const enriched = enrichSeedPlacementsFromEvidences(placement("s1"), map);
    expect(enriched[0]?.durationMin).toBe(90); // seed_explicit 勝利
    expect(enriched[0]?.durationSource).toBe("seed_explicit");
    expect(enriched[0]?.grounding).toBe("strong");
    expect(complete(enriched)).not.toBeNull(); // 候補化
  });
});

describe("A1-5-3a 静的安全（raw / DB / PRM / correction / default 不在 / barrel 非 export）", () => {
  const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/duration-evidence-adapter.ts"), "utf8");
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

  it("raw text(signal / desiredAction)を扱わない", () => {
    expect(CODE).not.toContain("signal");
    expect(CODE).not.toContain("desiredAction");
    expect(CODE).not.toContain("desired_action");
  });
  it("DB / PRM / correction runtime を import しない・server-only でない", () => {
    expect(CODE).not.toContain("createClient");
    expect(CODE).not.toContain(".from(");
    expect(CODE).not.toContain("typicalDuration");
    expect(CODE).not.toContain("correctionMemoryFrame");
    expect(CODE).not.toContain("server-only");
  });
  it("default duration を発明しない（入力 duration を pass-through・|| / ?? の数値 default なし）", () => {
    expect(CODE).not.toMatch(/\?\?\s*\d/);
    expect(CODE).not.toMatch(/\|\|\s*\d/);
    expect(seedExplicitToEvidence({ seedRef: "s1", durationMin: 17, confidence: "high" })?.durationMin).toBe(17);
    expect(prmTypicalToEvidence({ seedRef: "s1", typicalMin: 23, typicalConfidence: "high" })?.durationMin).toBe(23);
  });
  it("reality barrel(index.ts) が duration-evidence-adapter を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/index.ts"), "utf8");
    expect(idx).not.toContain("duration-evidence-adapter");
  });
});
