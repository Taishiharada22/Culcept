/**
 * CoAlter AOO Phase B — Uncertainty Bucket (B-3)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §5 axis 5
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.3 / §6 / §9.3
 *   - 型定義: ../types.ts (B-2 で新設、B-3 で bucket 型追加)
 *
 * 役割:
 *   uncertainty score (0..1) を 3 段階 + unknown に分類する **pure / deterministic /
 *   side-effect-free** function。
 *
 * 閾値設計 (Phase A `lib/coalter/observer/relationshipStateTypes.ts` の
 * `UncertaintyBucket` 命名 `low_0_to_30` / `mid_30_to_70` / `high_70_to_100` に合わせる):
 *   - `low_0_to_30`:     0.0  ≤ x <  0.3
 *   - `mid_30_to_70`:    0.3  ≤ x <  0.7
 *   - `high_70_to_100`:  0.7  ≤ x ≤  1.0
 *
 * unknown 判定:
 *   - null / undefined → unknown
 *   - NaN / Infinity / -Infinity → unknown
 *   - 範囲外 (x < 0.0 || x > 1.0) → unknown (fail-closed)
 *   - 型外 (string / object / etc.) → unknown (runtime defensive)
 *
 * canProceedToMirrorDecision 設計 (B-0 plan §6.1 / §4.3 Safe Gate):
 *   - `low_0_to_30` / `mid_30_to_70` → canProceed = true (Speak 判定へ進めてよい)
 *   - `high_70_to_100` → canProceed = false (高不確実性、Safe Gate fail-closed)
 *   - `unknown` → canProceed = false (入力なし、fail-closed)
 *
 * 注意 (B-0 plan §4.3 との関係):
 *   - B-0 plan の Safe Gate は `uncertainty > 0.4` を fail 条件としているが、本 bucket は
 *     Phase A 命名 (30 / 70 区切り) を採用し categorical 分類のみ提供する。
 *   - B-4 ERV / Three-Gate engine 側で必要なら `> 0.4` 等の追加閾値を別途適用する
 *     (本 bucket の `mid_30_to_70` であっても B-4 engine が更に厳しく評価する余地を残す)。
 *
 * 設計境界 (B-0 §9 / Phase A 継承):
 *   - 既存 presence layer / observer / chat layer touch なし
 *   - PII を型レベル / 実装レベル 両方で受け取らない
 *   - 副作用なし
 *   - input mutation なし
 */

import type {
  UncertaintyBucketInput,
  UncertaintyBucketResult,
} from "../types";

const UNCERTAINTY_MIN = 0.0;
const UNCERTAINTY_MAX = 1.0;

function isValidUncertaintyNumber(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= UNCERTAINTY_MIN &&
    v <= UNCERTAINTY_MAX
  );
}

/**
 * Uncertainty score を bucket に分類する **pure / deterministic / side-effect-free** 関数。
 *
 * @param input - {@link UncertaintyBucketInput}
 *   - `uncertainty`: 0..1 範囲、null / undefined / 不正値 → unknown
 *
 * @returns {@link UncertaintyBucketResult}
 *   - `low_0_to_30` / `mid_30_to_70` (known, canProceed: true)
 *   - `high_70_to_100` (known, canProceed: false — Safe Gate fail)
 *   - `unknown` (raw: null, canProceed: false)
 *
 * @example
 *   classifyUncertaintyBucket({ uncertainty: 0.2 })
 *     // → { status: "known", bucket: "low_0_to_30", raw: 0.2,
 *     //     canProceedToMirrorDecision: true }
 *
 *   classifyUncertaintyBucket({ uncertainty: 0.85 })
 *     // → { status: "known", bucket: "high_70_to_100", raw: 0.85,
 *     //     canProceedToMirrorDecision: false }  ← Safe Gate fail
 *
 *   classifyUncertaintyBucket({ uncertainty: -0.1 })
 *     // → { status: "unknown", bucket: "unknown", raw: null,
 *     //     canProceedToMirrorDecision: false }  ← 範囲外 fail-closed
 */
export function classifyUncertaintyBucket(
  input: UncertaintyBucketInput,
): UncertaintyBucketResult {
  const raw = input.uncertainty;

  if (!isValidUncertaintyNumber(raw)) {
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

  // raw >= 0.7 → high_70_to_100 / Safe Gate fail
  return {
    status: "known",
    bucket: "high_70_to_100",
    raw,
    canProceedToMirrorDecision: false,
  };
}
