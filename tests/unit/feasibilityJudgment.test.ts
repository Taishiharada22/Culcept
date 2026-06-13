/**
 * evaluateFeasibility（RJ1a = 成立性の純粋判定器）— CEO 必須 12 項 + scope/identity
 * 正本: docs/reality-graph-contract-hardening-rg06.md / CEO RJ1a GO
 *
 * 注: RC2a v0 compile は placeCertainty/movementRequired を unknown に固定するため、
 *   feasible / feasible_with_risk path は ern 属性を synthetic に override して exercise する
 *   （evaluator は全 data state で正しく動く・v0 実 data は大半 unknown が正直）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { compileEventRealityNodes } from "@/lib/plan/realityCore/compileEventRealityNodes";
import { compileMovementReality } from "@/lib/plan/realityCore/movementReality";
import { compileCommitmentSignals } from "@/lib/plan/realityCore/commitmentSignal";
import { deriveDecisionDebt } from "@/lib/plan/realityCore/decisionDebt";
import { deriveMomentSnapshot } from "@/lib/plan/realityCore/momentSnapshot";
import { assembleRealityGraph } from "@/lib/plan/realityCore/realityGraphSnapshot";
import { graphViewerKey } from "@/lib/plan/realityCore/graphIdentity";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { deriveMomentState } from "@/lib/plan/dayState/deriveMomentState";
import { inferredAttribute, heuristicAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { EventRealityNodeV0 } from "@/lib/plan/realityCore/eventRealityNode";
import type { CommitmentSignalV0 } from "@/lib/plan/realityCore/commitmentSignal";
import { buildRealityJudgmentInput, type TargetScope } from "@/lib/plan/realityCore/realityJudgmentInput";
import {
  evaluateFeasibility,
  feasibilityJudgmentViolations,
  FEASIBILITY_JUDGMENT_VERSION,
} from "@/lib/plan/realityCore/feasibilityJudgment";

const DATE = "2026-06-12";
const VIEWER = graphViewerKey("viewer-self");
const NOON_UTC = new Date(Date.UTC(2026, 5, 12, 3, 0)); // JST 12:00

function anchor(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return {
    anchorKind: "one_off",
    sourceId: "src-manual",
    title: "予定",
    date: DATE,
    rigidity: "soft",
    confirmedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  } as unknown as ExternalAnchor;
}

function base(anchors: ExternalAnchor[], utcNow: Date = NOON_UTC) {
  const { graph } = buildDayGraph({ anchors, date: DATE });
  const ern = compileEventRealityNodes({ date: DATE, graph, anchors });
  const mv = compileMovementReality({ date: DATE, graph });
  const cs = compileCommitmentSignals({ date: DATE, graph, anchors });
  const decisionDebt = deriveDecisionDebt({ subjectiveDate: DATE, graph, ern, mv, cs });
  const instant = makeRealityInstantJst(utcNow);
  const momentState = deriveMomentState({ nowHHMM: instant.wallClockHHMM, segments: [] });
  const momentSnapshot = deriveMomentSnapshot({ instant, momentState, ern, mv, cs, decisionDebt });
  return { ern, mv, cs, momentSnapshot };
}

/** ern / cs 属性を override して snapshot を組む（synthetic data state） */
function snap(
  b: ReturnType<typeof base>,
  opts: { ernOverrides?: Record<string, Partial<EventRealityNodeV0>>; csOverrides?: Record<string, Partial<CommitmentSignalV0>> } = {},
) {
  const ern = b.ern.map((e) => (opts.ernOverrides?.[e.eventRealityNodeId] ? { ...e, ...opts.ernOverrides[e.eventRealityNodeId] } : e));
  const cs = b.cs.map((c) => (opts.csOverrides?.[c.targetNodeId] ? { ...c, ...opts.csOverrides[c.targetNodeId] } : c));
  return assembleRealityGraph({ ern, mv: b.mv, cs, momentSnapshot: b.momentSnapshot, viewerKey: VIEWER });
}

function judgeEvent(snapshot: ReturnType<typeof snap>, eventRealityNodeId: string) {
  return evaluateFeasibility(buildRealityJudgmentInput(snapshot, { kind: "event", eventRealityNodeId }));
}

const ERN = (id: string) => `ern:${DATE}:${id}`;
const placeConfirmed = () => inferredAttribute(0.9, 0.9, ["test_place"], { status: "confirmed", displayPolicy: "visible" });
const movementNotRequired = () => inferredAttribute(false, 0.9, ["test_no_mv"], { status: "confirmed", displayPolicy: "visible" });
const movementRequired = () => inferredAttribute(true, 0.7, ["test_mv_req"], { status: "inferred" });
const fixedStartTrue = () => inferredAttribute(true, 0.8, ["test_fixed"], { status: "confirmed", displayPolicy: "visible" });

