/**
 * CoAlter Stage 2 — modeReturnLogic (L2-h)
 *
 * 正本: UI spec §6.5 通常モードへの復帰
 *   - §6.5.1 自然退出 (自動): プラン完成後、即時 fade
 *   - §6.5.2 手動復帰 (ユーザー操作): モード切替 chip [通常] tap
 *
 * 責務:
 *   - 復帰すべきかの判定 (modeReducer の PLAN_COMPLETE / MANUAL_RETURN event 発火タイミング)
 *   - 復帰経路の分類 (自然退出 / 手動復帰)
 *
 * 非責務:
 *   - 文脈継承 (共有メモリ surface への格納) は L2-i memoryStore / modeContextManager
 *   - UI 視覚遷移 (fade animation) は preview 側 (L1-g ModeReturn.tsx)
 */

import type { PresenceMode } from "./types";

/**
 * 復帰経路 (§6.5.1 / §6.5.2)。
 */
export type ReturnPath = "natural_exit" | "manual_return";

/**
 * 復帰判定の入力。
 */
export interface ReturnDecisionInput {
  /** 現 mode (Daily / Travel 中のみ復帰判定の対象) */
  currentMode: PresenceMode;
  /**
   * Daily 1 日プラン or Travel Plan Brief 出力完了時 true。
   * §6.5.1 自然退出 trigger の根拠。
   */
  planComplete: boolean;
  /**
   * ユーザーが [通常] chip を tap した場合 true。
   * §6.5.2 手動復帰 trigger の根拠。
   */
  manualReturnRequested: boolean;
}

/**
 * 復帰判定結果。
 */
export interface ReturnDecision {
  /** 復帰すべきか */
  shouldReturn: boolean;
  /** 復帰経路 (復帰しない場合は null) */
  path: ReturnPath | null;
  /** 判定理由 */
  reason: string;
}

/**
 * 通常モード復帰判定 (§6.5)。
 *
 * 復帰条件:
 *   - currentMode が "daily" or "travel" (通常では復帰判定不要)
 *   - planComplete = true (§6.5.1 自然退出) または manualReturnRequested = true (§6.5.2)
 *
 * 複数 trigger が同時 true の場合は manual を優先 (ユーザー意思が上位)。
 */
export function decideReturn(input: ReturnDecisionInput): ReturnDecision {
  if (input.currentMode === "normal") {
    return {
      shouldReturn: false,
      path: null,
      reason: "currentMode=normal (既に通常、復帰判定不要)",
    };
  }

  if (input.manualReturnRequested) {
    return {
      shouldReturn: true,
      path: "manual_return",
      reason: "ユーザー [通常] tap (§6.5.2 手動復帰)",
    };
  }

  if (input.planComplete) {
    return {
      shouldReturn: true,
      path: "natural_exit",
      reason: "プラン完成 (§6.5.1 自然退出)",
    };
  }

  return {
    shouldReturn: false,
    path: null,
    reason: `currentMode=${input.currentMode} だが復帰 trigger なし`,
  };
}
