/**
 * CoAlter Stage 3 Resolve (movie) — Theater Fact Authority (D-2-a)
 *
 * 三段式 §2.4.2 / mainstream plan §3.3 元 D-3-a / handover §6 / D-2 設計レビュー §2.
 *
 * 300 字スニペット依存を廃止し、作品公式サイト → eiga.com → Yahoo 映画 → EXA の
 * **3+1 段 fallback chain** で theater listing を取得する。順次試行 + first non-empty
 * 採用方式 (公式が成功すれば後続 source は不呼出、cost 削減)。
 *
 * 設計原則:
 *   - **theater fact authority**: 劇場確定は本 file が責務。Stage 2 Curate
 *     (D-1-a/b/c) は theater 不参照 (B1 構造 gate 継承)
 *   - **fallback chain (順次)**: 公式 → eiga → Yahoo → EXA、各 fetcher の
 *     throw / empty 両方を次 source へ fallback (fail-open)
 *   - **first non-empty 採用**: 最初に non-empty 配列を返した source で確定、
 *     後続 source は不呼出 (cost 削減)
 *   - **DI**: 4 fetcher は `TheaterFetcher` interface で外部注入 (D-2-e で実接続)。
 *     本 file は実 fetch を持たず pure logic + DI のみ
 *
 * D-2-a scope (CEO 採用 R1):
 *   - 本 file は型 + 関数 + DI interface のみ
 *   - 実 fetcher (公式サイト HTML パース / eiga / Yahoo / EXA API) は **D-2-e で
 *     接続予定** (CEO 厳禁: 本 file では実 fetch なし、実 API 接続なし)
 *   - test は **mock fetcher** で fallback 順序 + diagnostics を verify
 *
 * 構造 gate B2 担保 (mainstream plan §3.3 / 三段式 §6 M2):
 *   - 本 file は **3+1 段 fallback chain (公式 → eiga → Yahoo → EXA)** を実装
 *   - 順序固定 (`SOURCE_ORDER`)
 *   - diagnostics `stage3FallbackSourceUsed` で実 source verify
 *
 * 凍結線整合 (handover §4.2):
 *   - `lib/coalter/webConnector.ts` の `parseMovieScreenings` / `NEAR_WINDOW` /
 *     theater regex は **本 file と完全独立**、Stage 3 Resolve 稼働 (D-2-e 後の
 *     Step E) まで旧実装温存
 *   - `lib/coalter/movieCatalog.ts` 全体 touch なし (三段式 §11.A 禁触)
 *   - `lib/coalter/movieRanker.ts:166` `missing_where` hard drop touch なし
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. Public types — Theater Listing / Fetcher / Diagnostics
// ═══════════════════════════════════════════════════════════════════════════

/** Stage 3 fallback source 識別子。順序は SOURCE_ORDER で固定。 */
export type Stage3FallbackSource = "official" | "eiga" | "yahoo" | "exa";

/**
 * Stage 3 で確定する theater listing。
 *
 *   - `theaterName` + `area` は必須 (Stage 3 の核心、Skeleton UI の WHERE 充填)
 *   - `showtimes` / `officialUrl` は optional (取れなければ未充填、別 layer 補完)
 */
export type TheaterListing = {
  theaterName: string;
  area: string;
  /** 上映時刻 (取得できた場合のみ、空配列 / undefined 許容) */
  showtimes?: readonly string[];
  /** 劇場公式 URL (Stage 3 内別 layer で填充可) */
  officialUrl?: string | null;
};

/** Source hint (公式 fetcher の起点 URL や distributor 名)。 */
export type SourceHint = {
  officialUrl?: string | null;
  distributor?: string | null;
};

/** Fetcher への入力。 */
export type TheaterFetcherInput = {
  title: string;
  area: string;
  sourceHint?: SourceHint;
};

/**
 * Theater fetcher 関数 (DI)。
 *
 *   実装は D-2-e で別 file から注入する想定。本 file 自身は実 fetch を持たない。
 *   throw / empty 配列 両方とも fallback trigger となる (fail-open、内部で
 *   try/catch して次 source へ移行)。
 */
export type TheaterFetcher = (
  input: TheaterFetcherInput,
) => Promise<readonly TheaterListing[]>;

/** 4 fetcher の DI コンテナ。 */
export type TheaterResolverDeps = {
  officialFetcher: TheaterFetcher;
  eigaFetcher: TheaterFetcher;
  yahooFetcher: TheaterFetcher;
  exaFetcher: TheaterFetcher;
};

