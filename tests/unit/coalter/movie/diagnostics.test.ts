/**
 * D-2-e1 diagnostics 単体テスト (buildThreeStageDiagnostics pure function)。
 *
 * 検証軸 (D-2-e v2 設計レビュー §5):
 *   1. 6 fields 固定 (event 単位、集計値不在)
 *   2. poolDiagnostics.rawTotal → stage2CandidateRawCount propagate
 *   3. poolDiagnostics.softFilterPassed → stage2CandidateFilteredCount propagate
 *   4. prefetchCacheHit boolean propagate
 *   5. areaResult.stage3FallbackSourceUsed propagate
 *   6. areaResult.tier → stage3AreaTier propagate
 *   7. areaResult.state → stage3State propagate
 *   8. 入力 mutate なし (pure function)
 *   9. 決定論 (同 input → 同 output)
 *  10. tier2_fail 時: stage3FallbackSourceUsed === "none", stage3State === "tier2_fail"
 *  11. tier1_expanded_success 時: tier === 1, state === "tier1_expanded_success"
 *
 * D-2-e1 scope: 本 file は型 + pure helper のみの verify、wiring は **D-2-e2 で別 phase**。
 */

import { describe, it, expect } from "vitest";
import {
  buildThreeStageDiagnostics,
  type ThreeStageDiagnostics,
} from "@/lib/coalter/movie/diagnostics";
import type { AreaExpansionResult } from "@/lib/coalter/movie/areaExpansion";
import type { CandidatePoolDiagnostics } from "@/lib/coalter/movie/candidatePool";

// ═══════════════════════════════════════════════════════════════════════════
// fixture builders
// ═══════════════════════════════════════════════════════════════════════════

function buildPoolDiagnostics(
  overrides: Partial<CandidatePoolDiagnostics> = {},
): CandidatePoolDiagnostics {
  return {
    rawCounts: { ranking: 3, exa: 2, personality_history: 1 },
    rawTotal: 6,
    softFilterPassed: 4,
    softFilterRejected: 2,
    ...overrides,
  };
}

function buildAreaResultSuccess(): AreaExpansionResult {
  return {
    tier: 0,
    state: "success",
    theaters: [{ theaterName: "TOHO シネマズ渋谷", area: "渋谷" }],
    triedAreas: ["渋谷"],
    foundAtArea: "渋谷",
    stage3FallbackSourceUsed: "official",
  };
}

function buildAreaResultTier1(): AreaExpansionResult {
  return {
    tier: 1,
    state: "tier1_expanded_success",
    theaters: [{ theaterName: "TOHO シネマズ新宿", area: "新宿" }],
    triedAreas: ["渋谷", "新宿"],
    foundAtArea: "新宿",
    stage3FallbackSourceUsed: "eiga",
  };
}

