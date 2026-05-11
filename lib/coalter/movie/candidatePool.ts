/**
 * CoAlter Stage 2 Curate (movie) — Candidate Pool + Soft Availability Filter
 *
 * 三段式 §2.3.2 / mainstream plan §3.2 元 D-2-b / handoff rev 6 §2 Step D-1-b.
 *
 * 3 source の候補 pool (映画.com 公開中ランキング / EXA 検索 / 2人の履歴 +
 * Stargazer personality) を並列 fetch し、Soft Availability Filter で「ユーザー
 * 地域で見られる可能性が十分あるか」だけを軽く絞り込む。
 *
 * 設計原則:
 *   - **3 source 並列 fetch**: 各 source は失敗時 fail-open (空配列で継続)
 *   - **dedup**: id ベース重複排除 (最初に来た source を優先)
 *   - **Soft Filter**: 3 シグナル合計 0.4 以上で通過 (誤排除 < 誤採用 のリスクバランス)
 *   - **LLM ranking 前**: filter は logic 主体、availability の責務を LLM に持たせない
 *   - **DI**: source 関数は caller (D-1-d で movieOrchestrator) から注入。
 *     D-1-b 自身は実 fetch を持たない (test 容易性 + Stage 3 接続容易性)
 *
 * 構造 gate B1 担保 (mainstream plan §3.2 / 三段式 §6 M2 Bug-2 接続):
 *   - 本 file は `theater` フィールドを **filter logic で参照しない**
 *   - `theater` が null/undefined でも pool から drop しない
 *   - source 内に `missing_where` reject ロジックを **入れない**
 *   - 検証は `tests/unit/coalter/movie/candidatePoolNoMissingWhereDrop.test.ts` で
 *     symbol-level (regex grep) + runtime の両面で行う
 *
 * 凍結線整合 (handover §4.2):
 *   - `lib/coalter/movieRanker.ts:166` `missing_where` hard drop は **既存実装に残置**
 *     (Stage 3 Resolve 稼働まで fallback)。本 file はそれと**完全独立**な新経路
 *   - `lib/coalter/movieOrchestrator.ts` / `movieCatalog.ts` / `webConnector.ts`
 *     等への touch なし
 */

import type { MovieQuery } from "./queryDerivation";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Public types
// ═══════════════════════════════════════════════════════════════════════════

/** 公開状況。Soft filter で nowShowing シグナルとして使用。 */
export type ReleaseStatus = "now-showing" | "limited" | "upcoming";

/** どの source から取得した候補か (3 source、diagnostics で集計)。 */
export type CandidateSourceKind =
  | "ranking" //              映画.com / eiga.com 公開中ランキング (優先度 1)
  | "exa" //                  EXA 検索 (優先度 2)
  | "personality_history"; // 2人の履歴 + Stargazer personality (優先度 3)

/**
 * Movie 候補。
 *
 *   - **theater** は **optional** で、Stage 2 では空欄を許容する (Skeleton UI)。
 *     Stage 3 Resolve で別途 fetch して充填する経路。
 *   - 本 type を参照する filter / dedup / scoring logic は **theater を不参照**。
 *     これが B1 構造 gate の核 (theater 欠落で drop しない)。
 */
export type MovieCandidate = {
  /** Source 内一意な ID (dedup key) */
  id: string;
  /** 作品タイトル */
  title: string;
  /** あらすじ要約 (LLM Ranker / narration が参照、optional) */
  synopsis?: string;
  /** 上映時間 (分、length_minutes_max フィルタで使用、unknown は null) */
  runtimeMin?: number | null;
  /** ジャンル */
  genres: string[];
  /** 公開状況 (Soft filter nowShowing シグナル) */
  releaseStatus: ReleaseStatus;
  /** 配給会社 (Stage 3 公式サイト fetch で使用、optional) */
  distributor?: string | null;
  /** 公式サイト URL (Stage 3 で fetch 起点として利用、optional) */
  officialUrl?: string | null;
  /** 推定上映劇場数 (Soft filter wideRelease シグナル、不明は undefined → 弱い扱い) */
  screenCountEstimate?: number;
  /** どの source 由来か */
  sourceProvider: CandidateSourceKind;
  /**
   * Stage 3 で確定する劇場名 (null/undefined を許容)。
   * **B1 ガード**: 本 field の欠落を理由に candidatePool 側で drop しない。
   */
  theater?: string | null;
};

/** Source 関数 signature (DI)。 */
export type CandidateSource = (
  query: MovieQuery,
) => Promise<readonly MovieCandidate[]>;

/** 3 source 関数を注入する DI 用コンテナ。 */
export type CandidatePoolDeps = {
  rankingSource: CandidateSource;
  exaSource: CandidateSource;
  personalityHistorySource: CandidateSource;
};

/** Pool 構築の input。 */
export type CandidatePoolInput = {
  query: MovieQuery;
  /**
   * ユーザー地域 (Soft filter areaHint シグナル用)。
   * - null = Stage 3 未接続 (Step D 期間中の D-1-b/c では null 許容)
   * - 文字列 = エリア名 (例: "渋谷")
   */
  userArea?: string | null;
};

