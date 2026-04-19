/**
 * CoAlter Phase 2 — Pre-router gate (2026-04-19 v0.3)
 *
 * 位置づけ: 中核原則「mode selection と 安全/同意ゲート と 実行器を分離」の
 * **ゲート層**。mode は返さない。通すか止めるかの二値判定のみ。
 *
 * 参照: docs/coalter-phase2-3mode-design.md §1.2
 *
 * 責務:
 *  1. consent.state !== "active"  → no-op（起動拒否）
 *  2. emotion_heat.severity === "high"  → no-op（専門機関提示 / 介入拒否）
 *  3. 通過                            → Mode router に委譲
 *
 * 制約（CEO 実装固定条件）:
 *  - **純関数**（副作用禁止）。DB 書き込み / UI 文言生成を入れない。
 *  - emotion_heat.severity === "mid" は**ここでは扱わない**。
 *    mid は Post-router modifier の責務（語調・質問数調整）。
 */

import type {
  PreRouterGateInput,
  PreRouterGateResult,
} from "./types";

/**
 * Pre-router gate 判定。
 *
 * 通過条件: consent === "active" かつ emotion_heat.severity !== "high"
 *
 * @param input consent と emotion_heat のみ
 * @returns 通過なら { pass: true }、そうでなければ reason 付き否決
 */
export function evaluatePreRouterGate(
  input: PreRouterGateInput,
): PreRouterGateResult {
  // 1. 同意チェック
  if (input.consent !== "active") {
    return { pass: false, reason: "consent_not_active" };
  }

  // 2. 安全ブロック（high のみ）
  if (input.emotionHeat.severity === "high") {
    return {
      pass: false,
      reason: "emotion_heat_high",
      emotionReason: input.emotionHeat.reason ?? null,
    };
  }

  // 3. 通過（mid / low / undefined は通す。mid は後段 modifier で処理）
  return { pass: true };
}
