/**
 * T11-H3-B — Plan Intelligence Projection 純 mapper（**pure・未配線**）
 *
 * 設計: plan-intelligence-projection-types.ts + docs/t11-h-plan-intelligence-projection-design.md
 *
 * 役割: `PlanIntelligenceProjectionInput`（= `DisplayPacketForClient` を包む）を、bounded な
 *   `PlanIntelligenceProjection`（display/explanation）へ写像する **純関数**。
 *   **display packet の field のみ**を使い、authority/private/raw を一切生成・露出しない。
 *
 * 厳守（純・決定論・境界）:
 *   - import は projection 型のみ（**fit-core / readiness-core / packet-core internals / UI/app を import しない**）。
 *   - 外部 I/O（fetch・API・DB・runtime）なし。
 *   - **executionAuthority / authoritative / diagnostics / raw FitResult を出力に出さない**。
 *   - **private 逆推論しない**（authoritative⊥shared 差分しない）。
 *   - needsConfirmation は **shared-safe confirmation のみ**。
 *   - viewerNote は **指定 viewer 自身の note のみ**（他者 private を読まない）。
 *   - action-authority 語を導入しない。
 */

import type {
  PlanIntelligenceProjection,
  PlanIntelligenceProjectionInput,
  ProjectionConfirmation,
  ProjectionFailureNote,
  ProjectionFallback,
  ProjectionQuestion,
} from "./plan-intelligence-projection-types";

/**
 * display packet → bounded projection。決定論・副作用なし。
 *   - fit 入力が無ければ fitAdvisory/fit_risk は空（no-op）。
 *   - 各 section は display packet の対応 field のみから導出（§5 マッピング）。
 */
export function buildPlanIntelligenceProjection(input: PlanIntelligenceProjectionInput): PlanIntelligenceProjection {
  const p = input.packet;

  // needs confirmation: ★ shared-safe のみ（display packet は元々 shared だが防御的に filter）
  const needsConfirmation: ProjectionConfirmation[] = p.confirmationQueue
    .filter((c) => c.visibility === "shared")
    .map((c) => ({ reason: c.reason }));

  // what could fail: 実発火 contingency（keep_plan 以外）+ fit advisory（risk / missing）
  const whatCouldFail: ProjectionFailureNote[] = [
    ...p.fallbackSummary
      .filter((f) => f.fallbackAction !== "keep_plan")
      .map((f): ProjectionFailureNote => ({ note: f.trigger, source: "fallback" })),
    ...(p.fitSummary ?? []).flatMap((s): ProjectionFailureNote[] => [
      ...s.riskCodes.map((code): ProjectionFailureNote => ({ note: code, source: "fit_risk" })),
      ...s.missingFields.map((field): ProjectionFailureNote => ({ note: field, source: "fit_risk" })),
    ]),
  ];

  const questionsToAsk: ProjectionQuestion[] = p.questionQueue.map((q) => ({ about: q.about, intent: q.intent }));

  const fallbackNote: ProjectionFallback[] = p.fallbackSummary.map((f) => ({
    trigger: f.trigger,
    fallbackAction: f.fallbackAction,
    switchToProposalId: f.switchToProposalId,
  }));

  // viewer note: ★ 指定 viewer 自身の note のみ（他参加者の private を読まない・iterate しない）
  const viewerNote: string | null =
    input.viewerId !== undefined ? p.rationale.forParticipant[input.viewerId] ?? null : null;

  return {
    answer: {
      nextAction: p.nextAction,
      recommendedProposalId: p.recommendedProposalId,
      text: p.rationale.shared,
    },
    whyThisPlan: p.rationale.shared,
    whatCouldFail,
    needsConfirmation,
    questionsToAsk,
    fallbackNote,
    // advisory のみ・bounded（raw component 値/private signalBasis は ProposalFitSummary に存在しない）
    fitAdvisory: p.fitSummary ?? [],
    readinessWarning: {
      readinessState: p.readinessState,
      hasOpenConfirmations: needsConfirmation.length > 0,
    },
    viewerNote,
  };
}
