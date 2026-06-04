import { describe, it, expect } from "vitest";
import {
  enrichSeedPlacement,
  enrichSeedPlacements,
  type DurationEvidence,
  type DurationEvidenceSource,
} from "@/lib/plan/reality/seed-placement-enrich";
import { buildSeedPlacements, isPlaceable, type SeedPlacement } from "@/lib/plan/reality/seed-placement";
import { generateComplete } from "@/lib/plan/reality/complete-generator";
import type { GovernedNode } from "@/lib/plan/reality/candidate-generator";
import type { PlanItemGovernance } from "@/lib/plan/reality/authority";
import type { PlanSeed } from "@/lib/plan/plan-seed";

function seed(over: Partial<PlanSeed> & { id: string }): PlanSeed {
  const base: PlanSeed = {
    id: over.id,
    userId: "u1",
    signal: "生の発話テキスト(raw)",
    confidence: 0.9,
    status: "active",
    source: "chat",
    capturedAt: "2026-06-05T00:00:00Z",
  };
  return { ...base, ...over };
}

function gov(p: Partial<PlanItemGovernance> = {}): PlanItemGovernance {
  return { origin: "user", authority: "user_owned", flexibility: "movable", protectionReasons: ["tentative"], ...p };
}

function govNode(id: string, startMin: number, endMin: number, g: PlanItemGovernance = gov()): GovernedNode {
  return { id, startMin, endMin, importance: "normal", hard: false, governance: g };
}

/** SeedPlacement fixture（buildSeedPlacements 直後の状態: durationMin=null・unknown）。 */
function placement(over: Partial<SeedPlacement> = {}): SeedPlacement {
  const base: SeedPlacement = {
    seedRef: "syn",
    durationMin: null,
    durationSource: "unknown",
    dispositionHint: "place",
    confidence: 0.9,
    grounding: "strong",
  };
  return { ...base, ...over };
}

function evidence(over: Partial<DurationEvidence> = {}): DurationEvidence {
  return { seedRef: "syn", durationMin: 60, source: "prm_typical", confidence: "high", ...over };
}

