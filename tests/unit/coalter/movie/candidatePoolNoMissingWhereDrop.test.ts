/**
 * D-1-b 構造 gate B1 担保テスト (mainstream plan §3.2 元 D-2-b / 三段式 §6 M2 Bug-2 接続)。
 *
 * Bug-2 の構造原因 = `missing_where` hard drop で ranker が 0 件になる
 * (`lib/coalter/movieRanker.ts:166`、Stage 3 Resolve 稼働まで温存)。
 *
 * 三段式の解は、**Stage 2 Curate (本 D-1-b) では theater 欠落を理由に
 * candidate を drop しない** こと。劇場確定は Stage 3 Resolve に委譲する。
 *
 * 本テストは B1 構造 gate を 2 面で担保する:
 *   1. **symbol-level**: `lib/coalter/movie/candidatePool.ts` の source code 文字列に
 *      `missing_where` が一切登場しないことを regex で検証
 *      (将来の実装者が「念のため」 reject ロジックを混入することを防ぐ)
 *   2. **runtime**: theater = null / undefined / 空文字 の candidate を 3 source で
 *      与えても、Soft filter 通過後に pool に **残ること** を実証
 *
 * 凍結線整合 (handover §4.2):
 *   - 既存 `lib/coalter/movieRanker.ts:166` `missing_where` hard drop は **本テストでも
 *     touch しない** (旧実装側で温存される、Stage 3 完成後に別 rev で削除審議)
 *   - 本テストは新実装 `lib/coalter/movie/candidatePool.ts` のみを対象に B1 を verify
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCandidatePool,
  type CandidatePoolDeps,
  type CandidateSource,
  type MovieCandidate,
} from "@/lib/coalter/movie/candidatePool";
import type { MovieQuery } from "@/lib/coalter/movie/queryDerivation";

// ═══════════════════════════════════════════════════════════════════════════
// fixture builders (theater 欠落 variant に集中)
// ═══════════════════════════════════════════════════════════════════════════

function buildQuery(): MovieQuery {
  return {
    genres: ["ヒューマンドラマ"],
    mood: "comforting",
    weight: "light",
    length_minutes_max: 120,
    era: "now-showing",
    couple_fit_hints: [],
    exclude: [],
  };
}

/**
 * theater 欠落 variant を作る factory。
 *   - theaterField: undefined → property 自体を持たない
 *   - theaterField: "null" / "empty" → 明示的に null / 空文字
 */
function buildTheaterMissingCandidate(
  id: string,
  theaterField: "absent" | "null" | "empty",
): MovieCandidate {
  const base: MovieCandidate = {
    id,
    title: `theater-missing-${id}`,
    genres: ["ヒューマンドラマ"],
    releaseStatus: "now-showing",
    sourceProvider: "ranking",
    screenCountEstimate: 30,
  };
  if (theaterField === "null") return { ...base, theater: null };
  if (theaterField === "empty") return { ...base, theater: "" };
  return base; // absent
}

