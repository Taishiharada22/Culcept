/**
 * Phase 3-M M-3a — feasibilityDisplayPipeline tests
 *
 * 設計書: docs/alter-plan-phase3-m-3-readiness-audit.md §6
 *
 * 検証範囲:
 *   §1. happy path — 各 fixture で pipeline 完走 + M-2b assertion 通過
 *   §2. counts 完全保持 (= sufficient / insufficient / notApplicable 全件)
 *   §3. display は not_applicable 除外 (= M-2a 経由)
 *   §4. integration with L-4c-pure (= caller pattern smoke)
 *   §5. tracingId passthrough on/off
 *   §6. input mutation 0 (= graph / overlayResult)
 *   §7. PII grep (= result JSON に raw 値 0)
 *   §8. NG 文言 grep (= 警告系文言 / 記号 0)
 *   §9. M-2b assertion 実走確認 (= 通常 path で throw なし)
 *
 * 不変原則:
 *   - LLM 不使用
 *   - pure / sync / deterministic
 *   - no DB / no API / no localStorage / no network
 *   - K phase / L / M-1 / M-2 既存 file 改変 0
 */

import { describe, expect, it } from "vitest";

import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import { createHeuristicDistanceProvider } from "@/lib/plan/transport/heuristicDistanceProvider";
import { createManualUserProvider } from "@/lib/plan/transport/manualUserProvider";
import { createUnresolvedProvider } from "@/lib/plan/transport/unresolvedProvider";
import { resolveMovementSegmentOverlay } from "@/lib/plan/transport/movementSegmentOverlay";
import { runMovementDisplayPipeline } from "@/lib/plan/transport/movementDisplayPipeline";
import type { TransportResolutionProvider } from "@/lib/plan/transport/transportTypes";
import { runFeasibilityDisplayPipeline } from "@/lib/plan/feasibility/feasibilityDisplayPipeline";
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
// §1. happy path
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. happy path — 各 fixture で M-3a pipeline 完走", () => {
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
    it(`${name} fixture: pipeline 完走 + assertion 通過`, async () => {
      const { graph } = buildDayGraph({ anchors, date: DATE });
      const overlay = await resolveMovementSegmentOverlay({
        graph,
        coordsByAnchorId: new Map(),
        cascadeOptions: { providers: defaultProviders() },
      });
      const result = runFeasibilityDisplayPipeline({
        graph,
        overlayResult: overlay,
      });
      expect(result.feasibilityDisplay).toBeDefined();
      expect(result.feasibilityCounts).toBeDefined();
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. counts 完全保持
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2. feasibilityCounts 完全保持 (= sufficient + insufficient + notApplicable 全件)", () => {
  it("MOVEMENT + coords なし → 全 not_applicable (= 完全 counts 検証)", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });
    const result = runFeasibilityDisplayPipeline({ graph, overlayResult: overlay });
    expect(result.feasibilityCounts.notApplicable).toBe(graph.transitions.length);
    expect(result.feasibilityCounts.sufficient).toBe(0);
    expect(result.feasibilityCounts.insufficient).toBe(0);
  });

  it("MOVEMENT + 全 coords → sufficient counts > 0", async () => {
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
    const result = runFeasibilityDisplayPipeline({ graph, overlayResult: overlay });
    expect(result.feasibilityCounts.sufficient).toBe(1);
    expect(result.feasibilityCounts.insufficient).toBe(0);
    expect(result.feasibilityCounts.notApplicable).toBe(0);
  });

  it("MOVEMENT + manual override 200 分 → insufficient counts = 1", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map([
        ["move_morning", SHIBUYA],
        ["move_afternoon", SHINJUKU],
        ["move_evening", SHINJUKU],
      ]),
      overridesByTransitionIndex: new Map([[0, { userDurationMin: 200 }]]),
      cascadeOptions: { providers: defaultProviders() },
    });
    const result = runFeasibilityDisplayPipeline({ graph, overlayResult: overlay });
    expect(result.feasibilityCounts.insufficient).toBe(1);
    expect(result.feasibilityCounts.sufficient).toBe(0);
    expect(result.feasibilityCounts.notApplicable).toBe(0);
  });

  it("counts 和 (= sufficient + insufficient + notApplicable) === graph.transitions.length", async () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });
    const result = runFeasibilityDisplayPipeline({ graph, overlayResult: overlay });
    const total =
      result.feasibilityCounts.sufficient +
      result.feasibilityCounts.insufficient +
      result.feasibilityCounts.notApplicable;
    expect(total).toBe(graph.transitions.length);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. display は not_applicable 除外 (= M-2a 経由)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3. display map は not_applicable を除外", () => {
  it("MOVEMENT + coords なし (= 全 not_applicable) → display map 空", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });
    const result = runFeasibilityDisplayPipeline({ graph, overlayResult: overlay });
    expect(result.feasibilityDisplay.feasibilityDisplayByTransitionKey.size).toBe(0);
    expect(result.feasibilityDisplay.counts.slack).toBe(0);
    expect(result.feasibilityDisplay.counts.shortfall).toBe(0);
    // 但し M-1 counts は完全保持
    expect(result.feasibilityCounts.notApplicable).toBeGreaterThan(0);
  });

  it("MOVEMENT + 全 coords → display map size = 1、 variant slack", async () => {
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
    const result = runFeasibilityDisplayPipeline({ graph, overlayResult: overlay });
    expect(result.feasibilityDisplay.feasibilityDisplayByTransitionKey.size).toBe(1);
    const view = result.feasibilityDisplay.feasibilityDisplayByTransitionKey.get(
      "transition_0",
    )!;
    expect(view.variant).toBe("slack");
    expect(view.displayText).toMatch(/^余白 \d+ 分$/);
    expect(view.tier).toBe("tier_2_movement_aux");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. Integration with L-4c-pure (= caller pattern smoke)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4. Integration with L-4c-pure pipeline (= caller pattern)", () => {
  it("L-4c-pure → M-3a の合成: caller は 2 step で movement + feasibility display を取得", async () => {
    // L-4c-pure を呼ぶ (= anchors / coords / providers から MovementDisplayPipelineResult)
    const movementResult = await runMovementDisplayPipeline({
      anchors: MOVEMENT_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: new Map([
        ["move_morning", SHIBUYA],
        ["move_afternoon", SHINJUKU],
        ["move_evening", SHINJUKU],
      ]),
      providers: defaultProviders(),
    });
    expect(movementResult.display).toBeDefined();
    expect(movementResult.overlayCounts.resolvedCount).toBe(1);

    // M-3a を呼ぶには graph + overlayResult が必要だが、 L-4c-pure の output には
    // overlayResult 自体は含まれない (= display のみ)。 caller は別途 build + overlay を回す
    // 必要がある。 これは M-3a 軽量設計の trade-off (= L 統合 pipeline は M-4+)。
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
    const feasibilityResult = runFeasibilityDisplayPipeline({
      graph,
      overlayResult: overlay,
    });
    expect(feasibilityResult.feasibilityDisplay.feasibilityDisplayByTransitionKey.size).toBe(1);

    // 両者の transitionKey は一致 (= 同 ordinal)
    const movementKeys = Array.from(
      movementResult.display.displaysByTransitionKey.keys(),
    ).sort();
    const feasibilityKeys = Array.from(
      feasibilityResult.feasibilityDisplay.feasibilityDisplayByTransitionKey.keys(),
    ).sort();
    expect(movementKeys).toContain("transition_0");
    expect(feasibilityKeys).toContain("transition_0");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. tracingId passthrough
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. tracingId passthrough", () => {
  it("tracingId 指定 → result に含まれる", async () => {
    const { graph } = buildDayGraph({ anchors: LIGHT_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });
    const result = runFeasibilityDisplayPipeline({
      graph,
      overlayResult: overlay,
      tracingId: "trace-m3a-001-deadbeef",
    });
    expect(result.tracingId).toBe("trace-m3a-001-deadbeef");
  });

  it("tracingId なし → result.tracingId undefined", async () => {
    const { graph } = buildDayGraph({ anchors: LIGHT_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });
    const result = runFeasibilityDisplayPipeline({
      graph,
      overlayResult: overlay,
    });
    expect(result.tracingId).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. input mutation 0
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. input mutation 0", () => {
  it("graph を mutate しない", async () => {
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
    const graphSnapshot = JSON.stringify(graph);
    runFeasibilityDisplayPipeline({ graph, overlayResult: overlay });
    expect(JSON.stringify(graph)).toBe(graphSnapshot);
  });

  it("overlayResult を mutate しない", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });
    const sizeBefore = overlay.segmentsByTransitionKey.size;
    const resolvedBefore = overlay.resolvedCount;
    runFeasibilityDisplayPipeline({ graph, overlayResult: overlay });
    expect(overlay.segmentsByTransitionKey.size).toBe(sizeBefore);
    expect(overlay.resolvedCount).toBe(resolvedBefore);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. PII grep
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7. PII grep — result entries に raw 値が含まれない", () => {
  /**
   * 注: ReadonlyMap は JSON.stringify で空 object 化されるため、
   *      Array.from(map.entries()) で展開して serialize する必要あり。
   */
  function serializeFullResult(
    result: ReturnType<typeof runFeasibilityDisplayPipeline>,
  ): string {
    return JSON.stringify({
      feasibilityDisplay: {
        feasibilityDisplayByTransitionKey: Array.from(
          result.feasibilityDisplay.feasibilityDisplayByTransitionKey.entries(),
        ),
        counts: result.feasibilityDisplay.counts,
      },
      feasibilityCounts: result.feasibilityCounts,
      tracingId: result.tracingId,
    });
  }

  it("HEAVY fixture: result entries に anchor title / locationText / anchorId 不在", async () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map([
        ["heavy_c", SHINJUKU],
        ["heavy_d", TOKYO],
      ]),
      cascadeOptions: { providers: defaultProviders() },
    });
    const result = runFeasibilityDisplayPipeline({ graph, overlayResult: overlay });
    const serialized = serializeFullResult(result);
    expect(serialized).not.toContain("朝会議");
    expect(serialized).not.toContain("商談");
    expect(serialized).not.toContain("ランチ");
    expect(serialized).not.toContain("オフィス");
    expect(serialized).not.toContain("新宿");
    expect(serialized).not.toContain("heavy_a");
    expect(serialized).not.toContain("heavy_c");
  });

  it("SENSITIVE fixture: sensitive raw title / locationText 不在", async () => {
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
    const result = runFeasibilityDisplayPipeline({ graph, overlayResult: overlay });
    const serialized = serializeFullResult(result);
    expect(serialized).not.toContain("MRI");
    expect(serialized).not.toContain("弁護士");
    expect(serialized).not.toContain("病院");
    expect(serialized).not.toContain("法律事務所");
    expect(serialized).not.toContain("sens_med");
    expect(serialized).not.toContain("sens_legal");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. NG 文言 grep (= 警告系 / 記号 0)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§8. NG 文言 grep — 警告系文言 / 記号 不在", () => {
  it("MOVEMENT (= sufficient) result に NG 文言 0", async () => {
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
    const result = runFeasibilityDisplayPipeline({ graph, overlayResult: overlay });
    const serialized = JSON.stringify(
      Array.from(result.feasibilityDisplay.feasibilityDisplayByTransitionKey.entries()),
    );
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
      "間に合わない",
      "おすすめ",
      "推奨",
      "提案",
      "推測",
      "予測",
      "予想",
      "もう少し",
      "足りない",
      "余る",
      "ピッタリ",
      "ちょうど",
      "⚠",
      "❗",
      "❌",
      "‼",
      "warning",
      "alert",
      "Achtung",
    ];
    for (const ng of ngWords) {
      expect(serialized).not.toContain(ng);
    }
  });

  it("MOVEMENT (= insufficient via manual override) result に NG 文言 0", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map([
        ["move_morning", SHIBUYA],
        ["move_afternoon", SHINJUKU],
        ["move_evening", SHINJUKU],
      ]),
      overridesByTransitionIndex: new Map([[0, { userDurationMin: 200 }]]),
      cascadeOptions: { providers: defaultProviders() },
    });
    const result = runFeasibilityDisplayPipeline({ graph, overlayResult: overlay });

    // displayText に「不足 N 分」 が含まれる (= view 直接 check、 Map は JSON で空 object 化されるため)
    const view = result.feasibilityDisplay.feasibilityDisplayByTransitionKey.get("transition_0");
    expect(view).toBeDefined();
    expect(view!.displayText).toMatch(/^不足 \d+ 分$/);
    expect(view!.variant).toBe("shortfall");

    // Map entries を Array.from で展開して NG 文言 grep (= serialize 経路で raw 文字確認)
    const entriesSerialized = JSON.stringify(
      Array.from(result.feasibilityDisplay.feasibilityDisplayByTransitionKey.entries()),
    );
    expect(entriesSerialized).toContain("不足");
    expect(entriesSerialized).not.toContain("危険");
    expect(entriesSerialized).not.toContain("警告");
    expect(entriesSerialized).not.toContain("リスク");
    expect(entriesSerialized).not.toContain("遅刻");
    expect(entriesSerialized).not.toContain("⚠");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9. M-2b assertion 実走確認
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§9. M-2b assertion 実走 — 通常 path で throw なし", () => {
  it("INVALID fixture (= K phase warning 含む) でも M-3a は throw しない", async () => {
    // INVALID は K phase で warnings を出すが、 transition 自体は生成される可能性あり
    const { graph } = buildDayGraph({ anchors: INVALID_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });
    expect(() =>
      runFeasibilityDisplayPipeline({ graph, overlayResult: overlay }),
    ).not.toThrow();
  });

  it("EMPTY fixture (= transitions 0) → result も空、 throw なし", async () => {
    const { graph } = buildDayGraph({ anchors: EMPTY_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });
    const result = runFeasibilityDisplayPipeline({ graph, overlayResult: overlay });
    expect(result.feasibilityDisplay.feasibilityDisplayByTransitionKey.size).toBe(0);
    expect(result.feasibilityCounts.sufficient).toBe(0);
    expect(result.feasibilityCounts.insufficient).toBe(0);
    expect(result.feasibilityCounts.notApplicable).toBe(0);
  });
});
