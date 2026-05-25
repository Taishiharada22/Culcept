/**
 * User State Inference — Phase 3 Invariant 40 (Theory-of-Mind Pause) + Idea 26。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §2.6 Contract invariant 40 / §3.1 J-1c
 *
 * 役割:
 *   user の dismiss 反応から疲労 / 不快を推論し、 自動で proposal を pause する。
 *   既存 Calendar AI が user の無反応に関係なく押し続けるのに対し、
 *   Aneurasync は user signal を **観察 (= Theory-of-Mind reasoning)** して自己抑制する。
 *
 * pause 発動条件 (= default):
 *   - 直近 24 時間で dismiss 3+ → 24 時間 proposal 0
 *
 * TestOverride: bypassUserStatePause で無効化可 (= smoke で proposal 動作確認用)。
 */

import type { TestOverrideContext } from "./testOverrideContext";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DISMISS_PAUSE_THRESHOLD = 3;
const PAUSE_WINDOW_MS = 24 * 3600 * 1000;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DismissEvent {
  /** dismiss 発生時刻 (= ISO 8601) */
  readonly dismissedAt: string;
  /** dismiss 対象 proposal id */
  readonly proposalId: string;
}

export interface UserStateInferenceInput {
  /** 直近 dismiss event 配列 (= 入力時点で 7 日 retention 済を期待) */
  readonly dismissEvents: ReadonlyArray<DismissEvent>;
  /** 現在時刻 (= ISO 8601) */
  readonly now: string;
  /** test override */
  readonly testOverride?: TestOverrideContext;
}

export interface UserStateInferenceResult {
  /** 24 時間内 dismiss count */
  readonly recent24hDismissCount: number;
  /** Theory-of-Mind Pause 発動中か */
  readonly isPaused: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function parseIso(iso: string): number {
  const t = Date.parse(iso);
  return isNaN(t) ? 0 : t;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Inference
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * dismiss 履歴から user 状態を推論。
 *
 * 24 時間内 dismiss 3+ で pause 発動 (= proposal 一時停止)。
 * testOverride.bypassUserStatePause で無効化。
 */
export function inferUserStatePause(input: UserStateInferenceInput): UserStateInferenceResult {
  const nowMs = parseIso(input.now);
  if (nowMs === 0) {
    return { recent24hDismissCount: 0, isPaused: false };
  }
  const cutoffMs = nowMs - PAUSE_WINDOW_MS;

  const recent24h = input.dismissEvents.filter((e) => {
    const eMs = parseIso(e.dismissedAt);
    return eMs >= cutoffMs && eMs <= nowMs;
  });
  const count = recent24h.length;

  if (input.testOverride?.bypassUserStatePause) {
    return { recent24hDismissCount: count, isPaused: false };
  }

  return {
    recent24hDismissCount: count,
    isPaused: count >= DISMISS_PAUSE_THRESHOLD,
  };
}
