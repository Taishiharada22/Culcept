import { describe, it, expect } from "vitest";
import {
  calculateObservationDensity,
  selectDepthResponse,
  type StargazerDensityInput,
} from "@/lib/origin/observationDensity";
import type { DailyOrbitStore, DailyOrbitEntry } from "@/lib/origin/dailyOrbit/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(date: string, opts?: Partial<DailyOrbitEntry>): DailyOrbitEntry {
  return {
    date,
    tasks: [{ id: "t1", text: "task", nature: "obligation", completed: false, carryCount: 0, addedAt: date }],
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
    selfResolution: { score: 0, updatedAt: "", history: [] },
    threads: [],
    turningPoints: [],
    surpriseObservations: [],
    discoveryUnlocked: {},
    firstUsedAt: null,
    lastUsedAt: null,
    currentStreak: 0,
  };
}

function dateKey(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("calculateObservationDensity", () => {
  it("returns surface for no data", () => {
    const result = calculateObservationDensity(null, null);
    expect(result.score).toBe(0);
    expect(result.depthLevel).toBe("surface");
  });

  it("returns surface for empty store", () => {
    const store = makeStore({});
    const result = calculateObservationDensity(store, null);
    expect(result.score).toBe(0);
    expect(result.depthLevel).toBe("surface");
  });

  it("counts recent entries in last 7 days", () => {
    const entries: Record<string, DailyOrbitEntry> = {};
    for (let i = 0; i < 5; i++) {
      const key = dateKey(i);
      entries[key] = makeEntry(key);
    }
    const store = makeStore(entries);
    const result = calculateObservationDensity(store, null);
    // recentEntries=5 → recentScore=1.0 → 25pt
    // totalDays=5 → 5/30 → ~2.5pt
    // layerVariety=1(tasks only) → 1/6 → ~2.5pt
    expect(result.breakdown.recentEntries).toBe(5);
    expect(result.score).toBeGreaterThanOrEqual(15);
    expect(result.depthLevel).toBe("emerging");
  });

  it("boosts score with Stargazer data", () => {
    const store = makeStore({});
    const sgInput: StargazerDensityInput = {
      observedAxisCount: 15,
      contradictionAxisCount: 3,
      totalObservationCount: 100,
    };
    const result = calculateObservationDensity(store, sgInput);
    // stargazer=15 → 1.0 → 30pt, contradiction=3 → 1.0 → 15pt = 45pt
    expect(result.breakdown.stargazerAxes).toBe(15);
    expect(result.breakdown.contradictionAxes).toBe(3);
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.depthLevel).toBe("contextual");
  });

  it("reaches deep with full data", () => {
    const entries: Record<string, DailyOrbitEntry> = {};
    for (let i = 0; i < 30; i++) {
      const key = dateKey(i);
      entries[key] = makeEntry(key, {
        bodyEcho: { head: "light", recordedAt: key },
        dayState: { value: "calm", recordedAt: key } as any,
        shadowIntention: { text: "focus", recordedAt: key } as any,
        temporalDialogue: { question: "q", response: "r", recordedAt: key } as any,
        timeTexture: { fast: 0.5, recordedAt: key } as any,
        reflection: { question: "q", answer: "a", recordedAt: key } as any,
      });
    }
    const store = makeStore(entries);
    const sgInput: StargazerDensityInput = {
      observedAxisCount: 20,
      contradictionAxisCount: 5,
      totalObservationCount: 200,
    };
    const result = calculateObservationDensity(store, sgInput);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.depthLevel).toBe("deep");
  });

  it("counts layer variety correctly", () => {
    const key = dateKey(0);
    const entries: Record<string, DailyOrbitEntry> = {
      [key]: makeEntry(key, {
        bodyEcho: { head: "light", recordedAt: key },
        reflection: { question: "q", answer: "a", recordedAt: key } as any,
      }),
    };
    const store = makeStore(entries);
    const result = calculateObservationDensity(store, null);
    // tasks + bodyEcho + reflection = 3
    expect(result.breakdown.layerVariety).toBe(3);
  });

  it("caps scores at max", () => {
    const sgInput: StargazerDensityInput = {
      observedAxisCount: 39,
      contradictionAxisCount: 10,
      totalObservationCount: 500,
    };
    const result = calculateObservationDensity(null, sgInput);
    // stargazer capped at 15→1.0, contradiction capped at 3→1.0
    expect(result.breakdown.stargazerAxes).toBe(39);
    expect(result.score).toBe(45); // 30 + 15
  });
});

describe("selectDepthResponse", () => {
  it("returns surface response for low density", () => {
    const density = calculateObservationDensity(null, null);
    const resp = selectDepthResponse(density, {
      judgmentCategory: "work_decision",
      categoryLabel: "仕事の判断",
    });
    expect(resp.acknowledgment).toContain("仕事の判断");
    expect(resp.insight).toBeNull();
    expect(resp.nextPrompt).toBeTruthy();
  });

  it("returns contextual response with Stargazer axes", () => {
    const density = {
      score: 50,
      depthLevel: "contextual" as const,
      breakdown: { recentEntries: 5, layerVariety: 3, stargazerAxes: 15, contradictionAxes: 2, totalDays: 20 },
    };
    const resp = selectDepthResponse(density, {
      judgmentCategory: "work_decision",
      categoryLabel: "仕事の判断",
      stargazerTopAxes: [{ key: "analytical_vs_intuitive" as any, label: "分析的vs直感的", score: 0.7 }],
    });
    expect(resp.acknowledgment).toContain("仕事の判断");
    expect(resp.insight).toContain("分析的vs直感的");
  });

  it("returns deep response with patterns", () => {
    const density = {
      score: 75,
      depthLevel: "deep" as const,
      breakdown: { recentEntries: 7, layerVariety: 6, stargazerAxes: 20, contradictionAxes: 3, totalDays: 30 },
    };
    const resp = selectDepthResponse(density, {
      judgmentCategory: "relationship",
      categoryLabel: "人間関係",
      recentPatterns: [{ pattern: "月曜日に人間関係の判断が集中", frequency: "60%" }],
    });
    expect(resp.insight).toContain("月曜日");
    expect(resp.nextPrompt).toContain("心当たり");
  });
});