describe("A1-4-3a enrichSeedPlacement — structured evidence でだけ duration が入る", () => {
  it("evidence なし → 不変（durationMin null のまま）", () => {
    expect(enrichSeedPlacement(placement(), undefined).durationMin).toBeNull();
  });

  it("valid evidence → durationMin が入り durationSource 対応・placeable=true", () => {
    const out = enrichSeedPlacement(placement({ seedRef: "syn" }), evidence({ seedRef: "syn", durationMin: 60, source: "prm_typical", confidence: "high" }));
    expect(out.durationMin).toBe(60);
    expect(out.durationSource).toBe("prm_typical");
    expect(isPlaceable(out)).toBe(true);
  });

  it("confidence=low（弱い証拠）→ 不変（null のまま）", () => {
    expect(enrichSeedPlacement(placement(), evidence({ confidence: "low" })).durationMin).toBeNull();
  });

  it("seedRef 不一致 → enrich しない", () => {
    expect(enrichSeedPlacement(placement({ seedRef: "syn" }), evidence({ seedRef: "other" })).durationMin).toBeNull();
  });

  it("source 不明/不正 → enrich しない（runtime malformed 防御）", () => {
    expect(enrichSeedPlacement(placement(), evidence({ source: "bogus" as DurationEvidenceSource })).durationMin).toBeNull();
  });

  it("範囲外 / NaN / Infinity / 1 分以下 → enrich しない", () => {
    for (const d of [1, 0, -5, 1441, 5000, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(enrichSeedPlacement(placement(), evidence({ durationMin: d })).durationMin).toBeNull();
    }
  });

  it("境界の有効値（>1分・≤1日）は採用", () => {
    expect(enrichSeedPlacement(placement(), evidence({ durationMin: 2 })).durationMin).toBe(2);
    expect(enrichSeedPlacement(placement(), evidence({ durationMin: 1440 })).durationMin).toBe(1440);
  });

  it("既に durationMin がある placement は上書きしない", () => {
    const p = placement({ durationMin: 120, durationSource: "seed_explicit" });
    const out = enrichSeedPlacement(p, evidence({ durationMin: 60, source: "prm_typical" }));
    expect(out.durationMin).toBe(120);
    expect(out.durationSource).toBe("seed_explicit");
  });

  it("confidence / grounding / dispositionHint / seedRef（traceability）を保持", () => {
    const p = placement({ seedRef: "syn", confidence: 0.7, grounding: "strong", dispositionHint: "place" });
    const out = enrichSeedPlacement(p, evidence({ seedRef: "syn", durationMin: 45 }));
    expect(out.seedRef).toBe("syn");
    expect(out.confidence).toBe(0.7);
    expect(out.grounding).toBe("strong");
    expect(out.dispositionHint).toBe("place");
    expect(out.durationMin).toBe(45);
  });

  it("各 source（seed_explicit/prm_typical/correction）が durationSource に対応", () => {
    for (const s of ["seed_explicit", "prm_typical", "correction"] as const) {
      const out = enrichSeedPlacement(placement(), evidence({ source: s }));
      expect(out.durationSource).toBe(s);
    }
  });
});

describe("A1-4-3a enrichSeedPlacements — map で複数 enrich", () => {
  it("evidenceMap で seedRef ごとに enrich（無い/弱いものは不変）", () => {
    const ps = [placement({ seedRef: "a" }), placement({ seedRef: "b" }), placement({ seedRef: "c" })];
    const map = {
      a: evidence({ seedRef: "a", durationMin: 30 }),
      b: evidence({ seedRef: "b", durationMin: 60, confidence: "low" }), // low → enrich されない
    };
    const out = enrichSeedPlacements(ps, map);
    expect(out[0].durationMin).toBe(30); // a: enriched
    expect(out[1].durationMin).toBeNull(); // b: low
    expect(out[2].durationMin).toBeNull(); // c: evidence なし
    expect(out.map((p) => p.seedRef)).toEqual(["a", "b", "c"]); // 入力順保持
  });

  it("evidenceMap なし → 全て不変", () => {
    const ps = [placement({ seedRef: "a" }), placement({ seedRef: "b" })];
    expect(enrichSeedPlacements(ps, undefined).every((p) => p.durationMin === null)).toBe(true);
  });
});

describe("A1-4-3a 実 seed の境界（evidence なし→0 / evidence あり→実候補）", () => {
  it("実 seed + evidence なし → placeable=false のまま（候補 0 維持）", () => {
    const placements = buildSeedPlacements([seed({ id: "s1", actionShape: "full_go", confidence: 0.9 })]);
    const out = enrichSeedPlacements(placements, undefined);
    expect(out.every(isPlaceable)).toBe(false);
  });

  it("buildSeedPlacements → enrichSeedPlacements → generateComplete: 実 seed + evidence で実候補が出る", () => {
    const placements = buildSeedPlacements([
      seed({ id: "s1", actionShape: "full_go", confidence: 0.9, desiredDate: "2026-06-06", desiredTimeHint: "morning" }),
    ]);
    expect(placements[0].durationMin).toBeNull(); // enrich 前
    expect(isPlaceable(placements[0])).toBe(false);

    const enriched = enrichSeedPlacements(placements, { s1: evidence({ seedRef: "s1", durationMin: 60, source: "prm_typical", confidence: "high" }) });
    expect(enriched[0].durationMin).toBe(60);
    expect(enriched[0].durationSource).toBe("prm_typical");
    expect(isPlaceable(enriched[0])).toBe(true);

    const draft = generateComplete({
      placements: enriched,
      existing: [govNode("a", 480, 540), govNode("b", 600, 720)], // morning [480,720] → gap [540,600]
      activeWindow: { startMin: 480, endMin: 1080 },
      date: "2026-06-06",
      bandBounds: { morning: { startMin: 480, endMin: 720 } },
    });
    expect(draft).not.toBeNull();
    expect(draft?.changeSet.ops.length).toBe(1);
    const op = draft!.changeSet.ops[0];
    if (op.kind === "add") {
      expect(op.after.startMin).toBe(540);
      expect(op.after.endMin).toBe(600); // 540 + 60
    }
  });
});
