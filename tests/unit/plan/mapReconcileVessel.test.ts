/**
 * A1 — MapTab reconcile vessel test
 * 目的: 将来 GoogleRoutesProvider を transport 正本層に差した時、その resolved 出力が
 *   runMovementDisplayPipeline を通って MovementDisplayView「移動 約N分」になり
 *   movementDisplayContract を PASS することを fake provider(実API不使用)で先に証明する。
 * 注: cascade/pipeline/manual override/contract の網羅は既存
 *   cascadeOrchestrator.test.ts / movementDisplayPipeline.test.ts が担う。本 file は重複を避け
 *   「future google_routes provider の end-to-end 通過」だけを最小に補う。
 * 不変: API/key/billing/DB/localStorage/network 不使用。production code 変更 0。
 */
import { describe, expect, it } from "vitest";

import { runMovementDisplayPipeline } from "@/lib/plan/transport/movementDisplayPipeline";
import { assertMovementDisplayResultCompliance } from "@/lib/plan/transport/movementDisplayContract";
import type {
  MovementResolutionResult,
  TransportResolutionProvider,
} from "@/lib/plan/transport/transportTypes";
import { MOVEMENT_DAY_ANCHORS } from "@/tests/fixtures/dayGraph";

const DATE = "2026-06-04";
const SHIBUYA = { lat: 35.658, lng: 139.7016 };
const SHINJUKU = { lat: 35.6896, lng: 139.7006 };
const COORDS = new Map([
  ["move_morning", SHIBUYA],
  ["move_afternoon", SHINJUKU],
  ["move_evening", SHINJUKU],
]);

/** 将来の GoogleRoutesProvider を模した fake(実 API は叩かない)。常に resolved。 */
function makeFakeGoogleRoutesProvider(durationMin: number): TransportResolutionProvider {
  return {
    id: "google_routes",
    health: "healthy",
    async resolveDuration(): Promise<MovementResolutionResult> {
      return {
        ok: true,
        segment: {
          fromNodeId: "node-from",
          toNodeId: "node-to",
          sensitiveProximity: false,
          timingStatus: "resolved",
          estimatedDurationMin: durationMin,
          modeCandidate: { mode: "driving", confidence: { level: "high", reason: "routes_api_response" } },
          source: "google_routes",
          confidence: { level: "high", reason: "routes_api_response" },
          privacyClass: "normal",
        },
      };
    },
  };
}

describe("A1: future GoogleRoutesProvider が pipeline→MovementDisplayView を通る(fake・実API不使用)", () => {
  it("fake google_routes(resolved) → '移動 約 N 分' + contract PASS", async () => {
    const result = await runMovementDisplayPipeline({
      anchors: MOVEMENT_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: COORDS,
      providers: [makeFakeGoogleRoutesProvider(23)],
    });
    expect(result.display.variantCounts.duration_only).toBeGreaterThanOrEqual(1);
    for (const view of result.display.displaysByTransitionKey.values()) {
      if (view.variant === "duration_only") {
        expect(view.displayText).toBe("移動 約 23 分");
      }
    }
    expect(() => assertMovementDisplayResultCompliance(result.display)).not.toThrow();
  });

  it("display 出力に mode/distance/raw/PII が漏れない(保守契約)", async () => {
    const result = await runMovementDisplayPipeline({
      anchors: MOVEMENT_DAY_ANCHORS,
      date: DATE,
      coordsByAnchorId: COORDS,
      providers: [makeFakeGoogleRoutesProvider(23)],
    });
    const json = JSON.stringify(Array.from(result.display.displaysByTransitionKey.entries()));
    expect(json).not.toContain("driving");
    expect(json).not.toContain("車");
    expect(json).not.toContain("km");
    expect(json).not.toContain("google_routes");
  });
});
