/**
 * 横 R2 — Life Ops × Empty-day 3案 Compose（pure・fake/fixture のみ）unit。
 *   実 collector → placement → 実 generateEmptyDay → compose の full pure chain + 容量エッジ（手組み fixture）。
 *   R2 本体無改変・honest overflow・3案累積包含・R4/Briefing 素材保持を固定。
 *
 * 設計: docs/life-ops-empty-day-compose-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { composeLifeOpsIntoDayProposals } from "@/lib/plan/reality/lifeops/lifeops-empty-day-compose";
import { placeLifeOpsCandidatesForDay, type LifeOpsPlacementResult, type PlacedLifeOpsCandidate } from "@/lib/plan/reality/lifeops/lifeops-placement";
import { collectLifeOpsCandidates, type LifeOpsInputs } from "@/lib/lifeops/candidate-collector";
import { generateEmptyDay, type EmptyDayProposalSet, type EmptyDayTier } from "@/lib/plan/reality/empty-day/empty-day-generator";
import { deriveEmptyDayInput } from "@/lib/plan/reality/world-state/world-state-derive";
import { synthesizeMemory } from "@/lib/plan/reality/learning/memory-synthesis";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

const FORBIDDEN = /seed_?ref|utterance|personality|trait|title|location|@[a-z]|\b\d{10,}\b/i;
const NOW_ISO = "2026-06-10T09:00:00+09:00";
const NOW_MS = Date.parse(NOW_ISO);

function fakeInputs(): LifeOpsInputs {
  return {
    cadenceObservations: [
      { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-04-11T10:00:00+09:00" },
      { categoryId: "groceries", lastCompletedAtISO: "2026-05-31T10:00:00+09:00" },
    ],
    upcomingEvents: [{ kind: "interview", startISO: "2026-06-13T10:00:00+09:00" }],
    deadlineObservations: [{ categoryId: "tax_filing", deadlineISO: "2026-06-15T00:00:00+09:00" }],
  };
}

function ws(): WorldState {
  return {
    date: "2026-06-10",
    nowMinute: 540,
    todaySchedule: [],
    availableWindows: [
      { startMinute: 600, endMinute: 660, meaning: null },
      { startMinute: 780, endMinute: 960, meaning: null },
    ],
    context: null,
    mobility: null,
    permissionLevel: 2,
  };
}

/** full pure chain（実 collector → placement → 実 R2 generator → compose）。 */
function chain() {
  const world = ws();
  const candidates = collectLifeOpsCandidates(fakeInputs(), NOW_ISO);
  const placement = placeLifeOpsCandidatesForDay({ candidates, worldState: world, maxPlacements: 10 });
  const edi = deriveEmptyDayInput(world, synthesizeMemory([], NOW_MS), { userIntent: null });
  const proposalSet = generateEmptyDay(edi);
  return { world, candidates, placement, proposalSet, compose: composeLifeOpsIntoDayProposals({ proposalSet, placement }) };
}

describe("compose — 3案への累積包含（§1）", () => {
  it("protect⊆easy⊆push（lane 包含で件数が単調非減少）", () => {
    const { compose } = chain();
    const byTier = Object.fromEntries(compose.composed.map((c) => [c.tier, c.lifeOps.fitting.length + c.lifeOps.overflow.length]));
    expect(byTier.protect).toBeLessThanOrEqual(byTier.easy);
    expect(byTier.easy).toBeLessThanOrEqual(byTier.push);
  });
  it("deadline（protect lane）は 3 案すべてに現れる（tier 選択で期限が消えない）", () => {
    const { compose } = chain();
    for (const c of compose.composed) {
      const all = [...c.lifeOps.fitting, ...c.lifeOps.overflow];
      expect(all.some((p) => p.candidate.dueReason.kind === "deadline")).toBe(true);
    }
    expect(compose.composed.map((c) => c.tier)).toEqual(["protect", "easy", "push"]);
  });
  it("push のみの lane（美容 cycle 等）は protect 案に入らない", () => {
    const { compose } = chain();
    const protectTier = compose.composed.find((c) => c.tier === "protect")!;
    const all = [...protectTier.lifeOps.fitting, ...protectTier.lifeOps.overflow];
    expect(all.every((p) => p.planLane === "protect")).toBe(true);
  });
});

describe("compose — R2 本体無改変（§7）", () => {
  it("proposal/blocks は同一参照（無改変）・recommended 透過", () => {
    const { proposalSet, compose } = chain();
    for (let i = 0; i < 3; i++) {
      expect(compose.composed[i].proposal).toBe(proposalSet.proposals[i]); // 同一参照
      expect(compose.composed[i].proposal.blocks).toBe(proposalSet.proposals[i].blocks);
    }
    expect(compose.recommended).toBe(proposalSet.recommended);
  });
});

