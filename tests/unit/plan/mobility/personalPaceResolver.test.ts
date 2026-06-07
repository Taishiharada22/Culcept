import { describe, it, expect } from "vitest";
import {
  movementEventStoreToPaceObservations,
  buildPersonalPaceRatiosFromStore,
  resolvePersonalPaceForLeg,
} from "@/lib/plan/mobility/personalPaceResolver";
import { MOVEMENT_EVENT_SCHEMA_VERSION, type MovementEvent, type MovementEventStore } from "@/lib/plan/mobility/movementEventStore";

function ev(over: Partial<MovementEvent> = {}): MovementEvent {
  return {
    actualDepartureAt: null,
    actualArrivalAt: null,
    completedAt: "2026-06-08T00:21:00.000Z",
    actualDurationMin: 40,
    confidence: "high",
    source: "manual",
    mode: "train",
    odKey: "home->office",
    estimateMin: 30,
    ...over,
  };
}

function store(byDay: Record<string, Record<string, MovementEvent>>): MovementEventStore {
  return { version: MOVEMENT_EVENT_SCHEMA_VERSION, byDay };
}

describe("movementEventStoreToPaceObservations", () => {
  it("mode tag 付き event → observation 化", () => {
    const obs = movementEventStoreToPaceObservations(store({ "2026-06-08": { legA: ev() } }));
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ legKey: "legA", odKey: "home->office", mode: "train", estimateMin: 30, actualDurationMin: 40 });
  });
  it("★mode tag 無し（旧 event）は除外（混線回避）", () => {
    const obs = movementEventStoreToPaceObservations(store({ "2026-06-08": { legA: ev({ mode: undefined }) } }));
    expect(obs).toHaveLength(0);
  });
});

describe("buildPersonalPaceRatiosFromStore — sparse/ready", () => {
  it("★1 件だけ（sparse）→ ready にならない（not_enough_signal）", () => {
    const ratios = buildPersonalPaceRatiosFromStore(store({ "2026-06-08": { legA: ev() } }));
    expect(ratios[0].status).toBe("not_enough_signal");
  });
  it("3 日分（同 odKey/mode）→ ready・tends_longer（actual40/est30=1.33）", () => {
    const ratios = buildPersonalPaceRatiosFromStore(
      store({
        "2026-06-06": { legA: ev() },
        "2026-06-07": { legB: ev() },
        "2026-06-08": { legC: ev() },
      }),
    );
    expect(ratios[0].status).toBe("ready");
    expect(ratios[0].tendency).toBe("tends_longer");
  });
});

describe("resolvePersonalPaceForLeg", () => {
  const readyStore = store({
    "2026-06-06": { legA: ev() },
    "2026-06-07": { legB: ev() },
    "2026-06-08": { legC: ev() },
  });
  const ratios = buildPersonalPaceRatiosFromStore(readyStore);

  it("ready を odKey×mode で引ける", () => {
    expect(resolvePersonalPaceForLeg(ratios, { odKey: "home->office", mode: "train" })?.status).toBe("ready");
  });
  it("mode 不一致 → null", () => {
    expect(resolvePersonalPaceForLeg(ratios, { odKey: "home->office", mode: "walk" })).toBeNull();
  });
  it("★not_enough_signal は null（ready のみ返す＝adapter は fallback）", () => {
    const sparse = buildPersonalPaceRatiosFromStore(store({ "2026-06-08": { legA: ev() } }));
    expect(resolvePersonalPaceForLeg(sparse, { odKey: "home->office", mode: "train" })).toBeNull();
  });
});
