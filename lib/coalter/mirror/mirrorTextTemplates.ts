/**
 * CoAlter AOO Phase B B-5b — Mirror Text Templates (State Mirror only, hedged form)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §5 / §6.5
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.5
 *
 * 役割 (B-5b 段階):
 *   visible Mirror surface に表示する **template 文字列** を const literal table として
 *   定義する。logic は持たない (純粋なデータ層)。
 *
 * 設計原則 (Phase B 北極星「黙る・誤読を避ける」):
 *   - **State Mirror category only** (B-5b canary 段階):
 *       Difference / Tempo / Fairness / Repair 系は Phase C 以降、本 file に追加しない
 *   - **hedged hypothesis form を design-time で保証**:
 *       全 template が以下のいずれかの grammar に従う:
 *         - 「〜のような気がしました」「〜という印象でした」
 *         - 「〜という雰囲気でした」「〜そんな感覚があります」
 *         - 「〜という感じが、ありました」
 *       いずれも **断定形 / 命令形 / 疑問形 / 提案形 / 共感演技 を構造的に含まない**
 *   - **≤ 40 文字** (postSpeakVerification の length < 60 char limit を design-time で
 *     余裕を持ってクリア、UI の glassmorphism 領域で 1-2 行に収まる):
 *       runtime check は postSpeakVerification.test の length check で保証
 *   - **enum-locked id**: `VisibleMirrorTemplateId` literal union に登録された 5 値のみ
 *
 * 不可侵境界:
 *   - 既存 presence layer / observer layer / chat layer touch なし
 *   - B-1〜B-5a zero diff (本 file は新規)
 *   - Question / Proposal / Suggestion grammar 一切含まない
 *   - LLM 生成 / 動的 string concat なし (const literal のみ)
 *   - 全 template は CEO レビュー対象 (Phase B canary 開始前)
 *
 * 拡張ルール (将来 Phase C):
 *   - 新規 template 追加時は本 file + `VisibleMirrorTemplateId` 型の両方を更新
 *   - 必ず CEO 承認 + grammar review を経る
 *   - 新規 category (Difference / Tempo etc) 追加時は別 file 分離検討
 */

import type {
  VisibleMirrorTemplate,
  VisibleMirrorTemplateId,
} from "./visibleMirrorTypes";

/**
 * State Mirror templates (5 entries, hedged hypothesis form)。
 *
 * 各 entry の design-time invariant:
 *   - `text.length ≤ 40` (postSpeakVerification の `< 60` を余裕でクリア)
 *   - 疑問符 (`?`, `？`) を**含まない**
 *   - 命令形末尾 (「しろ」「して」「べき」「なさい」「ましょう」) を**含まない**
 *   - 共感演技句 (「わかります」「気持ちわかる」「同じ」「私も」) を**含まない**
 *   - 提案形 (「みては」「みたら」「みよう」「するといい」) を**含まない**
 *   - 末尾は hedged form (「気がしました」「印象でした」「感覚があります」「感じが、ありました」)
 */
export const MIRROR_TEXT_TEMPLATES: ReadonlyArray<VisibleMirrorTemplate> = [
  {
    id: "state_mirror_pause",
    text: "少し、間がほしいような…そんな雰囲気でした",
    grammarTags: ["hedged", "state_mirror", "reflection_only", "no_imperative", "no_question"],
  },
  {
    id: "state_mirror_unsettled",
    text: "なにかが揺れている、そんな印象でした",
    grammarTags: ["hedged", "state_mirror", "reflection_only", "no_imperative", "no_question"],
  },
  {
    id: "state_mirror_preverbal",
    text: "まだ言葉になっていない感じが、ありました",
    grammarTags: ["hedged", "state_mirror", "reflection_only", "no_imperative", "no_question"],
  },
  {
    id: "state_mirror_holding",
    text: "なにかを抱えているような、そんな気がしました",
    grammarTags: ["hedged", "state_mirror", "reflection_only", "no_imperative", "no_question"],
  },
  {
    id: "state_mirror_threshold",
    text: "少し、立ち止まっているような感覚があります",
    grammarTags: ["hedged", "state_mirror", "reflection_only", "no_imperative", "no_question"],
  },
] as const;

/**
 * Template id → template entry の O(1) lookup map (immutable)。
 *
 * caller (mirrorTextGenerator) は本 map 経由で id resolution する。
 */
export const MIRROR_TEXT_TEMPLATE_BY_ID: ReadonlyMap<
  VisibleMirrorTemplateId,
  VisibleMirrorTemplate
> = new Map(MIRROR_TEXT_TEMPLATES.map((t) => [t.id, t]));

/**
 * **Test only**: template 数 (= 5) を取得。
 *
 * Phase C 以降の追加でも、本 const を更新せず実 length を test で参照する形にしてある。
 */
export function __getTemplateCountForTest(): number {
  return MIRROR_TEXT_TEMPLATES.length;
}
