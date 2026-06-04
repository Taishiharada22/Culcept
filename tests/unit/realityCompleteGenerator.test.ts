import { describe, it, expect } from "vitest";
import { generateComplete } from "@/lib/plan/reality/complete-generator";
import { buildSeedPlacements, type SeedPlacement } from "@/lib/plan/reality/seed-placement";
import { evaluateCandidate } from "@/lib/plan/reality/candidate-evaluator";
import { rankCandidates } from "@/lib/plan/reality/best-action";
import type { GovernedNode, GenerationContext } from "@/lib/plan/reality/candidate-generator";
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

/** synthetic（PRM 想定 duration あり）の SeedPlacement fixture。 */
function placement(over: Partial<SeedPlacement> = {}): SeedPlacement {
  const base: SeedPlacement = {
    seedRef: "syn",
    durationMin: 120,
    durationSource: "prm_typical",
    dispositionHint: "place",
    confidence: 0.9,
    grounding: "strong",
  };
  return { ...base, ...over };
}

function ctxFor(existing: readonly GovernedNode[]): GenerationContext {
  return { mode: "complete", nodes: existing, touchable: [], preserved: [], goals: { seeds: [] } };
}

describe("A1-4-2a generateComplete — 実 seed / synthetic の境界", () => {
  it("実 seed（duration なし）からは候補 0（捏造しない床の維持）", () => {
    const placements = buildSeedPlacements([
      seed({ id: "s1", actionShape: "full_go", confidence: 0.95, desiredDate: "2026-06-06", desiredTimeHint: "morning" }),
      seed({ id: "s2", actionShape: "bounded_go", confidence: 0.99 }),
    ]);
    const draft = generateComplete({
      placements,
      existing: [govNode("a", 540, 600)],
      activeWindow: { startMin: 480, endMin: 1080 },
      date: "2026-06-06",
      bandBounds: { morning: { startMin: 480, endMin: 720 } },
    });
    expect(draft).toBeNull();
  });

  it("synthetic duration あり placement からは候補が出る（add 1・gap 先頭・governance proposed）", () => {
    const existing = [govNode("a", 540, 600)];
    const draft = generateComplete({
      placements: [placement({ seedRef: "syn1", durationMin: 120 })],
      existing,
      activeWindow: { startMin: 540, endMin: 720 },
    });
    expect(draft).not.toBeNull();
    expect(draft?.changeSet.ops.length).toBe(1);
    const op = draft!.changeSet.ops[0];
    expect(op.kind).toBe("add");
    if (op.kind === "add") {
      expect(op.after.startMin).toBe(600); // gap [600,720] 先頭
      expect(op.after.endMin).toBe(720);
      expect(op.after.governance?.origin).toBe("alter_generated");
      expect(op.after.governance?.authority).toBe("proposed");
      expect(op.after.governance?.flexibility).toBe("movable");
    }
  });
});

describe("A1-4-2a 結合条件 — isPlaceable 単独では置かない", () => {
  const existing = [govNode("a", 540, 600)];
  const win = { startMin: 540, endMin: 720 } as const;

  it("durationSource=unknown は候補化しない", () => {
    expect(generateComplete({ placements: [placement({ durationMin: 120, durationSource: "unknown" })], existing, activeWindow: win })).toBeNull();
  });
  it("grounding=weak は候補化しない", () => {
    expect(generateComplete({ placements: [placement({ grounding: "weak" })], existing, activeWindow: win })).toBeNull();
  });
  it("disposition=tentative は候補化しない", () => {
    expect(generateComplete({ placements: [placement({ dispositionHint: "tentative" })], existing, activeWindow: win })).toBeNull();
  });
  it("disposition=skip は候補化しない", () => {
    expect(generateComplete({ placements: [placement({ dispositionHint: "skip" })], existing, activeWindow: win })).toBeNull();
  });
  it("durationMin<=0 は候補化しない", () => {
    expect(generateComplete({ placements: [placement({ durationMin: 0 })], existing: [], activeWindow: win })).toBeNull();
  });
});

describe("A1-4-2a date 照合", () => {
  const existing = [govNode("a", 540, 600)];
  const win = { startMin: 540, endMin: 720 } as const;

  it("date 一致（dated + 当日一致）なら候補化", () => {
    expect(generateComplete({ placements: [placement({ date: "2026-06-06", durationMin: 120 })], existing, activeWindow: win, date: "2026-06-06" })).not.toBeNull();
  });
  it("date 不一致は候補化しない", () => {
    expect(generateComplete({ placements: [placement({ date: "2026-06-07", durationMin: 120 })], existing, activeWindow: win, date: "2026-06-06" })).toBeNull();
  });
  it("placement が dated で当日 date 不明なら照合不能で候補化しない（推測しない）", () => {
    expect(generateComplete({ placements: [placement({ date: "2026-06-06", durationMin: 120 })], existing, activeWindow: win })).toBeNull();
  });
});

