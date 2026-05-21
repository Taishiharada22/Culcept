/**
 * Quiet Undo Window — Phase 3 Idea 28 + Invariant 1 (強制しない) 補完。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-4 / §8.3 Quiet Undo Window flow / §10.5 Smoke 50
 *
 * 役割:
 *   proposal accept (= ExternalAnchor 化) 後 5 分間、 subtle 「戻す」 link を提供する。
 *   既存 Calendar AI は accept = final、 Aneurasync は **decision pre-commitment inversion**。
 *   user agency 最大化、 採用ハードル最小化。
 *
 * Storage:
 *   - localStorage key: `aneurasync.plan.proposalUndo.v1` (= versioned)
 *   - 5 分超過 record は read 側で filter 除外
 *   - undo (= 戻す) tap → deleteAnchorSource + record 削除
 *
 * UX (= 別 commit、 J-4 内では helper のみ):
 *   - 5 分以内: chip 跡地に subtle 「戻す」 link (= text-slate-400)
 *   - 5 分経過: link 消失、 anchor 通常運用
 *   - undo: dismiss log 追加なし (= 「採用は試行、 戻すも観察」)
 *
 * 不変原則:
 *   - Invariant 39 No Penalty for Ignore: undo / accept は感情中立、 警告色禁止
 *   - Invariant 32 Minimal Memory: localStorage 限定、 cross-device 同期なし
 */

import { deleteAnchorSource } from "@/lib/plan/anchor-fetch";
import type { DismissStorage } from "./dismissAction";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const UNDO_STORAGE_KEY = "aneurasync.plan.proposalUndo.v1";
export const UNDO_WINDOW_MS = 5 * 60 * 1000; // 5 分

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UndoRecord {
  /** accept された proposal id */
  readonly proposalId: string;
  /** server 生成された ExternalAnchorSource id (= delete 対象) */
  readonly anchorSourceId: string;
  /** accept 時刻 (= ISO 8601) */
  readonly acceptedAt: string;
}

/**
 * Storage interface — DismissStorage を再利用 (= 同一 abstraction)。
 */
export type UndoStorage = DismissStorage;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isValidUndoRecord(value: unknown): value is UndoRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.proposalId === "string" &&
    typeof v.anchorSourceId === "string" &&
    typeof v.acceptedAt === "string"
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pure builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * UndoRecord を pure に構築 (= test 容易)。
 */
export function buildUndoRecord(input: {
  proposalId: string;
  anchorSourceId: string;
  acceptedAt: string;
}): UndoRecord {
  return {
    proposalId: input.proposalId,
    anchorSourceId: input.anchorSourceId,
    acceptedAt: input.acceptedAt,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Window active 判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * record の undo window が現時点でアクティブか。
 *
 * 判定:
 *   - acceptedAt と now の差が 0 以上 5 分以下 → アクティブ
 *   - 不正 ISO → false (= defensive)
 *   - 未来 acceptedAt → false (= defensive)
 */
export function isUndoWindowActive(record: UndoRecord, now: string): boolean {
  const accepted = Date.parse(record.acceptedAt);
  const nowMs = Date.parse(now);
  if (isNaN(accepted) || isNaN(nowMs)) return false;
  const elapsed = nowMs - accepted;
  return elapsed >= 0 && elapsed <= UNDO_WINDOW_MS;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Storage read
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function readUndoRecords(storage: UndoStorage | null): UndoRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(UNDO_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidUndoRecord);
  } catch {
    return [];
  }
}

/**
 * proposalId に対応する active な undo record を返す (= 5 分以内 only)。
 */
export function findActiveUndoForProposal(
  storage: UndoStorage | null,
  proposalId: string,
  now: string,
): UndoRecord | null {
  const records = readUndoRecords(storage);
  const matched = records.find((r) => r.proposalId === proposalId);
  if (!matched) return null;
  if (!isUndoWindowActive(matched, now)) return null;
  return matched;
}

/**
 * 全 active undo record (= UI で 「戻す」 link 一覧表示用)。
 */
export function filterActiveUndos(
  storage: UndoStorage | null,
  now: string,
): UndoRecord[] {
  const records = readUndoRecords(storage);
  return records.filter((r) => isUndoWindowActive(r, now));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Storage write
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function recordUndoToStorage(
  storage: UndoStorage | null,
  record: UndoRecord,
): void {
  if (!storage) return;
  try {
    const existing = readUndoRecords(storage);
    const next = [...existing, record];
    storage.setItem(UNDO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // silent (= No Penalty for Ignore)
  }
}

export function removeUndoFromStorage(
  storage: UndoStorage | null,
  proposalId: string,
): void {
  if (!storage) return;
  try {
    const existing = readUndoRecords(storage);
    const next = existing.filter((r) => r.proposalId !== proposalId);
    storage.setItem(UNDO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // silent
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Undo action (= API call)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type UndoResult =
  | { ok: true }
  | { ok: false; reason: "no_active_undo" | "delete_failed"; detail?: string };

/**
 * Undo action — active record 検索 → deleteAnchorSource → record 削除。
 *
 * - active record なし or 5 分超過 → ok:false, reason:"no_active_undo"
 * - delete API 失敗 → ok:false, reason:"delete_failed", detail:err
 * - delete 成功 → record 削除 + ok:true
 *
 * dismiss log には書き込まない (= 「採用は試行、 戻すも観察」)。
 */
export async function undoProposalAccept(
  storage: UndoStorage | null,
  proposalId: string,
  now: string,
): Promise<UndoResult> {
  const record = findActiveUndoForProposal(storage, proposalId, now);
  if (!record) return { ok: false, reason: "no_active_undo" };

  const result = await deleteAnchorSource(record.anchorSourceId);
  if (!result.ok) {
    return { ok: false, reason: "delete_failed", detail: result.error };
  }

  removeUndoFromStorage(storage, proposalId);
  return { ok: true };
}