function buildAreaResultTier2Fail(): AreaExpansionResult {
  return {
    tier: 2,
    state: "tier2_fail",
    theaters: [],
    triedAreas: ["渋谷", "新宿", "表参道"],
    foundAtArea: null,
    stage3FallbackSourceUsed: "none",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. 6 fields 固定 (event 単位)
// ═══════════════════════════════════════════════════════════════════════════

describe("buildThreeStageDiagnostics — 6 fields 固定", () => {
  it("返り値は 6 fields 固定 (集計値不在)", () => {
    const result: ThreeStageDiagnostics = buildThreeStageDiagnostics({
      poolDiagnostics: buildPoolDiagnostics(),
      prefetchCacheHit: false,
      areaResult: buildAreaResultSuccess(),
    });
    expect(Object.keys(result).sort()).toEqual([
      "stage2CandidateFilteredCount",
      "stage2CandidateRawCount",
      "stage3AreaTier",
      "stage3FallbackSourceUsed",
      "stage3PrefetchCacheHit",
      "stage3State",
    ]);
  });

  it("集計値 (success rate / fail rate) は含まれない", () => {
    const result = buildThreeStageDiagnostics({
      poolDiagnostics: buildPoolDiagnostics(),
      prefetchCacheHit: true,
      areaResult: buildAreaResultSuccess(),
    });
    // 集計値 keys が含まれない (Step E の SQL 層で算出する責務)
    const keys = Object.keys(result);
    expect(keys).not.toContain("successRate");
    expect(keys).not.toContain("tier2FailRate");
    expect(keys).not.toContain("cacheHitRate");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. propagate verify (各 field の sub-module → ThreeStageDiagnostics 対応)
// ═══════════════════════════════════════════════════════════════════════════

describe("buildThreeStageDiagnostics — sub-module diagnostics propagation", () => {
  it("poolDiagnostics.rawTotal → stage2CandidateRawCount", () => {
    const result = buildThreeStageDiagnostics({
      poolDiagnostics: buildPoolDiagnostics({ rawTotal: 12 }),
      prefetchCacheHit: false,
      areaResult: buildAreaResultSuccess(),
    });
    expect(result.stage2CandidateRawCount).toBe(12);
  });

  it("poolDiagnostics.softFilterPassed → stage2CandidateFilteredCount", () => {
    const result = buildThreeStageDiagnostics({
      poolDiagnostics: buildPoolDiagnostics({ softFilterPassed: 7 }),
      prefetchCacheHit: false,
      areaResult: buildAreaResultSuccess(),
    });
    expect(result.stage2CandidateFilteredCount).toBe(7);
  });

  it("prefetchCacheHit boolean propagate (true)", () => {
    const result = buildThreeStageDiagnostics({
      poolDiagnostics: buildPoolDiagnostics(),
      prefetchCacheHit: true,
      areaResult: buildAreaResultSuccess(),
    });
    expect(result.stage3PrefetchCacheHit).toBe(true);
  });

  it("prefetchCacheHit boolean propagate (false)", () => {
    const result = buildThreeStageDiagnostics({
      poolDiagnostics: buildPoolDiagnostics(),
      prefetchCacheHit: false,
      areaResult: buildAreaResultSuccess(),
    });
    expect(result.stage3PrefetchCacheHit).toBe(false);
  });

  it("areaResult.stage3FallbackSourceUsed → propagate (success)", () => {
    const result = buildThreeStageDiagnostics({
      poolDiagnostics: buildPoolDiagnostics(),
      prefetchCacheHit: false,
      areaResult: buildAreaResultSuccess(), // "official"
    });
    expect(result.stage3FallbackSourceUsed).toBe("official");
  });

  it("areaResult.tier → stage3AreaTier propagate (0 / 1 / 2)", () => {
    const cases = [
      { area: buildAreaResultSuccess(), tier: 0 },
      { area: buildAreaResultTier1(), tier: 1 },
      { area: buildAreaResultTier2Fail(), tier: 2 },
    ] as const;
    for (const { area, tier } of cases) {
      const result = buildThreeStageDiagnostics({
        poolDiagnostics: buildPoolDiagnostics(),
        prefetchCacheHit: false,
        areaResult: area,
      });
      expect(result.stage3AreaTier).toBe(tier);
    }
  });

  it("areaResult.state → stage3State propagate (3 states)", () => {
    const cases = [
      { area: buildAreaResultSuccess(), state: "success" },
      { area: buildAreaResultTier1(), state: "tier1_expanded_success" },
      { area: buildAreaResultTier2Fail(), state: "tier2_fail" },
    ] as const;
    for (const { area, state } of cases) {
      const result = buildThreeStageDiagnostics({
        poolDiagnostics: buildPoolDiagnostics(),
        prefetchCacheHit: false,
        areaResult: area,
      });
      expect(result.stage3State).toBe(state);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. tier 別の専用 expectation
// ═══════════════════════════════════════════════════════════════════════════

describe("buildThreeStageDiagnostics — tier 別 invariant", () => {
  it("tier2_fail: stage3FallbackSourceUsed === 'none' + state === 'tier2_fail'", () => {
    const result = buildThreeStageDiagnostics({
      poolDiagnostics: buildPoolDiagnostics(),
      prefetchCacheHit: false,
      areaResult: buildAreaResultTier2Fail(),
    });
    expect(result.stage3FallbackSourceUsed).toBe("none");
    expect(result.stage3State).toBe("tier2_fail");
    expect(result.stage3AreaTier).toBe(2);
  });

  it("tier1_expanded_success: tier === 1 + state === 'tier1_expanded_success'", () => {
    const result = buildThreeStageDiagnostics({
      poolDiagnostics: buildPoolDiagnostics(),
      prefetchCacheHit: false,
      areaResult: buildAreaResultTier1(),
    });
    expect(result.stage3AreaTier).toBe(1);
    expect(result.stage3State).toBe("tier1_expanded_success");
    expect(result.stage3FallbackSourceUsed).toBe("eiga");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. immutability + 決定論
// ═══════════════════════════════════════════════════════════════════════════

describe("buildThreeStageDiagnostics — pure function (immutability + 決定論)", () => {
  it("入力 mutate なし", () => {
    const poolDiagnostics = buildPoolDiagnostics();
    const areaResult = buildAreaResultSuccess();
    const poolSnapshot = JSON.parse(JSON.stringify(poolDiagnostics));
    const areaSnapshot = JSON.parse(JSON.stringify(areaResult));
    buildThreeStageDiagnostics({
      poolDiagnostics,
      prefetchCacheHit: false,
      areaResult,
    });
    expect(poolDiagnostics).toEqual(poolSnapshot);
    expect(areaResult).toEqual(areaSnapshot);
  });

  it("同 input → 同 output (決定論)", () => {
    const inputs = {
      poolDiagnostics: buildPoolDiagnostics(),
      prefetchCacheHit: true,
      areaResult: buildAreaResultTier1(),
    };
    const r1 = buildThreeStageDiagnostics(inputs);
    const r2 = buildThreeStageDiagnostics(inputs);
    expect(r1).toEqual(r2);
  });
});
