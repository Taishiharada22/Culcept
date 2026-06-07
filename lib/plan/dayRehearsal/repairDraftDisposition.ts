/**
 * lib/plan/dayRehearsal/repairDraftDisposition.ts — Repair Draft Disposition v0（pure・read-only・unwired）
 *
 * Day Rehearsal Repair Candidate を「将来どう予定変更に橋渡すか」の **disposition に分類するだけ**の純粋層。
 * ★新しい RepairDraft / ChangeSet は作らない。Reality Control OS に接続しない。予定変更・repair 実行・apply はしない。
 *
 * 不変原則（CEO/GPT 2026-06-07 GO）:
 *   - 「予定変更の下書き」層は既存（Reality Control OS の ChangeOp/ChangeSet/applyChangeSet）。本層は **再発明しない**。
 *     ここは candidate → disposition の **分類 spec** のみ。実 ChangeSet 生成は full path（magnitude）+ Reality coordination 後。
 *   - ★**v0 は全 kind で `draftable: false`**（実 ChangeSet を作れる kind は無い）:
 *       leave_earlier は変更寄り(adjust)だが Option D に magnitude(shortfall) が無く・Reality move mode も未実装 ⇒ 二重ブロック。
 *       reduce_density は変更寄り(reduce)だが target 無し・予定変更/最適化に最も見える ⇒ v0 では draft 化しない。
 *       confirm/protect はそもそも plan-change でない（確認タスク / 保護シグナル）。
 *   - `realityHint`（将来の Reality 対応の doc 文字列）/ `blockers` / `evidence` を保持してよい。**Reality enum を import しない**（couple 回避・doc 文字列のみ）。
 *   - suggestion copy は変更しない（candidate のものをそのまま参照保持）。
 *   - pure / Date 不使用 / 予定を動かさない / UI 配線しない / 入力を破壊しない。
 */
import type { DayRepairCandidate, DayRepairKind } from "./dayRepairCandidates";
import type { Evidence } from "./dayRehearsalTypes";

/** candidate が将来どの種類の扱いになるかの分類（変更/確認/保護/削減）。 */
export type RepairDisposition = "adjust" | "confirm" | "protect" | "reduce";

export interface RepairDraftDisposition {
  readonly kind: DayRepairKind;
  /** 将来の扱い: adjust=時間調整(変更寄り) / confirm=確認タスク / protect=維持・保護 / reduce=削減(変更寄り)。 */
  readonly disposition: RepairDisposition;
  /** ★v0 は常に false（実 ChangeSet を作れる kind は無い）。 */
  readonly draftable: boolean;
  /** 将来 Reality へ橋渡すときの対応（doc 文字列・Reality を import しない）。 */
  readonly realityHint: string;
  /** draftable=false の理由 / 将来の前提（doc 文字列）。 */
  readonly blockers: readonly string[];
  /** 元 candidate の prose（参照・無改変）。 */
  readonly suggestion: string;
  /** trace（candidate 由来を保持）。 */
  readonly evidence: Evidence;
}

/** kind → 分類定義（deterministic・per-kind・v0 は draftable 全 false）。 */
const DISPOSITION: Readonly<
  Record<DayRepairKind, { disposition: RepairDisposition; realityHint: string; blockers: readonly string[] }>
> = {
  // 変更寄り（adjust）だが二重ブロックで draft 化不可。
  leave_earlier: {
    disposition: "adjust",
    realityHint: "update(move): 該当 event を早める方向（Reality update op 相当）",
    blockers: ["no_magnitude(option_d)", "reality_move_mode_unimplemented"],
  },
  // 予定変更でなく確認タスク。
  confirm_uncertain: {
    disposition: "confirm",
    realityHint: "verify_travel: 移動/travel の確認タスク（ChangeSet 外・INV-23 tentative/確認）",
    blockers: ["not_a_plan_change(verification_task)"],
  },
  // 予定変更でなく既存余白の維持・保護。
  use_recovery_window: {
    disposition: "protect",
    realityHint: "protection:recovery_core: この余白を埋めない（Reality governance シグナル）",
    blockers: ["not_a_plan_change(protection_signal)"],
  },
  // 保護（Option D 不到達=dormant）。
  protect_buffer: {
    disposition: "protect",
    realityHint: "protection:cascade_guard|recovery_core: この前後の余白を守る（Reality governance シグナル）",
    blockers: ["not_a_plan_change(protection_signal)", "dormant(option_d_unreachable)"],
  },
  // 変更寄り（reduce）だが target 無し・予定変更/最適化に最も見える ⇒ v0 では draft 化しない。
  reduce_density: {
    disposition: "reduce",
    realityHint: "optimize(remove|shorten): droppable/shortenable を先に（Reality Optimize・INV-7）",
    blockers: ["no_target", "optimize_domain", "v0_excluded(plan_change_appearance)"],
  },
};

/** 1 candidate を disposition に分類（純粋・予定変更なし・v0 は draftable false）。 */
export function classifyRepairDisposition(candidate: DayRepairCandidate): RepairDraftDisposition {
  const d = DISPOSITION[candidate.kind];
  return {
    kind: candidate.kind,
    disposition: d.disposition,
    draftable: false, // ★v0 は全 kind false（実 ChangeSet を作らない）
    realityHint: d.realityHint,
    blockers: d.blockers,
    suggestion: candidate.suggestion, // 無改変
    evidence: candidate.evidence, // 保持
  };
}

/** 候補配列をまとめて分類（順序保持・純粋）。 */
export function classifyRepairDispositions(candidates: readonly DayRepairCandidate[]): readonly RepairDraftDisposition[] {
  return candidates.map(classifyRepairDisposition);
}
