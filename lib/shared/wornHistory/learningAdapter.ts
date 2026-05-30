/**
 * shared WornHistory — learning / recency adapter + shadow comparator（Phase 5-B: pure・runtime 非接続）
 *
 * 目的: shared の `learningCorpus` / `entries` を、既存 engine の learner が理解する旧 `WornRecord` 系
 * （date / itemIds / satisfaction）へ変換し、現行 path と pure に比較できる基盤を作る。
 * **engine の実提案にはまだ使わない**（5-C で gated 接続）。
 *
 * 用途分離（5-A の最重要設計）:
 *   - 満足度 / コンボ学習 ← `learningCorpus`（source ∈ {engine, calendar_form}・satisfaction 必須）
 *   - recency / rotation（着た事実）← `entries`（engine / calendar_form / my_style。 mock / hydrated_mock 除外）
 *
 * 厳守: storage / engine / log / analytics には一切接続しない（pure 関数のみ）。
 *       raw note / moodTag / 大量 id を comparator から返さない（privacy-safe summary）。
 */

import { isSatisfactionLevel } from "./eligibility";
import type { WornHistoryView } from "./readView";
import type { SatisfactionLevel, WornHistoryEntry, WornHistorySource } from "./types";

/** 学習入力（satisfaction 必須＝learner が要求）。 engine の WornRecord と構造互換。 */
export interface LearningWornRecord {
  date: string;
  itemIds: string[];
  satisfaction: SatisfactionLevel;
}

/** recency 入力（着た事実。 satisfaction は任意）。 */
export interface RecencyWornRecord {
  date: string;
  itemIds: string[];
  satisfaction?: SatisfactionLevel;
}

export interface AdapterOptions {
  /**
   * 指定時、 実在する wardrobe id 集合で絞る。
   *   - learning: itemIds の一部でも不在なら record ごと除外（combo の完全性・eligibility と整合）。
   *   - recency: itemIds を per-item で実在のみに絞り、 空になれば record を除外。
   */
  knownWardrobeIds?: Iterable<string>;
}

/** 学習対象 source（mock / hydrated_mock / my_style は除外）。 */
const LEARNING_SOURCES: ReadonlySet<WornHistorySource> = new Set<WornHistorySource>([
  "engine",
  "calendar_form",
]);
/** recency 対象 source（着た事実）。 mock / hydrated_mock は実服でない可能性 → recency を汚さないため除外。 */
const RECENCY_SOURCES: ReadonlySet<WornHistorySource> = new Set<WornHistorySource>([
  "engine",
  "calendar_form",
  "my_style",
]);

const byDateDesc = (a: { date: string }, b: { date: string }): number =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : 0;

function toKnownSet(options: AdapterOptions): Set<string> | null {
  if (!options.knownWardrobeIds) return null;
  return options.knownWardrobeIds instanceof Set
    ? options.knownWardrobeIds
    : new Set(options.knownWardrobeIds);
}

/**
 * learningCorpus → LearningWornRecord[]（pure）。
 *   - source ∈ {engine, calendar_form} のみ（mock / hydrated_mock / my_style は防御的に除外）。
 *   - satisfaction（1-5）必須。 itemIds 非空。
 *   - knownWardrobeIds 指定時: itemIds の一部でも不在なら record ごと除外。
 *   - note 等は持ち込まない（出力は date / itemIds / satisfaction のみ）。 date 降順で安定。
 */
export function learningCorpusToWornRecords(
  corpus: ReadonlyArray<WornHistoryEntry>,
  options: AdapterOptions = {},
): LearningWornRecord[] {
  const known = toKnownSet(options);
  const out: LearningWornRecord[] = [];
  for (const e of corpus) {
    if (!e || !LEARNING_SOURCES.has(e.source)) continue;
    if (!isSatisfactionLevel(e.satisfaction)) continue;
    if (!Array.isArray(e.itemIds) || e.itemIds.length === 0) continue;
    if (known && (known.size === 0 || !e.itemIds.every((id) => known.has(id)))) continue;
    out.push({ date: e.date, itemIds: [...e.itemIds], satisfaction: e.satisfaction });
  }
  return out.sort(byDateDesc);
}