describe("RJ1a #1 missingInputs だけでは infeasible にしない（v0 実 data = unknown）", () => {
  it("place 不明だけの event → unknown（infeasible でない・断定しない）", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })]));
    const j = judgeEvent(s, ERN("a1"));
    expect(j.feasibilityStatus).toBe("unknown");
    expect(j.confirmedBlockingReasons).toEqual([]);
    expect(j.unresolvedCriticalInputs.length).toBeGreaterThan(0);
    expect(feasibilityJudgmentViolations(j)).toEqual([]);
  });
});

describe("RJ1a #2 confirmedBlockingReason がある時だけ infeasible", () => {
  it("hard 同士の時間 overlap → confirmed hard_time_conflict → infeasible", () => {
    const s = snap(base([
      anchor({ id: "a1", startTime: "10:00", endTime: "12:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "11:00", endTime: "13:00", locationText: "新宿", rigidity: "hard" }),
    ]));
    const j = judgeEvent(s, ERN("a1"));
    expect(j.feasibilityStatus).toBe("infeasible");
    expect(j.confirmedBlockingReasons.map((r) => r.code)).toContain("hard_time_conflict");
    expect(j.riskLevel).toBe("high");
    expect(feasibilityJudgmentViolations(j)).toEqual([]);
  });
});

describe("RJ1a #3 inferredBlocking + missing → unknown or feasible_with_risk（infeasible でない）", () => {
  it("soft overlap（inferred）+ place 不明（unresolved）→ unknown", () => {
    const s = snap(base([
      anchor({ id: "a1", startTime: "10:00", endTime: "12:00", rigidity: "soft" }),
      anchor({ id: "a2", startTime: "11:00", endTime: "13:00", rigidity: "soft" }),
    ]));
    const j = judgeEvent(s, ERN("a1"));
    expect(j.inferredBlockingReasons.map((r) => r.code)).toContain("schedule_tension_inferred");
    expect(j.feasibilityStatus).toBe("unknown"); // unresolved があるので unknown
    expect(j.feasibilityStatus).not.toBe("infeasible");
  });
  it("soft overlap（inferred）+ critical 解決済み → feasible_with_risk（infeasible でない）", () => {
    const ov = { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired() };
    const s = snap(base([
      anchor({ id: "a1", startTime: "10:00", endTime: "12:00", locationText: "渋谷", rigidity: "soft" }),
      anchor({ id: "a2", startTime: "11:00", endTime: "13:00", locationText: "新宿", rigidity: "soft" }),
    ]), { ernOverrides: { [ERN("a1")]: ov, [ERN("a2")]: ov } });
    const j = judgeEvent(s, ERN("a1"));
    expect(j.inferredBlockingReasons.length).toBeGreaterThan(0);
    expect(j.unresolvedCriticalInputs).toEqual([]);
    expect(j.feasibilityStatus).toBe("feasible_with_risk");
  });
});

describe("RJ1a #4 route/ETA/leaveBy missing は遅刻確定にしない", () => {
  it("movement required + ETA/route/leaveBy 欠落 → unknown（infeasible/遅刻確定でない・confirmed なし）", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
      ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementRequired() } },
      csOverrides: { [ERN("a1")]: { fixedStart: fixedStartTrue() } },
    });
    const j = judgeEvent(s, ERN("a1"));
    expect(j.feasibilityStatus).not.toBe("infeasible");
    expect(j.confirmedBlockingReasons).toEqual([]);
    expect(j.unresolvedCriticalInputs.map((r) => r.code)).toEqual(expect.arrayContaining(["eta_source_missing"]));
    // 「遅刻確定」のような断定 code は存在しない
    expect(JSON.stringify(j).includes("late_confirmed")).toBe(false);
  });
});

describe("RJ1a #5 commitment high は infeasible にしない", () => {
  it("高 socialWeight/changeCost（commitment 高）→ risk context のみ・infeasible でない", () => {
    const ov = { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired() };
    const cs = {
      socialWeight: inferredAttribute(0.9, 0.8, ["test_social"], { status: "inferred" }),
      changeCost: heuristicAttribute(0.3, 0.3, ["test_change"], { displayPolicy: "debugOnly" }),
    };
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" })]), {
      ernOverrides: { [ERN("a1")]: ov },
      csOverrides: { [ERN("a1")]: cs },
    });
    const j = judgeEvent(s, ERN("a1"));
    expect(j.feasibilityStatus).not.toBe("infeasible");
    expect(j.confirmedBlockingReasons).toEqual([]);
    expect(j.riskFactors.map((r) => r.code)).toContain("commitment_severity_context");
  });
});

describe("RJ1a #6 permission blocked は feasibility 不可でなく action 不可", () => {
  it("permissionLevel 0 → permission_action_gate（risk context）・infeasible でない", () => {
    const ov = {
      placeCertainty: placeConfirmed(),
      movementRequired: movementNotRequired(),
      permissionLevel: inferredAttribute(0, 0.6, ["test_perm"], { status: "inferred" }) as EventRealityNodeV0["permissionLevel"],
    };
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
      ernOverrides: { [ERN("a1")]: ov },
    });
    const j = judgeEvent(s, ERN("a1"));
    expect(j.feasibilityStatus).not.toBe("infeasible");
    expect(j.riskFactors.map((r) => r.code)).toContain("permission_action_gate");
  });
});

