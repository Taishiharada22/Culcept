/**
 * PersonRef — PR-11 Who Staircase 型予約
 *
 * 位置づけ:
 *   event.who[] が現在 string[] で保持している「同行者名」を、PR-11 で
 *   PersonRef[] に昇格するための型。commit 13 では型定義のみ。
 *
 * 設計書:
 *   - docs/alter-morning-pr10-14-interface-reservation.md §2
 *
 * 後続 PR との握り:
 *   - scope: "session" は session ローカル、"persistent" は DB (supabase) に保存
 *   - createdInSession は migration 追跡用（cross-session match debug）
 *
 * 凍結規則:
 *   - 本 file に関数・class を追加してはいけない（PR-11 本体で追加）
 *   - 型定義のみ
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PersonRef
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PersonRef {
  /** 一意 ID（user scope、別ユーザーとは共有しない） */
  personId: string;
  /** 正規化された表示名（「A さん」「お母さん」等） */
  canonicalName: string;
  /** 別名（発話揺れ: 「A ちゃん」「A」等） */
  aliases: string[];
  /** 関係ラベル（任意、family / friend / colleague 等）。未分類時 null */
  relation: string | null;
  /** cross-session 参照可能か（session ローカル or persistent） */
  scope: "session" | "persistent";
  /** 作成元 session */
  createdInSession: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PersonRefExtraction — 発話から同定したときの候補情報
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PersonRefExtraction {
  /** 抽出文字列（「A さんと」） */
  rawMention: string;
  /** 正規化された candidate ref（既存 match or 新規）。一致不能時 null */
  resolved: PersonRef | null;
  /** 一致確信度 */
  confidence: "exact" | "fuzzy" | "new";
}
