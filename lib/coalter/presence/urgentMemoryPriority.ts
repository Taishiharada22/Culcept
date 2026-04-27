/**
 * CoAlter Stage 2 — urgent layer × memory surface 優先順位 (L2-k)
 *
 * 正本: UI spec §8.6 全体
 *   - §8.6.1 平常時 / 緊急時の優先順位
 *   - §8.6.2 降格 vs 縮退の使い分け
 *   - §8.6.3 同時出現禁止組み合わせ
 *   - §8.6.4 遷移アニメのトーン連続性
 *
 * 責務:
 *   - 同時出現禁止組み合わせの構造的 enforce
 *   - 平常時 / 緊急時の memory surface 状態 (主 / 降格 / 縮退) を返す helper
 *
 * 不可侵 (§8.6.1 / §8.6.3):
 *   - 平常時に urgent layer の弱キュー (inline_cue) を恒常表示しない
 *   - 緊急時に memory surface を平常時と同じサイズで残さない
 *   - 5 同時出現禁止組み合わせを enforce
 */

import type { PresenceState } from "./types";
import type { MemoryFallback, UrgentForm } from "./urgentTrigger";

/**
 * Memory surface の表示状態 (§8.6.1)。
 */
export type MemorySurfacePresence = "primary" | "demoted" | "compacted" | "hidden";

/**
 * §8.6.3 5 同時出現禁止組み合わせ。
 *
 * 各組み合わせは UI 構造で発生しないよう本関数群で gate する。
 */
export interface ForbiddenCoexistence {
  description: string;
  reason: string;
}

export const FORBIDDEN_COEXISTENCES: ReadonlyArray<ForbiddenCoexistence> = [
  {
    description: "memory drawer 展開中 + urgent dominant_card 発火",
    reason: "2 つの大型 UI 衝突 → drawer を先に縮退させてから urgent を出す",
  },
  {
    description: "urgent 中 + memory batch 更新キュー表示",
    reason: "注意分散 → batch 更新は urgent 解除後に繰越",
  },
  {
    description: "複数 urgent layer 重ね表示",
    reason: "§8.5.4 上位優先切替で置換、重ねない",
  },
  {
    description: "urgent dominant_card 内に memory inline_reference 埋め込み",
    reason: "情報密度過多、urgent の主役性が薄れる",
  },
  {
    description: "urgent + S7 提案カード同居",
    reason: "提案と緊急介入は意味的競合 (plan §4.9 / §8.6.3)",
  },
];

// ─────────────────────────────────────────────
// 同時出現 gate
// ─────────────────────────────────────────────

export interface CoexistenceCheckInput {
  urgentActive: boolean;
  urgentForm?: UrgentForm;
  memoryDrawerOpen?: boolean;
  memoryBatchUpdatePending?: boolean;
  memoryInlineRefInUrgent?: boolean;
  presenceState: PresenceState;
  /** 既に他 urgent layer が active か (multiple urgent 防止) */
  anotherUrgentActive?: boolean;
}

export interface CoexistenceCheckResult {
  ok: boolean;
  /** 違反した組み合わせ index (FORBIDDEN_COEXISTENCES の) */
  violationIndex: number | null;
  reason: string;
}

/**
 * 5 禁止組み合わせを順にチェックし、最初の違反を返す。
 */
export function checkCoexistence(
  input: CoexistenceCheckInput,
): CoexistenceCheckResult {
  // ① memory drawer + urgent dominant_card
  if (
    input.urgentActive &&
    input.urgentForm === "dominant_card" &&
    input.memoryDrawerOpen
  ) {
    return {
      ok: false,
      violationIndex: 0,
      reason: FORBIDDEN_COEXISTENCES[0].reason,
    };
  }
  // ② urgent + memory batch 更新キュー
  if (input.urgentActive && input.memoryBatchUpdatePending) {
    return {
      ok: false,
      violationIndex: 1,
      reason: FORBIDDEN_COEXISTENCES[1].reason,
    };
  }
  // ③ 複数 urgent
  if (input.urgentActive && input.anotherUrgentActive) {
    return {
      ok: false,
      violationIndex: 2,
      reason: FORBIDDEN_COEXISTENCES[2].reason,
    };
  }
  // ④ urgent dominant_card 内 memory inline_reference
  if (
    input.urgentActive &&
    input.urgentForm === "dominant_card" &&
    input.memoryInlineRefInUrgent
  ) {
    return {
      ok: false,
      violationIndex: 3,
      reason: FORBIDDEN_COEXISTENCES[3].reason,
    };
  }
  // ⑤ urgent + S7 同居
  if (input.urgentActive && input.presenceState === "S7") {
    return {
      ok: false,
      violationIndex: 4,
      reason: FORBIDDEN_COEXISTENCES[4].reason,
    };
  }
  return { ok: true, violationIndex: null, reason: "no coexistence violation" };
}

// ─────────────────────────────────────────────
// Memory surface presence resolver (§8.6.1 / §8.6.2)
// ─────────────────────────────────────────────

/**
 * urgent / memory の状態 → memory surface の表示状態を決定。
 *
 * - urgent 非 active           : primary (panel / drawer / inline reference)
 * - urgent active + demote     : demoted
 * - urgent active + compact    : compacted
 */
export function resolveMemoryPresence(
  urgentActive: boolean,
  fallback: MemoryFallback | null,
): MemorySurfacePresence {
  if (!urgentActive) return "primary";
  if (fallback === "demote") return "demoted";
  if (fallback === "compact") return "compacted";
  // urgent active だが fallback 未指定 → 防御的に compacted (主役性確保)
  return "compacted";
}
