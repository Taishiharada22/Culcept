/**
 * Slice 1 — section 見出し (presentational pure)
 *
 * 参照画像の各 section ラベル (今日の予定 / おすすめコーデ / ...) を控えめに描く。
 */

import { CAL_OUTFIT_PALETTE } from "./_palette";

export function SectionHeader({
  title,
  hint,
  action,
  testid,
}: {
  title: string;
  hint?: string;
  /** 右肩のアクションリンク (例: 「タイムラインで確認 >」「詳細を見る >」) */
  action?: { label: string; onClick?: () => void };
  testid?: string;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between px-1" data-testid={testid}>
      <h3 className={`text-sm font-semibold ${CAL_OUTFIT_PALETTE.heading}`}>{title}</h3>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center gap-0.5 rounded text-xs font-medium text-violet-600 transition hover:text-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        >
          {action.label}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 18l6-6-6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : (
        hint && <span className={`text-xs ${CAL_OUTFIT_PALETTE.subtle}`}>{hint}</span>
      )}
    </div>
  );
}
