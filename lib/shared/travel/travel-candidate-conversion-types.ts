/**
 * C2 — TravelCandidate Conversion gate 型（pure types **のみ**・helper/construction なし）
 *
 * 設計正本: docs/t11-candidate-insertion-preflight.md（§4/§6 案 B・補正: factual と interpretive を分離）
 *
 * 役割: `ScheduledDraftCandidateEnvelope`（非挿入・server-only）→ core-types `TravelCandidate`
 *   への**明示 converter** の**入力契約**を型で固定する。
 *   ★ ここでは **TravelCandidate を構築しない**（result は「構築準備 OK」であって候補ではない）。
 *   ★ insertion adapter も持たない（別 slice C4）。
 *
 * 厳守（型で強制）:
 *   - source は `ScheduledDraftCandidateEnvelope` のみ（DisplayScheduledItinerary / raw draft / no_draft 不可）。
 *   - **interpretive 核（title/tags/rationale/uncertainty/tradeoff/reversal）は明示供給必須**（捏造禁止）。
 *   - factual は draft 由来の構造のみ（derivedAllowed で明示 consent・価格/空き/理由を作らない）。
 *   - raw FitResult を入力にしない。
 *   - ranking/dominance・executionAuthority・booking/calendar/action・acceptance/final state を**持たない**。
 */

import type { ScheduledDraftCandidateEnvelope } from "./travel-candidate-boundary-types";
import type {
  TravelCandidate,
  ViewerScopedRationale,
  UncertaintyLevel,
  TradeoffProfile,
  ReversalCost,
  TravelConstraint,
} from "./core-types";

/**
 * 変換ターゲットの**型マーカー**（実体は構築しない）。
 * 変換 gate の終点が core-types `TravelCandidate` であることを型で明示するための alias。
 */
export type TravelCandidateConversionTarget = TravelCandidate;

/** 終点が core-types TravelCandidate であることを示す literal discriminant。 */
export type TravelCandidateConversionTargetMarker = "core_types_travel_candidate";

// ─────────────────────────────────────────────────────────────────────────────
// 入力 4 バケツ（補正: 全部を平らな袋にせず、導出可否で分離する）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ① source — 唯一の権威入力。
 *   ★ `ScheduledDraftCandidateEnvelope`（server-only・insertable:false）のみ。
 *     DisplayScheduledItinerary / raw ScheduledTravelItineraryDraft / no_draft は構造的に代入不可。
 */
export type TravelCandidateConversionSource = ScheduledDraftCandidateEnvelope;

/**
 * ② explicitInterpretation — **解釈的 field（機械導出不可・明示供給必須・捏造禁止）**。
 *   scheduled draft の text から auto 生成してはならない。
 */
export interface TravelCandidateExplicitInterpretation {
  /** core TravelCandidate.title（明示供給） */
  title: string;
  /** core TravelCandidate.tags（明示供給） */
  tags: string[];
  /** core TravelCandidate.rationale = why-this-plan copy（明示供給・viewer-scoped） */
  rationale: ViewerScopedRationale;
  /** core TravelCandidate.uncertainty（明示供給・"high"|"medium"|"low"） */
  uncertainty: UncertaintyLevel;
  /** core TravelCandidate.tradeoff（明示供給・factual 集計でも「明示」値として渡す・silent 導出しない） */
  tradeoff: TradeoffProfile;
  /** core TravelCandidate.reversal?（任意・明示供給） */
  reversal?: ReversalCost;
}

/**
 * ③ explicitCandidateMetadata — 候補メタ（明示供給）。
 */
export interface TravelCandidateExplicitMetadata {
  /** core TravelCandidate.candidateId（通常は envelope.candidateId 踏襲・明示） */
  candidateId: string;
  /** 任意 */
  proposalId?: string;
  /** 任意・candidate kind / angle */
  candidateKind?: string;
  /** 任意・source label */
  sourceLabel?: string;
  /** 任意・created-by / source metadata */
  createdBy?: string;
}

/**
 * ④ derivedAllowed — **factual のみ・既に explicit な場合に限り採用**。
 *   ★ ここで価格/空き/rationale を**捏造しない**。
 */
export interface TravelCandidateDerivedAllowed {
  /** ★ core TravelCandidate.itinerary は source.scheduledDraft.itinerary（factual 構造）のみを採用する consent。 */
  itinerarySource: "scheduled_draft";
  /** core TravelCandidate.constraints（既に explicit な制約のみ・intake/source 由来・捏造禁止・無ければ []） */
  constraints: TravelConstraint[];
}

/** 変換入力（4 バケツを束ねる・全 bucket 必須）。 */
export interface TravelCandidateConversionInput {
  source: TravelCandidateConversionSource;
  explicitInterpretation: TravelCandidateExplicitInterpretation;
  explicitCandidateMetadata: TravelCandidateExplicitMetadata;
  derivedAllowed: TravelCandidateDerivedAllowed;
}

// ─────────────────────────────────────────────────────────────────────────────
// 結果（★ まだ TravelCandidate ではない）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 成功 = **構築準備 OK**（検証済み素材を保持するが、TravelCandidate は構築しない）。
 *   ★ `TravelCandidate` に代入不可・`candidates[]` に push 不可（C3 で初めて構築）。
 */
export interface TravelCandidateConversionReady {
  outcome: "conversion_ready";
  serverOnly: true;
  /** ★ まだ候補でない・非挿入 */
  insertable: false;
  /** ★ 構築ターゲットの型マーカー（実体なし） */
  targetType: TravelCandidateConversionTargetMarker;
  /** C3 が消費する検証済み入力（TravelCandidate ではない） */
  input: TravelCandidateConversionInput;
}

/** 拒否理由（中立・private 値/自由文を含めない）。 */
export type TravelCandidateConversionRejectionReason =
  | "source_not_convertible_envelope" // source が envelope でない / insertable でない
  | "missing_explicit_interpretation" // interpretive 必須 field 欠落
  | "missing_explicit_metadata" // candidateId 等の欠落
  | "fabrication_not_allowed" // factual を捏造しようとした
  | "invalid_input";

/** 変換診断（中立）。 */
export interface TravelCandidateConversionDiagnostic {
  reason: TravelCandidateConversionRejectionReason;
  /** 欠落 field 名等の中立ヒント（private 値・自由文を含めない） */
  missingFields?: string[];
}

/** 失敗（fail-closed）。 */
export interface TravelCandidateConversionRejected {
  outcome: "conversion_rejected";
  serverOnly: true;
  diagnostic: TravelCandidateConversionDiagnostic;
}

/** 変換結果（成功=構築準備 / 失敗）。★ いずれも TravelCandidate でない。 */
export type TravelCandidateConversionResult =
  | TravelCandidateConversionReady
  | TravelCandidateConversionRejected;
