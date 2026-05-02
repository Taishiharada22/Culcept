/**
 * Label Classification (PR B-3b Commit 1)
 *
 * CEO/GPT 2026-05-03 PR B-3 audit doc (B-3a) 確定方針:
 *   `known_label_only` な journeyOrigin / journeyEnd の label を 4 種に分類し、
 *   Places API 経由の grounding を起動するか否かを判定する。
 *
 * 4 分類 (audit doc §4.1 / §4.2):
 *   - public_poi_proper_noun: Places API で解決可能 (例: 「東京駅」「サドヤ」)
 *   - generic_category:       anchor 必須、narrowStep paradigm (例: 「ホテル」「カフェ」)
 *   - private_semantic:       Places API NG (例: 「自宅」「会社」「友達の家」)
 *   - ambiguous_or_demonstrative: 文脈依存 (例: 「あそこ」「その辺」)
 *
 * 重要規律 (CEO/GPT 2026-05-03 確定):
 *   - private_semantic を Places API に流すのは **禁止**
 *     (= 公開施設の「自宅」 を検索しても本人の自宅ではない、意味的破綻)
 *   - generic_category の「ホテル」 だけで即「どのホテル？」 と聞くのは禁止
 *     (= 質問アプリ化防止、known_label_only のまま保持)
 *   - public_poi_proper_noun のみ同 turn で grounding 起動可
 *
 * scope (PR B-3b):
 *   - 純関数 classifyLabel (本 file)
 *   - 副作用なし、test 容易
 *   - 4 分類 × 代表サンプルで test fixture 化
 *
 * out of scope:
 *   - PresentationTarget 型 (Commit 2)
 *   - dialogReducer 拡張 (Commit 3)
 *   - placesHandoffOrchestrator 統合 (Commit 4)
 *   - candidate selection 後の anchor 更新 (B-3c)
 *   - derivedFrom / AnchorSource type 分離 (B-3d)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type LabelClassification =
  | "public_poi_proper_noun"
  | "generic_category"
  | "private_semantic"
  | "ambiguous_or_demonstrative";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants — 分類 vocabulary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * private_semantic 判定 regex 群 (CEO/GPT 2026-05-03 確定):
 *
 * Places API に流してはいけない label。本人個別の意味を持ち、公開施設検索では
 * 解決できない。
 *   - 自宅系: "自宅", "うち", "家", "実家"
 *   - 職場系: "会社", "職場", "オフィス", "学校", "大学", "事務所"
 *   - 関係系: "友達/彼/彼女/親 + の + 家/うち/ところ"
 *
 * 規律: 「自宅」 のみ B-3 で saved places (= userHomeLat/Lng) で resolve 可。
 *       「会社」 「友達の家」 等は known_label_only 維持、別 PR で saved_places table
 *       追加時に対応。
 */
const PRIVATE_SEMANTIC_REGEX_LIST: ReadonlyArray<RegExp> = [
  // 自宅系: 完全一致 (= 末尾までマッチ、複合語 "自宅オフィス" は弾く)
  /^(自宅|うち|家|実家)$/,
  // 職場系: 末尾マッチ (= 「会社」「私の会社」 等)
  /(会社|職場|オフィス|学校|大学|事務所)$/,
  // 関係系: 「友達の家」「彼の家」 等
  /(友達|彼|彼女|親|父|母|兄|姉|妹|弟)の(家|うち|ところ)$/,
];

/**
 * ambiguous_or_demonstrative 判定 regex 群:
 *
 * 文脈依存・指示語・代名詞。Places API では解決不可能。
 * 例: 「あそこ」「その辺」「いつもの」「どこか」
 */
const AMBIGUOUS_REGEX_LIST: ReadonlyArray<RegExp> = [
  // 指示語 prefix: 「あそこ」「そこ」「ここ」「あの場所」
  /^(あそこ|そこ|ここ|あの場所|その場所|この場所)$/,
  // 「その辺」「あの辺」 系
  /^(その辺|あの辺|この辺|そっちの方|あっちの方)$/,
  // 代名詞・頻度語: 「いつもの」「どこか」
  /^(いつもの|どこか|どこでも)/,
];

