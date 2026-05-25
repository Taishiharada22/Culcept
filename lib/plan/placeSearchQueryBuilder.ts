/**
 * Phase 2-H: Place Search Query Builder (Pure helper)
 *
 * 設計書: docs/alter-plan-phase2-h-place-intent-candidate-search-mini-design.md §6
 *
 * 役割:
 *   title + locationText から、Google Places API へ送る最終的な textQuery を構築する。
 *   intentClassification の結果に応じて構築方針を分岐:
 *
 *     explicit_place    → textQuery = locationText (= 既存 Phase 2-D 挙動)
 *     intent_with_area  → textQuery = `${locationText} ${title}` (= 場所 → 行為の順)
 *     intent_only       → textQuery = title (= bias で area 補正)
 *     ambiguous         → textQuery = "" (= 候補検索しない、 panel 非表示)
 *
 * 不変原則:
 *   - pure (no fetch / no Date / 入力 mutate なし)
 *   - 既存 query max length (= 300 chars、Phase 2-D server-side validation) を尊重
 *   - 300 超なら explicit_place fallback (= locationText のみ送信、title 捨てる)
 *   - Privacy: textQuery 構築のみ、anchor metadata は組み込まない
 */

import type { LocationCategory } from "@/lib/plan/location-category";
import { classifyPlaceIntent, type IntentType } from "@/lib/plan/intentClassification";
import { inferLocationCategory } from "@/lib/plan/categoryInference";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Places API へ送信される最大 query 長 (Phase 2-D server-side validation と整合)。
 * combine 結果が 300 超なら explicit_place fallback (= title を捨て locationText のみ)。
 */
export const MAX_QUERY_LENGTH = 300;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PlaceSearchQuery {
  /** 最終的に Places API に渡される textQuery (= 空文字なら検索しない) */
  textQuery: string;
  /** intent type の判定結果 (UI 透明性用、panel header 文言に使用) */
  intentType: IntentType;
  /** category inference 結果 (UI suggestion 用、null = 推定不能) */
  inferredCategory: LocationCategory | null;
}

/**
 * Place Search Query Builder — title + locationText から構築。
 *
 * @param title anchor.title (= 予定名、trim 前)
 * @param locationText anchor.locationText (= 場所、trim 前)
 * @returns PlaceSearchQuery (textQuery / intentType / inferredCategory)
 */
export function buildPlaceSearchQuery(args: {
  title: string;
  locationText: string;
}): PlaceSearchQuery {
  const title = args.title.trim();
  const locationText = args.locationText.trim();

  const intentType = classifyPlaceIntent({ title, locationText });
  const inferredCategory = inferLocationCategory(title);

  let textQuery: string;

  switch (intentType) {
    case "explicit_place":
      // 既存 Phase 2-D 挙動: locationText をそのまま検索
      textQuery = locationText;
      break;

    case "intent_with_area": {
      // 場所 → 行為の順で combine (= Google Places API 整合、§6.3)
      const combined = `${locationText} ${title}`;
      // 300 超なら explicit_place fallback (= title 捨て locationText のみ)
      textQuery = combined.length <= MAX_QUERY_LENGTH ? combined : locationText;
      break;
    }

    case "intent_only":
      // locationText 空、title のみで検索 (= biasing で area 補正)
      textQuery = title;
      break;

    case "ambiguous":
      // 候補検索しない (= panel 非表示)
      textQuery = "";
      break;
  }

  return {
    textQuery,
    intentType,
    inferredCategory,
  };
}
