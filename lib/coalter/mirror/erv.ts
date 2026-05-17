/**
 * CoAlter AOO Phase B B-4c — ERV (Expected Relationship Value) computation
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §3.1 / §10.3 (Conservative Bias)
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §3 / §10.3
 *   - 型: lib/coalter/mirror/types.ts (B-4a)
 *   - 定数: lib/coalter/mirror/decisionConstants.ts (B-4a)
 *
 * 役割 (B-4c 段階):
 *   `MirrorDecisionInput` から **ERV (Expected Relationship Value)** を計算する
 *   **pure / deterministic / side-effect-free** function。
 *
 *   ERV は「Mirror を 1 回返すことで、ユーザーの関係性理解が改善する期待値」を
 *   コスト (attention / autonomy / trust risk) から差し引いた純益 (0.0-1.0)。
 *
 * **B-4c では発話判定しない**:
 *   - `computeERV()` は **数値を返すだけ** で、それ自体は SPEAK / STAY_SILENT を決定しない
 *   - B-4d decisionEngine が ERV と Gate 結果と Counterfactual outcome を統合して
 *     `MirrorDecision` (STAY_SILENT / MIRROR_CANDIDATE) を生成する
 *   - 本 file からは `SPEAK_THRESHOLD_BASE` (0.75) を **参照しない**
 *     (decision logic との分離維持、B-4c 単体では threshold 比較しない)
 *
 * 数式 (B-0 §3.1 を具体化):
 *   ERV = ΔU - (attentionCost + autonomyCost + trustRisk + safetyMargin)
 *
 *   ΔU (Expected Understanding gain, additive 形式):
 *     ΔU = w_novelty * novelty
 *        + w_alignment * |alignment|     (strongly_+/- どちらも informative)
 *        + w_confidence * (1 - uncertainty)
 *     = 0.4 * novelty + 0.4 * alignmentStrength + 0.2 * (1 - uncertainty)
 *     (重み合計 1.0、ΔU は [0, 1] 範囲)
 *
 *   attentionCost = silenceBudget * 0.3
 *     (既に十分喋っている文脈で新たな Mirror = 注意消費コスト大)
 *
 *   autonomyCost = mode === "travel" ? 0.15 : 0.05
 *     (travel mode は体験優先、reflection 介入コスト高)
 *
 *   trustRisk = uncertainty * 0.2 + (ruptureFlag ? 0.4 : 0)
 *     (不確実 + rupture 兆候 → 誤発話で信頼毀損リスク大)
 *
 *   safetyMargin = 0.05
 *     (conservative bias: 「言い過ぎ」より「言わなさ過ぎ」を選ぶ Phase B 北極星)
 *
 *   ERV = clamp(ΔU - 上記合計, 0, 1)
 *
 * Calibration (tentative, B-5 canary で見直し):
 *   - 全 unknown → ERV ≈ 0 (defensive)
 *   - 普通 (novelty=0.7, |alignment|=0.6, uncertainty=0.2, silenceBudget=0.3, normal) → ERV ≈ 0.45
 *   - 良好 (novelty=0.9, |alignment|=0.9, uncertainty=0.1, silenceBudget=0.1, normal) → ERV ≈ 0.75
 *     (ちょうど SPEAK_THRESHOLD_BASE = 0.75 に到達)
 *   - 例外的良好 (全 perfect) → ERV ≈ 0.90 (COUNTERFACTUAL_ERV_BAR = 0.85 を超える)
 *
 *   この calibration により:
 *     - 普通の観測では SPEAK しない (silent default)
 *     - 良好以上の観測で初めて Counterfactual を経て SPEAK 候補
 *     - 例外的に明確な観測でのみ Mirror 発話 (B-0 §10.4 NC Index 設計と整合)
 *
 * Unknown / Invalid 入力の取り扱い (defensive defaults):
 *   - novelty: undefined/NaN/Infinity/範囲外 → 0 (ΔU 寄与なし)
 *   - alignment.status === "unknown" → 0 (ΔU 寄与なし)
 *   - uncertainty.status === "unknown" → 1 (max risk、ΔU 大幅減 + trustRisk max)
 *   - silenceBudget.status === "unknown" → 1 (max consumed、attentionCost max)
 *   - modeContext.status === "unknown" → travel 扱い (autonomyCost max、conservative)
 *   - ruptureFlag !== true → 0 (CEO B-4b 仕様: true のみ感知)
 *
 *   結果: 不明入力ほど ERV が下がる → fail-closed
 *
 * No-Effect Contract (B-1 から継承):
 *   - pure / deterministic / side-effect-free
 *   - I/O / network / storage / DOM / event / timer / log 一切なし
 *   - input mutation なし
 *   - 副作用ゼロ (Math.abs / Math.min / Math.max のみ使用、すべて pure)
 *
 * 不可侵境界 (B-0 §9 / Phase A 継承):
 *   - 既存 presence layer / observer / chat layer touch なし
 *   - B-1 / B-2 / B-3 / B-4a / B-4b zero diff
 *   - PII 受理なし (MirrorDecisionInput 経由のみ)
 *
 * B-4d 計画 (本 file は変更しない):
 *   - B-4d decisionEngine が本関数の戻り値を `SPEAK_THRESHOLD_BASE` と比較
 *   - B-4d で `MIRROR_CANDIDATE` 生成 / `STAY_SILENT` 分岐 を実装
 *   - 本 file は B-4d で `computeERV()` を import される pure utility
 */

