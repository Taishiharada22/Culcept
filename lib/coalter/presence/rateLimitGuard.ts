/**
 * CoAlter Stage 2 — Rate Limit Guard (L2-l)
 *
 * 正本: UI spec §1.6 連投抑制 / Core UX v1.1 §5.2 (1 発話 1 タスク) / §5.3 (長く話さない) / §11.4 (連投禁止) / §8.6 (5 分再起動)
 *
 * 責務:
 *   - 発話前 guard で 4 違反を構造的に reject
 *
 * 4 チェック:
 *   ① 同一 state で 2 連発禁止 (active utterance あれば reject、§1.6)
 *   ② cooldown 中 (normal_s8 5 分) の発話 reject
 *   ③ 1 発話 1 pattern (§5.2) — 複数 variant の同時実行 禁止
 *   ④ 文長制約 (§5.3 2-4 行) — 行数超過 reject
 *
 * 不変原則: ログ警告ではなく **enforce** (試行に対して reject、plan §5.12 Gate)。
 */

import type { PatternVariant, PresenceState } from "./types";
import { hasActiveUtterance, type UtteranceQueueState } from "./utteranceQueue";

// ─────────────────────────────────────────────
// 行数制約 (§5.3)
// ─────────────────────────────────────────────

/** §5.3: 上部レイヤーの発話は 2-4 行程度 */
export const MIN_UTTERANCE_LINES = 1;
export const MAX_UTTERANCE_LINES = 4;

// ─────────────────────────────────────────────
// 入力 / 出力型
// ─────────────────────────────────────────────

export interface UtteranceCandidate {
  /** 発話パターン (1 つのみ、§5.2) */
  variant: PatternVariant;
  /** 現 state */
  state: PresenceState;
  /** 文面 (行数判定用、§5.3) */
  body: string;
  /** 同時発火しようとする他 pattern variant (§5.2 違反検出用) */
  concurrentVariants?: ReadonlyArray<PatternVariant>;
}

export interface GuardInput {
  candidate: UtteranceCandidate;
  queueState: UtteranceQueueState;
  /** normal_s8 cooldown active か (5 分再起動禁止、v1.1 §8.6) */
  normalS8CooldownActive?: boolean;
  /** 直近 5 分以内に同 state 発話を行ったか (§1.6 / §8.6) */
  recentSameStateWithin5Min?: boolean;
}

export interface GuardResult {
  allowed: boolean;
  /** どの違反か (allowed=true なら null) */
  violation:
    | "concurrent_active_utterance"
    | "normal_s8_cooldown_active"
    | "recent_same_state_within_5min"
    | "multiple_pattern_in_one_turn"
    | "line_length_violation"
    | null;
  reason: string;
}

// ─────────────────────────────────────────────
// Guard 本体
// ─────────────────────────────────────────────

/**
 * 発話前の 4 重チェック。
 *
 * 早期 return: 1 つでも違反あれば即 reject。複数違反あっても最初のもののみ報告。
 */
export function guardUtterance(input: GuardInput): GuardResult {
  // ① 同一スロットに active 発話 → 2 連発禁止 (§1.6)
  if (hasActiveUtterance(input.queueState)) {
    return {
      allowed: false,
      violation: "concurrent_active_utterance",
      reason: "active 発話が既に存在 (§1.6 連投構造的禁止)",
    };
  }

  // ② normal_s8 cooldown 中
  if (input.normalS8CooldownActive) {
    return {
      allowed: false,
      violation: "normal_s8_cooldown_active",
      reason: "normal_s8 cooldown active (5 分再起動禁止、v1.1 §8.6)",
    };
  }

  // ② (続) 同 state で 5 分以内の発話履歴あり
  if (input.recentSameStateWithin5Min) {
    return {
      allowed: false,
      violation: "recent_same_state_within_5min",
      reason:
        "直近 5 分以内に同 state 発話あり (§1.6 / v1.1 §8.6 5 分再起動禁止)",
    };
  }

  // ③ 1 発話 1 pattern (§5.2) — concurrentVariants が空でない場合違反
  if (
    input.candidate.concurrentVariants &&
    input.candidate.concurrentVariants.length > 0
  ) {
    return {
      allowed: false,
      violation: "multiple_pattern_in_one_turn",
      reason: `複数 pattern 同時 (concurrent=${input.candidate.concurrentVariants.length}、§5.2 1 発話 1 タスク違反)`,
    };
  }

  // ④ 行数制約 (§5.3)
  const lineCount = countLines(input.candidate.body);
  if (lineCount < MIN_UTTERANCE_LINES || lineCount > MAX_UTTERANCE_LINES) {
    return {
      allowed: false,
      violation: "line_length_violation",
      reason: `行数 ${lineCount} (許容 ${MIN_UTTERANCE_LINES}-${MAX_UTTERANCE_LINES}、§5.3 2-4 行原則)`,
    };
  }

  return {
    allowed: true,
    violation: null,
    reason: "all guards passed",
  };
}

// ─────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────

/**
 * 改行数 + 1 で行数を数える。空文字列は 0、末尾改行は数えない。
 */
function countLines(body: string): number {
  if (body.length === 0) return 0;
  // 末尾の改行は無視 (trailing newline)
  const trimmed = body.endsWith("\n") ? body.slice(0, -1) : body;
  return trimmed.split("\n").length;
}
