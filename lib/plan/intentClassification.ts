/**
 * Phase 2-H: Place Intent Classification (Pure helper)
 *
 * 設計書: docs/alter-plan-phase2-h-place-intent-candidate-search-mini-design.md §4
 *
 * 役割:
 *   anchor の title (= 予定名) + locationText (= 場所) から、4 階層の IntentType を判定する。
 *   後段の placeSearchQueryBuilder が IntentType に応じて textQuery を構築する。
 *
 * 不変原則 (CEO + GPT 補正 + mini design 厳守):
 *   - pure (no fetch / no Date / 入力 mutate なし)
 *   - regex / keyword based (= dep / env なし、ML / LLM 不使用)
 *   - 強制せず補助 (= 誤判定でも user は手入力で覆せる、helper は補助のみ)
 *   - title 短すぎ (= 1 文字) は ambiguous 扱い (= 過剰トリガー回避)
 */

import { EXPLICIT_PLACE_KEYWORDS } from "@/lib/plan/explicitPlaceKeywords";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** title が short すぎて intent_only として扱わない最小長 */
const MIN_INTENT_TITLE_LENGTH = 2;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 4 階層 Intent Type (= mini design §2.2)
 *
 * - explicit_place:   locationText に明確な施設名 / 店舗名 / chain 名キーワード
 *                     → locationText をそのまま検索 (既存 Phase 2-D 挙動)
 * - intent_with_area: title (= 行為) + locationText (= エリア名)
 *                     → `${locationText} ${title}` で combine 検索
 * - intent_only:      title あり、locationText 空
 *                     → title のみで検索、bias は baseline
 * - ambiguous:        title 空 / 短すぎ、locationText 空
 *                     → 候補検索しない (= panel 非表示)
 */
export type IntentType =
  | "explicit_place"
  | "intent_with_area"
  | "intent_only"
  | "ambiguous";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * locationText が「明確な施設名 / 店舗名」 を含むか判定。
 * EXPLICIT_PLACE_KEYWORDS のいずれかが includes される → true。
 *
 * 注: 入力空 / whitespace-only は false (= explicit_place としない)。
 */
function hasExplicitPlaceKeyword(locationText: string): boolean {
  if (!locationText) return false;
  const t = locationText.trim();
  if (!t) return false;
  for (const k of EXPLICIT_PLACE_KEYWORDS) {
    if (t.includes(k)) return true;
  }
  return false;
}

/**
 * Place Intent Classification — 4 階層判定。
 *
 * 判定順:
 *   1. locationText に explicit keyword → explicit_place (= title あっても優先)
 *   2. title 空 / 短すぎ → ambiguous (= title だけで考えても判定不能)
 *   3. locationText 空 → intent_only (= title だけある)
 *   4. それ以外 → intent_with_area (= 両方ある、 locationText はエリア名と推定)
 *
 * @param title anchor.title (= 予定名)
 * @param locationText anchor.locationText (= 場所、free text or canonical)
 * @returns IntentType
 */
export function classifyPlaceIntent(args: {
  title: string;
  locationText: string;
}): IntentType {
  const title = args.title.trim();
  const locationText = args.locationText.trim();

  // 1. locationText が明確な施設名 → explicit_place 優先
  if (hasExplicitPlaceKeyword(locationText)) {
    return "explicit_place";
  }

  // 2. title 空 / 短すぎ
  if (!title || title.length < MIN_INTENT_TITLE_LENGTH) {
    // locationText が短く / 空でも explicit_place ではないので、ambiguous
    // (= 既存 Phase 2-D 挙動とは別: 場所だけ「abc」 のような短い free text は ambiguous 扱い)
    // ただし locationText が non-empty なら既存 Phase 2-D に近い挙動を保つため explicit_place 以外でも候補検索を行いたい
    // → title 空かつ locationText non-empty は「explicit_place ではない場所単独」 と判定、後段 query builder で locationText 単独 query 化
    // それを意味的に explicit_place と同視するか別 type にするかは設計判断
    // 採用: title 空 + locationText non-empty → explicit_place (= 既存 Phase 2-D 挙動完全互換)
    if (locationText.length > 0) {
      return "explicit_place";
    }
    return "ambiguous";
  }

  // 3. locationText 空 → intent_only
  if (!locationText) {
    return "intent_only";
  }

  // 4. 両方ある、 locationText はエリア名と推定
  return "intent_with_area";
}