import type { MirrorDecisionInput } from "./types";

// =============================================================================
// ERV formula coefficients (tentative, B-5 canary calibration 対象)
// =============================================================================

/**
 * ΔU additive 形式の重み (合計 1.0)。
 *
 * - novelty 重み 0.4: 「新規性」が ΔU の最大寄与因子
 * - alignment 重み 0.4: 「観測パターン強度」が同等
 * - confidence 重み 0.2: 「不確実性低」は補正項
 */
export const ERV_NOVELTY_WEIGHT = 0.4 as const;
export const ERV_ALIGNMENT_WEIGHT = 0.4 as const;
export const ERV_CONFIDENCE_WEIGHT = 0.2 as const;

/** silence_budget による attention cost weight。 */
export const ERV_ATTENTION_WEIGHT = 0.3 as const;

/** mode === "travel" / unknown の autonomy cost (体験優先文脈、介入高コスト)。 */
export const ERV_AUTONOMY_COST_TRAVEL = 0.15 as const;

/** mode === "normal" | "daily" の autonomy cost (通常の介入コスト)。 */
export const ERV_AUTONOMY_COST_BASE = 0.05 as const;

/** uncertainty による trust risk weight (不確実 → 誤発話で信頼毀損)。 */
export const ERV_TRUST_WEIGHT = 0.2 as const;

/** ruptureFlag === true の追加 penalty (rupture 兆候時の致命的リスク)。 */
export const ERV_RUPTURE_PENALTY = 0.4 as const;

/** Conservative bias (B-0 §10.3): 「言い過ぎ」より「言わなさ過ぎ」を選ぶ Phase B 北極星。 */
export const ERV_SAFETY_MARGIN = 0.05 as const;

// =============================================================================
// Internal helpers (pure, defensive value extraction)
// =============================================================================

/**
 * observationNovelty を 0..1 の数値として安全に抽出する pure helper。
 *
 * 不正入力 (非 number / NaN / Infinity / 範囲外) は **0** に正規化 (ΔU 寄与なし)。
 */
function extractNoveltyValue(input: MirrorDecisionInput): number {
  const v = input.observationNovelty;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) return 0;
  return v;
}

/**
 * alignment の **絶対値 strength** を 0..1 の数値として抽出する pure helper。
 *
 * - status === "unknown" → 0
 * - status === "known" → |raw| (strongly_negative も strongly_positive も同等 informative)
 * - raw が範囲外 / NaN → 0 (defensive)
 */
function extractAlignmentStrength(input: MirrorDecisionInput): number {
  if (input.alignment.status !== "known") return 0;
  const raw = input.alignment.raw;
  if (!Number.isFinite(raw)) return 0;
  return Math.min(1, Math.abs(raw));
}

/**
 * uncertainty 数値を 0..1 として安全に抽出する pure helper。
 *
 * - status === "unknown" → **1** (max risk、defensive)
 * - status === "known" → raw (範囲外 / NaN なら 1)
 */
function extractUncertaintyValue(input: MirrorDecisionInput): number {
  if (input.uncertainty.status !== "known") return 1;
  const raw = input.uncertainty.raw;
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return 1;
  return raw;
}

/**
 * silence_budget 数値を 0..1 として安全に抽出する pure helper。
 *
 * - status === "unknown" → **1** (max consumed、defensive)
 * - status === "known" → raw (範囲外 / NaN なら 1)
 */
