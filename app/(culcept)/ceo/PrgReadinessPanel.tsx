/**
 * app/(culcept)/ceo/PrgReadinessPanel.tsx
 *   — PRG Readiness の operator 表示（pure presentational・read-only・status のみ）
 *
 * ★dev/operator 専用・read-only・raw 値なし（status label + 次アクションのみ）。CeoDashboardClient が
 *   flag gate（isPrgReadinessConsoleEnabled）配下でのみ render する。
 */
import type { PrgReadinessReport, PrgReadinessState } from "@/lib/plan/mobility/prgReadinessEvaluator";
import { PRG_AXIS_LABEL, PRG_STATE_DISPLAY } from "@/lib/plan/mobility/prgReadinessConsole";

const STATE_BADGE: Record<PrgReadinessState, string> = {
  dormant: "bg-gray-100 text-gray-500",
  accumulating: "bg-slate-100 text-slate-600",
  dogfooding: "bg-indigo-100 text-indigo-700",
  needs_attention: "bg-amber-100 text-amber-700",
  activation_candidate: "bg-emerald-100 text-emerald-700",
};

/** PRG 各軸の readiness を 1 行ずつ表示（pure・raw 値を出さない）。 */
export function PrgReadinessReportView({ report }: { report: PrgReadinessReport }) {
  return (
    <div data-testid="prg-readiness-report" className="space-y-1.5">
      {report.axes.map((a) => {
        const d = PRG_STATE_DISPLAY[a.state];
        return (
          <div
            key={a.axis}
            data-axis={a.axis}
            className="flex items-center justify-between gap-2 rounded-lg border border-black/5 bg-white/50 px-3 py-2 text-xs"
          >
            <span className="shrink-0 font-medium text-gray-700">{PRG_AXIS_LABEL[a.axis]}</span>
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[10px] text-gray-400">{d.action}</span>
              <span
                data-state={a.state}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATE_BADGE[a.state]}`}
              >
                {d.label}
              </span>
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-[10px] text-gray-400">
        dev/operator 専用・read-only・status のみ（raw 値なし）・activation 候補は stability 確認時のみ
      </p>
    </div>
  );
}