function buildSource(items: readonly MovieCandidate[]): CandidateSource {
  return vi.fn().mockResolvedValue(items);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. symbol-level: candidatePool.ts に "missing_where" 文字列が存在しない
// ═══════════════════════════════════════════════════════════════════════════

describe("B1 構造 gate — symbol-level (source code に missing_where 登場禁止)", () => {
  const SOURCE_PATH = resolve(
    process.cwd(),
    "lib/coalter/movie/candidatePool.ts",
  );
  const sourceCode = readFileSync(SOURCE_PATH, "utf8");

  it("candidatePool.ts の **実装行** に 'missing_where' が存在しない (doc コメントは許容、混入防止)", () => {
    // 真の意図: 将来の実装者が candidatePool.ts に `missing_where` reject ロジックを
    // 入れることを構造的に禁止する。
    //
    // ただし、doc コメント内で「missing_where reject を入れない」と説明することは
    // 後の実装者への警告として valuable。コメント許容 + 実装行のみ検出する logic を採用。
    //
    // 検出対象: 行 trim 後に `*` / `//` / `/*` で始まらない行 (= 実装行) で
    //   `missing_where` を含むもの。
    const lines = sourceCode.split("\n");
    const offendingLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (
        trimmed.startsWith("*") ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*")
      ) {
        return false; // doc コメント / ブロックコメントは許容
      }
      return /missing_where/.test(line);
    });
    expect(offendingLines).toEqual([]);
  });

  it("candidatePool.ts source code に theater 参照の filter / reject 関数呼び出しが存在しない", () => {
    // theater field 自体は型定義 (`theater?: string | null`) には存在するため、
    // 「型定義以外で theater を読む」ロジックを構造的に禁止する。
    //
    // doc コメント内の `theater` 言及は許容 (本 file の意図表明として必要)。
    // 実装行で theater を参照する pattern を grep で検出する。
    //
    // 想定 NG pattern:
    //   - `c.theater === null`
    //   - `candidate.theater === undefined`
    //   - `if (!c.theater)`
    //   - `.filter(c => c.theater ...)`
    //
    // 本 file が theater を実装行で読まない構造を verify する。
    // (型定義 `theater?: string | null` 以外で `.theater` を持つ行をカウント)
    const lines = sourceCode.split("\n");
    const NON_TYPE_THEATER_REFS = lines.filter((line) => {
      // type 定義行は許容 (`theater?: string | null;`)
      if (/theater\?\s*:\s*string\s*\|\s*null/.test(line)) return false;
      // doc コメント / ブロックコメント (`* `, `// ` 始まり) は許容
      const trimmed = line.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//")) return false;
      // 実装行で `.theater` を読んでいるか
      return /\.theater\b/.test(line);
    });
    expect(NON_TYPE_THEATER_REFS).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. runtime: theater 欠落 candidate が pool に残ることを実証
// ═══════════════════════════════════════════════════════════════════════════

describe("B1 構造 gate — runtime (theater 欠落 candidate を drop しない)", () => {
  it("theater absent (property 自体なし) candidate は filteredPool に残る", async () => {
    const deps: CandidatePoolDeps = {
      rankingSource: buildSource([
        buildTheaterMissingCandidate("absent-1", "absent"),
      ]),
      exaSource: buildSource([]),
      personalityHistorySource: buildSource([]),
    };
    const result = await buildCandidatePool({ query: buildQuery() }, deps);
    expect(result.rawPool).toHaveLength(1);
    expect(result.filteredPool).toHaveLength(1);
    expect(result.filteredPool[0].id).toBe("absent-1");
    // theater field の状態を verify (absent = undefined)
    expect(result.filteredPool[0].theater).toBeUndefined();
  });

  it("theater null candidate は filteredPool に残る", async () => {
    const deps: CandidatePoolDeps = {
      rankingSource: buildSource([
        buildTheaterMissingCandidate("null-1", "null"),
      ]),
      exaSource: buildSource([]),
      personalityHistorySource: buildSource([]),
    };
    const result = await buildCandidatePool({ query: buildQuery() }, deps);
    expect(result.filteredPool).toHaveLength(1);
    expect(result.filteredPool[0].theater).toBeNull();
  });

  it("theater 空文字 candidate も filteredPool に残る", async () => {
    const deps: CandidatePoolDeps = {
      rankingSource: buildSource([
        buildTheaterMissingCandidate("empty-1", "empty"),
      ]),
      exaSource: buildSource([]),
      personalityHistorySource: buildSource([]),
    };
    const result = await buildCandidatePool({ query: buildQuery() }, deps);
    expect(result.filteredPool).toHaveLength(1);
    expect(result.filteredPool[0].theater).toBe("");
  });

  it("3 source で theater 欠落 candidate が混在しても全部残る (混入時の確証)", async () => {
    const deps: CandidatePoolDeps = {
      rankingSource: buildSource([
        buildTheaterMissingCandidate("r-absent", "absent"),
      ]),
      exaSource: buildSource([
        { ...buildTheaterMissingCandidate("e-null", "null"), sourceProvider: "exa" },
      ]),
      personalityHistorySource: buildSource([
        {
          ...buildTheaterMissingCandidate("p-empty", "empty"),
          sourceProvider: "personality_history",
        },
      ]),
    };
    const result = await buildCandidatePool({ query: buildQuery() }, deps);
    expect(result.rawPool).toHaveLength(3);
    expect(result.filteredPool).toHaveLength(3);
    expect(result.filteredPool.map((c) => c.id).sort()).toEqual([
      "e-null",
      "p-empty",
      "r-absent",
    ]);
    // diagnostics: missingWhereRejectCount のような field は本 implementation に存在しない
    // (構造的に存在しない = B1 担保)
    expect(result.diagnostics).not.toHaveProperty("missingWhereRejectCount");
    expect(result.diagnostics).not.toHaveProperty("rejectedReasons");
  });

  it("theater あり / なし 混在: filter は theater を見ず Soft filter score のみで判定", async () => {
    const deps: CandidatePoolDeps = {
      rankingSource: buildSource([
        // theater あり、しかし Soft filter 不通過 (upcoming + screenCount 1 + areaなし)
        {
          ...buildTheaterMissingCandidate("with-theater-rejected", "absent"),
          theater: "TOHO シネマズ渋谷",
          releaseStatus: "upcoming",
          screenCountEstimate: 1,
        },
        // theater なし、Soft filter 通過 (now-showing + screenCount 30)
        buildTheaterMissingCandidate("no-theater-passes", "null"),
      ]),
      exaSource: buildSource([]),
      personalityHistorySource: buildSource([]),
    };
    const result = await buildCandidatePool({ query: buildQuery() }, deps);
    // filter 結果は theater 不参照、Soft filter score のみで判定
    expect(result.filteredPool.map((c) => c.id)).toEqual(["no-theater-passes"]);
    expect(result.diagnostics.softFilterPassed).toBe(1);
    expect(result.diagnostics.softFilterRejected).toBe(1);
  });
});
