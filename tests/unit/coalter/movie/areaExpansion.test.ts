/**
 * D-2-b areaExpansion 単体テスト。
 *
 * 検証軸 (mainstream plan §3.3 元 D-3-b / D-2 設計レビュー §3.3):
 *   1. Tier 0 success → state="success", tier=0, foundAtArea=tier0Area
 *   2. Tier 0 empty + Tier 1 (最初の隣接駅) success → state="tier1_expanded_success", tier=1
 *   3. Tier 0 empty + Tier 1 中間 area success → first non-empty 採用 verify
 *   4. Tier 0 + Tier 1 全 empty → state="tier2_fail", tier=2, theaters=[], foundAtArea=null
 *   5. tier0Area が adjacencyTable 外 + Tier 0 empty → Tier 1 skip → tier2_fail
 *   6. triedAreas に試行順序が記録される (early-stop 反映)
 *   7. foundAtArea の正確性 (success / tier1_expanded_success 時は found area、fail 時は null)
 *   8. resolver throw → fail-open で次 area へ (theaterResolver の内部 fail-open に依存)
 *   9. sourceHint propagation (全 resolveTheater 呼び出しに渡る)
 *  10. immutability (input mutate しない)
 *  11. shape verify (AreaExpansionResult 5 fields)
 *
 * D-2-b scope (CEO 採用 R1 + 補正):
 *   - 実 fetch / 実 API 接続なし
 *   - test は mock resolverDeps で挙動 verify
 */

import { describe, it, expect, vi } from "vitest";
import {
  expandAreaConcentrically,
  type AreaExpansionDeps,
  type AreaExpansionInput,
  type AreaExpansionResult,
} from "@/lib/coalter/movie/areaExpansion";
import { ADJACENCY_TABLE } from "@/lib/coalter/movie/adjacencyTable";
import type {
  TheaterFetcher,
  TheaterListing,
  TheaterResolverDeps,
} from "@/lib/coalter/movie/theaterResolver";

// ═══════════════════════════════════════════════════════════════════════════
// fixture builders
// ═══════════════════════════════════════════════════════════════════════════

function buildListing(theaterName: string, area: string): TheaterListing {
  return { theaterName, area };
}

/**
 * Area 別の listing map を引数に取り、その map を見て area-aware に応答する
 * theaterFetcher を生成。すべて official fetcher として使う (test では他 source
 * を空配列にして、official の area-aware 挙動だけで Tier 拡張を verify)。
 */
function buildAreaAwareFetcher(
  areaToListings: Record<string, readonly TheaterListing[]>,
): TheaterFetcher {
  return vi.fn(async (input) => areaToListings[input.area] ?? []);
}

function buildEmptyFetcher(): TheaterFetcher {
  return vi.fn().mockResolvedValue([]);
}

function buildResolverDeps(
  areaToListings: Record<string, readonly TheaterListing[]> = {},
): TheaterResolverDeps {
  return {
    officialFetcher: buildAreaAwareFetcher(areaToListings),
    eigaFetcher: buildEmptyFetcher(),
    yahooFetcher: buildEmptyFetcher(),
    exaFetcher: buildEmptyFetcher(),
  };
}

function buildDeps(
  areaToListings: Record<string, readonly TheaterListing[]> = {},
): AreaExpansionDeps {
  return { resolverDeps: buildResolverDeps(areaToListings) };
}

