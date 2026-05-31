/**
 * bridge POST payload / outcome helpers（pure・server 依存なし＝単体テスト可能）。
 *
 * 22P02 fix の中核:
 *   - DB 列 `user_style_summary.wardrobe_categories` は `text[]`（migration 20260326300000）。
 *   - だが `deriveSyncSignals().summary.wardrobeCategories` は countBy の **オブジェクト**（{tops:3,…}）。
 *     これを `text[]` 列へ送ると Postgres `22P02 (expected JSON array)` で styleSummary upsert が失敗し、
 *     同梱の `quiz_result.myStyleState.wardrobe`（=ワードローブ本体）が**永続化されない**。
 *   - 列型に合わせて **string[]**（カテゴリキー列）へ正規化して送る（migration はしない）。
 */

/**
 * `wardrobe_categories`（text[] 列）へ安全に入れられる string[] へ正規化する。
 *   - object → 非空キー（Object.keys）
 *   - array  → 文字列・非空要素のみ sanitize
 *   - null / undefined / その他 → []
 */
export function wardrobeCategoriesToTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  }
  if (value !== null && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).filter((k) => k.trim().length > 0);
  }
  return [];
}

/**
 * 2 つの upsert（styleSummary / prefProfile）の失敗集合から HTTP status を決める。
 *
 *   - **styleSummary 失敗 → 500**: styleSummary は `quiz_result.myStyleState.wardrobe` を含むため、
 *     失敗を握り潰すと add/delete がサーバに保存されないのに client が成功と誤認する。 必ずエラーにする。
 *   - **prefProfile のみ失敗 → 200**: wardrobe は保存済みで非致命。 partialFailures で明示しつつ成功扱い。
 *   - 失敗なし → 200。
 */
export function bridgeWriteHttpStatus(failures: readonly string[]): 200 | 500 {
  return failures.includes("styleSummary") ? 500 : 200;
}
