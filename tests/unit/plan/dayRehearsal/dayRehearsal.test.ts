/**
 * Wave 2 Day Rehearsal — pure simulation layer のテスト（engine + adapter）。
 * 仮説 estimate / evidence trace(known/unknown/inferred) / unknown 非捏造 / degrade / 決定論 を検証。
 */
import { describe, it, expect } from "vitest";
import { rehearseDay, buildRehearsalInput, buildRehearsalInputFromDisplay } from "@/lib/plan/dayRehearsal/dayRehearsal";
import type { FeasibilityDisplayView } from "@/lib/plan/feasibility/feasibilityDisplayFormatter";
import {
  DEFAULT_REHEARSAL_CONFIG,
  type RehearsalEventInput,
  type RehearsalInput,
  type RehearsalStep,
  type RehearsalTransitionInput,
} from "@/lib/plan/dayRehearsal/dayRehearsalTypes";
import type { DayGraph, EventNode } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { DayFeasibilityResult, FeasibilitySlackView } from "@/lib/plan/feasibility/feasibilityTypes";
import type { TransportSegment } from "@/lib/alter-morning/transport/types";

// ── builders ──
function ev(id: string, o: Partial<RehearsalEventInput> = {}): RehearsalEventInput {
  return { id, timeBucket: o.timeBucket ?? "morning", durationMin: o.durationMin ?? 60, durationAssumed: o.durationAssumed ?? false, sensitive: o.sensitive ?? false };
}
function trans(o: Partial<RehearsalTransitionInput> = {}): RehearsalTransitionInput {
  return {
    mode: o.mode ?? "walk",
    travelMin: o.travelMin === undefined ? 20 : o.travelMin,
    travelKnown: o.travelKnown ?? true,
    bufferStatus: o.bufferStatus ?? "sufficient",
    slackMin: o.slackMin === undefined ? 30 : o.slackMin,
    shortfallMin: o.shortfallMin === undefined ? null : o.shortfallMin,
    gapMin: o.gapMin === undefined ? 40 : o.gapMin,
  };
}
function mkInput(steps: RehearsalStep[], o: Partial<RehearsalInput> = {}): RehearsalInput {
  return { date: o.date ?? "2026-06-06", dayMood: o.dayMood ?? "light", density: o.density ?? "balanced", baseEnergyLevel: o.baseEnergyLevel ?? null, steps };
}

