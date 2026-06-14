/**
 * T11-H2-B — Plan Intelligence Projection 契約型（**pure types only**・未配線）
 *
 * 設計: docs/t11-h-plan-intelligence-projection-design.md（+ CEO/GPT 命名補正: action-authority 語禁止）
 *
 * 役割: 将来 Plan Intelligence（PI）が T9 出力を **安全に投影**するための入出力契約。
 *   - 入力は **`DisplayPacketForClient` に型ロック**（G の consume tier 壁を PI 入口まで延伸）。
 *     → authoritative packet / 生 PlanDecisionPacket / raw FitResult は **型レベルで受理不可**。
 *   - 出力は **bounded な display/explanation のみ**。**executionAuthority / authoritative / diagnostics /
 *     raw FitResult / private rationale を持たない**。
 *
 * ★ 命名規約（CEO/GPT 補正）: **action-authority を連想させる field 名を使わない**
 *   （canBook / canSchedule / canReserve / execute / bookingReady / scheduleReady / actionAllowed 禁止）。
 *   readiness は **説明してよい**が **authority を表現しない**。
 *
 * 純粋性: 型のみ（runtime emit なし）。logic/生成関数は含まない（H2 は型壁のみ）。
 */

import type { DisplayPacketForClient } from "./engine-consume-types";
import type { NextAction } from "./packet-types";
import type { ConfirmationReason, ReadinessState } from "./readiness-types";
import type { DecisionQuestionKind } from "./decision-types";
import type { ContingencyTrigger, FallbackAction } from "./contingency-types";
import type { ProposalFitSummary } from "./fit-decision-adapter-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 入力（display tier 型ロック）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PI 投影の入力。`packet` は **`DisplayPacketForClient` のみ**。
 *   - `AuthoritativePacketForServer`（brand "server"）→ 代入不可。
 *   - 生 `PlanDecisionPacket`（brand 欠如・authoritative:boolean）→ 代入不可。
 *   - raw FitResult → 型不一致で不可。
 * ＝ PI は構造的に authoritative/private を受け取れない（privacy/authority を G から継承）。
 */
export interface PlanIntelligenceProjectionInput {
  packet: DisplayPacketForClient;
  /** 表示文脈の viewer（任意・viewerNote をその viewer に限定するため） */
  viewerId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 出力 section（display/explanation のみ・authority 語なし）
// ─────────────────────────────────────────────────────────────────────────────

/** 結論カード（次の一手の**説明**・実行権限ではない） */
export interface ProjectionAnswer {
  /** engine の次の一手（display ラベル・実行はしない） */
  nextAction: NextAction;
  recommendedProposalId: string | null;
  /** shared rationale 由来の説明文 */
  text: string;
}

export interface ProjectionFailureNote {
  note: string;
  /** 由来（contingency fallback / fit risk advisory） */
  source: "fallback" | "fit_risk";
}

/** 進める前の確認（**shared/viewer-safe のみ**・private は来ない） */
export interface ProjectionConfirmation {
  reason: ConfirmationReason;
}

export interface ProjectionQuestion {
  about: DecisionQuestionKind;
  /** 安定 intent ラベル（ユーザー向け生文ではない） */
  intent: string;
}

export interface ProjectionFallback {
  trigger: ContingencyTrigger;
  fallbackAction: FallbackAction;
  switchToProposalId: string | null;
}

/**
 * readiness の**説明**（state + 未解決確認の有無）。**authority を表現しない**。
 *   ★ `bookingReady` 等の field は持たない（説明のみ）。
 */
export interface ProjectionReadinessWarning {
  readinessState: ReadinessState;
  /** 未解決の確認があるか（説明用 boolean・実行可否ではない） */
  hasOpenConfirmations: boolean;
}

/**
 * PI 投影出力。**bounded display/explanation のみ**。
 *   - **executionAuthority / authoritative / diagnostics / raw FitResult / private rationale を持たない**。
 *   - `fitAdvisory` は `ProposalFitSummary`（bounded・raw component 値/private signalBasis なし）。
 *   - action-authority 語の field を持たない。
 */
export interface PlanIntelligenceProjection {
  answer: ProjectionAnswer;
  whyThisPlan: string;
  whatCouldFail: ProjectionFailureNote[];
  needsConfirmation: ProjectionConfirmation[];
  questionsToAsk: ProjectionQuestion[];
  fallbackNote: ProjectionFallback[];
  /** advisory のみ（ranking/execution に使わない・Bundle 2 未承認） */
  fitAdvisory: ProposalFitSummary[];
  readinessWarning: ProjectionReadinessWarning;
  /** その viewer 自身の note のみ（他者 private は含まない）・無ければ null */
  viewerNote: string | null;
}
