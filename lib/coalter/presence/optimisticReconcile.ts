/**
 * CoAlter Stage 2 — Optimistic Reconcile (L2-f、媒体非依存層)
 *
 * 正本: runtime contract §2.5 矛盾時の調停規則 / §2.6 片方先行容認
 *
 * 役割:
 *   - client optimistic update が server state と矛盾した時の調停
 *   - 「server が勝つ」原則の純関数実装
 *   - 入力欄の内容 (LocalState.inputDraft) は revert 対象外
 *   - 共有メモリ surface 同時編集は last-write-wins (§2.5 例外)
 *
 * 不可侵 (runtime §2.5):
 *   1. server が勝つ (client は revert)
 *   2. ユーザー入力は消さない (入力欄の内容は revert 対象外)
 *   3. 共有メモリ surface 編集 / 削除は同時編集時 last-write-wins (server 受信順)
 */

import type { LocalState } from "./localState";
import type { SharedState } from "./sharedState";

// ─────────────────────────────────────────────
// Reconcile input / output
// ─────────────────────────────────────────────

/**
 * Reconcile 入力。
 */
export interface ReconcileInput {
  /** client が optimistic に保持していた SharedState */
  optimistic: SharedState;
  /** server から broadcast された SharedState (正本) */
  serverState: SharedState;
  /** Local state (入力欄等は revert 対象外、§2.5-2) */
  localState: LocalState;
}

/**
 * Reconcile 結果。
 */
export interface ReconcileResult {
  /** 反映後の SharedState (server 勝ち) */
  nextShared: SharedState;
  /** 反映後の LocalState (入力欄は保持、§2.5-2) */
  nextLocal: LocalState;
  /** revert が発生したか (UI fade アニメ trigger) */
  reverted: boolean;
  /** どのフィールドが server で上書きされたか (debug) */
  changedFields: ReadonlyArray<keyof SharedState>;
}

// ─────────────────────────────────────────────
// Reconcile 本体
// ─────────────────────────────────────────────

/**
 * server 勝ちの調停を実行する。
 *
 * 1. SharedState は **常に server を採用** (optimistic を破棄、§2.5-1)
 * 2. LocalState は **保持** (input draft 等を消さない、§2.5-2)
 * 3. 共有メモリ surface は server の last-write-wins (server 既に解決済の前提)
 */
export function reconcileOptimistic(input: ReconcileInput): ReconcileResult {
  const optimistic = input.optimistic;
  const server = input.serverState;

  // どのフィールドが optimistic ↔ server で異なるかを検出 (debug 用)
  const changedFields: Array<keyof SharedState> = [];
  for (const key of Object.keys(server) as Array<keyof SharedState>) {
    if (!isFieldEqual(optimistic[key], server[key])) {
      changedFields.push(key);
    }
  }

  return {
    nextShared: server, // server が勝つ (§2.5-1)
    nextLocal: input.localState, // local は保持 (§2.5-2)
    reverted: changedFields.length > 0,
    changedFields,
  };
}

// ─────────────────────────────────────────────
// Field 比較 helper
// ─────────────────────────────────────────────

/**
 * SharedState の任意フィールドの shallow 比較。
 *
 * - primitive: ===
 * - array: length + element ===
 * - object: JSON.stringify
 *
 * 本関数は debug 用 (changedFields 列挙)。本物の immutable equality は不要。
 */
function isFieldEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

// ─────────────────────────────────────────────
// Last-write-wins (§2.5 例外、共有メモリ surface 同時編集)
// ─────────────────────────────────────────────

/**
 * Server 受信順で last-write-wins を適用する helper。
 *
 * 同一 id の項目について、より新しい timestamp を持つほうを採用する。
 * server が既にこの解決を行った前提だが、client 側でも同じロジックで再描画できるよう
 * helper として提供。
 */
export function lastWriteWins<T extends { id: string; updatedAt: number }>(
  a: T,
  b: T,
): T {
  if (a.id !== b.id) {
    throw new Error(
      `lastWriteWins: id 不一致 (${a.id} vs ${b.id}) — 同一項目に対してのみ呼ぶ`,
    );
  }
  return a.updatedAt >= b.updatedAt ? a : b;
}
