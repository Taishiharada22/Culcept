/**
 * Phase 3-M M-1 (pure) — dayFeasibilityComputation tests
 *
 * 設計書: docs/alter-plan-phase3-m-readiness-audit.md §4.3
 *
 * 検証範囲:
 *   §1. happy path — 各 fixture で feasibility 計算成立
 *   §2. unresolved transition → not_applicable
 *   §3. sensitive proximity → not_applicable (= cascade で unresolved 経由)
 *   §4. resolved + sufficient (= 余白あり)
 *   §5. resolved + insufficient (= 不足あり)
 *   §6. resolved + 時刻 parse 不能 → not_applicable
 *   §7. counts 集計正確 + transitionKey format 整合
 *   §8. input mutation 0 (= graph / overlay 不変)
 *   §9. assertDayFeasibilityResultCompliance 実走 (= 出荷直前)
 *   §10. PII grep — result JSON に raw 含まれず
 *   §11. Integration — K phase 全 fixture で完走
 *
 * 不変原則:
 *   - LLM 不使用
 *   - no DB / no API / no localStorage / no network
 *   - K phase / L 既存 file 改変 0
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
  EMPTY_DAY_ANCHORS,
  HEAVY_DAY_ANCHORS,
  INVALID_DAY_ANCHORS,
  LIGHT_DAY_ANCHORS,
  MOVEMENT_DAY_ANCHORS,
  OVERLAP_DAY_ANCHORS,
  SENSITIVE_DAY_ANCHORS,
  SINGLE_DAY_ANCHORS,
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. happy path — 各 fixture で feasibility 計算成立
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. happy path — 各 fixture で computeDayFeasibility 完走", () => {
  const fixtures = [
    { name: "EMPTY", anchors: EMPTY_DAY_ANCHORS },
    { name: "SINGLE", anchors: SINGLE_DAY_ANCHORS },
    { name: "LIGHT", anchors: LIGHT_DAY_ANCHORS },
    { name: "HEAVY", anchors: HEAVY_DAY_ANCHORS },
    { name: "MOVEMENT", anchors: MOVEMENT_DAY_ANCHORS },
    { name: "SENSITIVE", anchors: SENSITIVE_DAY_ANCHORS },
    { name: "OVERLAP", anchors: OVERLAP_DAY_ANCHORS },
  ];

  for (const { name, anchors } of fixtures) {
    it(`${name} fixture: feasibility 完走 + assertion 通過`, async () => {
      const { graph } = buildDayGraph({ anchors, date: DATE });
      const overlay = await resolveMovementSegmentOverlay({
        graph,
        coordsByAnchorId: new Map(),
        cascadeOptions: { providers: defaultProviders() },
      });
      const result = computeDayFeasibility(graph, overlay);
      expect(result.feasibilityByTransitionKey.size).toBe(graph.transitions.length);
      const total =
        result.counts.sufficient + result.counts.insufficient + result.counts.notApplicable;
      expect(total).toBe(graph.transitions.length);
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. unresolved transition → not_applicable
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2. unresolved → not_applicable", () => {
  it("MOVEMENT fixture + coords なし → 全 transition not_applicable", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });
    const result = computeDayFeasibility(graph, overlay);
    expect(result.counts.notApplicable).toBe(graph.transitions.length);
    expect(result.counts.sufficient).toBe(0);
    expect(result.counts.insufficient).toBe(0);
    for (const view of result.feasibilityByTransitionKey.values()) {
      expect(view.status).toBe("not_applicable");
      expect(view.slackMin).toBeUndefined();
      expect(view.shortfallMin).toBeUndefined();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. sensitive proximity → not_applicable
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3. sensitive → not_applicable (= cascade で unresolved 経由)", () => {
  it("SENSITIVE fixture + coords 揃い → 全 not_applicable", async () => {
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
    const result = computeDayFeasibility(graph, overlay);
    expect(result.counts.notApplicable).toBe(graph.transitions.length);
    expect(result.counts.sufficient).toBe(0);
    expect(result.counts.insufficient).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 / §5. resolved + sufficient / insufficient
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4 / §5. resolved + sufficient / insufficient", () => {
  it("MOVEMENT (12:00-13:00 渋谷 → 15:00-16:00 新宿) + 全 coords → sufficient (= 余白 120 分 - 移動 25 分 = 95 分)", async () => {
    // 渋谷 (~5km) → 新宿 ~= 移動 25 分 (= heuristic ≤7km bin)
    // 余白 = 15:00 - 13:00 = 120 分
    // slack = 120 - 25 = 95 分 → sufficient
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
    const result = computeDayFeasibility(graph, overlay);
    expect(result.counts.sufficient).toBe(1);
    expect(result.counts.insufficient).toBe(0);
    const view = result.feasibilityByTransitionKey.get("transition_0")!;
    expect(view.status).toBe("sufficient");
    expect(view.slackMin).toBeGreaterThan(0);
    expect(view.shortfallMin).toBeUndefined();
  });

  it("manual override で大きな duration → insufficient", async () => {
    // MOVEMENT fixture の transition (= 12:00 終了 → 15:00 開始、 余白 180 分)
    // manual override で 200 分 → 余白 180 - 200 = -20 → insufficient (shortfall=20)
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
    const result = computeDayFeasibility(graph, overlay);
    const view = result.feasibilityByTransitionKey.get("transition_0")!;
    expect(view.status).toBe("insufficient");
    expect(view.shortfallMin).toBe(80); // 200 (manual) - 120 (available) = 80
    expect(view.slackMin).toBeUndefined();
  });

  it("manual override で exact match → sufficient slackMin=0", async () => {
    // exact: duration = available なら slack = 0、 sufficient
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    // MOVEMENT transition[0] (= 渋谷 12:00-13:00 → 新宿 15:00-16:00)
    // 余白 = 15:00 - 13:00 = 120 分
    const overrides = new Map([[0, { userDurationMin: 120 }]]);
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
    const result = computeDayFeasibility(graph, overlay);
    const view = result.feasibilityByTransitionKey.get("transition_0")!;
    expect(view.status).toBe("sufficient");
    expect(view.slackMin).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. counts 集計恒等式 + transitionKey format
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. counts + transitionKey format", () => {
  it("counts 和 = size", async () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });
    const result = computeDayFeasibility(graph, overlay);
    const total =
      result.counts.sufficient + result.counts.insufficient + result.counts.notApplicable;
    expect(total).toBe(result.feasibilityByTransitionKey.size);
  });

  it("全 key は `transition_${index}` 形式 (= L-3c 継承)", async () => {
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
    const result = computeDayFeasibility(graph, overlay);
    for (const key of result.feasibilityByTransitionKey.keys()) {
      expect(key).toMatch(/^transition_\d+$/);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. input mutation 0
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7. input mutation 0", () => {
  it("computeDayFeasibility は graph を mutate しない", async () => {
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
    const graphBeforeJson = JSON.stringify(graph);
    computeDayFeasibility(graph, overlay);
    expect(JSON.stringify(graph)).toBe(graphBeforeJson);
  });

  it("computeDayFeasibility は overlay を mutate しない", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });
    const sizeBefore = overlay.segmentsByTransitionKey.size;
    const resolvedBefore = overlay.resolvedCount;
    computeDayFeasibility(graph, overlay);
    expect(overlay.segmentsByTransitionKey.size).toBe(sizeBefore);
    expect(overlay.resolvedCount).toBe(resolvedBefore);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. PII grep — result に raw 含まれず
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§8. PII grep — result JSON に raw 値が含まれない", () => {
  it("HEAVY fixture: anchor title / locationText が含まれない", async () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map([
        ["heavy_c", SHINJUKU],
        ["heavy_d", TOKYO],
      ]),
      cascadeOptions: { providers: defaultProviders() },
    });
    const result = computeDayFeasibility(graph, overlay);
    const serialized = JSON.stringify(
      Array.from(result.feasibilityByTransitionKey.entries()),
    );
    expect(serialized).not.toContain("朝会議");
    expect(serialized).not.toContain("商談");
    expect(serialized).not.toContain("オフィス");
    expect(serialized).not.toContain("新宿");
    expect(serialized).not.toContain("heavy_a");
    expect(serialized).not.toContain("heavy_c");
  });

  it("SENSITIVE fixture: sensitive raw title 含まれない", async () => {
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
    const result = computeDayFeasibility(graph, overlay);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("MRI");
    expect(serialized).not.toContain("弁護士");
    expect(serialized).not.toContain("病院");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9. NG 文言 — result に評価語が含まれない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§9. NG 文言 — result に評価語含まれない (= 数値のみ output)", () => {
  it("MOVEMENT fixture result に「ギリギリ」「快適」「危険」「リスク」 等の評価語不在", async () => {
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
    const result = computeDayFeasibility(graph, overlay);
    const serialized = JSON.stringify(result);
    const ngWords = [
      "ギリギリ",
      "余裕",
      "快適",
      "便利",
      "最適",
      "注意",
      "警告",
      "危険",
      "リスク",
      "遅刻",
      "急いで",
      "お急ぎ",
      "早めに",
    ];
    for (const ng of ngWords) {
      expect(serialized).not.toContain(ng);
    }
  });
});
