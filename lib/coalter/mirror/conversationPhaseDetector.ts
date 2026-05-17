/**
 * CoAlter AOO Phase B B-5a — Conversation Phase Detector (simple heuristic)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §5
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §5
 *
 * 役割 (B-5a 段階):
 *   会話 phase ("greeting" / "in_progress" / "closing" / "emergent" / "unknown") を
 *   **simple heuristic** で推定する pure function。
 *
 *   B-5a では chat message subscription なし → 入力情報が限定的:
 *     - messageCount: 会話 turn 数 (caller が知っていれば渡す、不明なら undefined)
 *     - lastMessageAgeMs: 最後の message からの経過時間 (caller が計算、不明なら undefined)
 *
 *   B-5b で chat message bridge 追加後、より正確な phase 検出に拡張可能。
 *
 * Heuristic 設計 (CEO 「in_progress 中心、unknown なら STAY_SILENT 寄り」):
 *   - messageCount === undefined → "unknown" (caller が知らない → defensive)
 *   - messageCount < 3 → "greeting" (会話冒頭、Mirror 不可 by B-4b Worth Gate)
 *   - messageCount >= 100 → "closing" (長時間会話の最終フェーズ、defensive 仮)
 *   - lastMessageAgeMs > 60_000 → "closing" (1 分以上無応答、ユーザー離脱可能性)
 *   - それ以外 → "in_progress" (Mirror 候補可)
 *
 *   **"emergent"** (緊急性検出) は B-5b/B-5c 以降で追加検討 (現状は in_progress 内)。
 *
 * No-Effect Contract:
 *   - pure / deterministic / side-effect-free
 *   - 入力 → 出力決定的
 *   - 副作用ゼロ
 *   - input mutation なし
 *   - PII 非受理 (numeric / number のみ受け付け)
 */

import type { ConversationPhase } from "./types";

/** "greeting" 判定の閾値 (message count < N で greeting)。 */
const GREETING_THRESHOLD = 3 as const;

/** "closing" 判定の closing message count 閾値 (>= N で closing)。 */
const CLOSING_MESSAGE_COUNT_THRESHOLD = 100 as const;

/** "closing" 判定の無応答時間閾値 (ms、> N で closing)。 */
const CLOSING_IDLE_MS_THRESHOLD = 60_000 as const;

/**
 * Conversation phase detector の入力。
 *
 * すべて optional (caller が知っているもののみ渡す)。
 * 不明な field は undefined のまま渡すと defensive な判定 (unknown 寄り) になる。
 */
export interface ConversationPhaseDetectorInput {
  /**
   * 会話開始からの message count (user + assistant 合計、turn 数相当)。
   *
   * undefined → "unknown" を返す (caller が情報を持っていない)。
   */
  readonly messageCount?: number;

  /**
   * 最後の message からの経過時間 (ms)。
   *
   * undefined → idle check skip (他条件で判定)。
   */
  readonly lastMessageAgeMs?: number;
}

/**
 * 数値が finite + 非負かを判定する pure helper。
 *
 * 拒否: 非 number / NaN / Infinity / 負数。
 */
function isValidNonNegativeNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * 会話 phase を simple heuristic で推定する **pure / deterministic / side-effect-free** 関数。
 *
 * @param input - {@link ConversationPhaseDetectorInput}
 * @returns {@link ConversationPhase}
 *
 * @example
 *   detectConversationPhase({})
 *     // → "unknown" (情報なし)
 *
 *   detectConversationPhase({ messageCount: 2 })
 *     // → "greeting"
 *
 *   detectConversationPhase({ messageCount: 15, lastMessageAgeMs: 5000 })
 *     // → "in_progress"
 *
 *   detectConversationPhase({ messageCount: 15, lastMessageAgeMs: 120000 })
 *     // → "closing" (2 分無応答)
 *
 *   detectConversationPhase({ messageCount: 200 })
 *     // → "closing" (長時間会話)
 */
export function detectConversationPhase(
  input: ConversationPhaseDetectorInput,
): ConversationPhase {
  // (1) messageCount 不明 → unknown (defensive、Worth Gate fail)
  if (!isValidNonNegativeNumber(input.messageCount)) {
    return "unknown";
  }

  const messageCount = input.messageCount;

  // (2) 長時間会話 → closing
  if (messageCount >= CLOSING_MESSAGE_COUNT_THRESHOLD) {
    return "closing";
  }

  // (3) 会話冒頭 → greeting (Worth Gate fail、Mirror 不可)
  if (messageCount < GREETING_THRESHOLD) {
    return "greeting";
  }

  // (4) 無応答時間長い → closing (idle 検出、user 離脱可能性)
  if (
    isValidNonNegativeNumber(input.lastMessageAgeMs) &&
    input.lastMessageAgeMs > CLOSING_IDLE_MS_THRESHOLD
  ) {
    return "closing";
  }

  // (5) 上記いずれにも該当しない → in_progress
  return "in_progress";
}

/**
 * **Test only**: 閾値 const を取得 (test verification 用)。
 *
 * @internal
 */
export function __getThresholdsForTest(): {
  readonly greetingThreshold: number;
  readonly closingMessageCountThreshold: number;
  readonly closingIdleMsThreshold: number;
} {
  return {
    greetingThreshold: GREETING_THRESHOLD,
    closingMessageCountThreshold: CLOSING_MESSAGE_COUNT_THRESHOLD,
    closingIdleMsThreshold: CLOSING_IDLE_MS_THRESHOLD,
  };
}