describe("A1-4-2a gap 一意性", () => {
  it("複数 gap に置ける場合は曖昧で no candidate", () => {
    // active [480,1080], existing [600,660], duration 30 → gaps [480,600],[660,1080] 両方 fit
    expect(generateComplete({ placements: [placement({ durationMin: 30 })], existing: [govNode("a", 600, 660)], activeWindow: { startMin: 480, endMin: 1080 } })).toBeNull();
  });
  it("gap が足りない場合は no candidate", () => {
    // active [540,600] 60min, duration 120
    expect(generateComplete({ placements: [placement({ durationMin: 120 })], existing: [], activeWindow: { startMin: 540, endMin: 600 } })).toBeNull();
  });
  it("compatible gap が一意なら配置（gap 先頭 earliest-fit）", () => {
    // active [480,1080], existing [480,540],[600,1080], duration 60 → gap [540,600] のみ
    const draft = generateComplete({ placements: [placement({ durationMin: 60 })], existing: [govNode("a", 480, 540), govNode("b", 600, 1080)], activeWindow: { startMin: 480, endMin: 1080 } });
    expect(draft).not.toBeNull();
    const op = draft!.changeSet.ops[0];
    if (op.kind === "add") {
      expect(op.after.startMin).toBe(540);
      expect(op.after.endMin).toBe(600);
    }
  });
});

describe("A1-4-2a window（band）解決 — clock を推測しない", () => {
  it("banded placement: bandBounds なしは no candidate", () => {
    expect(generateComplete({
      placements: [placement({ window: { band: "morning" }, durationMin: 60 })],
      existing: [govNode("a", 480, 540), govNode("b", 600, 720)],
      activeWindow: { startMin: 480, endMin: 1080 },
    })).toBeNull();
  });
  it("banded placement: bandBounds ありで band 内 gap 一意なら候補化", () => {
    // morning [480,720], active [480,1080], existing [480,540],[600,720] → region [480,720], gap [540,600]
    const draft = generateComplete({
      placements: [placement({ window: { band: "morning" }, durationMin: 60 })],
      existing: [govNode("a", 480, 540), govNode("b", 600, 720)],
      activeWindow: { startMin: 480, endMin: 1080 },
      bandBounds: { morning: { startMin: 480, endMin: 720 } },
    });
    expect(draft).not.toBeNull();
    const op = draft!.changeSet.ops[0];
    if (op.kind === "add") {
      expect(op.after.startMin).toBe(540);
      expect(op.after.endMin).toBe(600);
    }
  });
});

describe("A1-4-2a 多重配置 / raw text", () => {
  it("eligible が複数なら多重配置は曖昧で no candidate（A1-4-2b へ defer）", () => {
    expect(generateComplete({
      placements: [placement({ seedRef: "a", durationMin: 60 }), placement({ seedRef: "b", durationMin: 60 })],
      existing: [],
      activeWindow: { startMin: 540, endMin: 1080 },
    })).toBeNull();
  });

  it("生成 item は raw text を持たない（title なし・reason は固定定型・ref は seedRef id）", () => {
    const draft = generateComplete({ placements: [placement({ seedRef: "syn1", durationMin: 120 })], existing: [govNode("a", 540, 600)], activeWindow: { startMin: 540, endMin: 720 } });
    const op = draft!.changeSet.ops[0];
    if (op.kind === "add") expect(op.after.title).toBeUndefined();
    expect(draft!.sourceTraces[0]?.reason).toBe("空き時間に配置(complete)");
    expect(draft!.sourceTraces[0]?.ref).toBe("syn1");
    expect(draft!.proposedDisposition).toBe("confirm");
  });
});

describe("A1-4-2a evaluate + rank（test 内検証のみ）", () => {
  it("生成候補は evaluator で全 safety true、rank で best（add は安全）", () => {
    const existing = [govNode("a", 540, 600)];
    const draft = generateComplete({ placements: [placement({ seedRef: "syn1", durationMin: 120 })], existing, activeWindow: { startMin: 540, endMin: 720 } });
    expect(draft).not.toBeNull();
    const candidate = evaluateCandidate(draft!, ctxFor(existing));
    expect(candidate.metrics.feasible).toBe(true);
    expect(candidate.metrics.recoveryProtected).toBe(true);
    expect(candidate.metrics.deadlineSatisfied).toBe(true);
    expect(candidate.metrics.wholePartCoherent).toBe(true);
    const rank = rankCandidates([candidate]);
    expect(rank.best?.candidate.id).toBe(draft!.id);
    expect(rank.rejected.length).toBe(0);
  });

  it("実 seed 由来は候補 0 ＝ rank する候補が存在しない", () => {
    const placements = buildSeedPlacements([seed({ id: "s1", actionShape: "full_go", confidence: 0.95 })]);
    const draft = generateComplete({ placements, existing: [], activeWindow: { startMin: 540, endMin: 720 } });
    expect(draft).toBeNull();
  });
});
