/**
 * proposalSurfacePreview — RO-6（2026-06-20）: RO-3→4→5 の fail-closed 連結 orchestration（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro6-dev-proposal-surface-wiring-design.md（RO-6 v0.1）
 * 思想: RO-4 `buildProposalRoutes` / RO-5 `buildProposalSurface` は caller=0（dormant）。本 helper が
 *   `buildRealityLearningSignal → buildProposalRoutes → proposalRouteViolations → buildProposalSurface →
 *   proposalSurfaceViolations` を **fail-closed**（violation 1 件でも除外）で連結し、表示してよい safe DTO のみ返す。
 *   これにより RO-4/5 が初めて呼ばれ dormant を脱する（producer→consumer 接続）。
 *
 * CEO 裁定（2026-06-20・RO-6 dev-only wiring GO）:
 *   - production route/API/cron/notification/apply/DB write/PredictionLedger write/B1/ETA・RC4 を持たない。
 *   - signal/frame は injected（pure・Date/RNG/IO なし）。本 helper は「読む→safe DTO を返す」だけ。
 *
 * 不変条件: pure。RO-1/2/3/4/5 の runtime/型を改変しない（import のみ）。fail-closed（violation あれば skip・捏造しない）。
 */
import type { RealityFrameV0 } from "./realityFrame";
import type { CorrectionGradientV0 } from "./correctionGradient";
import type { TaskLedgerSignalV0 } from "./taskOutcome";
import { buildRealityLearningSignal } from "./realityLearningSignal";
import { buildProposalRoutes, proposalRouteViolations } from "./proposalRoute";
import { buildProposalSurface, proposalSurfaceViolations, type ProposalSurfaceViewV0 } from "./proposalSurface";

export const PROPOSAL_SURFACE_PREVIEW_VERSION = 0;

export interface PreviewProposalSurfacesInputV0 {
  /** 前回 frame（初回は null）。 */
  readonly prior: RealityFrameV0 | null;
  /** 今回 frame（RO-4 が task ノードを read・RO-5 surface の母集合）。 */
  readonly current: RealityFrameV0;
  /** decomposeCorrection 済み gradient（injected・easy 根拠）。 */
  readonly gradients?: ReadonlyArray<CorrectionGradientV0>;
  /** RO-1 applyTaskOutcome の ledgerSignal（injected）。 */
  readonly ledgerSignals?: ReadonlyArray<TaskLedgerSignalV0>;
  /** routeSetId の deterministic seed（caller 供給・乱数/now なし）。 */
  readonly routeSetIdSeed: string;
}

/** counts のみ（raw/trace を含まない・operator 観測用）。 */
export interface PreviewDiagnosticsV0 {
  readonly totalSets: number;
  readonly skippedForRouteViolation: number;
  readonly skippedForSurfaceViolation: number;
  readonly rendered: number;
}

export interface ProposalSurfacePreviewResultV0 {
  /** 表示してよい safe DTO のみ（fail-closed を通過したもの）。 */
  readonly surfaces: ReadonlyArray<ProposalSurfaceViewV0>;
  readonly diagnostics: PreviewDiagnosticsV0;
}

/**
 * previewProposalSurfaces — RO-3→4→5 を fail-closed で連結（pure）。
 *   route violation / surface violation のある set は除外し、safe DTO のみ返す（捏造より除外）。
 */
export function previewProposalSurfaces(input: PreviewProposalSurfacesInputV0): ProposalSurfacePreviewResultV0 {
  const signal = buildRealityLearningSignal({
    prior: input.prior,
    current: input.current,
    gradients: input.gradients,
    ledgerSignals: input.ledgerSignals,
  });

  const sets = buildProposalRoutes({ signal, frame: input.current, routeSetIdSeed: input.routeSetIdSeed });

  const surfaces: ProposalSurfaceViewV0[] = [];
  let skippedForRouteViolation = 0;
  let skippedForSurfaceViolation = 0;

  for (const set of sets) {
    // ① RO-4 set の自己整合（不正なら表示しない）
    if (proposalRouteViolations(set).length > 0) {
      skippedForRouteViolation += 1;
      continue;
    }
    // ② RO-5 surface 化
    const view = buildProposalSurface(set);
    // ③ RO-5 DTO の leak/整合（1 件でも violation なら表示しない＝fail-closed）
    if (proposalSurfaceViolations(view).length > 0) {
      skippedForSurfaceViolation += 1;
      continue;
    }
    surfaces.push(view);
  }

  return {
    surfaces,
    diagnostics: {
      totalSets: sets.length,
      skippedForRouteViolation,
      skippedForSurfaceViolation,
      rendered: surfaces.length,
    },
  };
}
