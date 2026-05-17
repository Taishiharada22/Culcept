/**
 * CoAlter AOO Phase B — Pattern Category Bucket (B-3)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §9.3 / §6.5
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.3 / §7 / §9.3
 *   - 型定義: ../types.ts (B-2 で新設、B-3 で bucket 型追加)
 *
 * 役割:
 *   pattern category enum を Mirror Channel 用 bucket に正規化する
 *   **pure / deterministic / side-effect-free** function。
 *
 * 値 mapping (B-0 plan §9.3):
 *   入力                            → 出力 bucket             canProceed
 *   ─────────────────────────────────────────────────────────────────────
 *   `null`                          → "null_pattern"          true   (通常評価)
 *   "null_pattern"                  → "null_pattern"          true   (通常評価)
 *   "rupture_signal_mild"           → "rupture_signal_mild"   true   (Repair Mirror 候補)
 *   "rupture_signal_high"           → "rupture_signal_high"   false  (STAY_SILENT)
 *   "safety_concern"                → "safety_concern"        false  (Phase B 発話禁止)
 *   "unknown_category"              → "unknown_category"      false  (Observe Gate fail)
 *   undefined                       → "unknown_category"      false  (fail-closed)
 *   不明 string                     → "unknown_category"      false  (fail-closed)
 *   非 string                       → "unknown_category"      false  (fail-closed)
 *
 * 安全側設計:
 *   - 不明値 / undefined / 型外 は **常に "unknown_category"** に正規化
 *   - "rupture_signal" (Phase A raw、severity 不明) は本 bucket 入力としては禁止
 *     (caller 側で severity を判定して `_high` / `_mild` を渡す責務)。
 *     ただし caller が誤って渡した場合に備え、本 function は string 完全一致のみ受理
 *     → "rupture_signal" 単体は "unknown_category" に正規化される (fail-closed)
 *
 * canProceedToMirrorDecision 設計:
 *   - `null_pattern` / `rupture_signal_mild` → canProceed = true
 *   - `safety_concern` / `rupture_signal_high` / `unknown_category` → canProceed = false
 *
 * 設計境界:
 *   - 既存 presence layer / observer / chat layer touch なし
 *   - raw matched pattern string は受け取らない (caller が事前に severity 判定済の前提)
 *   - PII 非受理
 *   - 副作用なし / input mutation なし
 *
 * 注 (Phase A raw との関係):
 *   Phase A `lib/coalter/observer/signalRedaction.ts` の `MatchedPatternCategory` は
 *   `"safety_concern" | "rupture_signal" | "unknown_category" | null` で severity を持たない。
 *   Phase A raw → Mirror severity 別 bucket の adapter は別 PR で実装する
 *   (本 B-3 では caller が severity 既知の前提で受け取る)。
 */

import type {
  PatternCategoryBucketInput,
  PatternCategoryBucketResult,
} from "../types";

type KnownCategoryWithProceed = "null_pattern" | "rupture_signal_mild";
type KnownCategoryWithoutProceed = "safety_concern" | "rupture_signal_high";

const KNOWN_WITH_PROCEED: ReadonlySet<KnownCategoryWithProceed> = new Set<KnownCategoryWithProceed>([
  "null_pattern",
  "rupture_signal_mild",
]);

const KNOWN_WITHOUT_PROCEED: ReadonlySet<KnownCategoryWithoutProceed> =
  new Set<KnownCategoryWithoutProceed>([
    "safety_concern",
    "rupture_signal_high",
  ]);

/**
 * Pattern category を bucket に分類する **pure / deterministic / side-effect-free** 関数。
 *
 * @param input - {@link PatternCategoryBucketInput}
 *   - `category`: 既知 enum / null (= null_pattern) / undefined / 不明値 → unknown_category
 *
 * @returns {@link PatternCategoryBucketResult}
 *   - `null_pattern` / `rupture_signal_mild` (known, canProceed: true)
 *   - `safety_concern` / `rupture_signal_high` (known, canProceed: false)
 *   - `unknown_category` (status: unknown, canProceed: false)
 *
 * @example
 *   classifyPatternCategoryBucket({ category: null })
 *     // → { status: "known", bucket: "null_pattern", canProceedToMirrorDecision: true }
 *
 *   classifyPatternCategoryBucket({ category: "safety_concern" })
 *     // → { status: "known", bucket: "safety_concern", canProceedToMirrorDecision: false }
 *
 *   classifyPatternCategoryBucket({ category: "rupture_signal_mild" })
 *     // → { status: "known", bucket: "rupture_signal_mild",
 *     //     canProceedToMirrorDecision: true }  // Repair Mirror 候補
 *
 *   classifyPatternCategoryBucket({})
 *     // → { status: "unknown", bucket: "unknown_category",
 *     //     canProceedToMirrorDecision: false }
 */
export function classifyPatternCategoryBucket(
  input: PatternCategoryBucketInput,
): PatternCategoryBucketResult {
  const raw = input.category;

  // null / undefined → null_pattern と unknown_category を区別:
  //   - null 明示 → "null_pattern" (caller が「pattern なし」を明示)
  //   - undefined / 未指定 → "unknown_category" (caller が情報を持っていない)
  if (raw === null) {
    return {
      status: "known",
      bucket: "null_pattern",
      canProceedToMirrorDecision: true,
    };
  }

  if (raw === undefined) {
    return {
      status: "unknown",
      bucket: "unknown_category",
      canProceedToMirrorDecision: false,
    };
  }

  // 型外 (number / object / boolean / array etc.) → unknown_category fail-closed
  if (typeof raw !== "string") {
    return {
      status: "unknown",
      bucket: "unknown_category",
      canProceedToMirrorDecision: false,
    };
  }

  // 既知 (canProceed: true) — null_pattern / rupture_signal_mild
  if (raw === "null_pattern" || raw === "rupture_signal_mild") {
    return {
      status: "known",
      bucket: raw,
      canProceedToMirrorDecision: true,
    };
  }

  // 既知 (canProceed: false) — safety_concern / rupture_signal_high
  if (raw === "safety_concern" || raw === "rupture_signal_high") {
    return {
      status: "known",
      bucket: raw,
      canProceedToMirrorDecision: false,
    };
  }

  // 明示的 unknown_category
  if (raw === "unknown_category") {
    return {
      status: "unknown",
      bucket: "unknown_category",
      canProceedToMirrorDecision: false,
    };
  }

  // 不明 string (Phase A raw "rupture_signal" / typo / 不正値) → unknown_category fail-closed
  // KNOWN_* set は型保証のため使用 (実際には上の if で全網羅、defensive coding)
  void KNOWN_WITH_PROCEED;
  void KNOWN_WITHOUT_PROCEED;

  return {
    status: "unknown",
    bucket: "unknown_category",
    canProceedToMirrorDecision: false,
  };
}
