/**
 * Reality Control OS — A1-7-3 PRM Dry-run Proposal Projection（**pure・local・no-persist・no-DB・no-LLM・no-route・no-Home**・barrel 非 export・未配線）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §10.3
 *
 * 役割: A1-7-1 `TentativePatternReport` を、**PRM に保存する前**の **PRM update proposal candidate** に変換する pure projection。
 *   **これは PRM 永続化ではない**。「PRM 更新候補への dry-run projection」（保存しない・review 必須）。
 *
 * 設計思想（PRM に「事実」を勝手に積まない・review gate・断定しない）:
 *   - PRM は user について **自動で fact を学習しない**。すべての更新は **review 必須の dry-run 提案**（事実でない）。
 *   - 提案は **evidence + counter-evidence + 代替仮説（stillPossible）+ humility（なぜ提案止まりか）** を必ず携える。
 *   - **certainty low / evidence 不足 → blocked**（observation 止まり・PRM 候補にしない）。**tentative かつ十分 → candidate**（但し `reviewRequired`）。
 *   - **dismiss を「嫌い」に / accept を「好み確定」に変換しない**。tendency 表現（採用されやすい/にくい傾向の可能性）+ 要 review。
 *   - **high certainty / fixed preference / personality を作らない**（certainty 型に high なし・`assertsPreference/assertsPersonality=false`）。
 *
 * 厳守:
 *   - **pure・deterministic**: DB / network / route / UI / Date.now / LLM なし。**保存しない**（`persisted=false` marker）。
 *   - **未永続化**: `kind="prm_dry_run_proposal" / "prm_dry_run_projection"` marker。PRM schema / migration / persistence は **別 slice（§3・CEO 承認）**。barrel 非 export。
 */

import type { CandidateActionKind } from "../candidate-action";
import type { LearningSignal, LearningHypothesisCode } from "./dry-run-learning-event";
import { hypothesisLabel } from "./dry-run-learning-event";
import type { ContextDimension, PatternCertainty, TentativePattern, TentativePatternReport } from "./dry-run-aggregation";

/** 提案ステータス（tentative+十分→candidate / それ以外→blocked）。 */
export type PrmProposalStatus = "candidate" | "blocked";

/** blocked の理由コード（**controlled**）。 */
export type BlockedReasonCode = "certainty_low" | "evidence_insufficient";

/** PRM 候補になるための最小 evidence 件数（pattern 表示の minEvents より高い bar）。 */
const DEFAULT_MIN_CANDIDATE_EVIDENCE = 5;

/** context 次元/値ラベル（interpretation 用・controlled・aggregation と整合）。 */
const DIM_LABEL: Record<ContextDimension, string> = { band: "時間帯", durationBucket: "所要時間", confidence: "確信度", source: "根拠" };
const VAL_LABEL: Record<string, string> = {
  morning: "午前", afternoon: "午後", evening: "夜", none: "帯なし",
  short: "短い", medium: "中", long: "長い", unknown: "不明",
  high: "高", low: "低", seed_explicit: "発話由来", correction: "調整由来",
};
/** action → **tendency 表現**（**「嫌い/好み確定」に変換しない**・採用されやすい/にくい/保留 の傾向止まり）。 */
const ACTION_TENDENCY: Record<CandidateActionKind, string> = {
  accept: "採用されやすい傾向",
  dismiss: "採用されにくい傾向",
  later: "保留されやすい傾向",
};
/** blocked 理由ラベル（controlled・display 用）。 */
const BLOCKED_REASON_LABEL: Record<BlockedReasonCode, string> = {
  certainty_low: "certainty が low（単一行動の集積では断定不可・observation 止まり）",
  evidence_insufficient: "evidence 不足（PRM 候補には十分な件数が必要）",
};

/** **PRM update proposal candidate**（**未永続化・review 必須・断定しない**）。 */
export interface PrmDryRunProposal {
  /** marker（**PRM 未保存**・PRM write でない）。 */
  readonly kind: "prm_dry_run_proposal";
  /** candidate（reviewable）/ blocked（observation 止まり）。 */
  readonly status: PrmProposalStatus;
  /** 元 pattern の文脈次元/値。 */
  readonly sourceDimension: ContextDimension;
  readonly sourceValue: string;
  /** 元 pattern の dominant action / 中立信号。 */
  readonly dominantAction: CandidateActionKind;
  readonly signal: LearningSignal;
  /** **tentative interpretation**（tendency 表現・要 review・断定しない）。 */
  readonly tentativeInterpretation: string;
  /** disambiguate された favored hypothesis。 */
  readonly favoredHypothesis: LearningHypothesisCode;
  /** **counter-hypotheses を保持**（潰さない）。 */
  readonly stillPossible: readonly LearningHypothesisCode[];
  /** evidence 件数 / counter-evidence 件数（保持）。 */
  readonly evidenceCount: number;
  readonly counterCount: number;
  /** certainty（low | tentative・**high なし**）。 */
  readonly certainty: PatternCertainty;
  /** **なぜ提案止まりか**（humility・controlled）。 */
  readonly whyProposalOnly: string;
  /** blocked 理由（candidate は null）。 */
  readonly blockedReason: BlockedReasonCode | null;
  /** **常に true**（PRM 自動更新を許さない構造的 gate）。 */
  readonly reviewRequired: true;
  /** **構造的保証**: 選好を断定しない。 */
  readonly assertsPreference: false;
}

