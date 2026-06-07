/**
 * lib/plan/dayRehearsal/repairProtectSignal.ts — Repair Protect Signal v0（pure・read-only・unwired）
 *
 * `protect` disposition（use_recovery_window / protect_buffer）を、将来 Reality Control OS の
 * `recovery_core` 保護に渡せる **保護シグナル候補** に変換する純粋層。
 * ★Reality に接続しない・ChangeSet を作らない・applyChangeSet を使わない・予定変更しない。橋渡し候補を作るだけ。
 *
 * 不変原則（CEO/GPT 2026-06-07 GO）:
 *   - 対象は **protect disposition のみ**（use_recovery_window / protect_buffer）。
 *     adjust(leave_earlier) / confirm(confirm_uncertain) / reduce(reduce_density) は signal 対象外。
 *   - protect 判定は `classifyRepairDisposition` を **single source of truth** として利用（kind を直書きしない）。
 *   - 出力は将来 Reality `recovery_core` 保護に渡せる中立 shape（**Reality enum を import しない**・doc 文字列 hint）。
 *   - ★gap-vs-node 問題は v0 では解決しない: signal は **生の targetStepIndex** と evidence を保持するだけ
 *     （eventId/区間解決は coordination 後の別 slice）。
 *   - pure / Date 不使用 / 予定を動かさない / UI 配線しない / 入力を破壊しない。
 *   - 注: protect_buffer は Option D 不到達(dormant)のため本番では実質 use_recovery_window のみ emit。
 *     protectionHint は v0 では両者とも "recovery_core"（protect_buffer の cascade_guard 相当は dormant ゆえ defer）。
 */
import type { DayRepairCandidate, DayRepairKind } from "./dayRepairCandidates";
import type { Evidence } from "./dayRehearsalTypes";
import { classifyRepairDisposition } from "./repairDraftDisposition";

/** Reality `recovery_core` 相当の保護 hint（Reality enum を import しない・doc 文字列）。 */
export type RepairProtectionHint = "recovery_core";

/** 将来 Reality へ渡せる保護シグナル候補（v0 は targetStepIndex + evidence + hint のみ・eventId 未解決）。 */
export interface RepairProtectSignal {
  /** 元 protect candidate の kind（use_recovery_window / protect_buffer）。 */
  readonly kind: DayRepairKind;
  /** 該当 step（gap/convergence の step index・★eventId/区間解決は未実施=v0 では生のまま保持）。 */
  readonly targetStepIndex: number | null;
  /** Reality `recovery_core` 保護に渡す想定の hint。 */
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
      targetStepIndex: c.targetStepIndex, // 生のまま保持（gap-vs-node 未解決）
      protectionHint: "recovery_core",
      evidence: c.evidence, // 保持
    });
  }
  return signals;
}
