/**
 * Phase 3-L L-4c-mapbridge — mapTabCoordsBridge tests
 *
 * 設計書: docs/alter-plan-phase3-l-4c-mapbridge-readiness-audit.md §3 / §4
 *
 * 検証範囲:
 *   §1. 正常 resolution map → coords map に変換
 *   §2. null entries は skip
 *   §3. NaN / Infinity / non-number 値は skip
 *   §4. confidence / resolvedName は output に含まれない (= PII 最小化)
 *   §5. 入力 mutation 0
 *   §6. 空 Map → 空 Map
 *   §7. anchorId が空文字列 / 不正な場合 skip
 *   §8. Pipeline integration (= bridge → runMovementDisplayPipeline)
 *   §9. PII grep (= resolvedName "東京駅" 等が output 経路に含まれない)
 *
 * 不変原則:
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用 / network 不使用
 *   - K phase / L-1〜L-4c-pure 既存 file 変更 0
 *   - _usePlanGeocode.ts 改変 0
 */

import { describe, expect, it } from "vitest";

import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import {
  buildCoordsByAnchorIdFromGeocodeResults,
  type BridgedCoords,
} from "@/lib/plan/transport/mapTabCoordsBridge";
import { runMovementDisplayPipeline } from "@/lib/plan/transport/movementDisplayPipeline";
import { createHeuristicDistanceProvider } from "@/lib/plan/transport/heuristicDistanceProvider";
import { createManualUserProvider } from "@/lib/plan/transport/manualUserProvider";
import { createUnresolvedProvider } from "@/lib/plan/transport/unresolvedProvider";
import type { AnchorResolution } from "@/app/(culcept)/plan/tabs/_usePlanGeocode";
import type { TransportResolutionProvider } from "@/lib/plan/transport/transportTypes";
import { MOVEMENT_DAY_ANCHORS } from "@/tests/fixtures/dayGraph";

const DATE = "2026-05-22";
const SHINJUKU = { lat: 35.6896, lng: 139.7006 };
const SHIBUYA = { lat: 35.6580, lng: 139.7016 };

function defaultProviders(): TransportResolutionProvider[] {
  return [
    createManualUserProvider(),
    createHeuristicDistanceProvider(),
    createUnresolvedProvider("no_provider_available"),
  ];
}