/**
 * generic_category 判定の vocabulary (CEO/GPT 2026-05-03 確定):
 *
 * Places API 検索可能だが anchor (= 地域 / chain) との組み合わせが必須。
 * 単独では候補無限大、grounding 起動しない。
 *
 * audit doc §4.2 で挙げた典型例:
 *   ホテル / カフェ / コンビニ / レストラン / 居酒屋 / 公園 / ジム / etc.
 *
 * 完全一致のみ (= 「カフェ」 はマッチ、「スターバックス」 や「ホテル ANA」 は public POI)。
 */
const GENERIC_CATEGORIES: ReadonlySet<string> = new Set([
  "ホテル",
  "カフェ",
  "コンビニ",
  "レストラン",
  "居酒屋",
  "公園",
  "ジム",
  "美容院",
  "病院",
  "クリニック",
  "スーパー",
  "ドラッグストア",
  "本屋",
  "書店",
  "薬局",
  "銀行",
  "郵便局",
]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// classifyLabel — pure 関数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * label を 4 分類のいずれかに判定する純関数。
 *
 * 判定順序 (CEO/GPT 2026-05-03 規律):
 *   1. private_semantic (= Places API NG が最優先、誤検索を防ぐ)
 *   2. ambiguous_or_demonstrative (= 指示語、文脈依存)
 *   3. generic_category (= 完全一致 vocabulary)
 *   4. それ以外 → public_poi_proper_noun (= 検証可能性高い)
 *
 * 不変条件:
 *   - 副作用なし、純関数
 *   - 入力 trim 推奨 (caller 責務)、本関数も内部で trim
 *   - 空文字 / 空白のみ → "ambiguous_or_demonstrative" (defensive、grounding しない)
 *
 * @param label 判定対象 (例: "ホテル", "東京駅", "自宅", "あそこ")
 * @returns 4 分類のいずれか
 */
export function classifyLabel(label: string): LabelClassification {
  const trimmed = label?.trim() ?? "";

  // 空文字 / 空白のみ → grounding しない (defensive)
  if (trimmed === "") return "ambiguous_or_demonstrative";

  // 1. private_semantic 判定 (= Places API NG、最優先)
  for (const regex of PRIVATE_SEMANTIC_REGEX_LIST) {
    if (regex.test(trimmed)) return "private_semantic";
  }

  // 2. ambiguous_or_demonstrative 判定 (= 指示語、文脈依存)
  for (const regex of AMBIGUOUS_REGEX_LIST) {
    if (regex.test(trimmed)) return "ambiguous_or_demonstrative";
  }

  // 3. generic_category 判定 (= 完全一致 vocabulary)
  if (GENERIC_CATEGORIES.has(trimmed)) return "generic_category";

  // 4. それ以外は public POI と推定 (Places API で検証可能)
  return "public_poi_proper_noun";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// shouldGroundLabel — grounding 起動判定 helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 同 turn で grounding (= Places API candidate 提示) を起動すべきか判定。
 *
 * CEO/GPT 2026-05-03 確定方針:
 *   - public_poi_proper_noun: ✅ 同 turn 起動可
 *   - generic_category:       ❌ 起動しない (anchor/chain 待ち、known_label_only 維持)
 *   - private_semantic:       ❌ Places API に流さない
 *   - ambiguous:              ❌ grounding しない
 *
 * 重要規律:
 *   - 「ホテル」 だけで即「どのホテル？」 と聞くのは禁止 (= 質問アプリ化防止)
 *   - generic_category は次 turn 以降にユーザーが anchor を追加発話した時に
 *     既存 narrowStep paradigm で拾う (= 本関数は false を返すだけ)
 *
 * @param classification classifyLabel の結果
 * @returns true なら同 turn で candidate 提示起動、false なら known_label_only 維持
 */
export function shouldGroundLabel(
  classification: LabelClassification,
): boolean {
  return classification === "public_poi_proper_noun";
}
