/**
 * S3-F — Sequencing / No-overlap feasibility golden tests
 *
 * 設計正本: docs/t11-s3-sequencing-gate-design.md（+ CEO 補正: S3 は provisional default を適用しない）
 *
 * 主眼: CAP=8/9・single/multi-day binding・no day 列挙・must_precede が P 拡大・reorderable は強制しない・
 *   no-overlap → ordering_choice / 両不能 → no_feasible_placement・forced は逆 disjunct 不能で検出・8! 列挙なし・
 *   coupling は独立 toggle でない・ScheduleChoicePoint 再利用・provisionalDefault 立てない・derive_shortest metric・
 *   private narrowing を shared に漏らさない・最終 placement/AssemblyInput を産まない・import 純度。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeManualEntityEvidence } from "@/lib/shared/travel/entity-retrieval";
import { buildCompositionDraft } from "@/lib/shared/travel/composition-preflight";
import { computeSequencingFeasibility, computeSharedSequencingFeasibility } from "@/lib/shared/travel/solver-sequencing-feasibility";
import type { SequencingFeasibilityInput } from "@/lib/shared/travel/solver-sequencing-feasibility";
import type { CompositionDraft, CompositionInput } from "@/lib/shared/travel/composition-types";
import type { EntityEvidence } from "@/lib/shared/travel/entity-retrieval-types";
import type { OrderingConstraint } from "@/lib/shared/travel/fit-types";
import type { TravelPlanScope } from "@/lib/shared/travel/core-types";

// ── fixtures ────────────────────────────────────────────────────────────────
const ev = (over: Partial<EntityEvidence> & { placeRefId: string; category: EntityEvidence["category"] }): EntityEvidence => ({ facts: [], ...over });
const place = (id: string) => normalizeManualEntityEvidence(ev({ placeRefId: id, category: "place" }));
const single: TravelPlanScope = { mode: "travel", window: { kind: "single_day", date: "2026-07-01" } };
const range1: TravelPlanScope = { mode: "travel", window: { kind: "range", startDate: "2026-07-01", endDate: "2026-07-02", nights: 1 } };

const draftOf = (ids: string[], over: Partial<CompositionInput> = {}): CompositionDraft => {
  const r = buildCompositionDraft({ candidateId: "c:relaxed", entities: ids.map(place), bindings: ids.map((id) => ({ placeRefId: id })), ...over });
  if (r.outcome !== "draft") throw new Error(`expected draft, got ${r.outcome}`);
  return r;
};
const durs = (d: CompositionDraft, m = 60) => Object.fromEntries(d.candidateNodes.map((n) => [n.nodeId, m]));
const baseInput = (d: CompositionDraft, over: Partial<SequencingFeasibilityInput> = {}): SequencingFeasibilityInput => ({
  draft: d, scope: single, nodeDurations: durs(d, 60), edgeDurations: {}, ...over,
});
const asSpace = (r: ReturnType<typeof computeSequencingFeasibility>) => {
  if (r.outcome !== "feasible_space") throw new Error(`expected feasible_space, got ${r.outcome}`);
  return r;
};

// ── 1. CAP ──────────────────────────────────────────────────────────────────
describe("1. CAP=8/day", () => {
  it("CAP=8 通過（feasible_space）", () => {
    const d = draftOf(["a", "b", "c", "d", "e", "f", "g", "h"]); // 8 node・1 day（place は 1 node ずつ）
    expect(d.candidateNodes).toHaveLength(8);
    expect(computeSequencingFeasibility(baseInput(d, { nodeDurations: durs(d, 30) })).outcome).toBe("feasible_space");
  });
  it("CAP=9 → needs_input / split_day_required", () => {
    const d = draftOf(["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
    const r = computeSequencingFeasibility(baseInput(d, { nodeDurations: durs(d, 10) }));
    expect(r.outcome).toBe("needs_input");
    if (r.outcome === "needs_input") expect(r.missingForSchedule.map((g) => g.kind)).toContain("split_day_required");
  });
});

// ── 2. day-assignment（explicit binding のみ・列挙しない）──────────────────────
describe("2. day-assignment", () => {
  it("single_day は dayIndex 0（binding 不要）→ feasible_space", () => {
    const d = draftOf(["a", "b"]);
    expect(computeSequencingFeasibility(baseInput(d)).outcome).toBe("feasible_space");
  });
  it("多日 binding 無 → day_assignment_missing（day を推論/列挙しない）", () => {
    const d = draftOf(["a", "b"]);
    const r = computeSequencingFeasibility(baseInput(d, { scope: range1 })); // nodeDayBindings 無
    expect(r.outcome).toBe("needs_input");
    if (r.outcome === "needs_input") expect(r.missingForSchedule.map((g) => g.kind)).toContain("day_assignment_missing");
  });
  it("多日 binding 有 → 別日 node は overlap せず（choicePoint なし）", () => {
    const d = draftOf(["a", "b"]);
    const bindings = Object.fromEntries(d.candidateNodes.map((n, i) => [n.nodeId, i]));
    const s = asSpace(computeSequencingFeasibility(baseInput(d, { scope: range1, nodeDayBindings: bindings })));
    expect(s.choicePoints).toHaveLength(0); // 別日ゆえ順序自由でなく無関係
  });
});

// ── 3. forced order（半順序 P）─────────────────────────────────────────────────
describe("3. forced partial order P", () => {
  it("hard must_precede → forced edge（P 拡大）", () => {
    const d = draftOf(["a", "b"], { orderingConstraints: [{ kind: "must_precede", subjectRef: "a", objectRef: "b", relaxable: false }] });
    const [a, b] = d.candidateNodes.map((n) => n.nodeId);
    const s = asSpace(computeSequencingFeasibility(baseInput(d)));
    expect(s.forcedOrder).toContainEqual({ from: a, to: b });
    expect(s.choicePoints).toHaveLength(0); // 順序確定ゆえ choice なし
  });
  it("overlap が強いと逆 disjunct 不能で forced 検出（duration が day を埋める）", () => {
    // 2 node × 720 分 = 1440 ⇒ 1 日に 1 順序しか入らない…ではなく両順序可能。狭めるため lock で固定
    const d = draftOf(["a", "b"]);
    const [a, b] = d.candidateNodes.map((n) => n.nodeId);
    // a を午前固定・b を午後固定 → a before b forced
    const s = asSpace(computeSequencingFeasibility(baseInput(d, {
      nodeDurations: durs(d, 120),
      lockBounds: [
        { nodeId: a, kind: "timed_entry_lock", windowStartMin: 540, windowEndMin: 540 },
        { nodeId: b, kind: "timed_entry_lock", windowStartMin: 900, windowEndMin: 900 },
      ],
    })));
    expect(s.forcedOrder).toContainEqual({ from: a, to: b });
  });
});

// ── 4. reorderable / no-overlap → choice ─────────────────────────────────────
describe("4. choice（非比較 pair）", () => {
  it("reorderable 単独で order を強制しない → ordering_choice", () => {
    const d = draftOf(["a", "b"], { orderingConstraints: [{ kind: "reorderable", subjectRef: "a", objectRef: "b", relaxable: true }] });
    const [a, b] = d.candidateNodes.map((n) => n.nodeId);
    const s = asSpace(computeSequencingFeasibility(baseInput(d, { nodeDurations: durs(d, 60) })));
    expect(s.forcedOrder).toHaveLength(0);
    expect(s.choicePoints).toHaveLength(1);
    expect(s.choicePoints[0].kind).toBe("ordering_choice");
    expect(s.choicePoints[0].feasibleOptions).toEqual([`${a}→${b}`, `${b}→${a}`]);
  });
  it("★ S3 は provisionalDefault を立てない・namedTieBreak は宣言のみ", () => {
    const d = draftOf(["a", "b"]);
    const s = asSpace(computeSequencingFeasibility(baseInput(d)));
    expect(s.choicePoints[0].provisionalDefault).toBeUndefined();
    expect(s.choicePoints[0].namedTieBreak).toBe("lexicographic_nodeId");
  });
  it("両 disjunct 不能 → infeasible(no_feasible_placement)", () => {
    const d = draftOf(["a", "b"]);
    const [a, b] = d.candidateNodes.map((n) => n.nodeId);
    // 両 node を同一窓に固定し dwell で重ねる → どちらの順も不能
    const r = computeSequencingFeasibility(baseInput(d, {
      nodeDurations: durs(d, 120),
      lockBounds: [
        { nodeId: a, kind: "timed_entry_lock", windowStartMin: 600, windowEndMin: 600 },
        { nodeId: b, kind: "timed_entry_lock", windowStartMin: 600, windowEndMin: 600 },
      ],
    }));
    expect(r.outcome).toBe("infeasible");
    if (r.outcome === "infeasible") expect(r.infeasibility.conflictSet[0].reason).toBe("no_feasible_placement");
  });
});

// ── 5. coupling（独立 toggle にしない）────────────────────────────────────────
describe("5. coupling（複合 choice）", () => {
  it("3 node 全非比較 → 1 つの複合 ordering_choice（独立 3 toggle にしない・8! 列挙なし）", () => {
    const d = draftOf(["a", "b", "c"]); // 制約なし・全 day0・短 dwell → 全 pair 非比較
    const s = asSpace(computeSequencingFeasibility(baseInput(d, { nodeDurations: durs(d, 60) })));
    expect(s.choicePoints).toHaveLength(1); // ★ 複合 1 つ（独立 3 でない）
    expect(s.choicePoints[0].ref).toMatch(/^cluster:/);
    expect(s.choicePoints[0].feasibleOptions).toEqual(d.candidateNodes.map((n) => n.nodeId).sort());
  });
});

// ── 6. privacy（authoritative を narrow・shared に漏らさない）───────────────────
describe("6. private narrowing は shared に漏れない", () => {
  it("private time bound が authoritative の順序を forced 化するが shared は choice のまま", () => {
    const d = draftOf(["a", "b"]);
    const [a, b] = d.candidateNodes.map((n) => n.nodeId);
    // private に「b は a の後」を強制する time bound（a end ≤ 600 private・b start ≥ 600 private）
    const input: SequencingFeasibilityInput = baseInput(d, {
      nodeDurations: durs(d, 60),
      timeBounds: [
        { nodeId: a, event: "end", kind: "no_later_than", minute: 600, visibility: "private", constraintId: "tb:a" },
        { nodeId: b, event: "start", kind: "no_earlier_than", minute: 600, visibility: "private", constraintId: "tb:b" },
      ],
    });
    const auth = asSpace(computeSequencingFeasibility(input));
    const shared = asSpace(computeSharedSequencingFeasibility(input));
    expect(auth.forcedOrder).toContainEqual({ from: a, to: b }); // authoritative は forced
    expect(shared.forcedOrder).toHaveLength(0); // ★ shared は private narrowing を出さない
    expect(shared.choicePoints).toHaveLength(1); // shared では自由に見える
  });
});

// ── 7. 境界 + import 純度（source-contract）───────────────────────────────────
describe("7. 境界 + import 純度", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const read = () => strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/solver-sequencing-feasibility.ts"), "utf8"));
  it("最終 placement / AssemblyInput / itinerary / candidate / engine を産まない", () => {
    const src = read();
    for (const f of ["assembleScheduledDraft", "AssemblyInput", "ScheduledTravelItineraryDraft", "TravelItinerary", "TravelCandidate", "PlacedNode", "runTravelPlanEngine", "evaluateFit"]) {
      expect(src).not.toContain(f);
    }
  });
  it("8! 全順序列挙 / day 列挙 / provisionalDefault 適用をしない", () => {
    const src = read();
    expect(src).not.toMatch(/permutation|factorial/i);
    expect(src).not.toMatch(/provisionalDefault\s*[:=]/); // provisionalDefault を立てない
  });
  it("外部 fetch/API/DB/Supabase/M2/app/UI/route/weather/place を import しない", () => {
    const src = read();
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/from ["']next/);
    expect(src).not.toMatch(/from ["'][^"']*(components|app\/|\/m2|personalization)/i);
    expect(src).not.toMatch(/from ["']react/);
  });
});

// ── 8. S3 出力に最終 placement 値を含まない ───────────────────────────────────
describe("8. S3 は最終 placement を含まない", () => {
  it("出力に startMin/endMin/dayIndex 最終値・itinerary を含まない", () => {
    const d = draftOf(["a", "b"]);
    const json = JSON.stringify(computeSequencingFeasibility(baseInput(d)));
    for (const f of ["startMin", "endMin", "itinerary", "scheduled_draft", "nodeIntervals"]) expect(json).not.toContain(f);
  });
});
