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
import { TIER_FITTING_CAP, OVERFLOW_RETAINED_CAP } from "@/lib/plan/reality/lifeops/lifeops-pool-cap";
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
  return { world, candidates, placement, proposalSet, compose: composeLifeOpsIntoDayProposals({ proposalSet, placement, dayWindows: world.availableWindows }) };
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
  it("★refit: placement の窓が tier で塞がっていても、同 tier の他窓（open）へ収め直す（refit_in_tier）", () => {
    // 朝窓 600-660 は focus_work 占有・午後窓 780-960 は open 180 分。30 分の deadline を朝窓に placement した状況。
    const ps: EmptyDayProposalSet = {
      date: "2026-06-10",
      proposals: (["protect", "easy", "push"] as EmptyDayTier[]).map((tier) => ({
        tier,
        blocks: [
          { startMinute: 600, endMinute: 660, kind: "focus_work", band: "neutral", memoryLeaning: null } as never,
          { startMinute: 780, endMinute: 960, kind: "open", band: "neutral", memoryLeaning: null } as never,
        ],
        activeMinutes: 0,
        restMinutes: 0,
        strain: "low" as const,
      })),
      recommended: null,
    };
    const candidates = collectLifeOpsCandidates({ deadlineObservations: [{ categoryId: "tax_filing", deadlineISO: "2026-06-15T00:00:00+09:00" }] }, NOW_ISO);
    const placement: LifeOpsPlacementResult = {
      placements: [{ candidate: candidates[0], window: { startMinute: 600, endMinute: 660, meaning: null }, placementReason: ["deadline_near"], planLane: "protect", coarseMinutes: 30 }],
      placedCount: 1,
      unplacedCount: 0,
    };
    const r = composeLifeOpsIntoDayProposals({ proposalSet: ps, placement, dayWindows: [{ startMinute: 600, endMinute: 660 }, { startMinute: 780, endMinute: 960 }] });
    const protect = r.composed[0];
    expect(protect.lifeOps.overflow.length).toBe(0); // 溢れない
    expect(protect.lifeOps.fitting.length).toBe(1);
    expect(protect.lifeOps.fitting[0].window!.startMinute).toBe(780); // 午後 open へ refit
    expect(protect.lifeOps.fitting[0].placementReason).toContain("refit_in_tier");
    expect(protect.lifeOps.fitting[0].candidate).toBe(candidates[0]); // candidate は同一参照のまま
  });
});

