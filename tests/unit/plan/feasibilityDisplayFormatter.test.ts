/**
 * Phase 3-M M-2a — feasibilityDisplayFormatter tests
 *
 * 設計書: docs/alter-plan-phase3-m-2-readiness-audit.md §3 / §7
 *
 * 検証範囲:
 *   §1. variant + displayText 規則 (= sufficient → 「余白 N 分」、 insufficient → 「不足 N 分」)
 *   §2. tier 固定 (= "tier_2_movement_aux")
 *   §3. not_applicable は map から除外
 *   §4. counts 集計
 *   §5. PII 不存在 (= MovementDisplayView の key set 検証 + JSON grep)
 *   §6. integration with M-1 helper
 *   §7. input mutation 0
 *
 * 不変原則:
 *   - LLM 不使用
 *   - pure (= no side effects)
 *   - no DB / API / network / localStorage / env access
 *   - no UI import
 */

import { describe, expect, it } from "vitest";

import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import { createHeuristicDistanceProvider } from "@/lib/plan/transport/heuristicDistanceProvider";
import { createManualUserProvider } from "@/lib/plan/transport/manualUserProvider";
import { createUnresolvedProvider } from "@/lib/plan/transport/unresolvedProvider";
import { resolveMovementSegmentOverlay } from "@/lib/plan/transport/movementSegmentOverlay";
import type { TransportResolutionProvider } from "@/lib/plan/transport/transportTypes";
import { computeDayFeasibility } from "@/lib/plan/feasibility/dayFeasibilityComputation";
import {
  formatFeasibilityForDisplay,
  type FeasibilityDisplayView,
} from "@/lib/plan/feasibility/feasibilityDisplayFormatter";
import type {
  DayFeasibilityResult,
  FeasibilitySlackView,
} from "@/lib/plan/feasibility/feasibilityTypes";
import {
  HEAVY_DAY_ANCHORS,
  MOVEMENT_DAY_ANCHORS,
  SENSITIVE_DAY_ANCHORS,
} from "@/tests/fixtures/dayGraph";

const DATE = "2026-05-23";
const SHINJUKU = { lat: 35.6896, lng: 139.7006 };
const SHIBUYA = { lat: 35.6580, lng: 139.7016 };
const TOKYO = { lat: 35.6812, lng: 139.7671 };

function defaultProviders(): TransportResolutionProvider[] {
  return [
    createManualUserProvider(),
    createHeuristicDistanceProvider(),
    createUnresolvedProvider("no_provider_available"),
  ];
}

function makeSufficient(slackMin: number, transitionIndex = 0): FeasibilitySlackView {
  return { transitionIndex, status: "sufficient", slackMin };
}

function makeInsufficient(
  shortfallMin: number,
  transitionIndex = 0,
): FeasibilitySlackView {
  return { transitionIndex, status: "insufficient", shortfallMin };
}

function makeNotApplicable(transitionIndex = 0): FeasibilitySlackView {
  return { transitionIndex, status: "not_applicable" };
}