/**
 * Event 単位 diagnostics (CEO 補正 2 採用、集計値ではなく単発 request の事実):
 *
 *   - `stage3FallbackSourceUsed`: 採用 source ("none" = 全 source empty)
 *   - `attemptedSources`: 試行 source 順序 (early-stop の場合は途中まで)
 *   - `theaterResolverLatencyMs`: resolveTheater 全体の所要 ms
 *
 *   集計値 (tier2FailRate / 成功率等) は Step E で SQL / analytics 側で算出する
 *   (mainstream plan §3.3 元 D-3-e + CEO 補正 2 整合)。
 */
export type TheaterResolverDiagnostics = {
  stage3FallbackSourceUsed: Stage3FallbackSource | "none";
  attemptedSources: readonly Stage3FallbackSource[];
  theaterResolverLatencyMs: number;
};

/** resolveTheater の最終結果。 */
export type TheaterResolverResult = {
  theaters: readonly TheaterListing[];
  diagnostics: TheaterResolverDiagnostics;
};

/** resolveTheater の入力。 */
export type TheaterResolverInput = {
  title: string;
  area: string;
  /** source hint (公式 URL / distributor、optional) */
  sourceHint?: SourceHint;
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. Source order (構造 gate B2 担保)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 3+1 段 fallback chain 順序 (三段式 §2.4.2):
 *   1. 公式 (distributor が維持、最高信頼度)
 *   2. eiga.com (構造化 HTML)
 *   3. Yahoo 映画 (構造化 HTML)
 *   4. EXA 補助 (最終手段、テキストから劇場名抽出)
 *
 * 順序固定。test で B2 構造 gate verify される。
 */
export const SOURCE_ORDER: readonly Stage3FallbackSource[] = [
  "official",
  "eiga",
  "yahoo",
  "exa",
];

function getFetcher(
  source: Stage3FallbackSource,
  deps: TheaterResolverDeps,
): TheaterFetcher {
  switch (source) {
    case "official":
      return deps.officialFetcher;
    case "eiga":
      return deps.eigaFetcher;
    case "yahoo":
      return deps.yahooFetcher;
    case "exa":
      return deps.exaFetcher;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Fail-open helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetcher 呼び出し wrapper。throw を握り潰して空配列を返す。
 *
 *   失敗 (例外 / reject) → 空配列に倒す。これにより 1 source の障害が
 *   chain を打ち切らないことを保証 (fail-open、Bug-1 §2.3 失敗独立 5 条文の精神)。
 */
async function callFetcherFailOpen(
  fetcher: TheaterFetcher,
  input: TheaterFetcherInput,
): Promise<readonly TheaterListing[]> {
  try {
    const result = await fetcher(input);
    return result;
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Public API — resolveTheater
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 3+1 段 fallback chain で theater listing を取得する。
 *
 *   1. SOURCE_ORDER 通り順次試行 (公式 → eiga → Yahoo → EXA)
 *   2. 各 fetcher は throw / empty 両方 fallback trigger (fail-open)
 *   3. 最初に non-empty 配列を返した source で確定、後続は **不呼出** (cost 削減)
 *   4. 全 source empty → `theaters: []`, `stage3FallbackSourceUsed: "none"`
 *
 * **B1 構造 gate 継承**: 本関数は `candidate.theater` を入力に取らない。
 *   theater 確定は title + area から本 fetcher chain で行う、Stage 2 Curate
 *   (D-1-c) は theater 不参照のまま。
 *
 * **B2 構造 gate 担保**: SOURCE_ORDER = ["official", "eiga", "yahoo", "exa"]、
 *   `stage3FallbackSourceUsed` diagnostics で test verify。
 */
export async function resolveTheater(
  input: TheaterResolverInput,
  deps: TheaterResolverDeps,
): Promise<TheaterResolverResult> {
  const startedAt = Date.now();
  const attempted: Stage3FallbackSource[] = [];

  for (const source of SOURCE_ORDER) {
    attempted.push(source);
    const fetcher = getFetcher(source, deps);
    const result = await callFetcherFailOpen(fetcher, {
      title: input.title,
      area: input.area,
      sourceHint: input.sourceHint,
    });
    if (result.length > 0) {
      return {
        theaters: result,
        diagnostics: {
          stage3FallbackSourceUsed: source,
          attemptedSources: [...attempted],
          theaterResolverLatencyMs: Date.now() - startedAt,
        },
      };
    }
  }

  // 全 source 空配列 / throw → empty + "none"
  return {
    theaters: [],
    diagnostics: {
      stage3FallbackSourceUsed: "none",
      attemptedSources: [...attempted],
      theaterResolverLatencyMs: Date.now() - startedAt,
    },
  };
}
