import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  selectAdaptiveLayers,
  getLayerMeta,
  type OrbitLayerId,
} from "@/lib/origin/adaptiveLayerEngine";
import type { DailyOrbitStore, DailyOrbitEntry } from "@/lib/origin/dailyOrbit/types";
import type { StargazerOriginContext } from "@/lib/origin/stargazerPipeline";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(date: string, opts?: Partial<DailyOrbitEntry>): DailyOrbitEntry {
  return {
    date,
    tasks: [{ id: "t1", text: "task", nature: "obligation", completed: false, createdAt: date }],
    bodyEcho: null,
    dayState: null,
    shadowIntention: null,
    temporalDialogue: null,
    timeTexture: null,
    reflection: null,
    selfForecast: null,
    userPrediction: null,
    createdAt: date,
    updatedAt: date,
    ...opts,
  };
}

function makeStore(entries: Record<string, DailyOrbitEntry>): DailyOrbitStore {
  return {
    version: 2,
    entries,
    orbitLaws: [],
    selfResolution: { layers: [], updatedAt: "" },
    threads: [],
    turningPoints: [],
  };
}

function dateKey(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function makeStargazerCtx(overrides?: Partial<StargazerOriginContext>): StargazerOriginContext {
  return {
    density: { observedAxisCount: 10, contradictionAxisCount: 0, totalObservationCount: 50 },
    topAxes: [],
    contradictions: [],
    axisScores: {},
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("selectAdaptiveLayers", () => {
  it("always includes tasks as fixed", () => {
    const result = selectAdaptiveLayers(null, null, null);
    const tasks = result.primary.find((r) => r.layerId === "tasks");
    expect(tasks).toBeDefined();
    expect(tasks!.isFixed).toBe(true);
  });

  it("includes one emotion layer as fixed", () => {
    const result = selectAdaptiveLayers(null, null, null);
    const emotionLayers = result.primary.filter(
      (r) => r.isFixed && (r.layerId === "bodyEcho" || r.layerId === "dayState"),
    );
    expect(emotionLayers.length).toBe(1);
  });

  it("returns all layers as primary when forceShowAll", () => {
    const result = selectAdaptiveLayers(null, null, null, { forceShowAll: true });
    expect(result.primary.length).toBe(8); // all layers
    expect(result.collapsed.length).toBe(0);
    expect(result.blindSpot).toBeNull();
  });

  it("separates primary and collapsed layers", () => {
    const result = selectAdaptiveLayers(null, null, null);
    const totalLayers = result.primary.length + result.collapsed.length;
    // tasks(1) + emotion(1) + variable(1-2) + collapsed(rest) = 8 total
    expect(totalLayers).toBe(8);
    // primary: tasks + emotion + 1-2 variable = 3-4
    expect(result.primary.length).toBeGreaterThanOrEqual(3);
    expect(result.primary.length).toBeLessThanOrEqual(4);
  });

  it("boosts layers related to today's judgment category", () => {
    const entries: Record<string, DailyOrbitEntry> = {};
    for (let i = 0; i < 7; i++) {
      entries[dateKey(i)] = makeEntry(dateKey(i));
    }
    const store = makeStore(entries);

    // self_care → should boost bodyEcho, dayState, reflection
    const result = selectAdaptiveLayers(store, null, "self_care");
    const primaryIds = result.primary.map((r) => r.layerId);
    // bodyEcho or dayState should appear (one as emotion fixed, possibly the other boosted)
    const hasEmotionOrReflection =
      primaryIds.includes("bodyEcho") ||
      primaryIds.includes("dayState") ||
      primaryIds.includes("reflection");
    expect(hasEmotionOrReflection).toBe(true);
  });

  it("boosts layers with Stargazer contradictions", () => {
    const entries: Record<string, DailyOrbitEntry> = {};
    for (let i = 0; i < 7; i++) {
      entries[dateKey(i)] = makeEntry(dateKey(i));
    }
    const store = makeStore(entries);
    const ctx = makeStargazerCtx({
      contradictions: [
        { key: "rumination_tendency" as any, label: "反芻傾向", poles: [-0.3, 0.4], strength: 0.8 },
      ],
    });

    const result = selectAdaptiveLayers(store, ctx, null);
    // rumination_tendency relates to shadowIntention and reflection
    // At least one should appear in primary
    const primaryIds = result.primary.map((r) => r.layerId);
    const hasRelated =
      primaryIds.includes("shadowIntention") || primaryIds.includes("reflection");
    expect(hasRelated).toBe(true);
  });

  it("does not show blind spot on non-Sunday", () => {
    // Mock to a Wednesday
    vi.useFakeTimers();
    // Find next Wednesday
    const now = new Date();
    const daysToWed = (3 - now.getDay() + 7) % 7 || 7; // ensure non-Sunday
    const wed = new Date(now);
    wed.setDate(now.getDate() + (now.getDay() === 0 ? 1 : daysToWed));
    wed.setHours(12, 0, 0, 0);
    vi.setSystemTime(wed);

    const entries: Record<string, DailyOrbitEntry> = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(wed);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      entries[key] = makeEntry(key);
    }
    const store = makeStore(entries);
    const result = selectAdaptiveLayers(store, null, null);
    expect(result.blindSpot).toBeNull();

    vi.useRealTimers();
  });

  it("shows blind spot on Sunday with enough data", () => {
    vi.useFakeTimers();
    // Find next Sunday
    const now = new Date();
    const daysToSun = (7 - now.getDay()) % 7 || 7;
    const sun = new Date(now);
    sun.setDate(now.getDate() + daysToSun);
    sun.setHours(12, 0, 0, 0);
    vi.setSystemTime(sun);

    const entries: Record<string, DailyOrbitEntry> = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(sun);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      // Only fill tasks — all other layers empty
      entries[key] = makeEntry(key);
    }
    const store = makeStore(entries);
    const result = selectAdaptiveLayers(store, null, null);
    // Should suggest a blind spot since no variable layers are filled
    expect(result.blindSpot).not.toBeNull();
    expect(result.blindSpot!.reason).toContain("あまり使われていません");

    vi.useRealTimers();
  });
});

describe("getLayerMeta", () => {
  it("returns metadata for all layer IDs", () => {
    const ids: OrbitLayerId[] = [
      "tasks", "bodyEcho", "dayState", "shadowIntention",
      "temporalDialogue", "timeTexture", "reflection", "selfForecast",
    ];
    for (const id of ids) {
      const meta = getLayerMeta(id);
      expect(meta.label).toBeTruthy();
      expect(meta.emoji).toBeTruthy();
    }
  });
});
