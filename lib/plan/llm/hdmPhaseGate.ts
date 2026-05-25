/**
 * Phase 3-N Plan P2 Step 2 v3.1 — HDM Phase ゲート (= 個別化解禁判定)
 *
 * 設計書: docs/alter-plan-p2-llm-step2-readiness-v3.md §3.3 + §1.5
 *
 * 設計原則:
 *   - server-only (= 実 Stargazer hdmPhaseState 取得を想定)
 *   - **pure helper + thin async wrapper** (= 同 Phase → 同 gate result、 deterministic)
 *   - **fail-open** (= Phase 取得失敗時は Phase 0 fallback、 個別化 skip 安全側)
 *
 * Phase 別の個別化解禁レベル (= HDM v1 原則整合):
 *   - Phase 0-1 (= 接触 / 友達化): **skip** (= 「あなた」 主語 framing 早すぎる)
 *   - Phase 2 (= 心の復元): stable layer 注入 (= 一般 「あなた」 主語可、 hedging 弱)
 *   - Phase 3 (= 本人化): stable + recent (= 直近の状態を踏まえた hedging)
 *   - Phase 4-5 (= 多視点統合 / 現実返還): full (= 「あなたの軸では…」 深い framing 解禁)
 *
 * Trust level は補助 (= Phase で gate、 Trust < 3 では hedging 強化、 prompt 側で扱う)
 *
 * 設計書 references:
 *   - lib/plan/llm/personalModelExtractorV2.ts (= getPhaseReadoutLevel 流用)
 *   - lib/stargazer/hdmPhase.ts (= 別 Step で wire、 Step 2 v3.1 は synthetic 受け取り)
 */

import "server-only";

import {
  getPhaseReadoutLevel,
  type PhaseReadoutLevel,
} from "./personalModelExtractorV2";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gate decision (= 出力型)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Phase ゲート判定結果
 *
 * - allowPersonalModelInjection: Phase ≥ 2 で true
 * - readoutLevel: どの layer まで充填するか (= phaseReadoutLevel)
 * - framingHint: prompt builder に渡す文体ガイド (= Phase 別 hedging level)
 */
export type PhaseGateResult = {
  readonly allowPersonalModelInjection: boolean;
  readonly readoutLevel: PhaseReadoutLevel;
  readonly framingHint: PhaseFramingHint;
};

/**
 * Phase 別文体ガイド (= prompt 側で hedging を制御)
 */
export type PhaseFramingHint =
  | "no_personal_framing"      // Phase 0-1: 一般文体、 「あなた」 主語禁止
  | "soft_personal_with_hedge" // Phase 2: 「あなた」 OK、 hedging 強 (= 「〜の傾向」 等)
  | "moderate_personal"        // Phase 3: hedging 弱化、 推論可
  | "deep_personal_framing";   // Phase 4-5: 「あなたの軸では…」 深い framing 解禁

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase → framing hint (= pure helper)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getPhaseFramingHint(hdmPhase: number): PhaseFramingHint {
  if (hdmPhase < 2) return "no_personal_framing";
  if (hdmPhase === 2) return "soft_personal_with_hedge";
  if (hdmPhase === 3) return "moderate_personal";
  return "deep_personal_framing"; // 4-5
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gate evaluation (= pure)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Phase からゲート判定を生成 (= pure、 hdmPhase 単一 input)
 *
 * - 全 Phase で readoutLevel + framingHint を deterministic に決定
 * - allowPersonalModelInjection は Phase ≥ 2 で true
 *
 * 入力 mutate なし、 同 phase → 同 result。
 */
export function evaluatePhaseGate(hdmPhase: number): PhaseGateResult {
  const readoutLevel = getPhaseReadoutLevel(hdmPhase);
  const framingHint = getPhaseFramingHint(hdmPhase);
  return {
    allowPersonalModelInjection: hdmPhase >= 2,
    readoutLevel,
    framingHint,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Async wrapper (= 実 Stargazer wire 用 entry、 Step 2 v3.1 では Phase 0 fallback)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * userId から Phase ゲート判定 (= server entry、 Step 2 v3.1 stub)
 *
 * Step 2 v3.1: 実 Stargazer hdmPhaseState 取得未着手のため、 Phase 0 fallback。
 *   - userId 不在 → Phase 0 (= 完全 deterministic)
 *   - userId 指定あり → Phase 0 (= 別 Step で本実装に置換)
 *
 * production live ON 前に実 wire 完成必須 (= 別 readiness の責務)。
 */
export async function evaluatePhaseGateForUser(
  userId?: string,
): Promise<PhaseGateResult> {
  // Step 2 v3.1 stub: 実 wire 未着手、 safe Phase 0 fallback
  if (userId === undefined || userId.length === 0) {
    return evaluatePhaseGate(0);
  }
  // 実 hdmPhase 取得は別 Step で wire
  return evaluatePhaseGate(0);
}
