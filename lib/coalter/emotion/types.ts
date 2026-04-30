/**
 * CoAlter Bug-1 §4.1 — EmotionTag 型定義（正本）
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §4.1
 *
 * 設計原則:
 * - 感情タグは retrieval の排他ゲートではない（§2.1）。narration / reasoning 用。
 * - hard filter として使用しない（§5.1）。polarity=negative でも positive 候補を drop しない。
 * - EmotionCategory は意図的に 4 値に限定（偽の精密さを排除、§7.4）。
 * - confidence フィールドは今回非採用（§4.1 意図的に持たないフィールド）。
 */

/** 感情タグの分類。retrieval には影響しない。narration / reasoning 用 */
export type EmotionCategory = "mood" | "indecision" | "relation" | "friction";

/** 感情の極性（任意、lexeme から簡易推定）。hard filter 禁止 */
export type EmotionPolarity = "positive" | "negative" | "neutral";

/**
 * 会話から抽出された感情タグ。
 *
 * - 排他ゲートではない。retrieval の shouldSearch には影響させない（§2.1 / §2.4）。
 * - narration / proposalGenerator が導入文や bridge で参照する（§2.5）。
 * - 複数カテゴリを並列に保持する（「気分」と「迷い」は両立する）。
 */
export interface EmotionTag {
  /** カテゴリタグ */
  tag: EmotionCategory;
  /** hit した literal 語（例: "気分" / "迷う"）— telemetry / narration 用 */
  source_lexeme: string;
  /** どちらの発話に含まれたか */
  speaker: "user_a" | "user_b" | "both" | "unknown";
  /** 感情極性（任意）。lexeme から決まる場合のみ付ける */
  polarity?: EmotionPolarity;
}
