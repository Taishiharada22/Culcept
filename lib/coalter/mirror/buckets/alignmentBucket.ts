/**
 * CoAlter AOO Phase B — Alignment Bucket (B-3)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §5 axis 4
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.3
 *   - 型定義: ../types.ts (B-2 で新設、B-3 で bucket 型追加)
 *
 * 役割:
 *   alignment signal (-1..+1) を 5 段階 + unknown に分類する **pure / deterministic /
 *   side-effect-free** function。
 *
 * 閾値設計 (B-3 tentative、B-4 ERV engine の calibration で見直し可):
 *   - `strongly_negative`: -1.0 ≤ x ≤ -0.6
 *   - `negative`:          -0.6 <  x ≤ -0.2
 *   - `neutral`:           -0.2 <  x ≤  0.2
 *   - `positive`:           0.2 <  x ≤  0.6
 *   - `strongly_positive`:  0.6 <  x ≤  1.0
 *
 * unknown 判定:
 *   - null / undefined → unknown
 *   - NaN / Infinity / -Infinity → unknown
 *   - 範囲外 (x < -1.0 || x > 1.0) → unknown (fail-closed)
 *   - 型外 (string / object / etc.) → unknown (runtime defensive)
 *
 * canProceedToMirrorDecision 設計: alignment はすべての known level で `true`。
 *   alignment 値そのものは Mirror 発話を gate しない (B-4 ERV input としてのみ使う)。
 *   unknown のみ `false` (fail-closed)。
 *
 * 設計境界 (B-0 §9 / Phase A 継承):
 *   - 既存 presence layer / observer / chat layer touch なし
 *   - PII を型レベル / 実装レベル 両方で受け取らない
 *   - 副作用なし (I/O / network / storage / DOM / event / timer / log なし)
 *   - input mutation なし
 *
 * Phase A `lib/coalter/observer/relationshipStateTypes.ts` の `AlignmentBucket` と
 * 構造的に一致 (Mirror 側独立定義、本ファイルは presence/observer を import しない)。
 */

import type {
  AlignmentBucketInput,
  AlignmentBucketResult,
  MirrorAlignmentBucket,
} from "../types";

const ALIGNMENT_MIN = -1.0;
const ALIGNMENT_MAX = 1.0;

/**
 * 数値が有限 (finite) かつ範囲内かを判定する pure type guard。
 *
 * 範囲外 / NaN / Infinity / -Infinity / 非 number → false
 */
function isValidAlignmentNumber(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= ALIGNMENT_MIN &&
    v <= ALIGNMENT_MAX
  );
}

/**
 * 妥当な alignment 数値を bucket category に分類する pure function。
 *
 * Precondition: `isValidAlignmentNumber(value) === true`
 */
function classifyAlignmentLevel(value: number): Exclude<MirrorAlignmentBucket, "unknown"> {
  if (value <= -0.6) return "strongly_negative";
  if (value <= -0.2) return "negative";
  if (value <= 0.2) return "neutral";
  if (value <= 0.6) return "positive";
  return "strongly_positive";
}

/**
 * Alignment signal を bucket に分類する **pure / deterministic / side-effect-free**
 * 関数。
 *
 * @param input - {@link AlignmentBucketInput}
 *   - `alignmentSignal`: -1..+1 範囲、null / undefined / 不正値 → unknown
 *
 * @returns {@link AlignmentBucketResult}
 *   - `status === "known"`: bucket は 5 段階のいずれか、raw は元の数値、canProceed: true
 *   - `status === "unknown"`: bucket は "unknown"、raw は null、canProceed: false
 *
 * @example
 *   classifyAlignmentBucket({ alignmentSignal: 0.8 })
 *     // → { status: "known", bucket: "strongly_positive", raw: 0.8,
 *     //     canProceedToMirrorDecision: true }
 *
 *   classifyAlignmentBucket({ alignmentSignal: null })
 *     // → { status: "unknown", bucket: "unknown", raw: null,
 *     //     canProceedToMirrorDecision: false }
 *
 *   classifyAlignmentBucket({ alignmentSignal: NaN })
 *     // → { status: "unknown", bucket: "unknown", raw: null,
 *     //     canProceedToMirrorDecision: false }
 */
export function classifyAlignmentBucket(
  input: AlignmentBucketInput,
): AlignmentBucketResult {
  const raw = input.alignmentSignal;

  if (!isValidAlignmentNumber(raw)) {
    return {
      status: "unknown",
      bucket: "unknown",
      raw: null,
      canProceedToMirrorDecision: false,
    };
  }

  return {
    status: "known",
    bucket: classifyAlignmentLevel(raw),
    raw,
    canProceedToMirrorDecision: true,
  };
}
