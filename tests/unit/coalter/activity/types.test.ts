/**
 * Activity AD1 — Pure types compile-level test
 */

import { describe, expect, it } from "vitest";

import type {
  ActivityCandidate,
  ActivityCostBand,
  ActivityDurationBand,
  ActivityFatigueLevel,
  ActivityHandoffTarget,
  ActivityIndoorOutdoor,
  ActivityNoveltyLevel,
  ActivityPairCompatibility,
  ActivityRationale,
  ActivityTaxonomy,
  ActivityUncertaintyLabel,
  ActivityWeatherDependency,
} from "@/lib/coalter/activity/types";

describe("activity types — type import", () => {
  it("全 type が import 可能", () => {
    expect(true).toBe(true);
  });
});

describe("activity types — ActivityIndoorOutdoor", () => {
  it("3 値 (indoor / outdoor / hybrid)", () => {
    const values: ActivityIndoorOutdoor[] = ["indoor", "outdoor", "hybrid"];
    expect(values).toHaveLength(3);
  });
});

describe("activity types — ActivityDurationBand", () => {
  it("3 値 (short / medium / half_day)", () => {
    const values: ActivityDurationBand[] = ["short", "medium", "half_day"];
    expect(values).toHaveLength(3);
  });
});

describe("activity types — ActivityCostBand", () => {
  it("4 値 (free / low / medium / high)", () => {
    const values: ActivityCostBand[] = ["free", "low", "medium", "high"];
    expect(values).toHaveLength(4);
  });
});

describe("activity types — ActivityWeatherDependency", () => {
  it("2 値 (weather_dependent / weather_independent)", () => {
    const values: ActivityWeatherDependency[] = ["weather_dependent", "weather_independent"];
    expect(values).toHaveLength(2);
  });
});

describe("activity types — ActivityPairCompatibility", () => {
  it("3 値 (solo_friendly / pair_compatible / explicitly_pair)", () => {
    const values: ActivityPairCompatibility[] = [
      "solo_friendly",
      "pair_compatible",
      "explicitly_pair",
    ];
    expect(values).toHaveLength(3);
  });
});

describe("activity types — ActivityNoveltyLevel", () => {
  it("3 値 (routine / familiar / novelty)", () => {
    const values: ActivityNoveltyLevel[] = ["routine", "familiar", "novelty"];
    expect(values).toHaveLength(3);
  });
});

describe("activity types — ActivityFatigueLevel", () => {
  it("1-5 numeric literal union", () => {
    const fatigue1: ActivityFatigueLevel = 1;
    const fatigue3: ActivityFatigueLevel = 3;
    const fatigue5: ActivityFatigueLevel = 5;
    expect(fatigue1).toBe(1);
    expect(fatigue3).toBe(3);
    expect(fatigue5).toBe(5);
  });
});

describe("activity types — ActivityUncertaintyLabel", () => {
  it("4 段階 (Travel と同 value space、別 type)", () => {
    const labels: ActivityUncertaintyLabel[] = [
      "high_confidence",
      "mid_confidence",
      "low_confidence",
      "info_lacking",
    ];
    expect(labels).toHaveLength(4);
  });
});

describe("activity types — ActivityTaxonomy (7 軸)", () => {
  it("7 軸 taxonomy object を満たす", () => {
    const taxonomy: ActivityTaxonomy = {
      indoorOutdoor: "outdoor",
      durationBand: "medium",
      costBand: "free",
      weatherDependency: "weather_dependent",
      pairCompatibility: "pair_compatible",
      noveltyLevel: "familiar",
      fatigueLevel: 2,
    };
    expect(taxonomy.indoorOutdoor).toBe("outdoor");
    expect(taxonomy.fatigueLevel).toBe(2);
  });

  it("indoor / weather_independent combination", () => {
    const taxonomy: ActivityTaxonomy = {
      indoorOutdoor: "indoor",
      durationBand: "short",
      costBand: "low",
      weatherDependency: "weather_independent",
      pairCompatibility: "pair_compatible",
      noveltyLevel: "novelty",
      fatigueLevel: 1,
    };
    expect(taxonomy.indoorOutdoor).toBe("indoor");
    expect(taxonomy.weatherDependency).toBe("weather_independent");
  });
});

describe("activity types — ActivityRationale", () => {
  it("rationale object を満たす", () => {
    const rationale: ActivityRationale = {
      perUserA: "outdoor walking preference, low fatigue today",
      perUserB: "park visit affinity, casual mood",
      synthesis: "neighborhood park walk (outdoor + casual intersection)",
    };
    expect(rationale.perUserA).toContain("outdoor");
    expect(rationale.synthesis).toContain("park");
  });
});

describe("activity types — ActivityCandidate", () => {
  it("candidate object を満たす", () => {
    const candidate: ActivityCandidate = {
      candidateId: "act-1",
      name: "neighborhood park walk",
      taxonomy: {
        indoorOutdoor: "outdoor",
        durationBand: "short",
        costBand: "free",
        weatherDependency: "weather_dependent",
        pairCompatibility: "pair_compatible",
        noveltyLevel: "familiar",
        fatigueLevel: 2,
      },
      rationale: {
        perUserA: "test A",
        perUserB: "test B",
        synthesis: "test synthesis",
      },
      uncertaintyLabel: "mid_confidence",
    };
    expect(candidate.candidateId).toBe("act-1");
    expect(candidate.taxonomy.durationBand).toBe("short");
  });
});

describe("activity types — ActivityHandoffTarget", () => {
  it("food / movie / travel の 3 値 (PR #126 §4.4 handoff)", () => {
    const targets: ActivityHandoffTarget[] = ["food", "movie", "travel"];
    expect(targets).toHaveLength(3);
  });
});

describe("activity types — no runtime value exports", () => {
  it("本 file は pure types only、runtime function / constants を export しない", async () => {
    const mod = await import("@/lib/coalter/activity/types");
    const exportedKeys = Object.keys(mod);
    expect(exportedKeys).toHaveLength(0);
  });
});
