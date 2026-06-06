/**
 * DayOutlookBanner — Wave 2 Day Rehearsal の day-level outlook（選択日・presentation）
 *
 * 「今日のあなたの1日を先に試した」見通しを **1 行・仮説トーン**で出す。Day Rehearsal の初回 UI 露出。
 *
 * 不変原則（CEO/GPT 2026-06-06）:
 *   - 仮説トーンのみ（〜かも / 〜そう）。fatigue/risk を事実・警告として断定しない。
 *   - 「疲れます」「危険です」「壊れます」禁止。生スコア・raw 分数を出さない。
 *   - amber/orange/red を使わない（feasibility 警告色と分離・slate 中立）。
 *   - viability unknown（見通し不能）は **出さない**（過剰主張/ノイズ回避）。副作用なし・READ のみ。
 *   - timeline point marker は別 slice（本コンポーネントは day-level の 1 行のみ）。
 */
import type { DayRehearsal, ViabilityOutlook } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";

/** outlook → 仮説トーン copy（unknown は表示しないので除外）。 */
const OUTLOOK_COPY: Record<Exclude<ViabilityOutlook, "unknown">, string> = {
  holds: "今日はゆとりがありそうです",
  tight: "今日は予定が少し詰まりやすいかもしれません",
  breaks: "今日は余白が少なめで、移動と予定が重なりやすいかもしれません",
};

export function DayOutlookBanner({ rehearsal }: { rehearsal: DayRehearsal | null }) {
  if (!rehearsal) return null;
  const outlook = rehearsal.viability.outlook;
  if (outlook === "unknown") return null; // 見通し不能 → 出さない
  return (
    <div
      data-testid="plan-day-outlook-banner"
      data-outlook={outlook}
      className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
      aria-label="今日の見通し（仮説）"
    >
      <span className="text-slate-400">今日の見通し · </span>
      {OUTLOOK_COPY[outlook]}
    </div>
  );
}
