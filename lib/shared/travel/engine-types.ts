/**
 * T9A — Travel pure engine facade 契約型（**pure types only**・未配線）
 *
 * 設計: GPT note 2026-06-12（単一の安全な engine 入口）
 *
 * 役割: T3〜T8 を安全に束ねる **pure facade** の入出力契約。将来 UI/CoAlter/Plan Intelligence は
 * **この packet 出力を consume** すべきで、中間層（buildProposals 等）を個別に直接呼ばない。
 * ★ これは integration の実装ではない。runtime/DB/API/UI には一切触れない。
 *
 * 純粋性: 型のみ。
 */

import type { ExtractedSlot } from "./slot-types";
import type { ContingencyScenario } from "./contingency-types";
import type { DecisionState, FairnessHistoryInput } from "./decision-types";
import type { CancelWeatherEvidence, ReadinessPolicy, ReadinessState } from "./readiness-types";
import type { NextAction, PlanDecisionPacket } from "./packet-types";
import type { ProposalInputError } from "./proposal-types";
import type { ProposalFitInput } from "./fit-decision-adapter-types";

export interface TravelPlanEngineInput {
  /** 正規化済み slot（T2C normalizer 出力。正規化は本 facade の上流の責務） */
  slots: ExtractedSlot[];
  /** 参加者（1–2・MVP）。検証は T3 が fail-closed で行う */
  participantIds: string[];
  /** 任意・純 input。過去の偏り（DB ではない） */
  fairnessHistory?: FairnessHistoryInput;
  /** 任意・純 input。intended action / 有償・取消不能 */
  policy?: ReadinessPolicy;
  /** 任意・純 input。明示シナリオ（外部 weather/route データではない） */
  scenarios?: ContingencyScenario[];
  /** 任意。viewer 射影を返す対象 participantId */
  viewerId?: string;
  /**
   * ★ T11-F: Fit-to-Decision 合成の純 input（**caller が candidateId に対応づけて供給**）。
   *   不在時 → packet fitSummary なし＝従来 T9 output と byte 同一。fit は entity を捏造しない。
   */
  fit?: ProposalFitInput[];
  /**
   * ★ T11-C7/F: cancel_weather evidence（天候不確実 × 取消不能 commitment）。
   *   供給時のみ `assessReadiness` に thread し weather_reversal_uncertainty 確認を起こす。
   *   不在時 → readiness 挙動不変。**fit-core は producer にしない**（caller 供給の純 input）。
   */
  cancelWeather?: CancelWeatherEvidence;
}

/** 非 private な観測サマリ（debug/health 用・PII なし） */
export interface EngineDiagnostics {
  proposalCount: number;
  rejectedAngleCount: number;
  paretoCount: number;
  contingencyBranchCount: number;
  activeContingencyCount: number;
  decisionState: DecisionState;
  readinessState: ReadinessState;
  nextAction: NextAction;
  /** ★ 実行権限（authoritative packet 由来） */
  executionAuthority: boolean;
}

export interface TravelPlanEngineOutput {
  /** ★ 実行権限の正本（schedule/reserve/book の可否はこれで判定） */
  authoritative: PlanDecisionPacket;
  /** display 専用・両者向け（executionAuthority 常に false・private 非搭載） */
  shared: PlanDecisionPacket;
  /** display 専用・viewer 向け（viewerId 未指定なら null） */
  viewer: PlanDecisionPacket | null;
  diagnostics: EngineDiagnostics;
  inputError: ProposalInputError | null;
}
