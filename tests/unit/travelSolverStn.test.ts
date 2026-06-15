/**
 * S1+S2 — Real Solver type wall + STN feasibility-region golden tests
 *
 * 設計正本: docs/t11-real-solver-design.md（+ CEO 補正: forced_by_private_constraint は authoritative のみ /
 *   derive_shortest_from_terminal は explicit route metric 必須 / descriptor を parse しない）
 *
 * 主眼: S1 型壁（authoritative vs shared placement basis・no authority field）/ S2 STN feasibility-region
 *   （dwell 等式・route δ・lock 窓・time bound・negative cycle・missing→gap・private narrowing を shared に漏らさない・
 *   descriptor 非 parse・derive_shortest 無 metric→gap・最終配置/日割/AssemblyInput を産まない）/ import 純度。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeManualEntityEvidence } from "@/lib/shared/travel/entity-retrieval";
import { buildCompositionDraft } from "@/lib/shared/travel/composition-preflight";
import {
  PLACEMENT_BASES,
  SHARED_PLACEMENT_BASES,
  projectSharedPlacementBasis,
  ORDERING_LOCK_BINDING,
  LOCK_ORDERING_KINDS,
  MATERIAL_SLACK_THRESHOLD_MIN,
  SCHEDULE_NODE_CAP_PER_DAY,
} from "@/lib/shared/travel/solver-schedule-types";
import { computeTemporalFeasibility, computeSharedTemporalFeasibility } from "@/lib/shared/travel/solver-stn-feasibility";
import type { SolverScheduleInput } from "@/lib/shared/travel/solver-schedule-types";
import type { CompositionDraft, CompositionInput } from "@/lib/shared/travel/composition-types";
import type { EntityEvidence } from "@/lib/shared/travel/entity-retrieval-types";
import type { OrderingConstraint } from "@/lib/shared/travel/fit-types";

// ── fixtures ────────────────────────────────────────────────────────────────
const ev = (over: Partial<EntityEvidence> & { placeRefId: string; category: EntityEvidence["category"] }): EntityEvidence => ({ facts: [], ...over });
const place = (id: string) => normalizeManualEntityEvidence(ev({ placeRefId: id, category: "place" }));
const draftOf = (over: Partial<CompositionInput> = {}): CompositionDraft => {
  const r = buildCompositionDraft({ candidateId: "candidate:relaxed", entities: [place("A"), place("B")], bindings: [{ placeRefId: "A" }, { placeRefId: "B" }], ...over });
  if (r.outcome !== "draft") throw new Error(`expected draft, got ${r.outcome}`);
  return r;
};
const nodeIds = (d: CompositionDraft) => d.candidateNodes.map((n) => n.nodeId);
const single = { mode: "travel", window: { kind: "single_day", date: "2026-07-01" } } as const;
const durs = (d: CompositionDraft, m = 60) => Object.fromEntries(d.candidateNodes.map((n) => [n.nodeId, m]));
const region = (r: ReturnType<typeof computeTemporalFeasibility>) => {
  if (r.outcome !== "feasible_region") throw new Error(`expected feasible_region, got ${r.outcome}`);
  return r.events;
};

// ── 1. S1 型壁（authoritative vs shared basis）─────────────────────────────────
describe("1. S1 placement basis 二層", () => {
  it("authoritative basis は forced_by_private_constraint を持てる", () => {
    expect(PLACEMENT_BASES).toContain("forced_by_private_constraint");
  });
  it("★ shared-safe basis は forced_by_private_constraint を露出しない", () => {
    expect(SHARED_PLACEMENT_BASES).not.toContain("forced_by_private_constraint");
    expect(SHARED_PLACEMENT_BASES).toContain("constrained"); // 中立代替
  });
  it("projectSharedPlacementBasis は private 由来を constrained に潰す（他は pass-through）", () => {
    expect(projectSharedPlacementBasis("forced_by_private_constraint")).toBe("constrained");
    expect(projectSharedPlacementBasis("forced_by_lock")).toBe("forced_by_lock");
    expect(projectSharedPlacementBasis("tiebreak_shortest_route")).toBe("tiebreak_shortest_route");
  });
  it("lock binding table は 7 lock kind を網羅・start/end/both", () => {
    expect(LOCK_ORDERING_KINDS).toHaveLength(7);
    expect(ORDERING_LOCK_BINDING.timed_entry_lock).toBe("start");
    expect(ORDERING_LOCK_BINDING.last_departure_lock).toBe("end");
    expect(ORDERING_LOCK_BINDING.open_hours_window_lock).toBe("both");
  });
  it("named const: MATERIAL_SLACK_THRESHOLD_MIN / CAP=8", () => {
    expect(typeof MATERIAL_SLACK_THRESHOLD_MIN).toBe("number");
    expect(SCHEDULE_NODE_CAP_PER_DAY).toBe(8);
  });
});

// ── 2. S2 STN feasibility-region ──────────────────────────────────────────────
describe("2. STN feasibility-region", () => {
  it("dwell 等式: endEarliest − startEarliest === duration", () => {
    const d = draftOf();
    const ev = region(computeTemporalFeasibility({ draft: d, scope: single, nodeDurations: durs(d, 90), edgeDurations: {} }));
    for (const id of nodeIds(d)) expect(ev[id].endEarliest - ev[id].startEarliest).toBe(90);
  });
  it("node duration 欠落 → needs_input / node_duration_missing（default 60 を作らない）", () => {
    const d = draftOf();
    const r = computeTemporalFeasibility({ draft: d, scope: single, nodeDurations: {}, edgeDurations: {} });
    expect(r.outcome).toBe("needs_input");
    if (r.outcome === "needs_input") expect(r.missingForSchedule.map((g) => g.kind)).toContain("node_duration_missing");
  });
  it("route δ が遷移を制約: edge duration 供給で s_to ≥ e_from + t", () => {
    const oc: OrderingConstraint = { kind: "must_precede", subjectRef: "A", objectRef: "B", relaxable: false };
    const d = draftOf({ orderingConstraints: [oc] });
    const [a, b] = nodeIds(d);
    // route edge を draft.edges に乗せるため routeChains 経由
    const d2 = draftOf({ orderingConstraints: [oc], routeChains: [{ connection: { fromRef: "A", toRef: "B", legs: [{ mode: "walk", legKind: "mainLeg", timeMin: 15 }], transferNodes: [] } }] });
    const [a2, b2] = nodeIds(d2);
    const key = `${d2.edges.find((e) => e.kind === "route_transition")!.fromNodeId}>>${d2.edges.find((e) => e.kind === "route_transition")!.toNodeId}`;
    const ev = region(computeTemporalFeasibility({ draft: d2, scope: single, nodeDurations: durs(d2, 30), edgeDurations: { [key]: 20 } }));
    // B の earliest start ≥ A の earliest end + 20（route δ）。A は precedence で先行
    expect(ev[b2].startEarliest).toBeGreaterThanOrEqual(ev[a2].endEarliest + 20);
    void a; void b;
  });
  it("route edge duration 欠落 → needs_input / route_duration_missing", () => {
    const d = draftOf({ routeChains: [{ connection: { fromRef: "A", toRef: "B", legs: [{ mode: "walk", legKind: "mainLeg", timeMin: 15 }], transferNodes: [] } }] });
    const r = computeTemporalFeasibility({ draft: d, scope: single, nodeDurations: durs(d), edgeDurations: {} });
    expect(r.outcome).toBe("needs_input");
    if (r.outcome === "needs_input") expect(r.missingForSchedule.map((g) => g.kind)).toContain("route_duration_missing");
  });
  it("explicit lock 窓が region を制約（checkin_window_lock → start ∈ [a,b]）", () => {
    const d = draftOf();
    const [a] = nodeIds(d);
    const ev = region(computeTemporalFeasibility({
      draft: d, scope: single, nodeDurations: durs(d, 60), edgeDurations: {},
      lockBounds: [{ nodeId: a, kind: "checkin_window_lock", windowStartMin: 900, windowEndMin: 1080 }],
    }));
    expect(ev[a].startEarliest).toBeGreaterThanOrEqual(900);
    expect(ev[a].startLatest).toBeLessThanOrEqual(1080);
  });
  it("time-axis hard 制約に数値 bound 無 → needs_input（descriptor を parse しない）", () => {
    const d = draftOf();
    // axis time / hard の TravelConstraint を draft.constraints に注入（lock 経由）
    const d2 = draftOf({ timeLocks: [{ ordering: { kind: "last_departure_lock", subjectRef: "A", objectRef: "A", relaxable: false }, rawTime: "20:00" }] });
    const r = computeTemporalFeasibility({ draft: d2, scope: single, nodeDurations: durs(d2), edgeDurations: {} });
    expect(r.outcome).toBe("needs_input");
    if (r.outcome === "needs_input") expect(r.missingForSchedule.map((g) => g.kind)).toContain("explicit_lock_window_missing");
    void d;
  });
  it("矛盾する explicit bound → infeasible（negative cycle）", () => {
    const d = draftOf();
    const [a] = nodeIds(d);
    // start ≥ 1000 だが latest end ≤ 900 かつ dwell 60 → 不能
    const r = computeTemporalFeasibility({
      draft: d, scope: single, nodeDurations: durs(d, 60), edgeDurations: {},
      lockBounds: [{ nodeId: a, kind: "checkin_window_lock", windowStartMin: 1000, windowEndMin: 1100 }],
      timeBounds: [{ nodeId: a, event: "end", kind: "no_later_than", minute: 900, constraintId: "tb:a" }],
    });
    expect(r.outcome).toBe("infeasible");
    if (r.outcome === "infeasible") expect(r.infeasibility.conflictSet[0].reason).toBe("impossible_time_lock");
  });
  it("非矛盾 → feasible_region（earliest/latest）", () => {
    const d = draftOf();
    const ev = region(computeTemporalFeasibility({ draft: d, scope: single, nodeDurations: durs(d, 60), edgeDurations: {} }));
    for (const id of nodeIds(d)) {
      expect(ev[id].startEarliest).toBeLessThanOrEqual(ev[id].startLatest);
      expect(ev[id].startEarliest).toBe(0); // lock なし → 0 から可能
    }
  });
});

// ── 3. privacy（private が authoritative を narrow・shared に漏らさない）──────────
describe("3. private narrowing は shared に漏れない", () => {
  it("private time bound は authoritative region を narrow するが shared region は緩いまま", () => {
    const d = draftOf();
    const [a] = nodeIds(d);
    const base: SolverScheduleInput = {
      draft: d, scope: single, nodeDurations: durs(d, 60), edgeDurations: {},
      timeBounds: [{ nodeId: a, event: "start", kind: "no_earlier_than", minute: 600, visibility: "private", constraintId: "tb:priv" }],
    };
    const auth = region(computeTemporalFeasibility(base));
    const shared = region(computeSharedTemporalFeasibility(base));
    expect(auth[a].startEarliest).toBe(600); // private が narrow（server-side）
    expect(shared[a].startEarliest).toBe(0); // ★ shared には private narrowing が出ない
    // shared region は private 制約が存在しないかのように見える（漏洩なし）
    const noPriv = region(computeTemporalFeasibility({ ...base, timeBounds: [] }));
    expect(shared[a]).toEqual(noPriv[a]);
  });
});

// ── 4. derive_shortest_from_terminal（explicit metric 必須）────────────────────
describe("4. derive_shortest_from_terminal", () => {
  it("route metric 無で directive あり → ordering_directive_unsupported（推論しない）", () => {
    const d = draftOf({ orderingConstraints: [{ kind: "derive_shortest_from_terminal", subjectRef: "A", objectRef: "B", relaxable: true }] });
    const r = computeTemporalFeasibility({ draft: d, scope: single, nodeDurations: durs(d), edgeDurations: {} });
    expect(r.outcome).toBe("needs_input");
    if (r.outcome === "needs_input") expect(r.missingForSchedule.map((g) => g.kind)).toContain("ordering_directive_unsupported");
  });
});

// ── 5. S2 が確定配置/日割/AssemblyInput を産まない（boundary）────────────────────
describe("5. S2 は最終配置を産まない", () => {
  it("出力は region/infeasible/needs_input のみ・placed/itinerary/AssemblyInput を含まない", () => {
    const d = draftOf();
    const r = computeTemporalFeasibility({ draft: d, scope: single, nodeDurations: durs(d, 60), edgeDurations: {} });
    expect(["feasible_region", "infeasible", "needs_input"]).toContain(r.outcome);
    const json = JSON.stringify(r);
    for (const f of ["placed", "itinerary", "nodeIntervals", "dayIndex", "scheduled_draft", "tradeoff"]) expect(json).not.toContain(f);
    expect(r.authoritative).toBe(false);
    expect(r.draft).toBe(true);
  });
});

// ── 6. 境界 + import 純度（source-contract）───────────────────────────────────
describe("6. 境界 + import 純度", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const read = (rel: string) => strip(readFileSync(resolve(process.cwd(), rel), "utf8"));
  const files = ["lib/shared/travel/solver-schedule-types.ts", "lib/shared/travel/solver-stn-feasibility.ts"];
  it("S3 領域（TSPTW/Held-Karp/sequencing/day-assignment）を実装しない", () => {
    for (const rel of files) {
      const src = read(rel);
      expect(src).not.toMatch(/Held|TSPTW|heldKarp|nearestNeighbor/i);
    }
  });
  it("最終 ScheduledTravelItineraryDraft / TravelCandidate / TravelItinerary / AssemblyInput を produce しない（construct）", () => {
    const src = read("lib/shared/travel/solver-stn-feasibility.ts");
    expect(src).not.toMatch(/ScheduledTravelItineraryDraft|assembleScheduledDraft|TravelCandidate/);
    expect(src).not.toMatch(/runTravelPlanEngine|evaluateFit/);
  });
  it("executionAuthority / booking / calendar field を持たない", () => {
    for (const rel of files) {
      const src = read(rel);
      expect(src).not.toMatch(/executionAuthority|booking|calendar/i);
    }
  });
  it("外部 fetch/API/DB/Supabase/M2/app/UI/live を import しない・descriptor を parse しない", () => {
    for (const rel of files) {
      const src = read(rel);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/from ["']next/);
      expect(src).not.toMatch(/from ["'][^"']*(components|app\/|\/m2|personalization)/i);
      expect(src).not.toMatch(/from ["']react/);
    }
    // descriptor を時間 bound に parse しない（descriptor.split/parseInt 等を使わない）
    const stn = read("lib/shared/travel/solver-stn-feasibility.ts");
    expect(stn).not.toMatch(/descriptor[^)]*\.(split|match|replace|slice)/);
  });
});
