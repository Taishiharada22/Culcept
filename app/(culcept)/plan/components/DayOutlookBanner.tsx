/**
 * DayOutlookBanner — Wave 2 Day Rehearsal の day-level outlook（選択日・presentation）
 *
 * 「今日のあなたの1日を先に試した」見通しを **1 行・仮説トーン**で出す。+ Evidence「なぜ?」+ Repair「どうするとよさそう?」disclosure。
 *
 * 不変原則（CEO/GPT 2026-06-06〜07）:
 *   - 仮説トーンのみ（〜かも / 〜そう / 〜ています）。fatigue/risk を事実・警告として断定しない。
 *   - 「疲れます」「危険です」「壊れます」「失敗」禁止。生スコア・raw 分数・level 名を出さない。
 *   - amber/orange/red を使わない（slate 中立）。viability unknown は出さない。
 *   - 「なぜ?」「どうするとよさそう?」は **native <details>（read-only disclosure・default 閉）**。
 *   - ★Repair 候補は **read-only の示唆テキストのみ**。ボタン/適用/保存/チェック等の実行 UI を一切置かない（予定変更でない）。
 *     copy は generateDayRepairCandidates の suggestion をそのまま使う（ad-hoc copy なし）。0 件なら disclosure を出さない。
 */
import { explainDayOutlook } from "@/lib/plan/dayRehearsal/dayRehearsal";
import type { DayOutlookExplanation, DayRehearsal, ViabilityOutlook } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";
import type { DayRepairCandidate, DayRepairKind } from "@/lib/plan/dayRehearsal/dayRepairCandidates";

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
  repairCandidates = [],
  simulationLineByKind,
  contextReason = null,
  a3ReasonLines = [],
}: {
  rehearsal: DayRehearsal | null;
  recoveryStepCount?: number;
  /** Repair Candidate v0: read-only 対処候補（優先度順・最大3・表示のみ）。0 件なら disclosure を出さない。 */
  repairCandidates?: readonly DayRepairCandidate[];
  /**
   * ★What-if v0 UI（最小・非冗長）: kind→「試すと…」短文。**leave_earlier のみ**・新情報がある時だけ供給される。
   * read-only 表示テキストのみ（apply/save/実行 UI なし）。不在 kind は非表示。生数値/confidence は含まない。
   */
  simulationLineByKind?: ReadonlyMap<DayRepairKind, string>;
  /**
   * ★A2-3 Context Modifier: 今日の文脈 reason 行（仮説トーン・数字フリー・sensitive-free）。
   * contextReasonLine（pure）の出力をそのまま受ける。null/空 → 非表示（沈黙原則）。
   * ★これは copy のみ。viability/outlook など rehearsal の数値判定には一切影響しない。
   */
  contextReason?: string | null;
  /**
   * ★A3 What-if（inverse / comparison）reason-only 行（最大 2・仮説トーン・数字なし・最適案/断定なし）。
   * flag-gated・computed は CalendarTab 側。copy のみ・rehearsal の scoring/marker/candidate 生成に影響しない。
   * 空 → 沈黙（沈黙原則）。
   */
  a3ReasonLines?: readonly string[];
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
      {/* ★A2-3: 今日の文脈 reason（あれば）。copy のみ・outlook 判定に影響しない・null は沈黙。 */}
      {contextReason && (
        <div data-testid="plan-day-outlook-context" className="mt-1 text-[11px] text-slate-500">
          <span className="text-slate-400">今日の文脈 · </span>
          {contextReason}
        </div>
      )}
      {/* ★A3 What-if: inverse（守る意味）/ comparison（診断レンズ）の reason-only 行（最大 2・copy のみ・空は沈黙）。 */}
      {a3ReasonLines.length > 0 && (
        <div data-testid="plan-day-outlook-a3" className="mt-1 space-y-0.5 text-[11px] text-slate-500">
          <span className="text-slate-400">もしもの見立て · </span>
          {a3ReasonLines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
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
      {repairCandidates.length > 0 && (
        <details data-testid="plan-day-outlook-repair" className="mt-1">
          <summary className="cursor-pointer list-none text-[11px] text-slate-400 underline">どうするとよさそう？</summary>
          {/* ★read-only：示唆テキストのみ。ボタン/適用/保存/チェック等の実行 UI は置かない。 */}
          <ul className="mt-1 space-y-0.5 text-[11px] text-slate-500 list-none">
            {repairCandidates.map((c, i) => {
              const simLine = simulationLineByKind?.get(c.kind);
              return (
                <li key={i} data-repair-kind={c.kind}>
                  {c.suggestion}
                  {/* ★What-if v0: 候補文の下に小さく 1 行（read-only・実行 UI なし・leave_earlier のみ供給される）。 */}
                  {simLine && (
                    <span
                      data-testid="plan-day-outlook-sim"
                      data-sim-kind={c.kind}
                      className="mt-0.5 block text-[11px] text-slate-400"
                    >
                      {simLine}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
