/**
 * Phase 2-H: Category Inference (Pure helper)
 *
 * 設計書: docs/alter-plan-phase2-h-place-intent-candidate-search-mini-design.md §5
 *
 * 役割:
 *   anchor の title (= 予定名) から LocationCategory を **推定** する。
 *   既存 8 値の範囲内、推定不能は null。 結果は AnchorFormFields の suggestion chip に表示。
 *
 * 不変原則:
 *   - pure (no fetch / no Date / 入力 mutate なし)
 *   - 補助のみ (= 自動 set しない、user が select で覆せる)
 *   - 推定不能なら null (= 「歯医者」 「病院」 等、 既存 enum に該当なしの場合も null)
 *   - LocationCategory enum 不変 (= 8 値: home / office / school / cafe / outdoor / public / transit / unknown)
 */

import type { LocationCategory } from "@/lib/plan/location-category";
import { CATEGORY_INFERENCE_KEYWORDS } from "@/lib/plan/categoryInferenceMap";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * title から LocationCategory を推定。
 *
 * 判定:
 *   - CATEGORY_INFERENCE_KEYWORDS を priority 順 evaluate
 *   - 最初に match した category を返す
 *   - 何も match しない → null (= 推定不能、user が select で選ぶ)
 *   - title 空 / whitespace-only → null
 *
 * @param title anchor.title (= 予定名)
 * @returns LocationCategory or null
 */
export function inferLocationCategory(title: string): LocationCategory | null {
  if (!title) return null;
  const t = title.trim();
  if (!t) return null;

  for (const entry of CATEGORY_INFERENCE_KEYWORDS) {
    for (const keyword of entry.keywords) {
      if (t.includes(keyword)) {
        return entry.category;
      }
    }
  }

  return null;
}
