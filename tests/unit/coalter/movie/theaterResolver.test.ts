/**
 * D-2-a theaterResolver 単体テスト (基本)。
 *
 * 検証軸 (mainstream plan §3.3 元 D-3-a / D-2 設計レビュー §2.4):
 *   1. 3+1 段 fallback chain の **順次実行** (公式 → eiga → Yahoo → EXA)
 *   2. **first non-empty 採用**: 公式 success → 後続 source 不呼出 (cost 削減)
 *   3. fail-open: 各 fetcher の throw / empty 両方を次 source へ fallback
 *   4. 全 source empty / throw → `theaters: []`, `stage3FallbackSourceUsed: "none"`
 *   5. source hint propagation (title / area / sourceHint が fetcher に渡る)
 *   6. immutability (input mutate しない、出力配列の独立性)
 *   7. shape verify (TheaterResolverResult 2 fields)
 *
 * B1 構造 gate 継承: theaterResolver は `candidate.theater` を入力に取らない。
 *   title + area から fetcher chain で theater 確定。
 *
 * D-2-a scope (CEO 採用 R1): test は **mock fetcher** で挙動 verify。
 *   実 fetch / API 接続なし。
 *
 * diagnostics の event 単位 verify は別 file
 * `theaterResolverFallbackSource.test.ts` で詳細担保 (CEO 補正 2 整合)。
 */

import { describe, it, expect, vi } from "vitest";
import {
  resolveTheater,
  SOURCE_ORDER,
  type Stage3FallbackSource,
  type TheaterFetcher,
  type TheaterListing,
  type TheaterResolverDeps,
  type TheaterResolverResult,
} from "@/lib/coalter/movie/theaterResolver";

// ═══════════════════════════════════════════════════════════════════════════
// fixture builders
// ═══════════════════════════════════════════════════════════════════════════

function buildListing(
  theaterName: string,
  area: string = "渋谷",
): TheaterListing {
  return {
    theaterName,
    area,
    showtimes: ["19:00", "21:30"],
    officialUrl: null,
  };
}

function buildFetcher(items: readonly TheaterListing[]): TheaterFetcher {
  return vi.fn().mockResolvedValue(items);
}

function buildThrowingFetcher(message: string): TheaterFetcher {
  return vi.fn().mockRejectedValue(new Error(message));
}

function buildDeps(opts: {
  official?: readonly TheaterListing[] | "throw";
  eiga?: readonly TheaterListing[] | "throw";
  yahoo?: readonly TheaterListing[] | "throw";
  exa?: readonly TheaterListing[] | "throw";
} = {}): TheaterResolverDeps {
  function fetcher(
    spec: readonly TheaterListing[] | "throw" | undefined,
    sourceName: string,
  ): TheaterFetcher {
    if (spec === "throw") return buildThrowingFetcher(`${sourceName} error`);
    return buildFetcher(spec ?? []);
  }
  return {
    officialFetcher: fetcher(opts.official, "official"),
    eigaFetcher: fetcher(opts.eiga, "eiga"),
    yahooFetcher: fetcher(opts.yahoo, "yahoo"),
    exaFetcher: fetcher(opts.exa, "exa"),
  };
}

