"use client";

/**
 * components/plan/PaceShadowReportPanel.tsx — A1-9: dogfood/dev 限定の pace shadow report パネル（debug）
 *
 * ★性質: 一般ユーザー向けでなく **dogfood/debug report**。CalendarTab が isPaceShadowActivationEnabled()
 *   （flag DAY_REHEARSAL_PACE_SHADOW_ENABLED ∧ 非 production）のときだけ描画する＝OFF/一般ユーザーには出ない。
 *
 * ★安全境界（CEO 方針）:
 *   - **raw 数値を出さない**（pace ratio / friction score / GPS 座標は表示しない）。status / level / 件数 / 懸念 badge のみ。
 *   - **sparse（not_enough）は shadow 比較を表示しない**（ready まで非表示）。
 *   - **実反映していない**ことを明示（DAY_REHEARSAL_PERSONAL_PACE_ENABLED は OFF・本パネルは観測のみ）。
 *   - 過悲観 / marker 爆発 / 診断悪化 / 過剰変化 を明確に出す。
 */
import type { PaceShadowActivationReport } from "@/lib/plan/mobility/paceShadowActivation";
import type { PersonalPaceDogfoodReadiness } from "@/lib/plan/mobility/personalPaceDogfoodReadiness";
import type { DogfoodStabilityAssessment } from "@/lib/plan/mobility/dogfoodSafetyJournal";

function ConcernBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${on ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-400"}`}
    >
      {on ? "⚠ " : "✓ "}
      {label}
    </span>
  );
}

export function PaceShadowReportPanel({
  report,
  dogfoodReadiness,
  stability,
}: {
  report: PaceShadowActivationReport;
  /** ★A1-11: dogfood activation の前チェック集約（任意・dev のみ）。 */
  dogfoodReadiness?: PersonalPaceDogfoodReadiness | null;
  /** ★A1-13: safety journal の複数日 stability（任意・dev のみ）。 */
  stability?: DogfoodStabilityAssessment | null;
}) {
  return (
    <div data-testid="pace-shadow-report" className="mt-3 rounded-xl border border-slate-300 border-dashed bg-slate-50/70 px-3 py-2.5 text-slate-600">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold tracking-wide text-slate-500">pace shadow report</span>
        <span className="text-[10px] text-slate-400">dogfood・確認のみ（実反映なし）</span>
      </div>

      {!report.ran || !report.shadow ? (
        <p className="mt-1.5 text-[11px] text-slate-400">
          観測不足（readiness: {report.readinessOverall}）— ready まで shadow 比較は非表示
        </p>
      ) : (
        <div className="mt-1.5 space-y-1.5 text-[11px]">
          <div>
            readiness: <b className="text-slate-700">{report.readinessOverall}</b>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-slate-400">懸念:</span>
            <ConcernBadge label="過悲観" on={report.concerns.overPessimism} />
            <ConcernBadge label="marker爆発" on={report.concerns.markerExplosion} />
            <ConcernBadge label="診断悪化" on={report.concerns.diagnosticWorsening} />
            <ConcernBadge label="過剰変化" on={report.concerns.overChange} />
          </div>
          <div>
            viability: <b className="text-slate-700">{report.shadow.viabilityBefore}</b> →{" "}
            <b className="text-slate-700">{report.shadow.viabilityAfter}</b>
          </div>
          <div>
            strain(level): <b className="text-slate-700">{report.shadow.peakStrainLevelBefore}</b> →{" "}
            <b className="text-slate-700">{report.shadow.peakStrainLevelAfter}</b>
          </div>
          <div>
            marker: {report.shadow.convergenceCountBefore} → {report.shadow.convergenceCountAfter}
          </div>
          <div
            data-testid="pace-shadow-verdict"
            className={`font-semibold ${report.anyConcern ? "text-rose-600" : "text-emerald-600"}`}
          >
            {report.anyConcern ? "⚠ 懸念あり（有効化前に要確認）" : "✓ 懸念なし"}
          </div>
        </div>
      )}

      {/* ★A1-11: dogfood activation 前チェック（opt-in / 反映区間 / shadow 安全 / 記録の質）。raw 数値なし。 */}
      {dogfoodReadiness && (
        <div data-testid="dogfood-readiness" className="mt-2 border-t border-dashed border-slate-200 pt-2 text-[11px]">
          <div
            data-testid="dogfood-verdict"
            className={`font-semibold ${dogfoodReadiness.overall === "ready_for_dogfood" ? "text-emerald-600" : "text-slate-500"}`}
          >
            dogfood: {dogfoodReadiness.overall === "ready_for_dogfood" ? "✓ ready_for_dogfood" : "未充足（not_ready）"}
          </div>
          <ul className="mt-1 space-y-0.5">
            {dogfoodReadiness.checks.map((c) => (
              <li key={c.key} className={c.passed ? "text-slate-500" : "text-rose-600"}>
                {c.passed ? "✓ " : "✗ "}
                {c.label}：<span className="text-slate-400">{c.detail}</span>
              </li>
            ))}
          </ul>
          {dogfoodReadiness.blockers.length > 0 && (
            <div className="mt-1 text-slate-400">未充足: {dogfoodReadiness.blockers.join(" / ")}</div>
          )}
        </div>
      )}

      {/* ★A1-13: 複数日 safety journal の stability（derived summary 由来・raw 値なし）。 */}
      {stability && (
        <div data-testid="dogfood-stability" className="mt-1.5 text-[11px]">
          <span className="text-slate-400">複数日:</span>{" "}
          <b
            className={
              stability.stability === "stable_safe"
                ? "text-emerald-600"
                : stability.stability === "unstable"
                  ? "text-rose-600"
                  : "text-slate-500"
            }
          >
            {stability.stability}
          </b>
          <span className="text-slate-400">
            （{stability.daysObserved}日観測・懸念{stability.daysWithConcern}日）
          </span>
        </div>
      )}
    </div>
  );
}
