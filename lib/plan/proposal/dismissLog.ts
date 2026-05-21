/**
 * Dismiss Log Reader — Phase 3 J-1c (= read-only)。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §2.2 表現 invariant 14 (Cross-day memory) / §3.1 J-1c
 *
 * 役割:
 *   dismiss 履歴を 7 日 retention で抽出する pure helper。
 *   実 storage (= localStorage 書込み) は Phase 3-J-3 で実装。
 *   本 module は **read filter のみ**、 mutation なし。
 *
 * 不変原則:
 *   - Invariant 14 Cross-day memory: 7 日 retention、 同 proposal は 7 日経過まで再出さない
 *   - Invariant 39 No Penalty for Ignore: dismiss 履歴を UI で nag に変換禁止 (= 本 module は count のみ提供)
 *   - データは localStorage 限定 (= Phase 3-J-3 で実装、 本 module は data structure と filter のみ)
 */

import type { ProposalReason } from "./proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const DEFAULT_DISMISS_RETENTION_DAYS = 7;
const MS_PER_DAY = 86400000;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DismissLogEntry {
  /** dismiss された proposal id (= "proposal_..." prefix) */
  readonly proposalId: string;
  /** proposal の signal 種類 (= debug + 統計用) */
  readonly reason: ProposalReason;
  /** dismiss 時刻 (= ISO 8601) */
  readonly dismissedAt: string;
}

/**
 * Dismiss Log Reader interface — production では localStorage 由来、 test では in-memory。
 */
export interface DismissLogReader {
  /** 全 entries を返す (= caller が date filter する) */
  readAll(): ReadonlyArray<DismissLogEntry>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function parseIso(iso: string): number {
  const t = Date.parse(iso);
  return isNaN(t) ? 0 : t;
}

/**
 * 指定 retention 日数内の dismiss event のみ抽出。
 *
 * - 不正な ISO は除外
 * - now より未来の event も除外 (= defensive)
 */
export function filterRecentDismisses(
  entries: ReadonlyArray<DismissLogEntry>,
  now: string,
  retentionDays: number = DEFAULT_DISMISS_RETENTION_DAYS,
): DismissLogEntry[] {
  const nowMs = parseIso(now);
  if (nowMs === 0) return [];
  const cutoffMs = nowMs - retentionDays * MS_PER_DAY;
  return entries.filter((e) => {
    const eMs = parseIso(e.dismissedAt);
    return eMs > 0 && eMs >= cutoffMs && eMs <= nowMs;
  });
}

/**
 * 特定 proposal が retention 内に dismiss されたか。
 */
export function wasRecentlyDismissed(
  entries: ReadonlyArray<DismissLogEntry>,
  proposalId: string,
  now: string,
  retentionDays: number = DEFAULT_DISMISS_RETENTION_DAYS,
): boolean {
  const recent = filterRecentDismisses(entries, now, retentionDays);
  return recent.some((e) => e.proposalId === proposalId);
}

/**
 * retention 内の dismiss event 件数を返す (= 各種 auto-scale ロジック用)。
 */
export function countRecentDismisses(
  entries: ReadonlyArray<DismissLogEntry>,
  now: string,
  retentionDays: number = DEFAULT_DISMISS_RETENTION_DAYS,
): number {
  return filterRecentDismisses(entries, now, retentionDays).length;
}
