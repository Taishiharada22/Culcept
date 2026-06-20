/**
 * ImportedSourceBadge — シフト表画像取り込み（shift_image）由来の控えめな「取込」由来表示
 *
 * 位置づけ: これは **警告ではなく provenance（由来表示）**。
 *   ユーザーが「この勤務/休みは画像から取り込んだもの」と手動入力と区別できるようにする。
 *
 * 不変原則:
 *   - 強調しない（muted slate・小さい・薄い border）。amber/orange/red は使わない
 *     （A1 confusable / A4 mismatch の feasibility/警告色と分離する）。
 *   - 保存 block しない・副作用なし・presentation のみ。
 *   - 文言は短く。日/月 view = 「取込」、週 view（密）= 「取」を label prop で切替。
 *   - title / aria-label は常に「シフト取込」で一定（密度に依らず意味が読める）。
 */

export function ImportedSourceBadge({
  label = "取込",
  className = "",
}: {
  /** 表示文言。既定「取込」。週 view など密な面では「取」を渡す */
  label?: string;
  className?: string;
}) {
  return (
    <span
      data-testid="imported-source-badge"
      data-imported-source="shift_image"
      className={`inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1 py-px text-[9px] font-medium leading-none text-slate-400 ${className}`}
      title="シフト取込"
      aria-label="シフト取込"
    >
      {label}
    </span>
  );
}