function makeResult(
  views: ReadonlyArray<readonly [string, FeasibilitySlackView]>,
): DayFeasibilityResult {
  const map = new Map(views);
  let sufficient = 0;
  let insufficient = 0;
  let notApplicable = 0;
  for (const [, view] of views) {
    if (view.status === "sufficient") sufficient++;
    else if (view.status === "insufficient") insufficient++;
    else notApplicable++;
  }
  return {
    feasibilityByTransitionKey: map,
    counts: { sufficient, insufficient, notApplicable },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. variant + displayText 規則
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. variant + displayText 規則", () => {
  it("sufficient (slackMin=50) → variant='slack'、 ' 余白 50 分'", () => {
    const result = makeResult([["transition_0", makeSufficient(50)]]);
    const display = formatFeasibilityForDisplay(result);
    const view = display.feasibilityDisplayByTransitionKey.get("transition_0");
    expect(view).toBeDefined();
    expect(view!.variant).toBe("slack");
    expect(view!.displayText).toBe("余白 50 分");
  });

  it("sufficient (slackMin=0) → '余白 0 分'", () => {
    const result = makeResult([["transition_0", makeSufficient(0)]]);
    const display = formatFeasibilityForDisplay(result);
    const view = display.feasibilityDisplayByTransitionKey.get("transition_0")!;
    expect(view.displayText).toBe("余白 0 分");
  });

  it("insufficient (shortfallMin=10) → variant='shortfall'、 '不足 10 分'", () => {
    const result = makeResult([["transition_0", makeInsufficient(10)]]);
    const display = formatFeasibilityForDisplay(result);
    const view = display.feasibilityDisplayByTransitionKey.get("transition_0");
    expect(view).toBeDefined();
    expect(view!.variant).toBe("shortfall");
    expect(view!.displayText).toBe("不足 10 分");
  });

  it("insufficient (shortfallMin=100) → '不足 100 分'", () => {
    const result = makeResult([["transition_0", makeInsufficient(100)]]);
    const display = formatFeasibilityForDisplay(result);
    expect(display.feasibilityDisplayByTransitionKey.get("transition_0")!.displayText).toBe(
      "不足 100 分",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. tier 固定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2. tier 固定 = 'tier_2_movement_aux'", () => {
  it("sufficient view の tier", () => {
    const result = makeResult([["transition_0", makeSufficient(30)]]);
    const display = formatFeasibilityForDisplay(result);
    expect(display.feasibilityDisplayByTransitionKey.get("transition_0")!.tier).toBe(
      "tier_2_movement_aux",
    );
  });

  it("insufficient view の tier", () => {
    const result = makeResult([["transition_0", makeInsufficient(20)]]);
    const display = formatFeasibilityForDisplay(result);
    expect(display.feasibilityDisplayByTransitionKey.get("transition_0")!.tier).toBe(
      "tier_2_movement_aux",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. not_applicable は map から除外
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3. not_applicable は表示しない (= map から除外)", () => {
  it("単一 not_applicable → 空 map + counts 全 0", () => {
    const result = makeResult([["transition_0", makeNotApplicable()]]);
    const display = formatFeasibilityForDisplay(result);
    expect(display.feasibilityDisplayByTransitionKey.size).toBe(0);
    expect(display.counts.slack).toBe(0);
    expect(display.counts.shortfall).toBe(0);
  });

  it("not_applicable と sufficient 混在 → sufficient のみ残る", () => {
    const result = makeResult([
      ["transition_0", makeNotApplicable(0)],
      ["transition_1", makeSufficient(30, 1)],
      ["transition_2", makeNotApplicable(2)],
    ]);
    const display = formatFeasibilityForDisplay(result);
    expect(display.feasibilityDisplayByTransitionKey.size).toBe(1);
    expect(display.feasibilityDisplayByTransitionKey.has("transition_0")).toBe(false);
    expect(display.feasibilityDisplayByTransitionKey.has("transition_1")).toBe(true);
    expect(display.feasibilityDisplayByTransitionKey.has("transition_2")).toBe(false);
    expect(display.counts.slack).toBe(1);
    expect(display.counts.shortfall).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. counts 集計
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4. counts 集計", () => {
  it("sufficient 2 + insufficient 1 + not_applicable 1 → counts={slack:2, shortfall:1}", () => {
    const result = makeResult([
      ["transition_0", makeSufficient(30, 0)],
      ["transition_1", makeSufficient(50, 1)],
      ["transition_2", makeInsufficient(20, 2)],
      ["transition_3", makeNotApplicable(3)],
    ]);
    const display = formatFeasibilityForDisplay(result);
    expect(display.counts.slack).toBe(2);
    expect(display.counts.shortfall).toBe(1);
    expect(display.feasibilityDisplayByTransitionKey.size).toBe(3); // not_applicable は除外
  });

  it("counts の和 = displayMap size (= 集計恒等式)", () => {
    const result = makeResult([
      ["transition_0", makeSufficient(10, 0)],
      ["transition_1", makeInsufficient(5, 1)],
    ]);
    const display = formatFeasibilityForDisplay(result);
    const sum = display.counts.slack + display.counts.shortfall;
    expect(sum).toBe(display.feasibilityDisplayByTransitionKey.size);
  });

  it("空 result → counts 全 0、 空 map", () => {
    const result = makeResult([]);
    const display = formatFeasibilityForDisplay(result);
    expect(display.feasibilityDisplayByTransitionKey.size).toBe(0);
    expect(display.counts.slack).toBe(0);
    expect(display.counts.shortfall).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. PII 不存在
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. PII 不存在 — view の key set", () => {
  it("sufficient view: 期待 field のみ (= 4 keys)", () => {
    const result = makeResult([["transition_0", makeSufficient(30)]]);
    const display = formatFeasibilityForDisplay(result);
    const view = display.feasibilityDisplayByTransitionKey.get("transition_0")!;
    const keys = Object.keys(view).sort();
    expect(keys).toEqual(["displayText", "tier", "transitionIndex", "variant"].sort());
  });

  it("insufficient view: 期待 field のみ", () => {
    const result = makeResult([["transition_0", makeInsufficient(10)]]);
    const display = formatFeasibilityForDisplay(result);
    const view = display.feasibilityDisplayByTransitionKey.get("transition_0")!;
    const keys = Object.keys(view).sort();
    expect(keys).toEqual(["displayText", "tier", "transitionIndex", "variant"].sort());
    // PII field 不在
    expect(keys).not.toContain("fromNodeId");
    expect(keys).not.toContain("toNodeId");
    expect(keys).not.toContain("fromLocationText");
    expect(keys).not.toContain("toLocationText");
    expect(keys).not.toContain("anchorId");
    expect(keys).not.toContain("userId");
    expect(keys).not.toContain("title");
    expect(keys).not.toContain("slackMin"); // raw 数値出さない、 displayText に集約
    expect(keys).not.toContain("shortfallMin");
  });

  it("result top-level の key set", () => {
    const result = makeResult([]);
    const display = formatFeasibilityForDisplay(result);
    const keys = Object.keys(display).sort();
    expect(keys).toEqual(["counts", "feasibilityDisplayByTransitionKey"].sort());
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. Integration with M-1 helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. Integration — buildDayGraph → overlay → computeDayFeasibility → format", () => {
  it("MOVEMENT fixture + 全 coords → sufficient view 1 件", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map([
        ["move_morning", SHIBUYA],
        ["move_afternoon", SHINJUKU],
        ["move_evening", SHINJUKU],
      ]),
      cascadeOptions: { providers: defaultProviders() },
    });
    const feasibility = computeDayFeasibility(graph, overlay);
    const display = formatFeasibilityForDisplay(feasibility);
    expect(display.counts.slack).toBe(1);
    expect(display.counts.shortfall).toBe(0);
    const view = display.feasibilityDisplayByTransitionKey.get("transition_0")!;
    expect(view.variant).toBe("slack");
    expect(view.displayText).toMatch(/^余白 \d+ 分$/);
  });

  it("MOVEMENT + manual override で 200 分 → insufficient view", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const overrides = new Map([[0, { userDurationMin: 200 }]]);
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map([
        ["move_morning", SHIBUYA],
        ["move_afternoon", SHINJUKU],
        ["move_evening", SHINJUKU],
      ]),
      overridesByTransitionIndex: overrides,
      cascadeOptions: { providers: defaultProviders() },
    });
    const feasibility = computeDayFeasibility(graph, overlay);
    const display = formatFeasibilityForDisplay(feasibility);
    expect(display.counts.shortfall).toBe(1);
    const view = display.feasibilityDisplayByTransitionKey.get("transition_0")!;
    expect(view.variant).toBe("shortfall");
    expect(view.displayText).toMatch(/^不足 \d+ 分$/);
  });

  it("SENSITIVE fixture → 全 not_applicable → display map 空 (= 表示しない)", async () => {
    const { graph } = buildDayGraph({ anchors: SENSITIVE_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map([
        ["sens_med", TOKYO],
        ["sens_legal", SHINJUKU],
        ["normal", SHIBUYA],
      ]),
      cascadeOptions: { providers: defaultProviders() },
    });
    const feasibility = computeDayFeasibility(graph, overlay);
    const display = formatFeasibilityForDisplay(feasibility);
    // SENSITIVE は全 not_applicable → display 空
    expect(display.feasibilityDisplayByTransitionKey.size).toBe(0);
  });

  it("HEAVY fixture: display JSON に raw title / locationText 不在", async () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map([
        ["heavy_c", SHINJUKU],
        ["heavy_d", TOKYO],
      ]),
      cascadeOptions: { providers: defaultProviders() },
    });
    const feasibility = computeDayFeasibility(graph, overlay);
    const display = formatFeasibilityForDisplay(feasibility);
    const serialized = JSON.stringify(
      Array.from(display.feasibilityDisplayByTransitionKey.entries()),
    );
    expect(serialized).not.toContain("朝会議");
    expect(serialized).not.toContain("商談");
    expect(serialized).not.toContain("オフィス");
    expect(serialized).not.toContain("heavy_a");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. input mutation 0
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7. input mutation 0", () => {
  it("formatFeasibilityForDisplay は input DayFeasibilityResult を mutate しない", () => {
    const result = makeResult([
      ["transition_0", makeSufficient(30)],
      ["transition_1", makeInsufficient(10, 1)],
    ]);
    const snapshot = JSON.stringify(Array.from(result.feasibilityByTransitionKey.entries()));
    const countsSnapshot = JSON.stringify(result.counts);
    formatFeasibilityForDisplay(result);
    expect(JSON.stringify(Array.from(result.feasibilityByTransitionKey.entries()))).toBe(snapshot);
    expect(JSON.stringify(result.counts)).toBe(countsSnapshot);
  });
});