/**
 * entries → RecencyWornRecord[]（pure・着た事実）。
 *   - source ∈ {engine, calendar_form, my_style}（mock / hydrated_mock 除外）。
 *   - knownWardrobeIds 指定時: itemIds を per-item で実在のみに絞り、 空になれば record 除外。
 *   - note 等は持ち込まない。 date 降順で安定。
 */
export function wornHistoryEntriesToRecencyWornRecords(
  entries: ReadonlyArray<WornHistoryEntry>,
  options: AdapterOptions = {},
): RecencyWornRecord[] {
  const known = toKnownSet(options);
  const out: RecencyWornRecord[] = [];
  for (const e of entries) {
    if (!e || !RECENCY_SOURCES.has(e.source)) continue;
    if (!Array.isArray(e.itemIds)) continue;
    const ids = known ? e.itemIds.filter((id) => known.has(id)) : [...e.itemIds];
    if (ids.length === 0) continue;
    out.push(
      isSatisfactionLevel(e.satisfaction)
        ? { date: e.date, itemIds: ids, satisfaction: e.satisfaction }
        : { date: e.date, itemIds: ids },
    );
  }
  return out.sort(byDateDesc);
}

/** shadow 比較サマリ（privacy-safe・counts / boolean のみ・raw id / note を出さない）。 */
export interface WornHistoryShadowSummary {
  /** 現行 engine が読む legacy worn records 件数。 */
  legacyCount: number;
  /** shared learning（learningCorpus 由来）件数。 */
  sharedLearningCount: number;
  /** shared recency（entries 由来）件数。 */
  sharedRecencyCount: number;
  /** sharedLearningCount - legacyCount。 */
  learningDelta: number;
  /** sharedRecencyCount - legacyCount。 */
  recencyDelta: number;
  /** shared learning に /plan（origin=plan）のフィードバックが含まれるか。 */
  sharedAddsPlanFeedback: boolean;
  /** shared recency に My-Style/Home（origin=style）の着用が含まれるか。 */
  sharedAddsStyleRecency: boolean;
  /** entries 中 mock / hydrated_mock の件数（学習・recency 双方から除外）。 */
  excludedMockCount: number;
  /** entries 中 my_style の件数（recency には入るが learning からは除外）。 */
  excludedMyStyleFromLearningCount: number;
}

export interface CompareInput {
  /** 現行 engine が読む legacy worn records（count 比較用。 date / itemIds のみ参照）。 */
  legacy: ReadonlyArray<{ date: string; itemIds: string[] }>;
  /** shared read-view（entries + learningCorpus）。 */
  view: WornHistoryView;
  knownWardrobeIds?: Iterable<string>;
}

/**
 * legacy（現行 engine 入力）と shared（corpus / entries）の learning / recency 入力を pure に比較する。
 *   - 返すのは件数・差分・boolean のみ（raw id / note / 大量 payload は返さない）。
 *   - log / analytics / storage には一切触れない（pure return）。
 */
export function compareWornHistoryLearningInputs(input: CompareInput): WornHistoryShadowSummary {
  const opts: AdapterOptions = input.knownWardrobeIds
    ? { knownWardrobeIds: input.knownWardrobeIds }
    : {};
  const sharedLearning = learningCorpusToWornRecords(input.view.learningCorpus, opts);
  const sharedRecency = wornHistoryEntriesToRecencyWornRecords(input.view.entries, opts);
  const legacyCount = input.legacy.length;

  const sharedAddsPlanFeedback = input.view.learningCorpus.some((e) => e.origin === "plan");
  let sharedAddsStyleRecency = false;
  let excludedMockCount = 0;
  let excludedMyStyleFromLearningCount = 0;
  for (const e of input.view.entries) {
    if (e.origin === "style") sharedAddsStyleRecency = true;
    if (e.source === "mock" || e.source === "hydrated_mock") excludedMockCount += 1;
    if (e.source === "my_style") excludedMyStyleFromLearningCount += 1;
  }

  return {
    legacyCount,
    sharedLearningCount: sharedLearning.length,
    sharedRecencyCount: sharedRecency.length,
    learningDelta: sharedLearning.length - legacyCount,
    recencyDelta: sharedRecency.length - legacyCount,
    sharedAddsPlanFeedback,
    sharedAddsStyleRecency,
    excludedMockCount,
    excludedMyStyleFromLearningCount,
  };
}
