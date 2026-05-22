/**
 * Phase 3-L L-4c-pure — movementDisplayPipeline tests
 *
 * 設計書: docs/alter-plan-phase3-l-4c-bridge-readiness-audit.md §3
 *
 * 検証範囲:
 *   §1. happy path — 各 fixture で pipeline 完走 + L-4b 通過
 *   §2. coords 空 Map → 全 unresolved
 *   §3. coords 揃い → resolved (= heuristic)
 *   §4. manual override → manual_user で resolved
 *   §5. SENSITIVE fixture → 全 sensitive_proximity unresolved
 *   §6. buildWarnings passthrough (= INVALID anchors で warning 生成)
 *   §7. tracingId passthrough
 *   §8. overlayCounts 集計恒等式
 *   §9. input immutability (= anchors / coordsByAnchorId / providers)
 *   §10. L-4b assertion が実走 (= 通常 path で throw しない、 確認)
 *
 * 不変原則:
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用 / network 不使用
 *   - K phase / L-1/L-2/L-3/L-4a/L-4b 既存 file 変更 0
 */

import { describe, expect, it } from "vitest";

import { createHeuristicDistanceProvider } from "@/lib/plan/transport/heuristicDistanceProvider";
import { createManualUserProvider } from "@/lib/plan/transport/manualUserProvider";
import { createUnresolvedProvider } from "@/lib/plan/transport/unresolvedProvider";
import {
  runMovementDisplayPipeline,
  type MovementDisplayPipelineInput,
} from "@/lib/plan/transport/movementDisplayPipeline";
import type { TransportResolutionProvider } from "@/lib/plan/transport/transportTypes";
import type { ManualOverride } from "@/lib/plan/transport/cascadeOrchestrator";
import {
  EMPTY_DAY_ANCHORS,
  HEAVY_DAY_ANCHORS,
  INVALID_DAY_ANCHORS,
  LIGHT_DAY_ANCHORS,
  MOVEMENT_DAY_ANCHORS,
  SENSITIVE_DAY_ANCHORS,
  SINGLE_DAY_ANCHORS,
} from "@/tests/fixtures/dayGraph";

