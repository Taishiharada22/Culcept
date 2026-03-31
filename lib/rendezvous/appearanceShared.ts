/**
 * 外見の好み — 恋愛・パートナー共通設定
 *
 * 外見の好みは恋愛とパートナーで共通の1セットとして扱う。
 * 片方で入力済みならもう片方では自動スキップ。
 * 保存先は rendezvous_ideal_partner_profiles の category="romantic" 行に統一。
 */

/**
 * 外見の好みの保存カテゴリ。
 * 恋愛でもパートナーでも、このカテゴリで読み書きする。
 */
export const APPEARANCE_SHARED_CATEGORY = "romantic" as const;

/**
 * 外見の好みが設定済みかどうかを判定する。
 * 顔型 or 体型が1つ以上選択されていれば「設定済み」。
 */
export function isAppearanceComplete(prefs: {
  appearancePriorityOrder?: string[] | null;
  preferredBodyTypes?: string[] | null;
  preferredFaceTypes?: string[] | null;
} | null | undefined): boolean {
  if (!prefs) return false;
  const hasFaceTypes =
    (prefs.appearancePriorityOrder?.length ?? 0) > 0 ||
    (prefs.preferredFaceTypes?.length ?? 0) > 0;
  const hasBodyTypes = (prefs.preferredBodyTypes?.length ?? 0) > 0;
  return hasFaceTypes || hasBodyTypes;
}