describe("rehearseDay engine — 6 計算 + evidence", () => {
  it("1. 空の日 → viability unknown・steps 空", () => {
    const r = rehearseDay(mkInput([]));
    expect(r.viability.outlook).toBe("unknown");
    expect(r.steps).toHaveLength(0);
    expect(r.coverage.transitionsTotal).toBe(0);
  });

  it("2. 単一 event（transition なし）→ strain 累積・friction/buffer なし", () => {
    const r = rehearseDay(mkInput([{ event: ev("a"), transitionAfter: null }]));
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]!.friction).toBeNull();
    expect(r.steps[0]!.bufferStatus).toBe("not_applicable");
    expect(r.steps[0]!.cumulativeStrain.score).toBeGreaterThan(0);
  });

  it("3. 2 event・余白十分 → buffer 観測・recovery・viability holds", () => {
    const r = rehearseDay(
      mkInput([
        { event: ev("a"), transitionAfter: trans({ bufferStatus: "sufficient", slackMin: 60 }) },
        { event: ev("b"), transitionAfter: null },
      ]),
    );
    expect(r.steps[0]!.bufferStatus).toBe("sufficient");
    expect(r.steps[0]!.bufferMin).toBe(60);
    expect(r.steps[0]!.recovery!.score).toBeGreaterThan(0);
    expect(r.viability.outlook).toBe("holds");
  });

  it("4. 余白不足 → friction に shortfall・convergence factor buffer_short・viability tight 以上", () => {
    const r = rehearseDay(
      mkInput([
        { event: ev("a"), transitionAfter: trans({ bufferStatus: "insufficient", slackMin: null, shortfallMin: 40, travelMin: 40, mode: "public_transit" }) },
        { event: ev("b"), transitionAfter: null },
      ]),
    );
    expect(r.steps[0]!.bufferStatus).toBe("insufficient");
    expect(r.steps[0]!.bufferMin).toBe(-40);
    expect(r.steps[0]!.convergence!.factors).toContain("buffer_short");
    expect(["tight", "breaks"]).toContain(r.viability.outlook);
  });

  it("5. travel duration unknown → friction evidence.unknown・coverage.travelUnknown++・捏造しない", () => {
    const r = rehearseDay(
      mkInput([
        { event: ev("a"), transitionAfter: trans({ travelMin: null, travelKnown: false, mode: "unknown" }) },
        { event: ev("b"), transitionAfter: null },
      ]),
    );
    expect(r.steps[0]!.friction!.evidence.unknown).toContain("travel duration unknown");
    expect(r.coverage.travelUnknown).toBe(1);
    expect(r.coverage.travelKnown).toBe(0);
  });

  it("6. 多数 event → 累積 strain 単調増（recovery 無）・peakStrain 反映", () => {
    const noRec = (): RehearsalTransitionInput => trans({ bufferStatus: "not_applicable", slackMin: null, travelMin: 30 });
    const steps: RehearsalStep[] = [];
    for (let i = 0; i < 5; i += 1) steps.push({ event: ev(`e${i}`, { durationMin: 90 }), transitionAfter: i < 4 ? noRec() : null });
    const r = rehearseDay(mkInput(steps, { density: "packed" }));
    const scores = r.steps.map((s) => s.cumulativeStrain.score);
    for (let i = 1; i < scores.length; i += 1) expect(scores[i]!).toBeGreaterThanOrEqual(scores[i - 1]!);
    expect(r.peakStrain.score).toBe(Math.max(...scores));
  });

  it("7. gap の余白 → recovery が strain を戻す（recovery 後 < 加算のみ想定より低い）", () => {
    const withRec = rehearseDay(
      mkInput([
        { event: ev("a"), transitionAfter: trans({ bufferStatus: "sufficient", slackMin: 90, travelMin: 10 }) },
        { event: ev("b"), transitionAfter: null },
      ]),
    );
    const noRec = rehearseDay(
      mkInput([
        { event: ev("a"), transitionAfter: trans({ bufferStatus: "not_applicable", slackMin: null, travelMin: 10 }) },
        { event: ev("b"), transitionAfter: null },
      ]),
    );
    // recovery 有る方が b 到達時の累積 strain が低い
    expect(withRec.steps[1]!.cumulativeStrain.score).toBeLessThan(noRec.steps[1]!.cumulativeStrain.score);
  });

  it("8. 不足 + 高 strain + 高 friction → convergence high・viability breaks・breaksAt 設定", () => {
    const heavy = (): RehearsalTransitionInput => trans({ bufferStatus: "insufficient", slackMin: null, shortfallMin: 60, travelMin: 60, mode: "public_transit" });
    const steps: RehearsalStep[] = [];
    for (let i = 0; i < 6; i += 1) steps.push({ event: ev(`e${i}`, { durationMin: 120, timeBucket: "evening" }), transitionAfter: i < 5 ? heavy() : null });
    const r = rehearseDay(mkInput(steps, { density: "packed" }));
    expect(r.convergencePoints.length).toBeGreaterThan(0);
    expect(r.viability.outlook).toBe("breaks");
    expect(r.viability.breaksAtStepIndex).not.toBeNull();
  });

  it("9. evidence: assumed duration → unknown / explicit → known / heuristic travel → inferred", () => {
    const r = rehearseDay(
      mkInput([
        { event: ev("a", { durationAssumed: true }), transitionAfter: trans({ travelKnown: false, travelMin: 20 }) },
        { event: ev("b", { durationAssumed: false }), transitionAfter: null },
      ]),
    );
    expect(r.steps[0]!.cumulativeStrain.evidence.unknown).toContain("event duration assumed (not user-confirmed)");
    expect(r.steps[1]!.cumulativeStrain.evidence.known).toContain("explicit event duration");
    expect(r.steps[0]!.friction!.evidence.inferred).toContain("heuristic travel duration");
  });

  it("10. degrade: energyLevel null でも動く（baseBudget 使用）", () => {
    const r = rehearseDay(mkInput([{ event: ev("a"), transitionAfter: null }], { baseEnergyLevel: null }));
    expect(r.viability.outlook).not.toBe("unknown"); // 単一 event でも成立判定（transition 0 だが steps>0）
  });

  it("11. energyLevel 低 → budget 低 → 同じ strain でも level が上がりやすい", () => {
    const steps: RehearsalStep[] = [];
    for (let i = 0; i < 4; i += 1) steps.push({ event: ev(`e${i}`, { durationMin: 90 }), transitionAfter: i < 3 ? trans({ bufferStatus: "not_applicable", slackMin: null }) : null });
    const high = rehearseDay(mkInput(steps, { baseEnergyLevel: 1.0 }));
    const low = rehearseDay(mkInput(steps, { baseEnergyLevel: 0.0 }));
    // score 自体は同じ（budget は level にのみ影響）
    expect(low.peakStrain.score).toBeCloseTo(high.peakStrain.score);
    const order = { low: 0, moderate: 1, high: 2, unknown: -1 } as const;
    expect(order[low.peakStrain.level]).toBeGreaterThanOrEqual(order[high.peakStrain.level]);
  });

  it("12. 決定論: 2 回呼んで同一", () => {
    const i = mkInput([
      { event: ev("a"), transitionAfter: trans({ bufferStatus: "insufficient", slackMin: null, shortfallMin: 30 }) },
      { event: ev("b"), transitionAfter: null },
    ]);
    expect(rehearseDay(i)).toEqual(rehearseDay(i));
  });

  it("13. Date.now / new Date を使わない", () => {
    const orig = Date.now;
    Date.now = () => {
      throw new Error("Date.now called");
    };
    try {
      expect(() => rehearseDay(mkInput([{ event: ev("a"), transitionAfter: trans() }, { event: ev("b"), transitionAfter: null }]))).not.toThrow();
    } finally {
      Date.now = orig;
    }
  });

  it("14. buffer/travel ともに signal なし → viability unknown（過剰主張しない）", () => {
    const r = rehearseDay(
      mkInput([
        { event: ev("a"), transitionAfter: trans({ travelMin: null, travelKnown: false, bufferStatus: "not_applicable", slackMin: null }) },
        { event: ev("b"), transitionAfter: trans({ travelMin: null, travelKnown: false, bufferStatus: "not_applicable", slackMin: null }) },
        { event: ev("c"), transitionAfter: null },
      ]),
    );
    expect(r.viability.outlook).toBe("unknown");
    expect(r.viability.evidence.unknown).toContain("no feasibility or travel signal");
  });

  it("14b. buffer signal あり・travel 全 unknown → unknown でない（Option D: status-only で outlook 可）", () => {
    const r = rehearseDay(
      mkInput([
        { event: ev("a"), transitionAfter: trans({ travelMin: null, travelKnown: false, bufferStatus: "insufficient", slackMin: null, shortfallMin: null }) },
        { event: ev("b"), transitionAfter: null },
      ]),
    );
    expect(r.viability.outlook).not.toBe("unknown"); // buffer status があるので outlook を出す
    expect(["tight", "breaks"]).toContain(r.viability.outlook); // insufficient あり
  });

  it("15. holds: 全余白十分・strain 低", () => {
    const r = rehearseDay(
      mkInput([
        { event: ev("a", { durationMin: 30 }), transitionAfter: trans({ bufferStatus: "sufficient", slackMin: 60, travelMin: 10, mode: "car" }) },
        { event: ev("b", { durationMin: 30 }), transitionAfter: null },
      ]),
    );
    expect(r.viability.outlook).toBe("holds");
    expect(r.convergencePoints).toHaveLength(0);
  });

  it("16. convergence は確率でなく factors（observed/inferred 区別）", () => {
    const r = rehearseDay(
      mkInput([
        { event: ev("a"), transitionAfter: trans({ bufferStatus: "insufficient", slackMin: null, shortfallMin: 20 }) },
        { event: ev("b"), transitionAfter: null },
      ]),
    );
    const conv = r.steps[0]!.convergence!;
    expect(Array.isArray(conv.factors)).toBe(true);
    expect(conv.evidence.known).toContain("feasibility insufficient"); // buffer は観測
  });
});