const DATE = "2026-05-22";
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
// §1. happy path — 各 fixture
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. happy path — 各 fixture で pipeline 完走", () => {
  const fixtures = [
    { name: "EMPTY", anchors: EMPTY_DAY_ANCHORS },
    { name: "SINGLE", anchors: SINGLE_DAY_ANCHORS },
    { name: "LIGHT", anchors: LIGHT_DAY_ANCHORS },
    { name: "HEAVY", anchors: HEAVY_DAY_ANCHORS },
    { name: "MOVEMENT", anchors: MOVEMENT_DAY_ANCHORS },
    { name: "SENSITIVE", anchors: SENSITIVE_DAY_ANCHORS },
  ];

  for (const { name, anchors } of fixtures) {
    it(`${name} fixture: pipeline 完走 + L-4b assertion 通過`, async () => {
      const result = await runMovementDisplayPipeline({
        anchors,
        date: DATE,
        coordsByAnchorId: new Map(),
        providers: defaultProviders(),
      });
      // L-4b assertion は内部で実行済、 throw なし
      expect(result.display).toBeDefined();
      expect(result.overlayCounts.resolvedCount).toBeGreaterThanOrEqual(0);
      expect(result.overlayCounts.unresolvedCount).toBeGreaterThanOrEqual(0);
      expect(result.overlayCounts.internalErrorCount).toBe(0);
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. coords 空 Map → 全 unresolved
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2. coords 空 Map → 全 transition unresolved", () => {
  it("MOVEMENT + 空 Map → variantCounts.unresolved === transitions.length", async () => {
    const result = await runMovementDisplayPipeline({
      anchors: MOVEMENT_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: new Map(),
      providers: defaultProviders(),
    });
    expect(result.overlayCounts.resolvedCount).toBe(0);
    expect(result.display.variantCounts.unresolved).toBe(result.overlayCounts.unresolvedCount);
    expect(result.display.variantCounts.duration_only).toBe(0);
    expect(result.display.variantCounts.sensitive).toBe(0);
  });

  it("displayText が全て '→ 移動' (= K view fallback と同形)", async () => {
    const result = await runMovementDisplayPipeline({
      anchors: MOVEMENT_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: new Map(),
      providers: defaultProviders(),
    });
    for (const view of result.display.displaysByTransitionKey.values()) {
      expect(view.displayText).toBe("→ 移動");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. coords 揃い → resolved (= heuristic)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3. coords 揃い → heuristic で resolved", () => {
  it("MOVEMENT + 全 coords → '移動 約 N 分' 1 件", async () => {
    const result = await runMovementDisplayPipeline({
      anchors: MOVEMENT_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: new Map([
        ["move_morning", SHIBUYA],
        ["move_afternoon", SHINJUKU],
        ["move_evening", SHINJUKU],
      ]),
      providers: defaultProviders(),
    });
    expect(result.overlayCounts.resolvedCount).toBe(1);
    expect(result.display.variantCounts.duration_only).toBe(1);
    const view = result.display.displaysByTransitionKey.get("transition_0")!;
    expect(view.displayText).toMatch(/^移動 約 \d+ 分$/);
    expect(view.confidenceBand).toBe("soft"); // heuristic = low
  });

  it("LIGHT + 全 coords → resolved", async () => {
    const result = await runMovementDisplayPipeline({
      anchors: LIGHT_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: new Map([
        ["light_a", SHINJUKU],
        ["light_b", SHIBUYA],
      ]),
      providers: defaultProviders(),
    });
    expect(result.overlayCounts.resolvedCount).toBeGreaterThan(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. manual override
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4. manual override → manual_user で resolved + strong band", () => {
  it("override 17 分 → '移動 約 17 分' + strong band", async () => {
    const overrides = new Map<number, ManualOverride>([
      [0, { userDurationMin: 17, userMode: "walking" }],
    ]);
    const result = await runMovementDisplayPipeline({
      anchors: MOVEMENT_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: new Map([
        ["move_morning", SHIBUYA],
        ["move_afternoon", SHINJUKU],
        ["move_evening", SHINJUKU],
      ]),
      providers: defaultProviders(),
      overridesByTransitionIndex: overrides,
    });
    const view = result.display.displaysByTransitionKey.get("transition_0")!;
    expect(view.variant).toBe("duration_only");
    expect(view.displayText).toBe("移動 約 17 分");
    expect(view.confidenceBand).toBe("strong");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. SENSITIVE fixture → 全 unresolved
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. SENSITIVE fixture → 全 transition unresolved", () => {
  it("coords 揃いでも sensitive_proximity → '→ 移動'", async () => {
    const result = await runMovementDisplayPipeline({
      anchors: SENSITIVE_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: new Map([
        ["sens_med", TOKYO],
        ["sens_legal", SHINJUKU],
        ["normal", SHIBUYA],
      ]),
      providers: defaultProviders(),
    });
    expect(result.overlayCounts.resolvedCount).toBe(0);
    for (const view of result.display.displaysByTransitionKey.values()) {
      expect(view.displayText).toBe("→ 移動");
      expect(view.variant).toBe("unresolved");
    }
  });

  it("raw sensitive title (= 「MRI 予約」 等) が pipeline output に含まれない", async () => {
    const result = await runMovementDisplayPipeline({
      anchors: SENSITIVE_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: new Map([
        ["sens_med", TOKYO],
        ["sens_legal", SHINJUKU],
        ["normal", SHIBUYA],
      ]),
      providers: defaultProviders(),
    });
    const serialized = JSON.stringify(
      Array.from(result.display.displaysByTransitionKey.entries()),
    );
    expect(serialized).not.toContain("MRI 予約");
    expect(serialized).not.toContain("弁護士相談");
    expect(serialized).not.toContain("○○病院");
    expect(serialized).not.toContain("××法律事務所");
    // anchor id 漏洩 0
    expect(serialized).not.toContain("sens_med");
    expect(serialized).not.toContain("sens_legal");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. buildWarnings passthrough
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. buildWarnings passthrough — K phase warning が caller に届く", () => {
  it("INVALID_DAY_ANCHORS → buildWarnings に warning 1 件以上", async () => {
    const result = await runMovementDisplayPipeline({
      anchors: INVALID_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: new Map(),
      providers: defaultProviders(),
    });
    expect(result.buildWarnings.length).toBeGreaterThan(0);
    for (const w of result.buildWarnings) {
      expect(typeof w.kind).toBe("string");
      expect(typeof w.detail).toBe("string");
    }
  });

  it("VALID fixture → buildWarnings 空", async () => {
    const result = await runMovementDisplayPipeline({
      anchors: MOVEMENT_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: new Map(),
      providers: defaultProviders(),
    });
    expect(result.buildWarnings).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. tracingId passthrough
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7. tracingId passthrough", () => {
  it("input.tracingId 存在 → result.tracingId 同値", async () => {
    const result = await runMovementDisplayPipeline({
      anchors: LIGHT_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: new Map(),
      providers: defaultProviders(),
      tracingId: "trace-l4c-001",
    });
    expect(result.tracingId).toBe("trace-l4c-001");
  });

  it("input.tracingId 無し → result.tracingId undefined", async () => {
    const result = await runMovementDisplayPipeline({
      anchors: LIGHT_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: new Map(),
      providers: defaultProviders(),
    });
    expect(result.tracingId).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. overlayCounts 集計恒等式
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§8. overlayCounts + display.variantCounts 整合", () => {
  it("variantCounts 和 = displaysByTransitionKey.size = overlayCounts.resolved + unresolved", async () => {
    const result = await runMovementDisplayPipeline({
      anchors: HEAVY_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: new Map(),
      providers: defaultProviders(),
    });
    const variantSum =
      result.display.variantCounts.unresolved +
      result.display.variantCounts.sensitive +
      result.display.variantCounts.duration_only;
    expect(variantSum).toBe(result.display.displaysByTransitionKey.size);
    expect(
      result.overlayCounts.resolvedCount + result.overlayCounts.unresolvedCount,
    ).toBe(result.display.displaysByTransitionKey.size);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9. input immutability
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§9. input immutability", () => {
  it("anchors / coordsByAnchorId / providers / overrides を mutate しない", async () => {
    const anchors = MOVEMENT_DAY_ANCHORS;
    const coords = new Map([
      ["move_morning", SHIBUYA],
      ["move_afternoon", SHINJUKU],
      ["move_evening", SHINJUKU],
    ]);
    const providers = defaultProviders();
    const overrides = new Map<number, ManualOverride>([[0, { userDurationMin: 30 }]]);

    const anchorsSnapshot = JSON.stringify(anchors);
    const coordsSnapshot = JSON.stringify(Array.from(coords.entries()));
    const providersLen = providers.length;
    const overridesSnapshot = JSON.stringify(Array.from(overrides.entries()));

    const input: MovementDisplayPipelineInput = {
      anchors,
      date: DATE,
      coordsByAnchorId: coords,
      providers,
      overridesByTransitionIndex: overrides,
    };

    await runMovementDisplayPipeline(input);

    expect(JSON.stringify(anchors)).toBe(anchorsSnapshot);
    expect(JSON.stringify(Array.from(coords.entries()))).toBe(coordsSnapshot);
    expect(providers.length).toBe(providersLen);
    expect(JSON.stringify(Array.from(overrides.entries()))).toBe(overridesSnapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §10. L-4b assertion が実走
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§10. L-4b assertion 実走確認", () => {
  it("通常 path で assertion throw なし (= 4 fixture 全件)", async () => {
    const fixtures = [
      MOVEMENT_DAY_ANCHORS,
      SENSITIVE_DAY_ANCHORS,
      LIGHT_DAY_ANCHORS,
      HEAVY_DAY_ANCHORS,
    ];
    for (const anchors of fixtures) {
      await expect(
        runMovementDisplayPipeline({
          anchors,
          date: DATE,
          coordsByAnchorId: new Map(),
          providers: defaultProviders(),
        }),
      ).resolves.toBeDefined();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §11. PII grep — pipeline 出力に raw 値 0
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§11. PII grep — pipeline 出力に anchor title / locationText / anchorId が含まれない", () => {
  it("HEAVY fixture: pipeline output JSON に raw anchor title 0", async () => {
    const result = await runMovementDisplayPipeline({
      anchors: HEAVY_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: new Map([
        ["heavy_c", SHINJUKU],
        ["heavy_d", TOKYO],
      ]),
      providers: defaultProviders(),
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("朝会議");
    expect(serialized).not.toContain("商談");
    expect(serialized).not.toContain("ランチ");
    expect(serialized).not.toContain("面接");
    expect(serialized).not.toContain("夜会議");
    // anchor id 漏洩 0
    expect(serialized).not.toContain("heavy_a");
    expect(serialized).not.toContain("heavy_b");
    expect(serialized).not.toContain("heavy_c");
    expect(serialized).not.toContain("heavy_d");
    expect(serialized).not.toContain("heavy_e");
    // location 漏洩 0
    expect(serialized).not.toContain("オフィス");
    expect(serialized).not.toContain("新宿");
  });

  it("display 部分のみの JSON でも PII 0", async () => {
    const result = await runMovementDisplayPipeline({
      anchors: MOVEMENT_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: new Map([
        ["move_morning", SHIBUYA],
        ["move_afternoon", SHINJUKU],
        ["move_evening", SHINJUKU],
      ]),
      providers: defaultProviders(),
    });
    const displayJson = JSON.stringify(
      Array.from(result.display.displaysByTransitionKey.entries()),
    );
    expect(displayJson).not.toContain("move_morning");
    expect(displayJson).not.toContain("move_afternoon");
    expect(displayJson).not.toContain("ランチ");
    expect(displayJson).not.toContain("カフェ");
    expect(displayJson).not.toContain("ジム");
    expect(displayJson).not.toContain("渋谷");
    expect(displayJson).not.toContain("新宿");
  });
});
