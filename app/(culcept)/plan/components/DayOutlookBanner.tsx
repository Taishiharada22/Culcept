/**
 * DayOutlookBanner — Wave 2 Day Rehearsal の day-level outlook（選択日・presentation）
 *
 * 「今日のあなたの1日を先に試した」見通しを **1 行・仮説トーン**で出す。+ Evidence「なぜ?」disclosure。
 *
 * 不変原則（CEO/GPT 2026-06-06〜07）:
 *   - 仮説トーンのみ（〜かも / 〜そう / 〜ています）。fatigue/risk を事実・警告として断定しない。
 *   - 「疲れます」「危険です」「壊れます」「失敗」禁止。生スコア・raw 分数・level 名を出さない。
 *   - amber/orange/red を使わない（slate 中立）。viability unknown は出さない。
 *   - 「なぜ?」は **native <details>（read-only disclosure・default 閉）**。known/unknown/inferred を観測/推定/未確定で。
 *     evidence が弱い（行なし）なら出さない。timeline point marker は別 slice。
 */
import { explainDayOutlook } from "@/lib/plan/dayRehearsal/dayRehearsal";
import type { DayOutlookExplanation, DayRehearsal, ViabilityOutlook } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";

/** outlook → 仮説トーン copy（unknown は表示しないので除外）。 */
const OUTLOOK_COPY: Record<Exclude<ViabilityOutlook, "unknown">, string> = {
  holds: "今日はゆとりがありそうです",
  tight: "今日は予定が少し詰まりやすいかもしれません",
  breaks: "今日は余白が少なめで、移動と予定が重なりやすいかもしれません",
};

/** explanation → 自然な日本語の行（観測/推定/未確定・空カテゴリは省略・断定/生数字なし）。 */
function explanationLines(e: DayOutlookExplanation): string[] {
  const lines: string[] = [];
  if (e.observed.length > 0) lines.push(`この見通しは、${e.observed.join("・")}から見ています。`);
  if (e.inferred.length > 0) lines.push(`${e.inferred.join("・")}を加味しています（推定）。`);
  if (e.uncertain.length > 0) lines.push(`一部、${e.uncertain.join("・")}があります。`);
  return lines;
}

export function DayOutlookBanner({
  rehearsal,
  recoveryStepCount = 0,
}: {
  rehearsal: DayRehearsal | null;
  recoveryStepCount?: number;
}) {
  if (!rehearsal) return null;
  const outlook = rehearsal.viability.outlook;
  if (outlook === "unknown") return null; // 見通し不能 → 出さない
  const lines = explanationLines(explainDayOutlook(rehearsal, recoveryStepCount));
  return (
    <div
      data-testid="plan-day-outlook-banner"
      data-outlook={outlook}
      className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
      aria-label="今日の見通し（仮説）"
    >
      <span className="text-slate-400">今日の見通し · </span>
      {OUTLOOK_COPY[outlook]}
      {lines.length > 0 && (
        <details data-testid="plan-day-outlook-why" className="mt-1">
          <summary className="cursor-pointer list-none text-[11px] text-slate-400 underline">なぜ?</summary>
          <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
            {lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
