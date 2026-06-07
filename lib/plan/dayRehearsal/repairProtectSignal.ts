/**
 * lib/plan/dayRehearsal/repairProtectSignal.ts — Repair Protect Signal v1（pure・read-only・unwired）
 *
 * `protect` disposition（use_recovery_window / protect_buffer）を、将来 Reality Control OS の
 * **gap-meaning `recovery`（INV-17「空白は埋めない・意味づけする」）** に渡せる **保護シグナル候補** に変換する純粋層。
 * ★Reality に接続しない・ChangeSet を作らない・applyChangeSet を使わない・予定変更しない。橋渡し候補を作るだけ。
 *
 * v1 補正（Reality Bridge Contract Audit 2026-06-07）:
 *   - ★protectionHint を `recovery_core`(node) → **`recovery`(gap-meaning)** に補正。
 *     理由: use_recovery_window は **gap**。Reality の node `recovery_core` は remove/update のみ弾き **add は無害扱い**（gap を埋めるのを止めない）。
 *     gap を「埋めない」保護は gap-meaning `recovery`（INV-17）が正しい対応先。targetStepIndex→GapNode 解決は `repairGapResolver.ts`。
 *
 * 不変原則（CEO/GPT 2026-06-07 GO）:
 *   - 対象は **protect disposition のみ**（use_recovery_window / protect_buffer）。
 *     adjust(leave_earlier) / confirm(confirm_uncertain) / reduce(reduce_density) は signal 対象外。
 *   - protect 判定は `classifyRepairDisposition` を **single source of truth** として利用（kind を直書きしない）。
 *   - 出力は将来 Reality gap-meaning `recovery` に渡せる中立 shape（**Reality enum を import しない**・doc 文字列 hint）。
 *   - ★gap-vs-node 解決はこの層では行わない: signal は **生の targetStepIndex** と evidence を保持するだけ
 *     （GapNode 解決は `repairGapResolver.ts`＝dayGraph を要する別層）。
 *   - pure / Date 不使用 / 予定を動かさない / UI 配線しない / 入力を破壊しない。
 *   - 注: protect_buffer は Option D 不到達(dormant)のため本番では実質 use_recovery_window のみ emit。
 *     protectionHint は v1 では両者とも "recovery"（protect_buffer の node 寄り保護＝gap resolver では解決しない=defer）。
 */
import type { DayRepairCandidate, DayRepairKind } from "./dayRepairCandidates";
import type { Evidence } from "./dayRehearsalTypes";
import { classifyRepairDisposition } from "./repairDraftDisposition";

/** Reality gap-meaning `recovery`（INV-17）相当の保護 hint（Reality enum を import しない・doc 文字列）。 */
export type RepairProtectionHint = "recovery";

/** 将来 Reality へ渡せる保護シグナル候補（v0 は targetStepIndex + evidence + hint のみ・eventId 未解決）。 */
export interface RepairProtectSignal {
  /** 元 protect candidate の kind（use_recovery_window / protect_buffer）。 */
  readonly kind: DayRepairKind;
  /** 該当 step（gap/convergence の step index・★eventId/区間解決は未実施=v0 では生のまま保持）。 */
  readonly targetStepIndex: number | null;
  /** Reality gap-meaning `recovery` 保護に渡す想定の hint。 */
  readonly protectionHint: RepairProtectionHint;
  /** trace（candidate 由来を保持）。 */
  readonly evidence: Evidence;
}

/**
 * protect disposition の candidate を保護シグナルに変換（純粋・予定変更なし・Reality 非接続）。
 * - disposition !== "protect" の candidate は除外（adjust/confirm/reduce は signal 化しない）。
 * - 順序保持。targetStepIndex / evidence は candidate のものを保持（無改変）。
 */
export function exportRepairProtectSignals(candidates: readonly DayRepairCandidate[]): readonly RepairProtectSignal[] {
  const signals: RepairProtectSignal[] = [];
  for (const c of candidates) {
    // protect 判定は disposition 分類器を single source of truth として利用。
    if (classifyRepairDisposition(c).disposition !== "protect") continue;
    signals.push({
      kind: c.kind,
      targetStepIndex: c.targetStepIndex, // 生のまま保持（GapNode 解決は repairGapResolver）
      protectionHint: "recovery",
      evidence: c.evidence, // 保持
    });
  }
  return signals;
}