describe("RJ1a #7 knownComponentSummary を正本入力にしない（source-scan）", () => {
  it("evaluator が knownComponentSummary を参照しない", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/feasibilityJudgment.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code.includes("knownComponentSummary")).toBe(false);
  });
});

describe("RJ1a #8 no probability / no percent", () => {
  it("riskLevel / judgmentConfidence は enum（数値でない）・% を出さない", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })]));
    const j = judgeEvent(s, ERN("a1"));
    expect(["low", "elevated", "high", "unknown"]).toContain(j.riskLevel);
    expect(["high", "moderate", "low", "none"]).toContain(j.judgmentConfidence);
    expect(typeof (j as unknown as { probability?: unknown }).probability).toBe("undefined");
    expect(JSON.stringify(j).includes("%")).toBe(false);
  });
});

describe("RJ1a #9 no proposal / departure line / intervention ladder", () => {
  it("該当 field が型に存在しない", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })]));
    const j = judgeEvent(s, ERN("a1"));
    for (const k of ["proposal", "proposals", "departureLine", "departureLines", "interventionLadder", "threeOptions", "recommendation", "action"]) {
      expect(k in j).toBe(false);
    }
  });
});

describe("RJ1a #10 trace に graphBaseId / snapshotId / inputRevisionSet / usedInputRefs が残る", () => {
  it("trace 必須 field・judgmentId 決定的・computedAt は identity 対象外", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]));
    const j = judgeEvent(s, ERN("a1"));
    const t = j.judgmentTrace;
    expect(t.graphBaseId).toBe(s.graphBaseId);
    expect(t.snapshotId).toBe(s.snapshotId);
    expect(t.inputRevisionSet).toBe(s.inputRevisionSet);
    expect(t.derivationVersionSet).toBe(s.derivationVersionSet);
    expect(t.usedInputRefs).toContain(ERN("a1"));
    expect(t.feasibilityJudgmentVersion).toBe(FEASIBILITY_JUDGMENT_VERSION);
    expect(t.sourcesRevisionPending).toBe(true);
    expect(t.sourceRecordRevisionPending).toBe(true);
    // judgmentId 決定的（同 snapshot+scope → 同 id）
    expect(judgeEvent(s, ERN("a1")).judgmentTrace.judgmentId).toBe(t.judgmentId);
    // raw viewerId 不含
    expect(t.judgmentId.includes("viewer-self")).toBe(false);
  });
});

describe("RJ1a #11 missingInputRefs の source trace を失わない", () => {
  it("snapshot.missingInputRefs を judgment が carry", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })]));
    const j = judgeEvent(s, ERN("a1"));
    for (const r of s.missingInputRefs) {
      expect(j.missingInputRefs.some((jr) => jr.dedupeKey === r.dedupeKey)).toBe(true);
      expect(j.judgmentTrace.missingInputRefs.some((jr) => jr.dedupeKey === r.dedupeKey)).toBe(true);
    }
  });
});

describe("RJ1a #12 UI/storage/API/DB/location/notification/external read 不接触（source-scan）", () => {
  it("両 module source に IO / 時刻 API / 乱数の痕跡がない", () => {
    for (const f of ["feasibilityJudgment.ts", "realityJudgmentInput.ts"]) {
      const src = readFileSync(join(process.cwd(), `lib/plan/realityCore/${f}`), "utf8");
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const bad of ["fetch(", "supabase", "localStorage", ".from(", "geolocation", "Date.now", "Math.random", "new Date("]) {
        expect(code.includes(bad)).toBe(false);
      }
    }
  });
});

describe("RJ1a feasible path + scope + input validation", () => {
  it("critical 全解決 + 衝突なし + 脆さなし → feasible", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷", endTimeExplicit: true } as Partial<ExternalAnchor> & { id: string; startTime: string })]), {
      ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired() } },
    });
    const j = judgeEvent(s, ERN("a1"));
    expect(j.feasibilityStatus).toBe("feasible");
    expect(j.riskLevel).toBe("low");
    expect(j.judgmentConfidence).toBe("high");
    expect(j.displayPolicy).toBe("visible");
  });
  it("day scope = active+upcoming の worst-case rollup（hard 衝突あれば day infeasible）", () => {
    const s = snap(base([
      anchor({ id: "a1", startTime: "10:00", endTime: "12:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "11:00", endTime: "13:00", locationText: "新宿", rigidity: "hard" }),
    ]));
    const day: TargetScope = { kind: "day" };
    const j = evaluateFeasibility(buildRealityJudgmentInput(s, day));
    expect(j.feasibilityStatus).toBe("infeasible");
    expect(j.judgmentTrace.targetScope).toEqual({ kind: "day" });
  });
  it("buildRealityJudgmentInput は存在しない target で throw", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })]));
    expect(() => buildRealityJudgmentInput(s, { kind: "event", eventRealityNodeId: ERN("nope") })).toThrow(/存在しない/);
  });
  it("unknown は notActionable（verdict として出さない）", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })]));
    expect(judgeEvent(s, ERN("a1")).displayPolicy).toBe("notActionable");
  });
});