/** 集計 diagnostics (LLM Ranker や observability に使用)。 */
export type CandidatePoolDiagnostics = {
  /** Source 別 raw count */
  rawCounts: Record<CandidateSourceKind, number>;
  /** dedup 後の raw 合計 */
  rawTotal: number;
  /** Soft filter 通過数 */
  softFilterPassed: number;
  /** Soft filter で除外された数 */
  softFilterRejected: number;
};

/** Pool 構築の最終結果。 */
export type CandidatePoolResult = {
  /** dedup 後の raw pool (filter 前) */
  rawPool: readonly MovieCandidate[];
  /** Soft filter 通過後 (LLM Ranker への入力) */
  filteredPool: readonly MovieCandidate[];
  diagnostics: CandidatePoolDiagnostics;
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. Soft Availability Filter (三段式 §2.3.2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 通過閾値 (三段式 §2.3.2 「閾値 0.4 未満は pool から除外」)。
 *
 *   ゆるい理由: 誤排除 (Stage 3 なら見つかる作品を落とす) <
 *     誤採用 (Stage 3 で絶対見つからない作品を推薦して失望させる) のリスクバランス。
 */
export const SOFT_AVAILABILITY_THRESHOLD = 0.4;

/**
 * Soft Availability Score (3 シグナル合計 0-1、三段式 §2.3.2)。
 *
 *   - nowShowing (0.4): releaseStatus === "now-showing" でフル付与
 *   - wideRelease (0.1 / 0.3): screenCountEstimate ≥ 20 で 0.3、それ以下 / unknown で 0.1
 *     (排除しない、弱く扱う)
 *   - areaHint (0 / 0.3): userArea が文字列なら 0.3、null なら 0 (Stage 3 未接続を許容)
 *
 * **B1 ガード**: 本関数は `candidate.theater` を **不参照**。theater null でも score
 * は同じ計算で出る。
 */
export function softAvailabilityScore(
  candidate: MovieCandidate,
  userArea: string | null,
): number {
  const nowShowing = candidate.releaseStatus === "now-showing" ? 0.4 : 0;
  const wideRelease =
    typeof candidate.screenCountEstimate === "number" &&
    candidate.screenCountEstimate >= 20
      ? 0.3
      : 0.1;
  const areaHint = typeof userArea === "string" && userArea.length > 0 ? 0.3 : 0;
  return nowShowing + wideRelease + areaHint;
}

/**
 * Soft filter 適用 (pure function、入力 pool 不変、新配列を返す)。
 *
 *   通過条件: softAvailabilityScore ≥ SOFT_AVAILABILITY_THRESHOLD (0.4)
 */
export function applySoftAvailabilityFilter(
  pool: readonly MovieCandidate[],
  userArea: string | null,
): MovieCandidate[] {
  return pool.filter(
    (c) => softAvailabilityScore(c, userArea) >= SOFT_AVAILABILITY_THRESHOLD,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Pool 構築 (3 source 並列 fetch + dedup + filter)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 各 source 関数を fail-open で呼ぶ wrapper。
 *
 *   失敗 (例外 / reject) → 空配列に倒す。これにより 1 source の障害が
 *   全 pool を枯渇させないことを保証。
 */
async function callSourceFailOpen(
  source: CandidateSource,
  query: MovieQuery,
): Promise<readonly MovieCandidate[]> {
  try {
    const result = await source(query);
    return result;
  } catch {
    return [];
  }
}

/**
 * id ベース重複排除 (最初に来た要素を優先)。pure function、入力配列不変。
 */
function dedupById(
  pool: readonly MovieCandidate[],
): readonly MovieCandidate[] {
  const seen = new Set<string>();
  const out: MovieCandidate[] = [];
  for (const c of pool) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/**
 * 3 source から候補 pool を構築する。
 *
 *   1. 3 source を並列 fetch (各 fail-open)
 *   2. ranking → exa → personality_history の順で結合 (優先度反映)
 *   3. id ベース dedup
 *   4. Soft Availability Filter
 *
 * **B1 ガード**: 本関数は `candidate.theater` を **filter / dedup logic で不参照**。
 * theater null/undefined でも pool から drop しない。
 */
export async function buildCandidatePool(
  input: CandidatePoolInput,
  deps: CandidatePoolDeps,
): Promise<CandidatePoolResult> {
  const { query } = input;
  const userArea = input.userArea ?? null;

  const [ranking, exa, personality] = await Promise.all([
    callSourceFailOpen(deps.rankingSource, query),
    callSourceFailOpen(deps.exaSource, query),
    callSourceFailOpen(deps.personalityHistorySource, query),
  ]);

  const concatenated: MovieCandidate[] = [...ranking, ...exa, ...personality];
  const dedupedRaw = dedupById(concatenated);
  const filteredPool = applySoftAvailabilityFilter(dedupedRaw, userArea);

  return {
    rawPool: dedupedRaw,
    filteredPool,
    diagnostics: {
      rawCounts: {
        ranking: ranking.length,
        exa: exa.length,
        personality_history: personality.length,
      },
      rawTotal: dedupedRaw.length,
      softFilterPassed: filteredPool.length,
      softFilterRejected: dedupedRaw.length - filteredPool.length,
    },
  };
}
