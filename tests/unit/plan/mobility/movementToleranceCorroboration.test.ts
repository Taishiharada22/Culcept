import { describe, it, expect } from "vitest";
import {
  buildMovementToleranceCorroboration,
  movementToleranceCorroborationLine,
  LOAD_AVOIDANCE_REASON,
  DEFAULT_CORROBORATION_CONFIG,
} from "@/lib/plan/mobility/movementToleranceCorroboration";
import {
  HYPOTHESIS_FEEDBACK_SCHEMA_VERSION,
  type HypothesisFeedbackStore,
  type HypothesisFeedbackEntry,
  type MobilityReason,
} from "@/lib/plan/mobility/hypothesisFeedbackStore";

function entry(reason?: MobilityReason): HypothesisFeedbackEntry {
  return { kind: "explicitCorrection", surfacedMode: "walk", chosenMode: "train", ...(reason ? { reason } : {}) };
}
/** day×leg にばらして reason 列から store を組む（global 集約のテスト用）。 */
function storeOf(reasons: Array<MobilityReason | undefined>): HypothesisFeedbackStore {
  const byDay: Record<string, Record<string, HypothesisFeedbackEntry>> = {};
  reasons.forEach((r, i) => {
    const day = `2026-06-${String((i % 27) + 1).padStart(2, "0")}`;
    byDay[day] = { ...(byDay[day] ?? {}), [`leg-${i}`]: entry(r) };
  });
  return { version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION, byDay };
}

describe("buildMovementToleranceCorroboration — global・条件非依存・convergent evidence", () => {
  it("★LOAD_AVOIDANCE_REASON は tired（hurry=time-load は別軸ゆえ除外）", () => {
    expect(LOAD_AVOIDANCE_REASON).toBe("tired");
  });

  it("★reason 付き観測 < minReasonObservations(5) → not_enough", () => {
    const r = buildMovementToleranceCorroboration(storeOf(["tired", "tired", "tired"]));
    expect(r.status).toBe("not_enough");
    expect(r.corroboratesLoadAvoidance).toBe(false);
  });

  it("★reason なし entry は集計しない（自己申告のみ）", () => {
    const r = buildMovementToleranceCorroboration(storeOf([undefined, undefined, "tired", "tired", "tired"]));
    expect(r.totalReasonObservations).toBe(3); // undefined 2 件は除外
    expect(r.loadAvoidanceCount).toBe(3);
  });

  it("★tired が十分数・share 十分 → corroboratesLoadAvoidance=true", () => {
    // 5 reasons, tired 3（share 0.6 ≥ 0.3・count 3 ≥ 3）
    const r = buildMovementToleranceCorroboration(storeOf(["tired", "tired", "tired", "scenery", "cheap"]));
    expect(r.status).toBe("ready");
    expect(r.loadAvoidanceCount).toBe(3);
    expect(r.corroboratesLoadAvoidance).toBe(true);
  });

  it("★tired が share 不足（count<3 or share<0.3）→ corroborate しない", () => {
    // 6 reasons, tired 2（count 2 < 3）
    const r = buildMovementToleranceCorroboration(storeOf(["tired", "tired", "scenery", "cheap", "mood", "hurry"]));
    expect(r.status).toBe("ready");
    expect(r.corroboratesLoadAvoidance).toBe(false);
  });

  it("★hurry は load-avoidance に数えない（time-load・別軸）", () => {
    const r = buildMovementToleranceCorroboration(storeOf(["hurry", "hurry", "hurry", "hurry", "hurry"]));
    expect(r.loadAvoidanceCount).toBe(0);
    expect(r.corroboratesLoadAvoidance).toBe(false);
  });

  it("★excludeLegKeys で対象外（二重安全）", () => {
    const store = storeOf(["tired", "tired", "tired", "tired", "tired"]);
    const exclude = new Set(Object.values(store.byDay).flatMap((legs) => Object.keys(legs)).slice(0, 5));
    const r = buildMovementToleranceCorroboration(store, { excludeLegKeys: exclude });
    expect(r.totalReasonObservations).toBe(0);
    expect(r.status).toBe("not_enough");
  });

  it("config 既定（minReasonObs5/minLoadCount3/minShare0.3）", () => {
    expect(DEFAULT_CORROBORATION_CONFIG).toEqual({ minReasonObservations: 5, minLoadAvoidanceCount: 3, minLoadAvoidanceShare: 0.3 });
  });
});

describe("movementToleranceCorroborationLine — 観測トーン・global・trait/数字/条件語なし", () => {
  it("★corroborate 時のみ 1 行・条件（雨等）に言及しない", () => {
    const line = movementToleranceCorroborationLine({
      status: "ready",
      totalReasonObservations: 5,
      loadAvoidanceCount: 3,
      corroboratesLoadAvoidance: true,
    });
    expect(line).toContain("疲れを理由に挙げることがある");
    expect(line).not.toMatch(/雨|雪|夜|夕方|平日|週末|[0-9]/); // ★条件語・数字なし
    expect(line).not.toMatch(/苦手|嫌い|タイプ|性格/); // ★trait でない
  });
  it("★not_enough / 非corroborate → null（沈黙）", () => {
    expect(movementToleranceCorroborationLine({ status: "not_enough", totalReasonObservations: 1, loadAvoidanceCount: 1, corroboratesLoadAvoidance: false })).toBeNull();
    expect(movementToleranceCorroborationLine({ status: "ready", totalReasonObservations: 5, loadAvoidanceCount: 1, corroboratesLoadAvoidance: false })).toBeNull();
  });
});
