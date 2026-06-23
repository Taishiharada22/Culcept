/**
 * RealityOsSurfacePanel / RealityOsScenarioCard — production-shaped presentational component（P3-8）
 *
 * `RealityOsSurfaceDisplayV0`（presenter 出力・redacted）を描画するだけの presentational 部品。
 * 「将来 CoAlter PlanIntelligenceLivePanel に差し込める形」を作る（**dormant seam**）。
 *
 * 厳守（前提）: production tab / PlanClient / API / DB / real user assets には**接続しない**。
 *   現状この component を import するのは dev-reality-pipeline preview のみ（flag OFF・三重ガード内）。
 *   表示は **redacted 表示VM のみ**（raw evidence/graph/ledger を持たない＝presenter で既に落ちている）。
 *   proposal 実行・通知・DB 保存・fetch は一切しない（presentational・no hooks・no IO）。
 */

import type {
  RealityOsSurfaceDisplayV0,
  RealityOsScenarioDisplayV0,
} from "@/lib/plan/realityPipeline/realityOsSurfacePresenter";

export function RealityOsScenarioCard({ scenario }: { scenario: RealityOsScenarioDisplayV0 }) {
  return (
    <div
      className="mt-2 rounded-lg border border-rose-100 bg-white/60 px-3 py-2 text-[12px]"
      data-testid="reality-os-scenario"
    >
      <div className="font-bold text-rose-800">{scenario.kindLabel}</div>
      <div className="mt-0.5 text-gray-700">
        成立: {scenario.feasibilityLabel} / 超過: {scenario.overrunLabel} / 崩れ: {scenario.collapseLabel}
      </div>
      {scenario.minimalProgressText && (
        <div className="mt-0.5 text-gray-700">最小前進: {scenario.minimalProgressText}</div>
      )}
      <div className="mt-0.5 text-[11px] text-gray-500">
        自律度: {scenario.permissionLabel} ・ 確信度: {scenario.confidenceBand} ・ {scenario.evidenceText}
        {scenario.diffSummaryText ? ` ・ 差分: ${scenario.diffSummaryText}` : ""}
      </div>
      {scenario.reasonText.length > 0 && (
        <div className="mt-0.5 text-[11px] text-gray-500">理由: {scenario.reasonText.join(" / ")}</div>
      )}
    </div>
  );
}

export function RealityOsSurfacePanel({ display }: { display: RealityOsSurfaceDisplayV0 }) {
  return (
    <section
      className="mt-3 rounded-xl border border-rose-200 bg-rose-50/40 px-4 py-3"
      data-testid="reality-os-surface"
    >
      <h2 className="text-sm font-bold text-rose-900">Reality OS surface（dev fixture・redacted 表示VM）</h2>
      {display.honestUnknownLabel && (
        <p className="mt-1 text-[11px] text-rose-700" data-testid="reality-os-honest-unknown">
          {display.honestUnknownLabel}
        </p>
      )}
      {display.scenarios.length === 0 ? (
        <p className="mt-2 text-[12px] text-gray-500">候補なし（proposalRoute が route を出していません）。</p>
      ) : (
        display.scenarios.map((s) => <RealityOsScenarioCard key={s.scenarioId} scenario={s} />)
      )}
    </section>
  );
}