function makeResolution(
  overrides: Partial<AnchorResolution> = {},
): AnchorResolution {
  return {
    lat: 35.6812,
    lng: 139.7671,
    confidence: "medium",
    resolvedName: "東京駅",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. 正常変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. 正常 resolution map → coords map", () => {
  it("単一 resolution → coords 1 件", () => {
    const input = new Map<string, AnchorResolution | null>([
      ["anchor-1", makeResolution({ lat: 35.6812, lng: 139.7671 })],
    ]);
    const out = buildCoordsByAnchorIdFromGeocodeResults(input);
    expect(out.size).toBe(1);
    const coords = out.get("anchor-1");
    expect(coords).toEqual({ lat: 35.6812, lng: 139.7671 });
  });

  it("複数 resolution → 全件 coords", () => {
    const input = new Map<string, AnchorResolution | null>([
      ["a1", makeResolution({ lat: 35.6896, lng: 139.7006 })],
      ["a2", makeResolution({ lat: 35.6580, lng: 139.7016 })],
      ["a3", makeResolution({ lat: 35.6812, lng: 139.7671 })],
    ]);
    const out = buildCoordsByAnchorIdFromGeocodeResults(input);
    expect(out.size).toBe(3);
    expect(out.get("a1")).toEqual({ lat: 35.6896, lng: 139.7006 });
    expect(out.get("a2")).toEqual({ lat: 35.6580, lng: 139.7016 });
    expect(out.get("a3")).toEqual({ lat: 35.6812, lng: 139.7671 });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. null entries は skip
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2. null entries は skip (= unresolved 統一扱い)", () => {
  it("null だけの map → 空 map", () => {
    const input = new Map<string, AnchorResolution | null>([
      ["a1", null],
      ["a2", null],
    ]);
    const out = buildCoordsByAnchorIdFromGeocodeResults(input);
    expect(out.size).toBe(0);
  });

  it("null と正常 entry 混在 → 正常のみ残る", () => {
    const input = new Map<string, AnchorResolution | null>([
      ["a1", makeResolution()],
      ["a2", null],
      ["a3", makeResolution({ lat: 35.6896, lng: 139.7006 })],
      ["a4", null],
    ]);
    const out = buildCoordsByAnchorIdFromGeocodeResults(input);
    expect(out.size).toBe(2);
    expect(out.has("a1")).toBe(true);
    expect(out.has("a2")).toBe(false);
    expect(out.has("a3")).toBe(true);
    expect(out.has("a4")).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. NaN / Infinity / non-number は skip
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3. NaN / Infinity / non-number は skip (= 防御)", () => {
  it("lat=NaN → skip", () => {
    const input = new Map<string, AnchorResolution | null>([
      ["a1", makeResolution({ lat: Number.NaN })],
    ]);
    const out = buildCoordsByAnchorIdFromGeocodeResults(input);
    expect(out.size).toBe(0);
  });

  it("lng=NaN → skip", () => {
    const input = new Map<string, AnchorResolution | null>([
      ["a1", makeResolution({ lng: Number.NaN })],
    ]);
    const out = buildCoordsByAnchorIdFromGeocodeResults(input);
    expect(out.size).toBe(0);
  });

  it("lat=Infinity → skip", () => {
    const input = new Map<string, AnchorResolution | null>([
      ["a1", makeResolution({ lat: Number.POSITIVE_INFINITY })],
    ]);
    const out = buildCoordsByAnchorIdFromGeocodeResults(input);
    expect(out.size).toBe(0);
  });

  it("lng=-Infinity → skip", () => {
    const input = new Map<string, AnchorResolution | null>([
      ["a1", makeResolution({ lng: Number.NEGATIVE_INFINITY })],
    ]);
    const out = buildCoordsByAnchorIdFromGeocodeResults(input);
    expect(out.size).toBe(0);
  });

  it("lat=string (= 型違反 cast) → skip", () => {
    const broken = {
      lat: "35.6812" as unknown as number,
      lng: 139.7671,
      confidence: "medium",
      resolvedName: "test",
    };
    const input = new Map<string, AnchorResolution | null>([
      ["a1", broken],
    ]);
    const out = buildCoordsByAnchorIdFromGeocodeResults(input);
    expect(out.size).toBe(0);
  });

  it("正常 + NaN 混在 → NaN だけ skip、 正常は残る", () => {
    const input = new Map<string, AnchorResolution | null>([
      ["good", makeResolution()],
      ["nan", makeResolution({ lat: Number.NaN })],
      ["good2", makeResolution({ lat: 35.6896, lng: 139.7006 })],
    ]);
    const out = buildCoordsByAnchorIdFromGeocodeResults(input);
    expect(out.size).toBe(2);
    expect(out.has("good")).toBe(true);
    expect(out.has("nan")).toBe(false);
    expect(out.has("good2")).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. PII 最小化 — confidence / resolvedName は output に含まれない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4. PII 最小化 — confidence / resolvedName は output に出さない", () => {
  it("BridgedCoords の key set は lat / lng のみ", () => {
    const input = new Map<string, AnchorResolution | null>([
      [
        "a1",
        makeResolution({
          lat: 35.68,
          lng: 139.77,
          confidence: "high",
          resolvedName: "新宿駅東口",
        }),
      ],
    ]);
    const out = buildCoordsByAnchorIdFromGeocodeResults(input);
    const coords = out.get("a1")!;
    const keys = Object.keys(coords).sort();
    expect(keys).toEqual(["lat", "lng"].sort());
    expect((coords as unknown as { confidence?: unknown }).confidence).toBeUndefined();
    expect(
      (coords as unknown as { resolvedName?: unknown }).resolvedName,
    ).toBeUndefined();
  });

  it("output JSON に resolvedName 文字列が含まれない (= PII grep)", () => {
    const input = new Map<string, AnchorResolution | null>([
      ["a1", makeResolution({ resolvedName: "東京駅" })],
      ["a2", makeResolution({ resolvedName: "新宿駅" })],
      ["a3", makeResolution({ resolvedName: "渋谷駅" })],
    ]);
    const out = buildCoordsByAnchorIdFromGeocodeResults(input);
    const serialized = JSON.stringify(Array.from(out.entries()));
    expect(serialized).not.toContain("東京駅");
    expect(serialized).not.toContain("新宿駅");
    expect(serialized).not.toContain("渋谷駅");
    expect(serialized).not.toContain("resolvedName");
    expect(serialized).not.toContain("confidence");
    expect(serialized).not.toContain("medium");
    expect(serialized).not.toContain("high");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. 入力 mutation 0
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. 入力 mutation 0", () => {
  it("入力 Map は変更されない", () => {
    const input = new Map<string, AnchorResolution | null>([
      ["a1", makeResolution()],
      ["a2", null],
    ]);
    const snapshot = JSON.stringify(Array.from(input.entries()));
    buildCoordsByAnchorIdFromGeocodeResults(input);
    expect(JSON.stringify(Array.from(input.entries()))).toBe(snapshot);
  });

  it("入力 entry 自身 (= AnchorResolution object) も変更されない", () => {
    const resolution = makeResolution({
      lat: 35.6812,
      lng: 139.7671,
      confidence: "medium",
      resolvedName: "東京駅",
    });
    const input = new Map([["a1", resolution]]);
    const resolutionSnapshot = JSON.stringify(resolution);
    buildCoordsByAnchorIdFromGeocodeResults(input);
    expect(JSON.stringify(resolution)).toBe(resolutionSnapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. 空 Map
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. 空 Map → 空 Map", () => {
  it("空 input → 空 output", () => {
    const out = buildCoordsByAnchorIdFromGeocodeResults(new Map());
    expect(out.size).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. anchorId 防御
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7. anchorId 防御 — 空文字列 / 不正な key は skip", () => {
  it("空文字列 key → skip", () => {
    const input = new Map<string, AnchorResolution | null>([
      ["", makeResolution()],
      ["valid", makeResolution()],
    ]);
    const out = buildCoordsByAnchorIdFromGeocodeResults(input);
    expect(out.size).toBe(1);
    expect(out.has("")).toBe(false);
    expect(out.has("valid")).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. Pipeline integration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§8. bridge → L-4c-pure pipeline integration", () => {
  it("MapTab geocode → bridge → pipeline で resolved 'duration_only'", async () => {
    // MapTab hook が返すような resolution map を simulate
    const resolutions = new Map<string, AnchorResolution | null>([
      [
        "move_morning",
        { lat: SHIBUYA.lat, lng: SHIBUYA.lng, confidence: "medium", resolvedName: "渋谷駅" },
      ],
      [
        "move_afternoon",
        { lat: SHINJUKU.lat, lng: SHINJUKU.lng, confidence: "medium", resolvedName: "新宿駅" },
      ],
      [
        "move_evening",
        { lat: SHINJUKU.lat, lng: SHINJUKU.lng, confidence: "medium", resolvedName: "新宿駅" },
      ],
    ]);

    // Bridge: AnchorResolution map → coords map
    const coords = buildCoordsByAnchorIdFromGeocodeResults(resolutions);

    // Pipeline: coords → display
    const result = await runMovementDisplayPipeline({
      anchors: MOVEMENT_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: coords,
      providers: defaultProviders(),
    });

    expect(result.overlayCounts.resolvedCount).toBe(1);
    const view = result.display.displaysByTransitionKey.get("transition_0")!;
    expect(view.variant).toBe("duration_only");
    expect(view.displayText).toMatch(/^移動 約 \d+ 分$/);
  });

  it("MapTab で 一部 null + 一部 resolved → bridge 後 部分 resolve", async () => {
    const resolutions = new Map<string, AnchorResolution | null>([
      ["move_morning", makeResolution({ lat: SHIBUYA.lat, lng: SHIBUYA.lng })],
      ["move_afternoon", null], // unresolved (= sensitive / no locationText / etc)
      ["move_evening", makeResolution({ lat: SHINJUKU.lat, lng: SHINJUKU.lng })],
    ]);

    const coords = buildCoordsByAnchorIdFromGeocodeResults(resolutions);
    expect(coords.size).toBe(2); // move_afternoon が無い

    const result = await runMovementDisplayPipeline({
      anchors: MOVEMENT_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: coords,
      providers: defaultProviders(),
    });

    // transition_0 は move_morning → move_afternoon、 move_afternoon の coords が無いため unresolved
    const view = result.display.displaysByTransitionKey.get("transition_0")!;
    expect(view.variant).toBe("unresolved");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9. PII grep — bridge → pipeline output 全体に PII 0
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§9. PII grep — bridge → pipeline 全経路で raw 値 0", () => {
  it("resolvedName が pipeline output に含まれない (= bridge で破棄済)", async () => {
    const resolutions = new Map<string, AnchorResolution | null>([
      [
        "move_morning",
        { lat: SHIBUYA.lat, lng: SHIBUYA.lng, confidence: "medium", resolvedName: "渋谷駅東口前" },
      ],
      [
        "move_afternoon",
        { lat: SHINJUKU.lat, lng: SHINJUKU.lng, confidence: "medium", resolvedName: "新宿駅南口" },
      ],
      [
        "move_evening",
        { lat: SHINJUKU.lat, lng: SHINJUKU.lng, confidence: "medium", resolvedName: "新宿駅南口" },
      ],
    ]);

    const coords = buildCoordsByAnchorIdFromGeocodeResults(resolutions);
    const result = await runMovementDisplayPipeline({
      anchors: MOVEMENT_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: coords,
      providers: defaultProviders(),
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("渋谷駅東口前");
    expect(serialized).not.toContain("新宿駅南口");
    expect(serialized).not.toContain("resolvedName");
    expect(serialized).not.toContain("confidence");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §10. Output type 型整合 (= L-3c overlay 入力に直接使える)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§10. BridgedCoords は L-3c overlay 入力型と互換", () => {
  it("BridgedCoords を ReadonlyMap として L-3c overlay 入力に渡せる (= compile-time + runtime)", () => {
    const resolutions = new Map<string, AnchorResolution | null>([
      ["a1", makeResolution()],
    ]);
    const out: ReadonlyMap<string, BridgedCoords> =
      buildCoordsByAnchorIdFromGeocodeResults(resolutions);

    // L-3c overlay の入力型 (= ReadonlyMap<string, {lat, lng}>) に互換
    const overlayInput: ReadonlyMap<string, { readonly lat: number; readonly lng: number }> = out;
    expect(overlayInput.size).toBe(1);
  });
});
