/**
 * A — TravelCandidate Construction Boundary 型（pure types のみ・runtime/配線なし）
 *
 * 設計正本: docs/t11-travelcandidate-construction-boundary-design.md（§4 problem・§7 output boundary）
 *
 * 目的（firewall）:
 *   server-only な `ScheduledTravelItineraryDraft`（bridge envelope）を、
 *   **`TravelCandidate` ではない**中間 envelope として包む型を定義する。
 *
 * 厳守:
 *   - これは `TravelCandidate`（core-types.ts）**ではない**。`TravelCorePlan.candidates[]` に **insert 不可**。
 *     - discriminant `outcome:"scheduled_draft_candidate_envelope"` + `insertable:false` で明示。
 *     - `title/tags/tradeoff/constraints/rationale/uncertainty/reversal` を**持たない**ため、構造的にも代入不可。
 *   - `authoritative:false` / `draft:true` / `serverOnly:true`。
 *   - **持たない**: executionAuthority・booking/calendar/action 権限・ranking 順位・dominance/pareto・
 *     acceptance state・final plan state・raw FitResult・raw ReadinessResult。
 *   - advisory summary は **bounded なものだけ**（`ProposalFitSummary` = engine-safe bounded・raw 不可）。
 *   - 入力に `DisplayScheduledItinerary` を権威として取らない（型で `AssemblyBridgeResult` のみ受ける）。
 */

import type { ScheduledTravelItineraryDraft } from "./assembly-types";
import type { AssemblyBridgeResult } from "./solver-assembly-bridge-types";
import type { ProposalFitSummary } from "./fit-decision-adapter-types";

/** readiness の **bounded 縮約のみ**（raw ReadinessResult / blockers / rationale を持たない）。 */
export interface ScheduledReadinessSummary {
  /** readiness state の縮約（例: "ready" | "needs_confirmation" 等の literal を caller が縮約済で渡す） */
  state: string;
  /** action kind の縮約（neutral・実行権限を含意しない） */
  actionKind: string;
}

/**
 * ★ server-only draft-candidate envelope（= TravelCandidate **ではない**）。
 *   bridge の scheduled draft を「候補化の手前」で包むだけ。insert/rank/accept いずれもしない。
 */
export interface ScheduledDraftCandidateEnvelope {
  /** ★ TravelCandidate にない discriminant（構造的に別物） */
  outcome: "scheduled_draft_candidate_envelope";
  /** ★ client/shared payload でない */
  serverOnly: true;
  /** ★ 実行権限でない */
  authoritative: false;
  /** ★ 受理済みでない */
  draft: true;
  /** ★ 非挿入マーカー（candidates[] に入れない意図を型で明示） */
  insertable: false;
  /** draft の candidateId を踏襲（or 既知 override） */
  candidateId: string;
  /** 既知時のみ（任意） */
  proposalId?: string;
  /** bridge envelope をそのまま保持（copy-only・改変しない） */
  scheduledDraft: ScheduledTravelItineraryDraft;
  /** 任意・**bounded advisory のみ**（raw FitResult でない） */
  fitSummary?: ProposalFitSummary;
  /** 任意・**bounded 縮約のみ**（raw ReadinessResult でない） */
  readinessSummary?: ScheduledReadinessSummary;
  // ★ 非所持（意図的に欠落）:
  //   title / tags / tradeoff / constraints / rationale / uncertainty / reversal  → TravelCandidate でない
  //   dominatedBy / paretoOptimal / rank / position                              → ranking/dominance しない
  //   executionAuthority / booking / calendar / action                          → 実行権限なし
  //   accepted / acceptance / finalized / planState                             → 受理/最終状態なし
}

/** construction が拒否した中立理由（private 値・診断文を含めない）。 */
export type NoCandidateReason =
  | "non_scheduled_draft_bridge" // bridge.outcome が scheduled_draft でない（no_draft 含む）
  | "missing_scheduled_draft" // scheduled_draft だが draft envelope が不変条件を満たさない
  | "invalid_input"; // 入力自体が不正（null 等）

/** construction 診断（中立・private 非露出）。 */
export interface ScheduledDraftCandidateDiagnostic {
  reason: NoCandidateReason;
  /** 入力 bridge の outcome（neutral・値に private を含めない） */
  rejectedBridgeOutcome?: AssemblyBridgeResult["outcome"];
}

/** 失敗（候補化しない・fail-closed）。 */
export interface NoScheduledDraftCandidate {
  outcome: "no_candidate";
  serverOnly: true;
  diagnostic: ScheduledDraftCandidateDiagnostic;
}

/** construction の結果（成功 envelope or 失敗）。 */
export type ScheduledDraftCandidateConstructionResult =
  | ScheduledDraftCandidateEnvelope
  | NoScheduledDraftCandidate;

/**
 * construction の入力。
 *   ★ 権威入力は `AssemblyBridgeResult`（scheduled_draft 側）のみ。
 *     DisplayScheduledItinerary / raw FitResult / no_draft をここに通せない（型で拒否）。
 */
export interface ScheduledDraftCandidateConstructionInput {
  /** server-side bridge envelope（成功側 scheduled_draft が唯一の正本入力） */
  bridge: AssemblyBridgeResult;
  /** 既知時のみ（任意） */
  proposalId?: string;
  /** 既知時のみ（任意）・通常は draft.candidateId を踏襲 */
  candidateIdOverride?: string;
  /** 既に shared-safe な bounded advisory の場合のみ（任意・raw FitResult 不可） */
  fitSummary?: ProposalFitSummary;
  /** 既に bounded な場合のみ（任意・raw ReadinessResult 不可） */
  readinessSummary?: ScheduledReadinessSummary;
}