// ── adapter: DayGraph + feasibility + transport → RehearsalInput ──
function evNode(id: string, startTime: string, endTime: string, o: Partial<EventNode> = {}): EventNode {
  return {
    id,
    kind: "event",
    origin: "explicit",
    startTime,
    endTime,
    durationMin: 60,
    timeBucket: "morning",
    anchorId: id,
    displayLabel: id,
    verb: "unknown",
    rigidity: "soft",
    latencyTolerance: "flexible",
    durationSource: o.durationSource ?? "explicit",
    boundaryClipped: false,
    sensitive: o.sensitive ?? false,
    overlapsWithNodeIds: [],
    ...o,
  } as unknown as EventNode;
}
function mkGraph(nodes: EventNode[]): DayGraph {
  return {
    snapshotId: "test",
    attributes: { date: "2026-06-06", dayMood: "light", density: "balanced" },
    nodes,
    edges: [],
    transitions: [],
  } as unknown as DayGraph;
}
function feas(views: Array<[number, FeasibilitySlackView]>): DayFeasibilityResult {
  const m = new Map<string, FeasibilitySlackView>();
  for (const [i, v] of views) m.set(`transition_${i}`, v);
  return { feasibilityByTransitionKey: m, counts: { sufficient: 0, insufficient: 0, notApplicable: 0 } };
}
function seg(from: string, to: string, o: Partial<TransportSegment> = {}): TransportSegment {
  return {
    fromEventId: from,
    toEventId: to,
    mode: o.mode ?? "walk",
    estimatedDurationMin: o.estimatedDurationMin === undefined ? 20 : o.estimatedDurationMin,
    durationSource: o.durationSource === undefined ? "routes_api" : o.durationSource,
    distanceM: null,
    confidence: "inferred",
    source: "routes_api",
  };
}