describe("compose — 容量と honest overflow（§2・手組み fixture）", () => {
  /** 手組み proposalSet（容量を厳密制御）。窓 780-960 のうち blocks が一部を占有。 */
  function fixtureProposalSet(flexibleKind: "open" | "focus_work"): EmptyDayProposalSet {
    const mk = (tier: EmptyDayTier) => ({
      tier,
      // 780-900 を flexibleKind が占有・900-960 は未充填（=60 分 flexible）
      blocks: [{ startMinute: 780, endMinute: 900, kind: flexibleKind, band: "neutral", memoryLeaning: null } as never],
      activeMinutes: 0,
      restMinutes: 0,
      strain: "low" as const,
    });
    return { date: "2026-06-10", proposals: [mk("protect"), mk("easy"), mk("push")], recommended: null };
  }
  /** 手組み placement（外出 90 分 1 件・protect lane・窓 780-960）。 */
  function fixturePlacement(): LifeOpsPlacementResult {
    const candidates = collectLifeOpsCandidates({ deadlineObservations: [{ categoryId: "tax_filing", deadlineISO: "2026-06-15T00:00:00+09:00" }] }, NOW_ISO);
    const p: PlacedLifeOpsCandidate = {
      candidate: candidates[0],
      window: { startMinute: 780, endMinute: 960, meaning: null },
      placementReason: ["deadline_near"],
      planLane: "protect",
      coarseMinutes: 90,
    };
    return { placements: [p], placedCount: 1, unplacedCount: 0 };
  }
  it("flexible block（open 120 分 + 未充填 60 分=180）→ 90 分の候補が fitting", () => {
    const r = composeLifeOpsIntoDayProposals({ proposalSet: fixtureProposalSet("open"), placement: fixturePlacement() });
    expect(r.composed[0].lifeOps.fitting.length).toBe(1);
    expect(r.composed[0].lifeOps.overflow.length).toBe(0);
  });
  it("focus_work 占有（flexible=未充填 60 分のみ）→ 90 分の候補は overflow（block を削らない）", () => {
    const r = composeLifeOpsIntoDayProposals({ proposalSet: fixtureProposalSet("focus_work"), placement: fixturePlacement() });
    expect(r.composed[0].lifeOps.fitting.length).toBe(0);
    expect(r.composed[0].lifeOps.overflow.length).toBe(1); // honest（黙って詰め込まない）
  });
  it("同一窓の多重充当は flexible 残量内のみ（90×2 > 180 → 2 件目 overflow）", () => {
    const pl = fixturePlacement();
    const two: LifeOpsPlacementResult = { placements: [pl.placements[0], { ...pl.placements[0], coarseMinutes: 100 }], placedCount: 2, unplacedCount: 0 };
    const r = composeLifeOpsIntoDayProposals({ proposalSet: fixtureProposalSet("open"), placement: two });
    expect(r.composed[0].lifeOps.fitting.length).toBe(1); // 90 は入る・+100 は 180-90=90 に入らない
    expect(r.composed[0].lifeOps.overflow.length).toBe(1);
  });
});

describe("compose — unplaced 透過・素材保持・summary（§4-§6）", () => {
  it("placement unplaced（cap_exceeded）は alsoAvailable へそのまま透過", () => {
    const world = ws();
    const candidates = collectLifeOpsCandidates(fakeInputs(), NOW_ISO);
    const placement = placeLifeOpsCandidatesForDay({ candidates, worldState: world, maxPlacements: 1 });
    const edi = deriveEmptyDayInput(world, synthesizeMemory([], NOW_MS), { userIntent: null });
    const r = composeLifeOpsIntoDayProposals({ proposalSet: generateEmptyDay(edi), placement });
    expect(r.alsoAvailable.length).toBe(placement.unplacedCount);
    expect(r.alsoAvailable.some((p) => p.placementReason.includes("cap_exceeded"))).toBe(true);
    expect(r.summary.alsoAvailableCount).toBe(placement.unplacedCount);
  });
  it("R4/Briefing 素材（window/dueReason/placeQuery/riskFlags/coarseMinutes）を欠落させない", () => {
    const { compose } = chain();
    for (const c of compose.composed) {
      for (const p of [...c.lifeOps.fitting, ...c.lifeOps.overflow]) {
        expect(p.window).not.toBeNull();
        expect(typeof p.window!.startMinute).toBe("number");
        expect(p.candidate.dueReason).toBeDefined();
        expect(p.candidate.riskFlags).toBeDefined();
        expect(p.coarseMinutes).toBeGreaterThan(0);
      }
    }
  });
  it("summary は counts のみ（redaction-trivial・FORBIDDEN 不一致）", () => {
    const { compose } = chain();
    expect(compose.summary.perTier.length).toBe(3);
    for (const t of compose.summary.perTier) {
      expect(typeof t.fittingCount).toBe("number");
      expect(typeof t.overflowCount).toBe("number");
    }
    expect(JSON.stringify(compose.summary)).not.toMatch(FORBIDDEN);
  });
  it("deterministic（同入力→同出力）", () => {
    const a = chain().compose;
    const b = chain().compose;
    expect(JSON.stringify(a.summary)).toBe(JSON.stringify(b.summary));
  });
});

describe("compose — source contract（責務分離）", () => {
  const SRC = fs
    .readFileSync(path.join(process.cwd(), "lib/plan/reality/lifeops/lifeops-empty-day-compose.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  it("generateEmptyDay を呼ばない（proposalSet は caller 注入＝R2 実行責務を奪わない）", () => {
    expect(SRC).not.toContain("generateEmptyDay(");
  });
  it("縦の collector/個別経路・DB/fetch/UI/通知/Morning/Trigger 本線を import しない", () => {
    for (const banned of ["candidate-collector", "candidate-engine", "deadline-engine", "event-preparation", "supabase", "fetch(", "server-only", "morning", "trigger-"]) {
      expect(SRC.toLowerCase()).not.toContain(banned);
    }
  });
});
