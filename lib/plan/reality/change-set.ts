/**
 * Reality Control OS — Change-set / Undo（変更差分・可逆性）
 *
 * 親設計: docs/aneurasync-live-plan-controller-golden-scenarios.md
 * 関連 Invariant:
 *   INV-24 Reversibility: 全変更を change-set として保存。複数予定の追加/移動/削除を
 *          atomic に undo 可能。before/after・影響範囲・理由・source trace・permission
 *          boundary を保持。5 分 Undo は最低保証、大規模は当日/session 復元。
 *   INV-5  自動実行の境界: 他人/予約/支払い(hard_external)・immovable を触る change-set は確認必須。
 *
 * 設計判断（独立推論）:
 *   - undo の核は invertOp/invertChangeSet（add↔remove、update は before/after swap）。
 *     一括 Daily Plan も ops 配列を逆順に反転するだけで atomic に戻せる。
 *   - permission boundary は authority.ts と接続して算出（モデルの一貫性）。
 *
 * 制約: 純関数のみ。I/O・DB・Date.now なし（時刻は呼び出し側から分で渡す）。
 */

import { isImmovable, hasProtection, type PlanItemGovernance } from "./authority";
import type { SourceTrace } from "./source-trace";

/** before/after に使う plan item の最小スナップショット（既存型と疎結合） */
export interface PlanItemSnapshot {
  readonly itemId: string;
  /** 基準時刻からの分 */
  readonly startMin?: number;
  readonly endMin?: number;
  readonly title?: string;
  readonly governance?: PlanItemGovernance;
  readonly sourceTraces?: readonly SourceTrace[];
}

export type ChangeOp =
  | { readonly kind: "add"; readonly itemId: string; readonly after: PlanItemSnapshot }
  | { readonly kind: "remove"; readonly itemId: string; readonly before: PlanItemSnapshot }
  | {
      readonly kind: "update"; // move / shorten 等（timing/fields の before→after）
      readonly itemId: string;
      readonly before: PlanItemSnapshot;
      readonly after: PlanItemSnapshot;
    };

export interface ChangeSet {
  readonly id: string;
  readonly ops: readonly ChangeOp[];
  readonly reason: string;
  /** この変更の根拠（なぜこの change-set か） */
  readonly sourceTraces: readonly SourceTrace[];
}

/** op の逆操作（INV-24 atomic undo の核）。add↔remove、update は before/after swap。 */
export function invertOp(op: ChangeOp): ChangeOp {
  if (op.kind === "add") {
    return { kind: "remove", itemId: op.itemId, before: op.after };
  }
  if (op.kind === "remove") {
    return { kind: "add", itemId: op.itemId, after: op.before };
  }
  // update
  return { kind: "update", itemId: op.itemId, before: op.after, after: op.before };
}

/**
 * change-set 全体の逆（ops を逆順に反転）。
 * 複数予定の一括変更でも atomic に undo できる（順序依存を逆順で吸収）。
 */
export function invertChangeSet(cs: ChangeSet): ChangeSet {
  const ops = [...cs.ops].reverse().map(invertOp);
  return {
    id: `${cs.id}:undo`,
    ops,
    reason: `Undo: ${cs.reason}`,
    sourceTraces: [{ kind: "change_set", ref: cs.id, reason: `undo of ${cs.id}`, confidence: 1 }],
  };
}

/** 影響を受ける item id（重複排除） */
export function affectedItemIds(cs: ChangeSet): string[] {
  return [...new Set(cs.ops.map((o) => o.itemId))];
}

/** 複数 op = bulk（一括 Daily Plan 提案など） */
export function isBulk(cs: ChangeSet): boolean {
  return cs.ops.length > 1;
}

/** op の主対象スナップショット（permission 判定用）。remove は before、それ以外は after。 */
function subjectSnapshot(op: ChangeOp): PlanItemSnapshot {
  return op.kind === "remove" ? op.before : op.after;
}

/**
 * 確認必須か（INV-5）。
 * 他人/予約/支払い(hard_external) や immovable を触る change-set は自動適用せず確認。
 */
export function changeSetRequiresConfirmation(cs: ChangeSet): boolean {
  return cs.ops.some((op) => {
    const g = subjectSnapshot(op).governance;
    if (!g) return false;
    return hasProtection(g, "hard_external") || isImmovable(g);
  });
}

// --- Undo entry / window (INV-24: 5min 最低保証, bulk は session 復元) ---

export const DEFAULT_MIN_UNDO_WINDOW_MIN = 5;
/** 当日/session 復元の代理窓（12h）。bulk Daily Plan に適用。 */
export const DEFAULT_SESSION_WINDOW_MIN = 720;

export interface UndoEntry {
  readonly changeSet: ChangeSet;
  readonly inverted: ChangeSet;
  readonly committedAtMin: number;
  readonly undoableUntilMin: number;
  /** bulk は session 中復元可（UI に「元に戻す」導線を残す） */
  readonly sessionRestorable: boolean;
}

/**
 * undo エントリを作る。
 * 単一変更 = 最低 5 分。bulk（一括 Daily Plan）= session 窓まで延長 + sessionRestorable。
 * 時刻は呼び出し側から分で渡す（純関数・Date.now を内部で使わない）。
 */
export function makeUndoEntry(
  cs: ChangeSet,
  committedAtMin: number,
  opts?: { readonly minUndoWindowMin?: number; readonly sessionWindowMin?: number }
): UndoEntry {
  const bulk = isBulk(cs);
  const minWindow = opts?.minUndoWindowMin ?? DEFAULT_MIN_UNDO_WINDOW_MIN;
  const sessionWindow = opts?.sessionWindowMin ?? DEFAULT_SESSION_WINDOW_MIN;
  const windowMin = bulk ? Math.max(minWindow, sessionWindow) : minWindow;
  return {
    changeSet: cs,
    inverted: invertChangeSet(cs),
    committedAtMin,
    undoableUntilMin: committedAtMin + windowMin,
    sessionRestorable: bulk,
  };
}

export function isUndoable(entry: UndoEntry, nowMin: number): boolean {
  return nowMin <= entry.undoableUntilMin;
}
