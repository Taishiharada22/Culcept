/**
 * app/(culcept)/ceo/PrgReadinessPanel.tsx
 *   — PRG Readiness の operator 表示（pure presentational・read-only・status のみ）
 *
 * ★dev/operator 専用・read-only・raw 値なし（status label + 次アクションのみ）。CeoDashboardClient が
 *   flag gate（isPrgReadinessConsoleEnabled）配下でのみ render する。
 * ★Apple list 言語: 1 枚の白カードを hairline で割る inset grouped list・状態は「点 + テキスト」
 *   （塗り badge で叫ばない・絵文字なし・数字なし）。
 */
import type { PrgReadinessReport, PrgReadinessState } from "@/lib/plan/mobility/prgReadinessEvaluator";
import { PRG_AXIS_LABEL, PRG_STATE_DISPLAY } from "@/lib/plan/mobility/prgReadinessConsole";
import {
  PHASE_B_CHECK_LABEL,
  PHASE_B_OVERALL_DISPLAY,
  PHASE_B_DB_READ_NOTE,
  type PhaseBReadinessProgress,
} from "@/lib/plan/mobility/phaseBReadinessProgress";

/** 状態 → 点の色（Apple: 色は点に集約・テキストは黒/グレー）。 */
const STATE_DOT: Record<PrgReadinessState, string> = {
  dormant: "bg-gray-300",
  accumulating: "bg-gray-400",
  dogfooding: "bg-blue-500",
  needs_attention: "bg-orange-500",
  activation_candidate: "bg-emerald-500",
};

/** inset grouped list の外枠（白 + hairline 分割・Card と同じマテリアル）。 */
const LIST_SHELL =
  "overflow-hidden rounded-2xl bg-white/80 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_30px_rgba(0,0,0,0.06)] ring-1 ring-black/5 backdrop-blur-xl divide-y divide-black/5";

/** PRG 各軸の readiness を 1 行ずつ表示（pure・raw 値を出さない）。 */
export function PrgReadinessReportView({ report }: { report: PrgReadinessReport }) {
  return (
    <div data-testid="prg-readiness-report">
      <div className={LIST_SHELL}>
        {report.axes.map((a) => {
          const d = PRG_STATE_DISPLAY[a.state];
          return (
            <div key={a.axis} data-axis={a.axis} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="shrink-0 text-[13px] text-gray-900">{PRG_AXIS_LABEL[a.axis]}</span>
              <div className="flex min-w-0 items-center gap-3">
                <span className="truncate text-[11px] text-gray-400">{d.action}</span>
                <span data-state={a.state} className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-gray-700">
                  <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[a.state]}`} />
                  {d.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="px-1 pt-2 text-[11px] leading-relaxed text-gray-400">
        dev/operator 専用・read-only・status のみ（raw 値なし）・activation 候補は stability 確認時のみ
      </p>
    </div>
  );
}

/**
 * ★B-0: Phase B readiness の data gate 進捗（pure presentational・read-only・達成/未達と次アクションのみ）。
 * Phase B 本体ではない（蓄積の見える化のみ）。raw count/件数は描画しない。DB read 領域は構造的な別 status。
 */
export function PhaseBGateView({ progress }: { progress: PhaseBReadinessProgress }) {
  const overall = PHASE_B_OVERALL_DISPLAY[progress.overall];
  const overallReady = progress.overall !== "accumulating";
  return (
    <div data-testid="phase-b-gate" className="mt-5">
      <p className="px-1 pb-2 text-[12px] font-semibold tracking-wide text-gray-400">Phase B 入口（data gate 進捗）</p>
      <div className={LIST_SHELL}>
        {progress.checks.map((c) => (
          <div key={c.key} data-check={c.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="shrink-0 text-[13px] text-gray-900">{PHASE_B_CHECK_LABEL[c.key]}</span>
            <span
              data-met={c.met ? "true" : "false"}
              className={`inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium ${c.met ? "text-gray-700" : "text-gray-400"}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${c.met ? "bg-emerald-500" : "bg-gray-300"}`} />
              {c.met ? "達成" : "未達"}
            </span>
          </div>
        ))}
        {/* ★構造的な別 status: 蓄積では満たせない（DB read 承認が必要な領域） */}
        <div data-testid="phase-b-db-read" className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="min-w-0 truncate text-[12px] text-gray-500">{PHASE_B_DB_READ_NOTE}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-gray-400">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
            承認待ち
          </span>
        </div>
        {/* 総合判定（リスト最下行・semibold） */}
        <div data-testid="phase-b-overall" data-overall={progress.overall} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="truncate text-[11px] text-gray-400">{overall.action}</span>
          <span className={`inline-flex shrink-0 items-center gap-1.5 text-[12px] font-semibold ${overallReady ? "text-gray-900" : "text-gray-600"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${overallReady ? "bg-blue-500" : "bg-gray-400"}`} />
            {overall.label}
          </span>
        </div>
      </div>
    </div>
  );
}