function extractSilenceBudgetValue(input: MirrorDecisionInput): number {
  if (input.silenceBudget.status !== "known") return 1;
  const raw = input.silenceBudget.raw;
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return 1;
  return raw;
}

/**
 * autonomy cost を mode に基づいて返す pure helper。
 *
 * - modeContext unknown → travel 扱い (conservative、autonomyCost max)
 * - mode === "travel" → travel cost
 * - mode === "normal" | "daily" → base cost
 */
function extractAutonomyCost(input: MirrorDecisionInput): number {
  if (input.modeContext.status !== "known") return ERV_AUTONOMY_COST_TRAVEL;
  if (input.modeContext.mode === "travel") return ERV_AUTONOMY_COST_TRAVEL;
  return ERV_AUTONOMY_COST_BASE;
}

/**
 * ruptureFlag === true なら 1、それ以外 (false / null / undefined) は 0 を返す pure helper。
 *
 * CEO B-4b 仕様: ruptureFlag は **true のみ** 感知 (asymmetric vs userOverrideSleep)。
 */
function extractRuptureRisk(input: MirrorDecisionInput): number {
  return input.ruptureFlag === true ? 1 : 0;
}

/**
 * 数値を [min, max] にクランプする pure helper。
 *
 * NaN / Infinity 等が混入していても 0 に丸める defensive 実装。
 */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// =============================================================================
// Public API: computeERV
// =============================================================================

/**
 * MirrorDecisionInput から ERV (Expected Relationship Value) を計算する
 * **pure / deterministic / side-effect-free** function。
 *
 * 数式 (詳細は本 file 冒頭 jsdoc 参照):
 *   ERV = clamp(
 *           ΔU - attentionCost - autonomyCost - trustRisk - safetyMargin,
 *           0, 1
 *         )
 *
 * 戻り値は **0.0..1.0 の finite number 保証** (clamp + NaN 防御)。
 *
 * **B-4c では発話判定しない**: 本関数は数値を返すだけ、SPEAK / STAY_SILENT 決定は
 * B-4d decisionEngine が行う。
 *
 * @param input - {@link MirrorDecisionInput}
 * @returns 0.0..1.0 の finite number (defensive clamp 適用)
 *
 * @example
 *   computeERV({
 *     modeContext: { status: "known", mode: "normal", ... },
 *     alignment: { status: "known", bucket: "strongly_positive", raw: 0.9, ... },
 *     uncertainty: { status: "known", bucket: "low_0_to_30", raw: 0.1, ... },
 *     silenceBudget: { status: "known", bucket: "low_0_to_30", raw: 0.1, ... },
 *     patternCategory: { status: "known", bucket: "null_pattern", ... },
 *     observationNovelty: 0.9,
 *     conversationPhase: "in_progress",
 *     timeSinceLastSpeakTurns: 10,
 *     ruptureFlag: false,
 *     userOverrideSleep: false,
 *   })
 *   // → ≈ 0.75 (SPEAK_THRESHOLD_BASE 到達)
 *
 *   computeERV({ ...全 unknown })
 *   // → 0 (defensive)
 */
export function computeERV(input: MirrorDecisionInput): number {
  // (1) Components
  const novelty = extractNoveltyValue(input);                  // [0, 1]
  const alignmentStrength = extractAlignmentStrength(input);   // [0, 1]
  const uncertaintyValue = extractUncertaintyValue(input);     // [0, 1]
  const silenceBudgetValue = extractSilenceBudgetValue(input); // [0, 1]
  const ruptureRisk = extractRuptureRisk(input);               // 0 or 1
  const autonomyCost = extractAutonomyCost(input);             // 0.05 or 0.15

  // (2) Expected Understanding gain (additive 形式、重み合計 1.0)
  const deltaU =
    ERV_NOVELTY_WEIGHT * novelty +
    ERV_ALIGNMENT_WEIGHT * alignmentStrength +
    ERV_CONFIDENCE_WEIGHT * (1 - uncertaintyValue);

  // (3) Costs
  const attentionCost = silenceBudgetValue * ERV_ATTENTION_WEIGHT;
  const trustRisk = uncertaintyValue * ERV_TRUST_WEIGHT + ruptureRisk * ERV_RUPTURE_PENALTY;

  // (4) Raw ERV
  const ervRaw =
    deltaU - attentionCost - autonomyCost - trustRisk - ERV_SAFETY_MARGIN;

  // (5) Clamp to [0, 1] with defensive NaN guard
  return clamp(ervRaw, 0, 1);
}
