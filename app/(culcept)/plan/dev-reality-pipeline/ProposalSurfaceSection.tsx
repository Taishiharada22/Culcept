"use client";
/**
 * ProposalSurfaceSection — RO-6（2026-06-20）: 「今の現実への構え」preview section（**presentational・read-only**）
 *
 * 正本設計: docs/reality-os-ro6-dev-proposal-surface-wiring-design.md
 * 役割: RO-5 `ProposalSurfaceViewV0[]`（既に fail-closed を通過した safe DTO）を operator が観測するための表示専用。
 *
 * 厳守（CEO 表示規約）:
 *   - empty-day（今日の組み方）と **別 section**・conceptLabel header 必須・同一 envelope に混ぜない。
 *   - presentational only（plan 書き換えない/通知しない/保存しない/実行しない/fetch しない/apply button なし）。
 *   - **dev fixture（synthetic）であることを明示**（実データでない）。
 *   - server 側 previewProposalSurfaces で violation を除外済（本 component は safe DTO のみ受け取る）。
 */
import type { ProposalSurfaceViewV0, ProposalRouteCardV0 } from "@/lib/plan/realityCore/proposalSurface";
import type { PreviewDiagnosticsV0 } from "@/lib/plan/realityCore/proposalSurfacePreview";

/** boolean→honest 不在句（presentation-side exact 句・hedged・断定なし）。 */
const RECOMMENDATION_ABSENT_LINE = "いまは特に推す構えは見当たりません";
const HAS_NO_BASIS_LINE = "この構えの根拠は、いまは見当たりません";

function Card({ card, recommended }: { card: ProposalRouteCardV0; recommended: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3 ${recommended ? "border-indigo-300 bg-indigo-50/40" : "border-gray-200"}`}
      data-testid="proposal-route-card"
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-gray-800">{card.stanceLabel}</span>
        {recommended && <span className="text-[10px] text-indigo-500">おすすめ</span>}
      </div>
      <p className="mt-1 text-[12px] text-gray-600">{card.intentLine}</p>
      <div className="mt-2 space-y-0.5">
        {card.hasNoBasis ? (
          <p className="text-[11px] text-gray-400">{HAS_NO_BASIS_LINE}</p>
        ) : (
          card.reasons.map((r, i) => (
            <p key={i} className="text-[11px] text-gray-500" data-testid="reason">
              ・{r.basisSummary}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function SurfaceCardSet({ view }: { view: ProposalSurfaceViewV0 }) {
  return (
    <div className="space-y-2" data-testid="proposal-surface">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {view.cards.map((card) => (
          <Card key={card.stanceLabelKey} card={card} recommended={view.recommendedStanceLabelKey === card.stanceLabelKey} />
        ))}
      </div>
      <p className="text-[11px] text-gray-400">
        {view.confidenceLabel}
        {view.recommendationAbsent ? `・${RECOMMENDATION_ABSENT_LINE}` : ""}
      </p>
    </div>
  );
}

/**
 * empty-day（今日の組み方）と **別 section**。conceptLabel header「今の現実への構え」を必須表示。
 */
export function ProposalSurfaceSection({
  surfaces,
  diagnostics,
}: {
  surfaces: ReadonlyArray<ProposalSurfaceViewV0>;
  diagnostics: PreviewDiagnosticsV0;
}) {
  const conceptLabel = surfaces[0]?.conceptLabel ?? "今の現実への構え"; // header 必須（DTO 由来 or 既定）
  return (
    <section className="mx-auto mt-6 max-w-md px-4" data-testid="proposal-surface-section">
      <div className="flex items-baseline justify-between border-t border-gray-200 pt-4">
        <h2 className="text-[15px] font-bold text-gray-800">{conceptLabel}</h2>
        <span className="text-[10px] text-gray-400">dev fixture（synthetic・観測のみ）</span>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">
        RO-4/5 chain（読み取り専用）。empty-day「今日の組み方」とは別レーンの「構え」候補です。
      </p>

      {surfaces.length === 0 ? (
        <p className="mt-3 text-[12px] text-gray-500" data-testid="proposal-surface-empty">
          表示できる構え候補がありません（fail-closed・rendered={diagnostics.rendered}）。
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {surfaces.map((view, i) => (
            <SurfaceCardSet key={i} view={view} />
          ))}
        </div>
      )}
    </section>
  );
}