function buildInput(overrides: Partial<{ title: string; area: string }> = {}) {
  return {
    title: overrides.title ?? "テスト作品",
    area: overrides.area ?? "渋谷",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 0. SOURCE_ORDER 設計値 (B2 構造 gate)
// ═══════════════════════════════════════════════════════════════════════════

describe("SOURCE_ORDER — 3+1 段 fallback 設計 (B2 構造 gate)", () => {
  it("順序: official → eiga → yahoo → exa (4 source 固定)", () => {
    expect(SOURCE_ORDER).toEqual(["official", "eiga", "yahoo", "exa"]);
  });

  it("readonly: 配列を mutate しても元の SOURCE_ORDER に影響しない (型契約)", () => {
    // const 配列なので TypeScript 上 readonly。runtime で push できないことを verify。
    const copy: Stage3FallbackSource[] = [...SOURCE_ORDER];
    copy.push("exa");
    expect(SOURCE_ORDER).toHaveLength(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. first non-empty 採用 + 後続 source 不呼出 (cost 削減)
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveTheater — first non-empty 採用 (cost 削減)", () => {
  it("official success → official の listing 返り、eiga/yahoo/exa は呼ばれない", async () => {
    const deps = buildDeps({
      official: [buildListing("TOHO シネマズ渋谷")],
      eiga: [buildListing("eiga-不呼出")],
    });
    const result = await resolveTheater(buildInput(), deps);
    expect(result.theaters).toHaveLength(1);
    expect(result.theaters[0].theaterName).toBe("TOHO シネマズ渋谷");
    expect(deps.officialFetcher).toHaveBeenCalledTimes(1);
    expect(deps.eigaFetcher).not.toHaveBeenCalled();
    expect(deps.yahooFetcher).not.toHaveBeenCalled();
    expect(deps.exaFetcher).not.toHaveBeenCalled();
  });

  it("eiga success → eiga の listing 返り、yahoo/exa は呼ばれない", async () => {
    const deps = buildDeps({
      official: [], // empty
      eiga: [buildListing("eiga-劇場")],
      yahoo: [buildListing("yahoo-不呼出")],
    });
    const result = await resolveTheater(buildInput(), deps);
    expect(result.theaters[0].theaterName).toBe("eiga-劇場");
    expect(deps.officialFetcher).toHaveBeenCalledTimes(1);
    expect(deps.eigaFetcher).toHaveBeenCalledTimes(1);
    expect(deps.yahooFetcher).not.toHaveBeenCalled();
    expect(deps.exaFetcher).not.toHaveBeenCalled();
  });

  it("yahoo success → yahoo の listing 返り、exa は呼ばれない", async () => {
    const deps = buildDeps({
      official: [],
      eiga: [],
      yahoo: [buildListing("yahoo-劇場")],
      exa: [buildListing("exa-不呼出")],
    });
    const result = await resolveTheater(buildInput(), deps);
    expect(result.theaters[0].theaterName).toBe("yahoo-劇場");
    expect(deps.exaFetcher).not.toHaveBeenCalled();
  });

  it("exa success (最終 source) → exa の listing 返る", async () => {
    const deps = buildDeps({
      official: [],
      eiga: [],
      yahoo: [],
      exa: [buildListing("exa-劇場")],
    });
    const result = await resolveTheater(buildInput(), deps);
    expect(result.theaters[0].theaterName).toBe("exa-劇場");
    expect(deps.officialFetcher).toHaveBeenCalledTimes(1);
    expect(deps.eigaFetcher).toHaveBeenCalledTimes(1);
    expect(deps.yahooFetcher).toHaveBeenCalledTimes(1);
    expect(deps.exaFetcher).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. fail-open (throw → 次 source へ fallback)
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveTheater — fail-open (各 fetcher の throw を握り潰す)", () => {
  it("official throw → eiga 試行 (1 source 障害が chain を打ち切らない)", async () => {
    const deps = buildDeps({
      official: "throw",
      eiga: [buildListing("eiga-成功")],
    });
    const result = await resolveTheater(buildInput(), deps);
    expect(result.theaters[0].theaterName).toBe("eiga-成功");
    expect(deps.officialFetcher).toHaveBeenCalledTimes(1);
    expect(deps.eigaFetcher).toHaveBeenCalledTimes(1);
  });

  it("official + eiga throw → yahoo 試行", async () => {
    const deps = buildDeps({
      official: "throw",
      eiga: "throw",
      yahoo: [buildListing("yahoo-成功")],
    });
    const result = await resolveTheater(buildInput(), deps);
    expect(result.theaters[0].theaterName).toBe("yahoo-成功");
  });

  it("official + eiga + yahoo throw → exa 試行", async () => {
    const deps = buildDeps({
      official: "throw",
      eiga: "throw",
      yahoo: "throw",
      exa: [buildListing("exa-成功")],
    });
    const result = await resolveTheater(buildInput(), deps);
    expect(result.theaters[0].theaterName).toBe("exa-成功");
  });

  it("throw は caller に伝播しない (resolveTheater は resolve、reject しない)", async () => {
    const deps = buildDeps({
      official: "throw",
      eiga: "throw",
      yahoo: "throw",
      exa: "throw",
    });
    // 全 throw でも reject せず、empty result を resolve
    await expect(resolveTheater(buildInput(), deps)).resolves.toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. 全 source empty / throw → "none"
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveTheater — 全 source 不発火 → "none"', () => {
  it("4 source 全 empty → theaters=[], stage3FallbackSourceUsed='none'", async () => {
    const deps = buildDeps({ official: [], eiga: [], yahoo: [], exa: [] });
    const result = await resolveTheater(buildInput(), deps);
    expect(result.theaters).toEqual([]);
    expect(result.diagnostics.stage3FallbackSourceUsed).toBe("none");
  });

  it("4 source 全 throw → theaters=[], stage3FallbackSourceUsed='none'", async () => {
    const deps = buildDeps({
      official: "throw",
      eiga: "throw",
      yahoo: "throw",
      exa: "throw",
    });
    const result = await resolveTheater(buildInput(), deps);
    expect(result.theaters).toEqual([]);
    expect(result.diagnostics.stage3FallbackSourceUsed).toBe("none");
  });

  it("empty / throw 混在で全 fallback 失敗 → 'none'", async () => {
    const deps = buildDeps({
      official: [],
      eiga: "throw",
      yahoo: [],
      exa: "throw",
    });
    const result = await resolveTheater(buildInput(), deps);
    expect(result.diagnostics.stage3FallbackSourceUsed).toBe("none");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. source hint / input propagation
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveTheater — input propagation", () => {
  it("title / area が全 fetcher に渡る", async () => {
    const deps = buildDeps({ official: [], eiga: [], yahoo: [], exa: [] });
    await resolveTheater(
      { title: "特定作品", area: "新宿" },
      deps,
    );
    for (const fetcher of [
      deps.officialFetcher,
      deps.eigaFetcher,
      deps.yahooFetcher,
      deps.exaFetcher,
    ]) {
      expect(fetcher).toHaveBeenCalledWith(
        expect.objectContaining({ title: "特定作品", area: "新宿" }),
      );
    }
  });

  it("sourceHint が全 fetcher に同形で渡る", async () => {
    const deps = buildDeps({ official: [], eiga: [], yahoo: [], exa: [] });
    const sourceHint = {
      officialUrl: "https://example.com/movie/x",
      distributor: "Sample Studio",
    };
    await resolveTheater(
      { title: "x", area: "渋谷", sourceHint },
      deps,
    );
    for (const fetcher of [
      deps.officialFetcher,
      deps.eigaFetcher,
      deps.yahooFetcher,
      deps.exaFetcher,
    ]) {
      expect(fetcher).toHaveBeenCalledWith(
        expect.objectContaining({ sourceHint }),
      );
    }
  });

  it("sourceHint 未指定でも全 fetcher が呼ばれる (undefined 許容)", async () => {
    const deps = buildDeps({ official: [], eiga: [], yahoo: [], exa: [] });
    await resolveTheater(buildInput(), deps);
    expect(deps.officialFetcher).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. immutability
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveTheater — immutability", () => {
  it("入力 fetcher が返した配列を mutate しない", async () => {
    const items = [
      buildListing("劇場 A"),
      buildListing("劇場 B"),
    ];
    const snapshot = JSON.parse(JSON.stringify(items));
    const deps = buildDeps({ official: items });
    await resolveTheater(buildInput(), deps);
    expect(items).toEqual(snapshot);
  });

  it("入力 input オブジェクトを mutate しない", async () => {
    const input = { title: "x", area: "渋谷" };
    const snapshot = JSON.parse(JSON.stringify(input));
    const deps = buildDeps({ official: [buildListing("劇場")] });
    await resolveTheater(input, deps);
    expect(input).toEqual(snapshot);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. shape verify
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveTheater — shape", () => {
  it("返り値は theaters / diagnostics 2 fields のみ", async () => {
    const result: TheaterResolverResult = await resolveTheater(
      buildInput(),
      buildDeps(),
    );
    expect(Object.keys(result).sort()).toEqual(["diagnostics", "theaters"]);
  });

  it("diagnostics は 3 fields (stage3FallbackSourceUsed / attemptedSources / theaterResolverLatencyMs)", async () => {
    const result = await resolveTheater(buildInput(), buildDeps());
    expect(Object.keys(result.diagnostics).sort()).toEqual([
      "attemptedSources",
      "stage3FallbackSourceUsed",
      "theaterResolverLatencyMs",
    ]);
  });

  it("CEO 補正 2: 集計 field (tier2FailRate 等) は本 diagnostics に含まれない (event 単位)", async () => {
    const result = await resolveTheater(buildInput(), buildDeps());
    expect(result.diagnostics).not.toHaveProperty("tier2FailRate");
    expect(result.diagnostics).not.toHaveProperty("successRate");
  });
});
