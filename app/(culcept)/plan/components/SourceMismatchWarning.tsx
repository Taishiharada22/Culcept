/**
 * SR A4-3 — source/result 不一致(P1) warning banner（presentational・pure）
 *
 * 役割: A4 guard が検出した「空欄だが原稿セルに視覚的内容がある」日を、safe-copy の warning として表示する。
 *   保存は止めない（soft）。ShiftReviewGrid から `days`（不一致 day 群）を受けて描画するだけ。
 *
 * 文言（CEO/GPT A4-3 確定）: 避ける語（誤/間違/失敗/エラー）を含まない。
 * 不変: hooks/IO/DOM副作用なし・days 空なら null（表示なし）。
 */

export const SOURCE_MISMATCH_WARNING_COPY =
  "原稿セルに記載がある可能性があります。該当日を原稿と照合してください。";

export function SourceMismatchWarning({
  days,
}: {
  days: readonly number[];
}): React.ReactElement | null {
  if (!days || days.length === 0) return null;
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  return (
    <div
      data-testid="shift-review-source-mismatch-warning"
      data-source-mismatch-days={sorted.join(",")}
      className="mb-3 rounded-xl border border-amber-300 bg-amber-50/80 px-3 py-2 text-[11px] leading-relaxed text-amber-800"
    >
      {SOURCE_MISMATCH_WARNING_COPY}
    </div>
  );
}
