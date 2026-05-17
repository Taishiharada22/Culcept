/**
 * CoAlter AOO Phase B B-4b — Worth Gate (pure function)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §4.2
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.2 / §4 / §5
 *   - 型: lib/coalter/mirror/types.ts (B-4a)
 *   - 定数: lib/coalter/mirror/decisionConstants.ts (B-4a)
 *
 * 役割 (B-4b 段階):
 *   Decision Engine の **第 2 段 Gate**。「反射する価値があるか」を判定する。
 *   silence_budget / novelty / conversation_phase / time_since_last_speak の 4 条件。
 *
 * Gate ロジック (CEO B-4b 指示 2):
 *   1. silenceBudget === "high_70_to_100" → fail WORTH_SILENCE_BUDGET_HIGH
 *   2. observationNovelty が missing / NaN / 範囲外 / < WORTH_NOVELTY_MIN
 *      → fail WORTH_NOVELTY_LOW
 *   3. conversationPhase が "in_progress" 以外 → fail WORTH_CONVERSATION_PHASE_UNSUITABLE
 *   4. timeSinceLastSpeakTurns が missing / invalid / < WORTH_TIME_SINCE_MIN_TURNS
 *      → fail WORTH_TIME_SINCE_LAST_SPEAK_TOO_RECENT
 *   5. すべて通過 → passed: true
 *
 * 評価順序 (autonomous 設計判断):
 *   - CEO 指示順 (silenceBudget → novelty → phase → time_since) で短絡 return
 *   - silenceBudget を最初に置く理由: B-3 で既に bucket 化済 (validation 不要、定数比較のみ)
 *     で計算コスト最小、reason 報告として最も具体的
 *   - novelty / time_since はそれぞれ inline validation が必要 (Phase A bucket 化なし)
 *
 * 数値 validation 設計 (autonomous):
 *   - `isValidNumericInRange(v, 0, 1)`: number 型 + Number.isFinite + [0, 1] 範囲
 *     - NaN / Infinity / -Infinity / 非 number / null / undefined → false
 *     - 上記いずれかなら WORTH_NOVELTY_LOW として fail (fail-closed)
 *   - `isValidNonNegativeInteger(v)`: number 型 + Number.isInteger + ≥ 0
 *     - 浮動小数 / 負数 / NaN / Infinity / 非 number → false
 *     - WORTH_TIME_SINCE_LAST_SPEAK_TOO_RECENT として fail
 *
 * conversationPhase 評価 (autonomous 設計判断):
 *   - "in_progress" のみ pass (CEO B-4b 指示)
 *   - "greeting" / "closing" / "emergent" / "unknown" / undefined すべて fail
 *   - 初期 Phase B canary では "in_progress" のみに絞る (B-0 plan §4.2)
 *
 * No-Effect Contract:
 *   - pure / deterministic / side-effect-free
 *   - input mutation なし
 *   - 数値 validation は helper を inline (副作用ゼロ)
 *   - reason は MIRROR_STAY_SILENT_REASON const 経由のみ
 *
 * 不可侵境界:
 *   - 既存 presence layer / observer / chat layer touch なし
 *   - B-1 / B-2 / B-3 / B-4a zero diff
 *   - PII 非受理 (MirrorDecisionInput 経由のみ)
 */

import {
  MIRROR_STAY_SILENT_REASON,
  WORTH_NOVELTY_MIN,
  WORTH_TIME_SINCE_MIN_TURNS,
} from "../decisionConstants";
import type { GateResult, MirrorDecisionInput } from "../types";

/**
 * 数値が finite かつ [min, max] 範囲内かを判定する pure type guard。
 *
 * 拒否される入力:
 *   - 非 number (string / boolean / object / null / undefined)
 *   - NaN / Infinity / -Infinity (Number.isFinite で false)
 *   - 範囲外 (v < min || v > max)
 */
function isValidNumericInRange(v: unknown, min: number, max: number): v is number {
  return (
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= min &&
    v <= max
  );
}

/**
 * 数値が非負整数かを判定する pure type guard。
 *
 * 拒否される入力:
 *   - 非 number / NaN / Infinity (Number.isInteger で false)
 *   - 浮動小数 (5.5 等)
 *   - 負数 (-1 等)
 *   - null / undefined
 */
function isValidNonNegativeInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/**
 * Worth Gate — 「反射する価値があるか」を判定する pure function。
 *
 * 4 条件: silence_budget low/mid + novelty ≥ 0.5 + phase "in_progress" + time_since ≥ 5。
 *
 * @param input - {@link MirrorDecisionInput}
 * @returns {@link GateResult}
 *   - `{ passed: true }`: 4 条件すべて通過
 *   - `{ passed: false, reason }`: 最初に検出された fail 条件の reason
 *
 * @example
 *   checkWorthGate({ silenceBudget: { bucket: "high_70_to_100", ... }, ... })
 *     // → { passed: false, reason: "worth_gate_silence_budget_high" }
 *
 *   checkWorthGate({ ..., observationNovelty: 0.3, ... })
 *     // → { passed: false, reason: "worth_gate_novelty_low" }
 */
export function checkWorthGate(input: MirrorDecisionInput): GateResult {
  // (1) silenceBudget high
  // silenceBudget.status === "known" の前提 (Observe Gate で unknown は捕捉)、
  // 万一 unknown を渡されても bucket === "unknown" であり "high_70_to_100" には一致しない
  // のでここでは fail しない (Observe Gate fail のみ報告される設計、defense-in-depth)
  if (
    input.silenceBudget.status === "known" &&
    input.silenceBudget.bucket === "high_70_to_100"
  ) {
    return {
      passed: false,
      reason: MIRROR_STAY_SILENT_REASON.WORTH_SILENCE_BUDGET_HIGH,
    };
  }

  // (2) observationNovelty validation + threshold
  const novelty = input.observationNovelty;
  if (!isValidNumericInRange(novelty, 0, 1) || novelty < WORTH_NOVELTY_MIN) {
    return {
      passed: false,
      reason: MIRROR_STAY_SILENT_REASON.WORTH_NOVELTY_LOW,
    };
  }

  // (3) conversationPhase: "in_progress" のみ pass
  // undefined / "greeting" / "closing" / "emergent" / "unknown" すべて fail
  if (input.conversationPhase !== "in_progress") {
    return {
      passed: false,
      reason: MIRROR_STAY_SILENT_REASON.WORTH_CONVERSATION_PHASE_UNSUITABLE,
    };
  }

  // (4) timeSinceLastSpeakTurns validation + threshold
  const turns = input.timeSinceLastSpeakTurns;
  if (!isValidNonNegativeInteger(turns) || turns < WORTH_TIME_SINCE_MIN_TURNS) {
    return {
      passed: false,
      reason: MIRROR_STAY_SILENT_REASON.WORTH_TIME_SINCE_LAST_SPEAK_TOO_RECENT,
    };
  }

  return { passed: true };
}