describe("buildRehearsalInput adapter — 既存 building blocks の join", () => {
  it("17. events 時系列順 + transition を feasibility/transport に join + gap 算出", () => {
    const g = mkGraph([evNode("a", "09:00", "10:00"), evNode("b", "11:00", "12:00")]);
    const f = feas([[0, { transitionIndex: 0, status: "sufficient", slackMin: 45 }]]);
    const input = buildRehearsalInput(g, f, [seg("a", "b", { mode: "public_transit", estimatedDurationMin: 15 })]);
    expect(input.steps).toHaveLength(2);
    const t = input.steps[0]!.transitionAfter!;
    expect(t.mode).toBe("public_transit");
    expect(t.travelMin).toBe(15);
    expect(t.travelKnown).toBe(true); // routes_api
    expect(t.bufferStatus).toBe("sufficient");
    expect(t.slackMin).toBe(45);
    expect(t.gapMin).toBe(60); // 11:00 - 10:00
    expect(input.steps[1]!.transitionAfter).toBeNull();
  });

  it("18. transport 欠落 → mode unknown / travelMin null（捏造しない）", () => {
    const g = mkGraph([evNode("a", "09:00", "10:00"), evNode("b", "11:00", "12:00")]);
    const input = buildRehearsalInput(g, feas([]), []);
    const t = input.steps[0]!.transitionAfter!;
    expect(t.mode).toBe("unknown");
    expect(t.travelMin).toBeNull();
    expect(t.travelKnown).toBe(false);
  });

  it("19. feasibility view 欠落 → not_applicable", () => {
    const g = mkGraph([evNode("a", "09:00", "10:00"), evNode("b", "11:00", "12:00")]);
    const input = buildRehearsalInput(g, feas([]), [seg("a", "b")]);
    expect(input.steps[0]!.transitionAfter!.bufferStatus).toBe("not_applicable");
  });

  it("20. durationSource assumed_default → durationAssumed true / heuristic travel → travelKnown false", () => {
    const g = mkGraph([evNode("a", "09:00", "10:00", { durationSource: "assumed_default" }), evNode("b", "11:00", "12:00")]);
    const input = buildRehearsalInput(g, feas([]), [seg("a", "b", { durationSource: "heuristic" })]);
    expect(input.steps[0]!.event.durationAssumed).toBe(true);
    expect(input.steps[0]!.transitionAfter!.travelKnown).toBe(false); // heuristic は known でない
    // engine と結合: rehearseDay が走る
    const r = rehearseDay(input);
    expect(r.date).toBe("2026-06-06");
    expect(r.coverage.eventsAssumedDuration).toBe(1);
  });
});