/** PRM dry-run projection（**未永続化・PRM 保存でない**・candidate/blocked 分離）。 */
export interface PrmDryRunProjection {
  /** marker（**PRM 未保存**）。 */
  readonly kind: "prm_dry_run_projection";
  /** 元 report の pattern 数。 */
  readonly totalPatterns: number;
  /** 全 proposal（status 付き）。 */
  readonly proposals: readonly PrmDryRunProposal[];
  /** status=candidate（review 対象）。 */
  readonly candidates: readonly PrmDryRunProposal[];
  /** status=blocked（observation 止まり）。 */
  readonly blocked: readonly PrmDryRunProposal[];
  /** **構造的保証**: 性格を断定しない。 */
  readonly assertsPersonality: false;
  /** **明示**: PRM 本体に保存していない。 */
  readonly persisted: false;
}

/** projection オプション（PRM 候補の最小 evidence・test 用）。 */
export interface PrmProjectionOptions {
  readonly minCandidateEvidence?: number;
}

/** pattern → (status, blockedReason)（projection rule）。 */
function classify(pattern: TentativePattern, minCandidateEvidence: number): { status: PrmProposalStatus; blockedReason: BlockedReasonCode | null } {
  if (pattern.certainty !== "tentative") return { status: "blocked", blockedReason: "certainty_low" }; // low → observation
  if (pattern.eventCount < minCandidateEvidence) return { status: "blocked", blockedReason: "evidence_insufficient" }; // 不足
  return { status: "candidate", blockedReason: null }; // tentative かつ十分 → candidate（但し review 必須）
}

/** controlled tentative interpretation（tendency・要 review・断定しない）。 */
function buildInterpretation(p: TentativePattern): string {
  const ctx = `${DIM_LABEL[p.dimension]}「${VAL_LABEL[p.value] ?? p.value}」`;
  return `${ctx}は${ACTION_TENDENCY[p.dominantAction]}の可能性（${hypothesisLabel(p.favoredHypothesis)}・要 review）`;
}

/** controlled humility（なぜ提案止まりか）。 */
function buildWhyProposalOnly(p: TentativePattern): string {
  return `単一行動の集積（${p.eventCount}件・counter ${p.counterCount}件・certainty ${p.certainty}）。固定的な嗜好・性格ではなく、review と更なる観測が前提。`;
}

/** pattern → PrmDryRunProposal。 */
function toProposal(p: TentativePattern, minCandidateEvidence: number): PrmDryRunProposal {
  const { status, blockedReason } = classify(p, minCandidateEvidence);
  return {
    kind: "prm_dry_run_proposal",
    status,
    sourceDimension: p.dimension,
    sourceValue: p.value,
    dominantAction: p.dominantAction,
    signal: p.signal,
    tentativeInterpretation: buildInterpretation(p),
    favoredHypothesis: p.favoredHypothesis,
    stillPossible: p.stillPossible,
    evidenceCount: p.eventCount,
    counterCount: p.counterCount,
    certainty: p.certainty,
    whyProposalOnly: buildWhyProposalOnly(p),
    blockedReason,
    reviewRequired: true,
    assertsPreference: false,
  };
}

/**
 * A1-7-3: `TentativePatternReport` → **`PrmDryRunProposal[]`**（pure・未永続化・review 必須・断定しない）。
 *   certainty low / evidence 不足 → blocked（observation）。tentative かつ十分 → candidate（reviewRequired）。**保存しない**。
 */
export function toPrmDryRunProposals(report: TentativePatternReport, opts?: PrmProjectionOptions): readonly PrmDryRunProposal[] {
  const minCandidateEvidence = opts?.minCandidateEvidence ?? DEFAULT_MIN_CANDIDATE_EVIDENCE;
  return report.patterns.map((p) => toProposal(p, minCandidateEvidence));
}

/**
 * A1-7-3: projection wrapper（candidate/blocked 分離 + 未永続化 marker）。**PRM 本体に保存しない**。
 */
export function projectPrmDryRun(report: TentativePatternReport, opts?: PrmProjectionOptions): PrmDryRunProjection {
  const proposals = toPrmDryRunProposals(report, opts);
  return {
    kind: "prm_dry_run_projection",
    totalPatterns: report.patterns.length,
    proposals,
    candidates: proposals.filter((p) => p.status === "candidate"),
    blocked: proposals.filter((p) => p.status === "blocked"),
    assertsPersonality: false,
    persisted: false,
  };
}

/** blocked 理由ラベル（display 用・controlled）。 */
export function blockedReasonLabel(code: BlockedReasonCode): string {
  return BLOCKED_REASON_LABEL[code];
}
