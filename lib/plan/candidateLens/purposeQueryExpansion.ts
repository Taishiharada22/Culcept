/**
 * lib/plan/candidateLens/purposeQueryExpansion.ts
 *   — Candidate Lens / Phase 5-a: 目的別 secondary query 生成（pure・dormant）
 *
 * ★狙い（plan: docs/candidate-lens-phase5-purpose-aware-enrichment-plan.md §P5-a）:
 *   「仕事なのにただ近いカフェ」を脱するため、目的（lens）に応じて検索時点で設備語/意図語を足した
 *   **secondary query 候補**を作る。primary query（地名+カテゴリ/予定名）は **一切壊さない**（別文字列を生成するだけ）。
 *
 * ★重要な honesty 境界:
 *   ここで足す「電源 / Wi-Fi / 静か」等は **検索語にすぎない**（その場所がその設備を持つ確証＝fact/evidence ではない）。
 *   UI は従来どおり Wi-Fi/電源/静か等を「未確認」のまま扱う。本 helper は **何を探すか**を変えるだけで、
 *   **何を断定表示するか**は一切変えない。
 *
 * ★pure: Date/Math.random/network/DB/外部 API なし。決定論。route 未接続・実 fetch なし・flag default OFF。
 */
import type { PurposeLens } from "./purposeLens";

/**
 * ★flag（dormant・default OFF・production hard block）。
 *   true でも本 module は文字列候補を返すだけ（route 接続・実 fetch・課金は別 GO）。
 */
export const PURPOSE_QUERY_EXPANSION_ENABLED = false;
export function isPurposeQueryExpansionEnabled(): boolean {
  return PURPOSE_QUERY_EXPANSION_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
}

/**
 * 目的別の secondary 検索語（設備語/意図語）。★fact ではなく「検索語」。
 *   入れすぎると Places Text Search が不安定化するため、ここでは候補語のみ列挙し、後段で MAX_KEYWORDS に絞る。
 *   generic は拡張しない（＝既存 primary のまま・no-op）。
 */
export const PURPOSE_QUERY_KEYWORDS: Record<PurposeLens, readonly string[]> = {
  meeting_prep: ["電源", "Wi-Fi", "静か", "落ち着いた", "打ち合わせ"],
  focus_work: ["電源", "Wi-Fi", "作業", "集中", "長居"],
  conversation: ["ゆっくり", "座れる", "会話", "雰囲気"],
  errand: ["立ち寄り", "近い"],
  generic: [],
};

/** 1 secondary query に詰める設備語の上限（過剰語で結果が 0 件化するのを防ぐ）。 */
export const MAX_KEYWORDS = 3;
/** 生成する secondary query の上限（当面 1 本・fan-out しない）。 */
export const MAX_SECONDARY_QUERIES = 1;

export interface SecondaryQueryInput {
  /** 予定から導いた目的レンズ（purposeLensFromSchedule の結果）。 */
  readonly lens: PurposeLens;
  /**
   * 既存 primary query（buildPlaceSearchQuery の textQuery＝地名+カテゴリ/予定名）。
   * 本 helper は **これを読むだけで一切変更しない**。空なら no-op。
   */
  readonly primaryQuery: string;
}

export interface SecondaryQueryResult {
  /** secondary query 候補（0..MAX_SECONDARY_QUERIES）。空配列＝拡張なし（no-op）。 */
  readonly queries: readonly string[];
  /**
   * secondary に使った設備語/意図語（★検索語であって fact/evidence ではない）。
   * UI は確定表示に使ってはいけない（未確認のまま）。空＝拡張なし。
   */
  readonly keywords: readonly string[];
}

/** 目的別の設備語/意図語（テスト・再利用用の純アクセサ）。generic/未知は []。 */
export function purposeQueryKeywords(lens: PurposeLens): readonly string[] {
  return PURPOSE_QUERY_KEYWORDS[lens] ?? [];
}

const EMPTY: SecondaryQueryResult = { queries: [], keywords: [] };

/**
 * ★目的別 secondary query を生成（pure・決定論）。
 *   - primary が空 → no-op
 *   - lens の語彙が空（generic/未知）→ no-op
 *   - 語は dedupe ＆ **primary に既出の語は除外**（重複検索語を増やさない）
 *   - MAX_KEYWORDS で打ち切り、MAX_SECONDARY_QUERIES 本だけ生成
 *   - secondary = `${primary} ${設備語...}`（primary は prefix のまま不変・別文字列を作るだけ）
 *   - 日本語/英語混在（"Wi-Fi" 等）でも安全（小文字化して包含比較）
 */
export function buildSecondaryQueries(input: SecondaryQueryInput): SecondaryQueryResult {
  const primary = input.primaryQuery.trim();
  if (primary.length === 0) return EMPTY; // primary なし → no-op（primary を壊さない・捏造しない）

  const vocab = purposeQueryKeywords(input.lens);
  if (vocab.length === 0) return EMPTY; // generic/未知 → no-op

  const lowerPrimary = primary.toLowerCase();
  const chosen: string[] = [];
  const seen = new Set<string>();
  for (const raw of vocab) {
    const kw = raw.trim();
    if (kw.length === 0) continue;
    const lk = kw.toLowerCase();
    if (seen.has(lk)) continue; // dedupe（語彙内の重複）
    if (lowerPrimary.includes(lk)) continue; // primary に既出 → 足さない（重複検索語を避ける）
    seen.add(lk);
    chosen.push(kw);
    if (chosen.length >= MAX_KEYWORDS) break;
  }
  if (chosen.length === 0) return EMPTY; // 足せる語がない → no-op

  // ★primary は不変。secondary は新しい文字列（primary を prefix に設備語を連結）。
  const secondary = `${primary} ${chosen.join(" ")}`;
  const queries = [secondary].slice(0, MAX_SECONDARY_QUERIES);
  return { queries, keywords: chosen };
}
