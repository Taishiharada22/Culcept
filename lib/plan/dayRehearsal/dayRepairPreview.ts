/**
 * lib/plan/dayRehearsal/dayRepairPreview.ts — Repair Candidate What-if Preview v0（pure・read-only・定性）
 *
 * Repair 候補を**実行する前に**「この方向で考えると何が軽くなりそうか / 何がまだ未確定か」を read-only で説明する。
 * ★予定変更・repair 実行・保存・最適化・自動リスケなし。**定量（何分改善等）は出さない**（定性のみ）。
 *
 * 不変原則（CEO/GPT 2026-06-07 GO）:
 *   - 定性 preview のみ。raw feasibility / re-simulation を使わない（v0 では raw 数値が無い＝定量不能）。
 *   - category 3 系統: effect（詰まり/余白/重なりを軽くしそう）/ clarity（未確定の確認）/ utilization（既存の一息余白の活用）。
 *   - **「改善します」「解決します」断定禁止**。「危険」「警告」「失敗」「疲れる」「壊れる」「絶対」「すべき」禁止。生スコア・数値なし。
 *   - confidence は high/medium/low の **level のみ（数値化しない）**。effect=仮説的→medium/low、clarity/utilization=観測由来→high。
 *   - reduce_density は予定変更に見えやすいので **弱く扱う**（具体的な予定削除/変更を促さない）。
 *   - evidence trace を保持（candidate 由来）。pure / Date 不使用 / UI 配線しない。
 *   - ★rehearsal/raw feasibility は v0 定性では不要（candidate が targeted signal を持つ）。定量 re-simulation は別 slice。
 */
import type { DayRepairCandidate, DayRepairKind } from "./dayRepairCandidates";
import type { Evidence } from "./dayRehearsalTypes";

export type RepairEffectCategory = "effect" | "clarity" | "utilization";
export type RepairConfidence = "high" | "medium" | "low";

export interface RepairEffectPreview {
  readonly kind: DayRepairKind;
  readonly category: RepairEffectCategory;
  /** user-facing な短い見出し。 */
  readonly headline: string;
  /** 1 文の説明（断定でなく仮説トーン）。 */
  readonly body: string;
  /** 確度 level（数値化しない）。effect=medium/low（仮説）・clarity/utilization=high（観測由来）。 */
  readonly confidence: RepairConfidence;
  /** 何がまだ未確定か（定量を出さないため度合いは常に未確定扱い）。 */
  readonly uncertainty: readonly string[];
  /** 内部 trace（candidate 由来・user には raw 表示しない）。 */
  readonly evidence: Evidence;
  /** 該当 step（保持のみ・UI にはまだ出さない）。 */
  readonly appliesTo: number | null;
}

/** kind → 定性 preview の内容（deterministic・per-kind）。 */
const PREVIEW: Readonly<
  Record<DayRepairKind, { category: RepairEffectCategory; confidence: RepairConfidence; headline: string; body: string; uncertainty: readonly string[] }>
> = {
  leave_earlier: {
    category: "effect",
    confidence: "medium",
    headline: "余白を守りやすくなるかも",
    body: "この前後の余白を少し守りやすくなるかもしれません。",
    uncertainty: ["どのくらい余白が変わるかは未確定です"],
  },
  protect_buffer: {
    category: "effect",
    confidence: "medium",
    headline: "予定が重なりにくくなりそう",
    body: "この前後の余白を残せると、予定が重なりにくそうです。",
    uncertainty: ["効果の度合いは未確定です"],
  },
  confirm_uncertain: {
    category: "clarity",
    confidence: "high",
    headline: "見通しが立てやすくなりそう",
    body: "未確定の部分を確認できると、見通しが立てやすくなりそうです。",
    uncertainty: ["確認するまでは余白が未確定です"],
  },
  use_recovery_window: {
    category: "utilization",
    confidence: "high",
    headline: "一息つく時間に使えそう",
    body: "ここを一息つく時間として使えると、次の予定に入りやすそうです。",
    uncertainty: [],
  },
  reduce_density: {
    category: "effect",
    confidence: "low", // v0 は弱く扱う（予定変更に見えやすい）
    headline: "全体に余白を作りやすく",
    body: "立て込む区間を少し軽くできると、余白を守りやすいかもしれません。",
    uncertainty: ["どの予定をどうするかは決めつけません"],
  },
};

/** 1 候補の read-only 定性 preview を返す（純粋・予定変更なし・定量なし）。 */
export function previewRepairEffect(candidate: DayRepairCandidate): RepairEffectPreview {
  const p = PREVIEW[candidate.kind];
  return {
    kind: candidate.kind,
    category: p.category,
    headline: p.headline,
    body: p.body,
    confidence: p.confidence,
    uncertainty: p.uncertainty,
    evidence: candidate.evidence,
    appliesTo: candidate.targetStepIndex,
  };
}

/** 候補配列の preview をまとめて返す（順序保持・純粋）。 */
export function previewRepairEffects(candidates: readonly DayRepairCandidate[]): readonly RepairEffectPreview[] {
  return candidates.map(previewRepairEffect);
}
