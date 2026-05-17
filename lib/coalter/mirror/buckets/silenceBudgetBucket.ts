/**
 * CoAlter AOO Phase B — Silence Budget Bucket (B-3)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §5 axis 1 / §4.2
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.3 / §6 / §9
 *   - 型定義: ../types.ts (B-2 で新設、B-3 で bucket 型追加)
 *
 * 役割:
 *   silence budget (0..1, 会話内発話量比率) を 3 段階 + unknown に分類する
 *   **pure / deterministic / side-effect-free** function。
 *
 * 閾値設計 (Phase A `lib/coalter/observer/relationshipStateTypes.ts` の
 * `SilenceBudgetBucket` 命名 `low_0_to_30` / `mid_30_to_70` / `high_70_to_100` に合わせる):
 *   - `low_0_to_30`:     0.0  ≤ x <  0.3 (発話余裕大)
 *   - `mid_30_to_70`:    0.3  ≤ x <  0.7 (中庸)
 *   - `high_70_to_100`:  0.7  ≤ x ≤  1.0 (満杯、追加発話 NG)
 *
 * unknown 判定:
 *   - null / undefined → unknown
 *   - NaN / Infinity / -Infinity → unknown
 *   - 範囲外 (x < 0.0 || x > 1.0) → unknown (fail-closed)
 *   - 型外 → unknown (runtime defensive)
 *
 * canProceedToMirrorDecision 設計 (B-0 plan §4.2 Worth Gate):
 *   - `low_0_to_30` / `mid_30_to_70` → canProceed = true (発話余裕あり)
 *   - `high_70_to_100` → canProceed = false (既に十分発話、Worth Gate fail-closed)
 *   - `unknown` → canProceed = false (fail-closed)
 *
 * B-0 plan の `silence_budget ≥ 0.7` 閾値と一致 (`high_70_to_100` 開始 = 0.7)。
 *
 * 設計境界:
 *   - 既存 presence layer / observer / chat layer touch なし
 *   - PII 非受理
 *   - 副作用なし / input mutation なし
 */

import type {
  SilenceBudgetBucketInput,
  SilenceBudgetBucketResult,
} from "../types";

const SILENCE_BUDGET_MIN = 0.0;
const SILENCE_BUDGET_MAX = 1.0;

function isValidSilenceBudgetNumber(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= SILENCE_BUDGET_MIN &&
    v <= SILENCE_BUDGET_MAX
  );
}

/**
 * Silence budget score を bucket に分類する **pure / deterministic / side-effect-free** 関数。
 *
 * @param input - {@link SilenceBudgetBucketInput}
 *   - `silenceBudget`: 0..1 範囲、null / undefined / 不正値 → unknown
 *
 * @returns {@link SilenceBudgetBucketResult}
 *   - `low_0_to_30` / `mid_30_to_70` (known, canProceed: true)
 *   - `high_70_to_100` (known, canProceed: false — Worth Gate fail)
 *   - `unknown` (raw: null, canProceed: false)
 *
 * @example
 *   classifySilenceBudgetBucket({ silenceBudget: 0.5 })
 *     // → { status: "known", bucket: "mid_30_to_70", raw: 0.5,
 *     //     canProceedToMirrorDecision: true }
 *
 *   classifySilenceBudgetBucket({ silenceBudget: 0.85 })
 *     // → { status: "known", bucket: "high_70_to_100", raw: 0.85,
 *     //     canProceedToMirrorDecision: false }  ← Worth Gate fail
 *
 *   classifySilenceBudgetBucket({ silenceBudget: 1.5 })
 *     // → { status: "unknown", bucket: "unknown", raw: null,
 *     //     canProceedToMirrorDecision: false }  ← 範囲外 fail-closed
 */
export function classifySilenceBudgetBucket(
  input: SilenceBudgetBucketInput,
): SilenceBudgetBucketResult {
  const raw = input.silenceBudget;

  if (!isValidSilenceBudgetNumber(raw)) {
    return {
      status: "unknown",
      bucket: "unknown",
      raw: null,
      canProceedToMirrorDecision: false,
    };
  }

  if (raw < 0.3) {
    return {
      status: "known",
      bucket: "low_0_to_30",
      raw,
      canProceedToMirrorDecision: true,
    };
  }

  if (raw < 0.7) {
    return {
      status: "known",
      bucket: "mid_30_to_70",
      raw,
      canProceedToMirrorDecision: true,
    };
  }

  // raw >= 0.7 → high_70_to_100 / Worth Gate fail
  return {
    status: "known",
    bucket: "high_70_to_100",
    raw,
    canProceedToMirrorDecision: false,
  };
}
