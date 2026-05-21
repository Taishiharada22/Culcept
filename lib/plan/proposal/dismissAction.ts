/**
 * Dismiss Action — Phase 3-J-3 dismiss path 実装。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-3 / §10.1 Smoke 6 / §10.6 Smoke 51
 *
 * 役割:
 *   ProposalChip の onDismiss callback から呼ばれ、 dismiss event を storage に記録。
 *   storage は dependency-injected (= test では in-memory、 production では localStorage)。
 *
 * Storage key: `aneurasync.plan.proposalDismiss.v1` (= versioned)
 *
 * 不変原則:
 *   - Invariant 14 Cross-day memory: 7 日 retention (= filterRecentDismisses で消費)
 *   - Invariant 32 Minimal Memory: storage は localStorage のみ、 cross-device 同期なし
 *   - Invariant 39 No Penalty for Ignore: dismiss 失敗時 silent (= user 操作妨げない)
 *
 * Counter-Factual Bookmark (= Idea 14) は Phase 3-M 預け、 本 J-3 では実装しない。
 */

import type { DismissLogEntry, DismissLogReader } from "./dismissLog";
import type { ProposedAnchor } from "./proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const DISMISS_STORAGE_KEY = "aneurasync.plan.proposalDismiss.v1";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Storage interface (= DI による test 容易性)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Storage abstraction — production は localStorage、 test は in-memory。
 */
export interface DismissStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * production 用 browser localStorage adapter。
 * SSR / non-browser env では null を返す (= silent fallback)。
 */
export function getBrowserDismissStorage(): DismissStorage | null {
  if (typeof window === "undefined") return null;
  if (typeof window.localStorage === "undefined") return null;
  return {
    getItem: (k) => window.localStorage.getItem(k),
    setItem: (k, v) => window.localStorage.setItem(k, v),
  };
}

/**
 * test 用 in-memory adapter。
 * tests/unit/plan/proposalDismissAction.test.ts 等で使用。
 */
export function createInMemoryDismissStorage(initial?: string): DismissStorage {
  let store: string | null = initial ?? null;
  return {
    getItem: () => store,
    setItem: (_, v) => {
      store = v;
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isValidEntry(value: unknown): value is DismissLogEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.proposalId === "string" &&
    typeof v.reason === "string" &&
    typeof v.dismissedAt === "string"
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pure record builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DismissActionInput {
  readonly proposal: ProposedAnchor;
  readonly dismissedAt: string; // ISO 8601
}

/**
 * 副作用なしの DismissLogEntry builder。 test 容易。
 */
export function buildDismissLogEntry(input: DismissActionInput): DismissLogEntry {
  return {
    proposalId: input.proposal.id,
    reason: input.proposal.reason,
    dismissedAt: input.dismissedAt,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Storage read
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * storage から DismissLogEntry 配列を読む。
 * malformed / 不在で空配列。
 */
export function readDismissesFromStorage(
  storage: DismissStorage | null,
): DismissLogEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

/**
 * DismissLogReader として wrap (= 既存 dismissLog.ts API と統合)。
 */
export function createStorageBackedDismissLogReader(
  storage: DismissStorage | null,
): DismissLogReader {
  return {
    readAll: () => readDismissesFromStorage(storage),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Storage write (= append)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * dismiss event を storage に append。 失敗時 silent (= user 影響なし)。
 */
export function recordDismissToStorage(
  storage: DismissStorage | null,
  input: DismissActionInput,
): void {
  if (!storage) return;
  const entry = buildDismissLogEntry(input);

  try {
    const existing = readDismissesFromStorage(storage);
    const next = [...existing, entry];
    storage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // silent — Invariant 39 No Penalty for Ignore に整合
  }
}
