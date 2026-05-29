/**
 * shared WornHistory — learning eligibility（Phase 3-A: pure・storage 非接触）
 *
 * 「この着用記録を学習に使ってよいか」を 1 箇所に固定する。 mock / hydrated_mock は
 * 何があっても学習に流さない（hard ban）。 実在 wardrobe id の検証は任意（knownWardrobeIds）。
 */

import type { SatisfactionLevel, WornHistoryEntry } from "./types";

/** value が満足度（1-5 の整数リテラル）か。 */
export function isSatisfactionLevel(value: unknown): value is SatisfactionLevel {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

/** computeLearningEligibility に必要な最小フィールド（entry / 生 record どちらでも渡せる）。 */
export type LearningEligibilityInput = Pick<WornHistoryEntry, "source" | "satisfaction" | "itemIds">;

export interface LearningEligibilityOptions {
  /**
   * 実在する wardrobe id 集合。 渡された場合のみ「itemIds が実在 id か」を厳格判定する。
   * 省略時は実在性を検証せず、 source / satisfaction / 非空 itemIds の構造判定に留める
   * （= 後から recompute で精緻化する前提）。 空集合を渡した場合は「実在 id なし」とみなす。
   */
  knownWardrobeIds?: Iterable<string>;
}

/**
 * 学習に使ってよいか（pure・storage 非接触）。
 *
 *   learningEligible =
 *     source ∈ {engine, calendar_form}        // mock / hydrated_mock は hard ban
 *     && satisfaction が 1-5
 *     && itemIds が非空
 *     && (knownWardrobeIds 指定時) 全 itemId が実在
 */
export function computeLearningEligibility(
  input: LearningEligibilityInput,
  options: LearningEligibilityOptions = {},
): boolean {
  const { source, satisfaction, itemIds } = input;

  // 1) mock / hydrated_mock は絶対に学習対象にしない（whitelist で二重に保証）。
  if (source !== "engine" && source !== "calendar_form") return false;

  // 2) 満足度がなければ学習しない（「satisfaction exists」）。
  if (!isSatisfactionLevel(satisfaction)) return false;

  // 3) itemIds が空なら学習しない。
  if (!Array.isArray(itemIds) || itemIds.length === 0) return false;

  // 4) knownWardrobeIds が与えられた場合のみ、 全 id が実在することを要求。
  if (options.knownWardrobeIds) {
    const known =
      options.knownWardrobeIds instanceof Set
        ? options.knownWardrobeIds
        : new Set(options.knownWardrobeIds);
    if (known.size === 0) return false;
    for (const id of itemIds) {
      if (!known.has(id)) return false;
    }
  }

  return true;
}

/** entry の learningEligible を（必要なら knownWardrobeIds 込みで）再計算した新 entry を返す（pure）。 */
export function recomputeLearningEligibility(
  entry: WornHistoryEntry,
  options: LearningEligibilityOptions = {},
): WornHistoryEntry {
  const learningEligible = computeLearningEligibility(entry, options);
  if (learningEligible === entry.learningEligible) return entry;
  return { ...entry, learningEligible };
}