// ── Option D adapter: buildRehearsalInputFromDisplay（display map status → input・status-only） ──
function displayMap(entries: Array<[number, "slack" | "shortfall"]>): ReadonlyMap<number, FeasibilityDisplayView> {
  const m = new Map<number, FeasibilityDisplayView>();
  for (const [i, variant] of entries) {
    m.set(i, { transitionIndex: i, displayText: variant === "slack" ? "余白 N 分" : "不足 N 分", variant, tier: "tier_2_movement_aux" });
  }
  return m;
}

describe("buildRehearsalInputFromDisplay (Option D: status-only・honest degrade)", () => {
  it("21. shortfall → insufficient・分数 null(捏造しない)・travel unknown・gap 算出", () => {
    const g = mkGraph([evNode("a", "09:00", "10:00"), evNode("b", "11:00", "12:00")]);
    const t = buildRehearsalInputFromDisplay(g, displayMap([[0, "shortfall"]])).steps[0]!.transitionAfter!;
    expect(t.bufferStatus).toBe("insufficient");
    expect(t.slackMin).toBeNull();
    expect(t.shortfallMin).toBeNull();
    expect(t.travelMin).toBeNull();
    expect(t.travelKnown).toBe(false);
    expect(t.mode).toBe("unknown");
    expect(t.gapMin).toBe(60); // 11:00 - 10:00
  });

  it("22. slack → sufficient", () => {
    const g = mkGraph([evNode("a", "09:00", "10:00"), evNode("b", "11:00", "12:00")]);
    expect(buildRehearsalInputFromDisplay(g, displayMap([[0, "slack"]])).steps[0]!.transitionAfter!.bufferStatus).toBe("sufficient");
  });

  it("23. display 不在 transition → not_applicable", () => {
    const g = mkGraph([evNode("a", "09:00", "10:00"), evNode("b", "11:00", "12:00")]);
    expect(buildRehearsalInputFromDisplay(g, displayMap([])).steps[0]!.transitionAfter!.bufferStatus).toBe("not_applicable");
  });

  it("24. engine 結合: shortfall display → viability unknown でない（status-only で outlook）", () => {
    const g = mkGraph([evNode("a", "09:00", "10:00"), evNode("b", "11:00", "12:00")]);
    const r = rehearseDay(buildRehearsalInputFromDisplay(g, displayMap([[0, "shortfall"]])));
    expect(r.viability.outlook).not.toBe("unknown");
    expect(["tight", "breaks"]).toContain(r.viability.outlook);
  });

  it("25. display 全空 → viability unknown（banner 非表示ケース）", () => {
    const g = mkGraph([evNode("a", "09:00", "10:00"), evNode("b", "11:00", "12:00")]);
    expect(rehearseDay(buildRehearsalInputFromDisplay(g, displayMap([]))).viability.outlook).toBe("unknown");
  });
});