describe("compose — unplaced 透過・素材保持・summary（§4-§6）", () => {
  it("★A-4-c4: pool cap の unplaced も per-tier 着席（seated_in_tier）・alsoAvailable は常に []", () => {
    const world = ws();
    const candidates = collectLifeOpsCandidates(fakeInputs(), NOW_ISO);
    const placement = placeLifeOpsCandidatesForDay({ candidates, worldState: world, maxPlacements: 1 }); // pool 安全弁を意図的に絞る
    expect(placement.unplacedCount).toBeGreaterThan(0);
    const edi = deriveEmptyDayInput(world, synthesizeMemory([], NOW_MS), { userIntent: null });
    const r = composeLifeOpsIntoDayProposals({ proposalSet: generateEmptyDay(edi), placement, dayWindows: world.availableWindows });
    // pool 段階で window=null だった候補が tier で着席する（情報は tier に移住・捨てない）。
    const seated = r.composed.flatMap((c) => c.lifeOps.fitting).filter((p) => p.placementReason.includes("seated_in_tier"));
    expect(seated.length).toBeGreaterThan(0);
    expect(r.alsoAvailable).toEqual([]); // 旧 alsoAvailable は引退（常に []・field は互換残置）
    expect(r.summary.alsoAvailableCount).toBe(0);
  });
  it("R4/Briefing 素材（window/dueReason/riskFlags/coarseMinutes）を欠落させない（fitting=窓必須・overflow=窓 null 可）", () => {
    const { compose } = chain();
    for (const c of compose.composed) {
      for (const p of c.lifeOps.fitting) {
        expect(p.window).not.toBeNull(); // 着席=窓確定
        expect(typeof p.window!.startMinute).toBe("number");
      }
      for (const p of [...c.lifeOps.fitting, ...c.lifeOps.overflow]) {
        expect(p.candidate.dueReason).toBeDefined();
        expect(p.candidate.riskFlags).toBeDefined();
        expect(p.coarseMinutes).toBeGreaterThan(0);
      }
    }
  });
  it("★A-4-c4 #4/#6: easy≠push（push lane 候補が cap で消えず、push の fitting/overflow に現れる）", () => {
    const { compose } = chain();
    const byTier = Object.fromEntries(compose.composed.map((c) => [c.tier, c]));
    const pushAll = [...byTier.push.lifeOps.fitting, ...byTier.push.lifeOps.overflow];
    const easyAll = [...byTier.easy.lifeOps.fitting, ...byTier.easy.lifeOps.overflow];
    // push lane 候補（美容院）は push tier に必ず現れる（fitting か overflow＝差分表示）・easy には現れない。
    expect(pushAll.some((p) => p.planLane === "push")).toBe(true);
    expect(easyAll.some((p) => p.planLane === "push")).toBe(false);
    // 集合として easy≠push（件数 or 構成が異なる）。
    const sig = (xs: typeof pushAll) => xs.map((p) => `${p.candidate.category}:${p.window ? "f" : "o"}`).join("|");
    expect(sig(pushAll)).not.toBe(sig(easyAll));
  });
  it("★A-4-c4 #5: deadline は 3 案すべての fitting に着席（urgency 先頭・消えない）", () => {
    const { compose } = chain();
    for (const c of compose.composed) {
      expect(c.lifeOps.fitting.some((p) => p.candidate.dueReason.kind === "deadline")).toBe(true);
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

describe("★A-4-c7 — tier fitting cap / overflow retained+total（flood chain）", () => {
  /** 多カテゴリ flood（collector 経由・~14 候補）。 */
  function floodInputs(): LifeOpsInputs {
    const old = "2026-03-01T10:00:00+09:00"; // 全部 well_beyond/beyond 圏
    return {
      deadlineObservations: [
        { categoryId: "tax_filing", deadlineISO: "2026-06-15T00:00:00+09:00" },
        { categoryId: "license_renewal", deadlineISO: "2026-06-30T00:00:00+09:00" },
        { categoryId: "passport_renewal", deadlineISO: "2026-07-20T00:00:00+09:00" },
      ],
      upcomingEvents: [{ kind: "interview", startISO: "2026-06-13T10:00:00+09:00" }],
      cadenceObservations: [
        { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: old },
        { categoryId: "eyebrow", lastCompletedAtISO: old },
        { categoryId: "nail", lastCompletedAtISO: old },
        { categoryId: "eyelash", lastCompletedAtISO: old },
        { categoryId: "bodywork", lastCompletedAtISO: old },
        { categoryId: "dental", lastCompletedAtISO: old },
        { categoryId: "groceries", lastCompletedAtISO: old },
        { categoryId: "daily_necessities", lastCompletedAtISO: old },
      ],
    };
  }
  function floodChain() {
    const world = ws();
    const candidates = collectLifeOpsCandidates(floodInputs(), NOW_ISO);
    const placement = placeLifeOpsCandidatesForDay({ candidates, worldState: world });
    const edi = deriveEmptyDayInput(world, synthesizeMemory([], NOW_MS), { userIntent: null });
    return { candidates, compose: composeLifeOpsIntoDayProposals({ proposalSet: generateEmptyDay(edi), placement, dayWindows: world.availableWindows }) };
  }
  it("fitting は各 tier ≤ TIER_FITTING_CAP・cap 落ちは tier_fitting_cap コードで overflow へ（deadline は落ちない）", () => {
    const { candidates, compose } = floodChain();
    expect(candidates.length).toBeGreaterThan(TIER_FITTING_CAP);
    for (const c of compose.composed) {
      expect(c.lifeOps.fitting.length).toBeLessThanOrEqual(TIER_FITTING_CAP);
      expect(c.lifeOps.fitting.some((p) => p.candidate.dueReason.kind === "deadline")).toBe(true); // urgency 先頭=cap で落ちない
      const capped = c.lifeOps.overflow.filter((p) => p.placementReason.includes("tier_fitting_cap"));
      for (const p of capped) expect(p.candidate.dueReason.kind).not.toBe("deadline");
    }
  });
  it("overflow 配列は ≤ OVERFLOW_RETAINED_CAP 保持・overflowTotalCount が総数（summary も総数）", () => {
    const { compose } = floodChain();
    for (const [i, c] of compose.composed.entries()) {
      expect(c.lifeOps.overflow.length).toBeLessThanOrEqual(OVERFLOW_RETAINED_CAP);
      expect(c.lifeOps.overflowTotalCount).toBeGreaterThanOrEqual(c.lifeOps.overflow.length);
      expect(compose.summary.perTier[i].overflowCount).toBe(c.lifeOps.overflowTotalCount);
    }
    // flood では少なくとも push tier で総数 > 保持数（retained cap が実作動）か、総数 ≤5 で同数（両形を許容しつつ総数の整合を固定）。
    const push = compose.composed[2];
    expect(push.lifeOps.overflowTotalCount).toBeGreaterThan(0);
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
