// lib/talk/intentTranslation/interventionControl.ts
// 三段階介入モデル — Alert Fatigue 防止
//
// 学術的基盤:
//   - PMC (2024): 医療分野でアラート80%削減しても安全性維持
//   - Signal Detection Theory in UX: 重要なアラートとノイズを分離
//   - PLOS ONE: intelligent notifications > daily > occasional
//
// 設計:
//   Silent  (risk < 0.3): 介入なし、内部ログのみ
//   Passive (0.3-0.6):    ユーザーがタップすると表示（プル型）
//   Active  (risk ≥ 0.6): 送信前に自動表示（プッシュ型、1日3回まで）
//
//   cooldown: 同一会話で Active が2回連続 → 30分間 Passive に降格

import type {
  InterventionLevel,
  InterventionCooldownState,
} from "./types";
import {
  MAX_ACTIVE_INTERVENTIONS_PER_DAY,
  CONSECUTIVE_ACTIVE_THRESHOLD,
  COOLDOWN_DURATION_MS,
} from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cooldown 判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * cooldown 状態を考慮した最終的な介入レベルを返す。
 *
 * Active が日次上限に達した場合、Passive に降格。
 * 連続 Active で cooldown 中の場合も Passive に降格。
 */
export function resolveInterventionLevel(
  rawLevel: InterventionLevel,
  cooldown: InterventionCooldownState,
): InterventionLevel {
  if (rawLevel !== "active") return rawLevel;

  // 1日上限チェック
  if (cooldown.activeCountToday >= MAX_ACTIVE_INTERVENTIONS_PER_DAY) {
    return "passive";
  }

  // cooldown 中チェック
  if (cooldown.inCooldown && cooldown.cooldownUntil) {
    const now = Date.now();
    const until = new Date(cooldown.cooldownUntil).getTime();
    if (now < until) {
      return "passive";
    }
  }

  return "active";
}

/**
 * Active 介入が実行された後、cooldown 状態を更新する。
 */
export function updateCooldownAfterActive(
  current: InterventionCooldownState,
): InterventionCooldownState {
  const newConsecutive = current.consecutiveActiveInConversation + 1;

  // 連続 Active が閾値に達したら cooldown 発動
  if (newConsecutive >= CONSECUTIVE_ACTIVE_THRESHOLD) {
    return {
      activeCountToday: current.activeCountToday + 1,
      consecutiveActiveInConversation: newConsecutive,
      inCooldown: true,
      cooldownUntil: new Date(Date.now() + COOLDOWN_DURATION_MS).toISOString(),
    };
  }

  return {
    activeCountToday: current.activeCountToday + 1,
    consecutiveActiveInConversation: newConsecutive,
    inCooldown: false,
    cooldownUntil: null,
  };
}

/**
 * Passive/Silent 介入後、連続カウンタをリセットする。
 */
export function resetConsecutiveActive(
  current: InterventionCooldownState,
): InterventionCooldownState {
  return {
    ...current,
    consecutiveActiveInConversation: 0,
  };
}

/**
 * 新しい日の初期状態を生成する。
 */
export function createFreshCooldownState(): InterventionCooldownState {
  return {
    activeCountToday: 0,
    consecutiveActiveInConversation: 0,
    inCooldown: false,
    cooldownUntil: null,
  };
}