function buildInput(
  overrides: Partial<AreaExpansionInput> = {},
): AreaExpansionInput {
  return {
    title: "テスト作品",
    tier0Area: "渋谷",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Tier 0 success
// ═══════════════════════════════════════════════════════════════════════════

describe("expandAreaConcentrically — Tier 0 success", () => {
  it("tier0Area で theater found → state='success', tier=0", async () => {
    const deps = buildDeps({
      渋谷: [buildListing("TOHO シネマズ渋谷", "渋谷")],
    });
    const result = await expandAreaConcentrically(buildInput(), deps);
    expect(result.state).toBe("success");
    expect(result.tier).toBe(0);
    expect(result.foundAtArea).toBe("渋谷");
    expect(result.theaters).toHaveLength(1);
    expect(result.theaters[0].theaterName).toBe("TOHO シネマズ渋谷");
    expect(result.triedAreas).toEqual(["渋谷"]);
  });

  it("Tier 0 success → 隣接駅は試行されない (early-stop)", async () => {
    const deps = buildDeps({
      渋谷: [buildListing("劇場", "渋谷")],
      新宿: [buildListing("劇場", "新宿")], // 試行されないはず
    });
    const result = await expandAreaConcentrically(buildInput(), deps);
    expect(result.triedAreas).toEqual(["渋谷"]);
    // officialFetcher は渋谷でのみ呼ばれる (1 回)
    expect(deps.resolverDeps.officialFetcher).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Tier 0 empty + Tier 1 (最初の隣接駅) success
// ═══════════════════════════════════════════════════════════════════════════

describe("expandAreaConcentrically — Tier 1 expansion (最初の隣接駅で success)", () => {
  it("Tier 0 empty + Tier 1 最初の隣接駅 success → state='tier1_expanded_success', tier=1", async () => {
    // 渋谷の隣接駅は [新宿, 表参道, 恵比寿, 原宿, 下北沢] (adjacencyTable 順)
    const firstAdjacent = ADJACENCY_TABLE.渋谷[0]; // "新宿"
    const deps = buildDeps({
      // 渋谷: empty (Tier 0 fail)
      [firstAdjacent]: [buildListing("劇場", firstAdjacent)],
    });
    const result = await expandAreaConcentrically(buildInput(), deps);
    expect(result.state).toBe("tier1_expanded_success");
    expect(result.tier).toBe(1);
    expect(result.foundAtArea).toBe(firstAdjacent);
    expect(result.theaters).toHaveLength(1);
    expect(result.triedAreas).toEqual(["渋谷", firstAdjacent]);
  });

  it("最初の隣接駅で found → 後続隣接駅は試行されない (cost 削減)", async () => {
    const firstAdjacent = ADJACENCY_TABLE.渋谷[0];
    const secondAdjacent = ADJACENCY_TABLE.渋谷[1];
    const deps = buildDeps({
      [firstAdjacent]: [buildListing("劇場", firstAdjacent)],
      [secondAdjacent]: [buildListing("劇場", secondAdjacent)], // 試行されないはず
    });
    const result = await expandAreaConcentrically(buildInput(), deps);
    expect(result.triedAreas).toEqual(["渋谷", firstAdjacent]);
    expect(result.triedAreas).not.toContain(secondAdjacent);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Tier 1 中間 area success (first non-empty 採用)
// ═══════════════════════════════════════════════════════════════════════════

describe("expandAreaConcentrically — Tier 1 中間 area success", () => {
  it("Tier 1 で 2 番目の隣接駅で found → 試行順序保持、3 番目以降は不呼出", async () => {
    const adjacents = ADJACENCY_TABLE.渋谷;
    const secondAdjacent = adjacents[1];
    const deps = buildDeps({
      [secondAdjacent]: [buildListing("劇場", secondAdjacent)],
    });
    const result = await expandAreaConcentrically(buildInput(), deps);
    expect(result.state).toBe("tier1_expanded_success");
    expect(result.foundAtArea).toBe(secondAdjacent);
    // triedAreas は [渋谷, 1st adjacent, 2nd adjacent]
    expect(result.triedAreas).toEqual([
      "渋谷",
      adjacents[0],
      adjacents[1],
    ]);
    // 3 番目以降は不呼出
    if (adjacents.length >= 3) {
      expect(result.triedAreas).not.toContain(adjacents[2]);
    }
  });

  it("Tier 1 で最後の隣接駅で found → 全隣接駅試行", async () => {
    const adjacents = ADJACENCY_TABLE.渋谷;
    const lastAdjacent = adjacents[adjacents.length - 1];
    const deps = buildDeps({
      [lastAdjacent]: [buildListing("劇場", lastAdjacent)],
    });
    const result = await expandAreaConcentrically(buildInput(), deps);
    expect(result.state).toBe("tier1_expanded_success");
    expect(result.foundAtArea).toBe(lastAdjacent);
    expect(result.triedAreas).toEqual(["渋谷", ...adjacents]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Tier 0 + Tier 1 全 empty → tier2_fail
// ═══════════════════════════════════════════════════════════════════════════

describe("expandAreaConcentrically — tier2_fail (Tier 0 + Tier 1 全 fail)", () => {
  it("Tier 0 + Tier 1 全 empty → state='tier2_fail', tier=2, theaters=[], foundAtArea=null", async () => {
    const deps = buildDeps({}); // 全 area empty
    const result = await expandAreaConcentrically(buildInput(), deps);
    expect(result.state).toBe("tier2_fail");
    expect(result.tier).toBe(2);
    expect(result.theaters).toEqual([]);
    expect(result.foundAtArea).toBeNull();
  });

  it("triedAreas に Tier 0 area + 全隣接駅が含まれる (tier2 fail 時)", async () => {
    const deps = buildDeps({}); // 全 empty
    const result = await expandAreaConcentrically(buildInput(), deps);
    const expectedTried = ["渋谷", ...ADJACENCY_TABLE.渋谷];
    expect(result.triedAreas).toEqual(expectedTried);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. tier0Area が adjacencyTable 外
// ═══════════════════════════════════════════════════════════════════════════

describe("expandAreaConcentrically — tier0Area が adjacencyTable 外", () => {
  it("孤立 area (adjacency なし) + Tier 0 empty → 即 tier2_fail", async () => {
    const deps = buildDeps({}); // 全 empty
    const result = await expandAreaConcentrically(
      buildInput({ tier0Area: "存在しない駅" }),
      deps,
    );
    expect(result.state).toBe("tier2_fail");
    expect(result.tier).toBe(2);
    expect(result.triedAreas).toEqual(["存在しない駅"]);
    expect(result.foundAtArea).toBeNull();
  });

  it("孤立 area + Tier 0 success (mock で found) → success (tier=0)", async () => {
    const deps = buildDeps({
      存在しない駅: [buildListing("劇場", "存在しない駅")],
    });
    const result = await expandAreaConcentrically(
      buildInput({ tier0Area: "存在しない駅" }),
      deps,
    );
    expect(result.state).toBe("success");
    expect(result.tier).toBe(0);
    expect(result.foundAtArea).toBe("存在しない駅");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. resolver throw → fail-open (theaterResolver の内部 catch に依存)
// ═══════════════════════════════════════════════════════════════════════════

describe("expandAreaConcentrically — resolver throw (fail-open)", () => {
  it("officialFetcher が throw → theaterResolver が内部 catch、Tier 0 empty 扱いで Tier 1 へ", async () => {
    const adjacents = ADJACENCY_TABLE.渋谷;
    const firstAdjacent = adjacents[0];
    const officialFetcher: TheaterFetcher = vi.fn(async (input) => {
      // Tier 0 (渋谷) では throw、Tier 1 (新宿) では non-empty
      if (input.area === "渋谷") throw new Error("network down");
      if (input.area === firstAdjacent) {
        return [buildListing("劇場", firstAdjacent)];
      }
      return [];
    });
    const deps: AreaExpansionDeps = {
      resolverDeps: {
        officialFetcher,
        eigaFetcher: buildEmptyFetcher(),
        yahooFetcher: buildEmptyFetcher(),
        exaFetcher: buildEmptyFetcher(),
      },
    };
    const result = await expandAreaConcentrically(buildInput(), deps);
    // throw が caller に伝播せず、Tier 1 で found
    expect(result.state).toBe("tier1_expanded_success");
    expect(result.foundAtArea).toBe(firstAdjacent);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. sourceHint propagation
// ═══════════════════════════════════════════════════════════════════════════

describe("expandAreaConcentrically — sourceHint propagation", () => {
  it("sourceHint が全 resolveTheater 呼び出しに propagate", async () => {
    const officialFetcher = vi.fn().mockResolvedValue([]);
    const deps: AreaExpansionDeps = {
      resolverDeps: {
        officialFetcher,
        eigaFetcher: buildEmptyFetcher(),
        yahooFetcher: buildEmptyFetcher(),
        exaFetcher: buildEmptyFetcher(),
      },
    };
    const sourceHint = {
      officialUrl: "https://example.com/movie/x",
      distributor: "Sample Studio",
    };
    await expandAreaConcentrically(buildInput({ sourceHint }), deps);
    // 全呼び出しに sourceHint が含まれる
    for (const call of officialFetcher.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ sourceHint }));
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. immutability
// ═══════════════════════════════════════════════════════════════════════════

describe("expandAreaConcentrically — immutability", () => {
  it("入力 input を mutate しない", async () => {
    const input = buildInput({
      sourceHint: { officialUrl: "x", distributor: "y" },
    });
    const snapshot = JSON.parse(JSON.stringify(input));
    const deps = buildDeps({});
    await expandAreaConcentrically(input, deps);
    expect(input).toEqual(snapshot);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. shape verify
// ═══════════════════════════════════════════════════════════════════════════

describe("expandAreaConcentrically — shape", () => {
  it("返り値は 6 fields (tier / state / theaters / triedAreas / foundAtArea / stage3FallbackSourceUsed)", async () => {
    const result: AreaExpansionResult = await expandAreaConcentrically(
      buildInput(),
      buildDeps(),
    );
    expect(Object.keys(result).sort()).toEqual([
      "foundAtArea",
      "stage3FallbackSourceUsed",
      "state",
      "theaters",
      "tier",
      "triedAreas",
    ]);
  });

  it("foundAtArea は success/tier1_expanded_success 時は string、tier2_fail 時は null", async () => {
    const successDeps = buildDeps({ 渋谷: [buildListing("x", "渋谷")] });
    const successResult = await expandAreaConcentrically(buildInput(), successDeps);
    expect(typeof successResult.foundAtArea).toBe("string");

    const failDeps = buildDeps({});
    const failResult = await expandAreaConcentrically(buildInput(), failDeps);
    expect(failResult.foundAtArea).toBeNull();
  });

  it("tier 値は 0 / 1 / 2 のみ", async () => {
    const cases: AreaExpansionDeps[] = [
      buildDeps({ 渋谷: [buildListing("x", "渋谷")] }), // tier 0
      buildDeps({
        [ADJACENCY_TABLE.渋谷[0]]: [
          buildListing("x", ADJACENCY_TABLE.渋谷[0]),
        ],
      }), // tier 1
      buildDeps({}), // tier 2
    ];
    for (const deps of cases) {
      const result = await expandAreaConcentrically(buildInput(), deps);
      expect([0, 1, 2]).toContain(result.tier);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. stage3FallbackSourceUsed propagation (D-2-e1 additive)
// ═══════════════════════════════════════════════════════════════════════════

describe("expandAreaConcentrically — stage3FallbackSourceUsed propagation", () => {
  it("Tier 0 success: theaterResolver の使用 source ('official') が propagate", async () => {
    // officialFetcher が non-empty → SOURCE_ORDER 通り "official" が採用される
    const deps = buildDeps({ 渋谷: [buildListing("劇場", "渋谷")] });
    const result = await expandAreaConcentrically(buildInput(), deps);
    expect(result.state).toBe("success");
    expect(result.stage3FallbackSourceUsed).toBe("official");
  });

  it("Tier 0 success: eiga fetcher 由来時は 'eiga' が propagate (fallback chain 経由)", async () => {
    // official empty + eiga non-empty → "eiga" 採用
    const deps: AreaExpansionDeps = {
      resolverDeps: {
        officialFetcher: buildEmptyFetcher(),
        eigaFetcher: vi.fn().mockResolvedValue([buildListing("劇場", "渋谷")]),
        yahooFetcher: buildEmptyFetcher(),
        exaFetcher: buildEmptyFetcher(),
      },
    };
    const result = await expandAreaConcentrically(buildInput(), deps);
    expect(result.state).toBe("success");
    expect(result.stage3FallbackSourceUsed).toBe("eiga");
  });

  it("Tier 1 success: 採用 area の resolveTheater の source が propagate", async () => {
    const firstAdjacent = ADJACENCY_TABLE.渋谷[0];
    const deps = buildDeps({
      [firstAdjacent]: [buildListing("劇場", firstAdjacent)],
    });
    const result = await expandAreaConcentrically(buildInput(), deps);
    expect(result.state).toBe("tier1_expanded_success");
    // Tier 1 で found した area の officialFetcher が採用 → "official"
    expect(result.stage3FallbackSourceUsed).toBe("official");
  });

  it("tier2_fail 時は 'none' で固定", async () => {
    const deps = buildDeps({}); // 全 empty
    const result = await expandAreaConcentrically(buildInput(), deps);
    expect(result.state).toBe("tier2_fail");
    expect(result.stage3FallbackSourceUsed).toBe("none");
  });
});
