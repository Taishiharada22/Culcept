/**
 * 予算金額の表示整形（pure・決定論）。
 *
 * 役割: budget band の上限（円・整数）を、日本語 UI に馴染む文字列へ。
 *   - 1 万円以上 → **万円**へ丸め（端数 49999→「5万円」/ 15000→「1.5万円」）。
 *   - 1 万円未満 → 3 桁区切り「8,000円」。
 *
 * honesty: これは **表示の丸め**であって金額の捏造ではない（band の上限は engine が保持し続ける）。
 *   proposal prose（proposal-builder）と CoAlter VM のバッジが **同一関数**を使うことで、
 *   同一カード内で「~49999円」と「〜5万円」が食い違う不整合を構造的に防ぐ。
 *
 * @param hi 予算上限（円・整数）。
 * @returns 単位付きの金額のみ（接頭の「〜」「予算 ~」は呼び出し側が付ける）。例: "5万円" / "8,000円"。
 */
export function formatBudgetYen(hi: number): string {
  if (hi >= 10000) {
    const man = Math.round((hi / 10000) * 10) / 10; // 0.1 万単位で丸め
    const label = Number.isInteger(man) ? `${man}` : man.toFixed(1);
    return `${label}万円`;
  }
  return `${Math.max(0, Math.round(hi)).toLocaleString("ja-JP")}円`;
}
