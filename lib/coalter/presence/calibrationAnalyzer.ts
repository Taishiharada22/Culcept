/**
 * CoAlter Gap 4 — Redacted Observation Calibration Analyzer (D6-a phase)
 *
 * 正本:
 *   - docs/coalter-master-design.md (Gap 4 phase plan)
 *   - lib/coalter/presence/contextDetector.ts (D2、PR #130)
 *   - lib/coalter/presence/contextDetectionMode.ts (D3、PR #141)
 *   - lib/coalter/presence/clientObservationReceive.ts (D4、PR #142)
 *   - lib/coalter/presence/observationEvent.ts (D5-a、PR #143)
 *
 * 役割:
 *   D5-a redacted event payload 群を入力に、Gap 4 calibration / threshold
 *   decision に使える **集計 summary を作る pure function** を提供する。
 *
 *   **本 D6-a phase は offline calibration helper only**:
 *     - input: D5-a redacted event payload array
 *     - output: factual aggregation summary + provisional recommendation
 *     - **threshold は provisional**、mathematically final と断定しない
 *     - small sample → fail-closed 明示 (`insufficient_sample`)
 *     - **telemetry 送信 / Sentry / storage / DB / production 観測は一切しない**
 *     - emit / wire / activation は他 phase で扱う
 *
 * **重要な区別 (CEO 2026-05-16)**:
 *   - 本 PR (D6-a): 「redacted event を offline で集計・校正できる pure layer」
 *   - D5-b (別 PR): 実 telemetry / Sentry 送信 (CEO 戦略判断必須)
 *   - D6-b (別 PR): live calibration / threshold 確定 (CEO 戦略判断必須)
 *   - D7 (別 PR): live activation (Pattern variant 発火、CEO 戦略判断必須)
 *
 * 構造的安全設計 (D2/D3/D4/D5-a 継承 + D6-a 強化):
 *   1. **raw text leakage 構造的防止** (型レベル):
 *      - input は D5-a `RedactedObservationEvent[]` (raw text 構造的不含)
 *      - output は fixed-shape aggregation (enum + number + bucket、free text 不含)
 *      - userId / pairId / threadId / message / URL / email を構造的に含まない
 *   2. **fact / recommendation separation (人間超越 Idea B)**:
 *      - factual aggregation (生集計) と provisional recommendation (推奨) を別 field
 *      - audit reviewer が「これは事実、これは推奨」を一目で区別可能
 *   3. **threshold provisional 明示 (CEO 5)**:
 *      - `provisionalThresholdNotes` enum で **mathematically final ではない** を構造的明示
 *      - `recommendedNextAction` は推奨であり最終決定ではない
 *   4. **anomaly detection (CEO 強化)**:
 *      - activation: true / shouldEmit: true が混入 → `calibrationWarnings` に集計のみ
 *      - 「混入したが実行・送信していない」を構造的に保証
 *   5. **sample quality classifier (人間超越 Idea A)**:
 *      - sample 数別 `insufficient_sample` / `low_sample` / `moderate_sample` /
 *        `sufficient_sample` 4 値で信用度明示
 *   6. **deterministic**:
 *      - 純関数、Math.random 不使用、Date.now / timestamp 不使用
 *      - by-axis aggregation は key lexicographic sort
 *   7. **no side effect**:
 *      - localStorage / sessionStorage / cookie 触らない
 *      - console.log / console.warn / console.error 呼ばない
 *      - Sentry / telemetry / fetch / Supabase / DB 接続なし
 *
 * 後続 phase (本 PR scope 外):
 *   - D5-b: telemetry / Sentry 実送信 (別 PR、CEO 戦略判断)
 *   - D6-b: live calibration / threshold 確定 (別 PR)
 *   - D7: live activation (別 PR、CEO 戦略判断)
 *
 * 本 PR の不可触 (CEO 2026-05-16 制約):
 *   - telemetry 実送信 / Sentry 実装
 *   - console.log / console.warn / console.error
 *   - localStorage / sessionStorage / cookie
 *   - Supabase / DB / migration
 *   - ChatClient / UpperLayerMount / UI 変更
 *   - Pattern activation / variant 発火
 *   - production env / Vercel env 変更
 *   - external API / API key
 *   - DD4 / Travel T6 / Activity AD5 / Movie Path α env 操作
 *   - bug1 / Stargazer pivot
 */

import type {
  ConfidenceBucket,
  PatternContextFlags,
  RedactedObservationEvent,
  RedactionLevel,
  SignalCountBucket,
} from "./observationEvent";
import type {
  Gap4ObservationMode,
  Gap4RouteObservationSkipReason,
} from "./contextDetectionMode";

// ─────────────────────────────────────────────
// const exports (calibration analyzer version、固定)
// ─────────────────────────────────────────────

/**
 * Calibration analyzer version (semver).
 *
 * 本 D6-a 初版 = "0.1.0"。
 * D6-b / 他 phase で aggregation logic 変更時 increment。
 */
export const CALIBRATION_ANALYZER_VERSION = "0.1.0";

/**
 * Calibration summary schema version (semver、output format).
 *
 * 本 D6-a 初版 = "0.1.0"。
 */
export const CALIBRATION_SUMMARY_SCHEMA_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// Sample size thresholds (provisional、calibration 用)
// ─────────────────────────────────────────────

/**
 * Sample size boundaries for `SampleQuality` classification (provisional).
 *
 * **mathematically final ではない** (CEO 2026-05-16 補正)。
 * D6-b / 実 data 観測後に再校正可能。
 */
export const PROVISIONAL_SAMPLE_THRESHOLD_INSUFFICIENT = 10;
export const PROVISIONAL_SAMPLE_THRESHOLD_LOW = 100;
export const PROVISIONAL_SAMPLE_THRESHOLD_MODERATE = 1000;
// >= MODERATE は "sufficient_sample"

// ─────────────────────────────────────────────
// Sample quality enum (人間超越 Idea A)
// ─────────────────────────────────────────────

/**
 * Sample quality classifier (信用度明示).
 *
 *   - "insufficient_sample": < 10 events (calibration 不可能、fail-closed)
 *   - "low_sample": 10-99 (信用度低、参考程度)
 *   - "moderate_sample": 100-999 (信用度中、tuning hint 取得可)
 *   - "sufficient_sample": 1000+ (信用度高、threshold 校正可)
 */
export type SampleQuality =
  | "insufficient_sample"
  | "low_sample"
  | "moderate_sample"
  | "sufficient_sample";

// ─────────────────────────────────────────────
// Recommendation enum (人間超越 Idea M、CEO 11)
// ─────────────────────────────────────────────

/**
 * Recommended next action (provisional、最終決定ではない).
 *
 *   - "keep_provisional_threshold": 現 threshold 維持推奨
 *   - "consider_lower_threshold": threshold 下げを検討
 *   - "consider_higher_threshold": threshold 上げを検討
 *   - "collect_more_samples": sample 不足、計測継続
 *   - "investigate_anomalies": anomaly あり (activation true 等)、調査必要
 *   - "investigate_schema_drift": schemaVersion 混在、調査必要
 *   - "escalate_to_d6b_review": calibration 進行は別 PR / 別 CEO 判断
 */
export type RecommendedNextAction =
  | "keep_provisional_threshold"
  | "consider_lower_threshold"
  | "consider_higher_threshold"
  | "collect_more_samples"
  | "investigate_anomalies"
  | "investigate_schema_drift"
  | "escalate_to_d6b_review";

// ─────────────────────────────────────────────
// Provisional threshold note enum (人間超越 Idea E、CEO 5)
// ─────────────────────────────────────────────

/**
 * Provisional threshold note (mathematically final ではない、構造的明示).
 *
 *   - "thresholds_are_provisional_not_final": 全 threshold は暫定
 *   - "calibration_not_yet_authoritative": 本 summary は権威的 calibration ではない
 *   - "use_only_for_offline_review": offline review 用、production decision 不可
 *   - "sample_distribution_may_bias_results": sample 偏りに注意
 *   - "anomaly_present_avoid_calibration": anomaly あり、calibration 推奨せず
 */
export type ProvisionalThresholdNote =
  | "thresholds_are_provisional_not_final"
  | "calibration_not_yet_authoritative"
  | "use_only_for_offline_review"
  | "sample_distribution_may_bias_results"
  | "anomaly_present_avoid_calibration";

// ─────────────────────────────────────────────
// Calibration warning enum (人間超越 Idea C + K、CEO 強化)
// ─────────────────────────────────────────────

/**
 * Calibration warning (anomaly / invariant violation 検出).
 *
 *   - "activation_true_anomaly_detected": activation: true event 混入 (期待値違反)
 *   - "should_emit_true_anomaly_detected": shouldEmit: true event 混入
 *   - "schema_version_drift_detected": 複数 schemaVersion 混在
 *   - "detector_version_drift_detected": 複数 detectorVersion 混在
 *   - "all_skipped_no_useful_data": 全 event が skipped、calibration 不可
 *   - "malformed_events_present": malformed event 存在 (invalid_observation_input 等)
 *   - "distribution_extremely_skewed": 分布が極端 (all_in_none_bucket 等)
 *   - "sample_size_below_minimum": sample < insufficient threshold
 */
export type CalibrationWarning =
  | "activation_true_anomaly_detected"
  | "should_emit_true_anomaly_detected"
  | "schema_version_drift_detected"
  | "detector_version_drift_detected"
  | "all_skipped_no_useful_data"
  | "malformed_events_present"
  | "distribution_extremely_skewed"
  | "sample_size_below_minimum";

// ─────────────────────────────────────────────
// Distribution shape enum (人間超越 Idea J)
// ─────────────────────────────────────────────

/**
 * Bucket distribution shape (極端な偏り detect).
 *
 *   - "all_in_none_bucket": 全 event が "none_0"
 *   - "all_in_high_bucket": 全 event が "high_70_plus"
 *   - "balanced": 複数 bucket に分散
 *   - "skewed_to_low": low / none に偏り
 *   - "skewed_to_high": high / mid に偏り
 *   - "no_data": data なし
 */
export type DistributionShape =
  | "all_in_none_bucket"
  | "all_in_high_bucket"
  | "balanced"
  | "skewed_to_low"
  | "skewed_to_high"
  | "no_data";

// ─────────────────────────────────────────────
// Confidence in bucket rates (人間超越 Idea N、大数の法則)
// ─────────────────────────────────────────────

/**
 * Confidence in bucket rates (sample 数別、distribution 信頼度).
 *
 * sample が少ないと distribution の信頼性も低い、threshold 提案信頼度に直結。
 */
export type ConfidenceInBucketRates = "low" | "moderate" | "high";

// ─────────────────────────────────────────────
// Reason code (analyzer の状態、enum only)
// ─────────────────────────────────────────────

export type CalibrationReasonCode =
  | "empty_input_fail_closed"
  | "summary_built"
  | "factual_aggregation_only"
  | "recommendations_are_provisional"
  | "no_telemetry_send"
  | "no_storage_no_db"
  | "no_console_output"
  | "anomalies_detected"
  | "schema_drift_detected"
  | "deterministic_no_timestamp"
  | "sample_quality_classified"
  | "by_axis_aggregation_applied"
  | "pattern_flag_rates_computed"
  | "bucket_distribution_analyzed"
  | "activation_invariant_verified"
  | "should_emit_invariant_verified";

// ─────────────────────────────────────────────
// Sub-aggregation interfaces
// ─────────────────────────────────────────────

/**
 * Per-mode aggregation.
 */
export interface ByModeAggregation {
  off: number;
  observe: number;
  live: number;
}

/**
 * Per-detector-version aggregation (key = detectorVersion string).
 *
 * 未指定 (undefined) は `"<unknown>"` key で集計。
 */
export type ByDetectorVersionAggregation = Record<string, number>;

/**
 * Per-skipped-reason aggregation.
 *
 * key = SkipReason enum、value = count。"<not_skipped>" は skip なし event。
 */
export type BySkippedReasonAggregation = Record<string, number>;

/**
 * Per-confidence-bucket aggregation per pattern field.
 *
 * key = patternContext field name (7 種)、value = bucket → count map。
 */
export type ByConfidenceBucketAggregation = Record<
  string,
  Record<ConfidenceBucket, number>
>;

/**
 * Per-signal-count-bucket aggregation per signal category.
 *
 * key = signal category (7 種)、value = bucket → count map。
 */
export type BySignalCountBucketAggregation = Record<
  string,
  Record<SignalCountBucket, number>
>;

/**
 * Pattern context flag rate (per field、true 出現率 0-1).
 *
 * key = patternContext field name (7 種)、value = 0-1 rate。
 */
export type PatternContextFlagRates = Record<keyof PatternContextFlags, number>;

// ─────────────────────────────────────────────
// Activation / shouldEmit invariant counts
// ─────────────────────────────────────────────

/**
 * Activation invariant verification result.
 *
 * 期待値: 全 event で activation === false。
 * 期待値違反 → anomaly warning + count。
 */
export interface ActivationInvariantResult {
  expectedFalseCount: number;
  unexpectedTrueCount: number; // anomaly count、本 PR では emit / 実行しない
  invariantHeld: boolean; // unexpectedTrueCount === 0
}

/**
 * shouldEmit invariant verification result (同様).
 */
export interface ShouldEmitInvariantResult {
  expectedFalseCount: number;
  unexpectedTrueCount: number;
  invariantHeld: boolean;
}

// ─────────────────────────────────────────────
// Bucket distribution analysis result
// ─────────────────────────────────────────────

/**
 * Bucket distribution shape per pattern field.
 *
 * key = patternContext field、value = distribution shape。
 */
export type BucketDistributionShapes = Record<string, DistributionShape>;

// ─────────────────────────────────────────────
// Top-level summary output (本 D6-a の output)
// ─────────────────────────────────────────────

/**
 * Calibration summary (fixed shape、raw text / PII 構造的不含).
 *
 * **構造的安全 (CEO 必須)**:
 *   - userId / pairId / threadId / message / URL / email を **構造的に含まない**
 *   - 全 field は enum / number / bucket / boolean のみ
 *   - timestamp / createdAt 等の time field 不在 (deterministic)
 *
 * **fact / recommendation separation (人間超越 Idea B)**:
 *   - `byMode` / `byDetectorVersion` / `bySkippedReason` / `byConfidenceBucket` /
 *     `bySignalCountBucket` / `patternContextFlagRates` は **factual aggregation**
 *   - `recommendedNextAction` / `provisionalThresholdNotes` は **provisional recommendation**
 */
export interface CalibrationSummary {
  /** Summary schema version (semver) */
  schemaVersion: string;
  /** Analyzer version (本 builder の version) */
  analyzerVersion: string;
  /** Total event count (malformed 含む) */
  sampleCount: number;
  /** Valid event count (malformed 除外) */
  validSampleCount: number;
  /** Sample quality classifier (人間超越 Idea A) */
  sampleQuality: SampleQuality;
  /** Confidence in bucket rates (人間超越 Idea N) */
  confidenceInBucketRates: ConfidenceInBucketRates;
  /** Per-mode aggregation (factual) */
  byMode: ByModeAggregation;
  /** Per-detector-version aggregation (factual) */
  byDetectorVersion: ByDetectorVersionAggregation;
  /** Per-skipped-reason aggregation (factual) */
  bySkippedReason: BySkippedReasonAggregation;
  /** Per-confidence-bucket aggregation per pattern field (factual) */
  byConfidenceBucket: ByConfidenceBucketAggregation;
  /** Per-signal-count-bucket aggregation per signal category (factual) */
  bySignalCountBucket: BySignalCountBucketAggregation;
  /** Pattern context flag rates per field (factual、0-1 rate) */
  patternContextFlagRates: PatternContextFlagRates;
  /** Bucket distribution shapes per pattern field (factual) */
  bucketDistributionShapes: BucketDistributionShapes;
  /** Activation invariant: expectedFalseCount + unexpectedTrueCount + held */
  activationInvariant: ActivationInvariantResult;
  /** shouldEmit invariant (同様) */
  shouldEmitInvariant: ShouldEmitInvariantResult;
  /** Recommended next action (provisional、enum) */
  recommendedNextAction: RecommendedNextAction;
  /** Provisional threshold notes (enum、constraint markers) */
  provisionalThresholdNotes: ProvisionalThresholdNote[];
  /** Calibration warnings (anomaly / invariant violation) */
  calibrationWarnings: CalibrationWarning[];
  /** Reason codes (enum、deterministic sort) */
  reasonCodes: CalibrationReasonCode[];
  /** Schema version drift detected (boolean) */
  schemaVersionDriftDetected: boolean;
  /** Detector version drift detected (boolean) */
  detectorVersionDriftDetected: boolean;
}

// ─────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────

/**
 * Analyzer input (D5-a redacted event payload array).
 */
export interface CalibrationAnalyzerInput {
  events: ReadonlyArray<RedactedObservationEvent | unknown>;
}

// ─────────────────────────────────────────────
// Helper: sample quality classifier (pure)
// ─────────────────────────────────────────────

function classifySampleQuality(count: number): SampleQuality {
  if (count < PROVISIONAL_SAMPLE_THRESHOLD_INSUFFICIENT) return "insufficient_sample";
  if (count < PROVISIONAL_SAMPLE_THRESHOLD_LOW) return "low_sample";
  if (count < PROVISIONAL_SAMPLE_THRESHOLD_MODERATE) return "moderate_sample";
  return "sufficient_sample";
}

function classifyConfidenceInBucketRates(count: number): ConfidenceInBucketRates {
  if (count < PROVISIONAL_SAMPLE_THRESHOLD_LOW) return "low";
  if (count < PROVISIONAL_SAMPLE_THRESHOLD_MODERATE) return "moderate";
  return "high";
}

// ─────────────────────────────────────────────
// Helper: shape validator (pure、forward compat)
// ─────────────────────────────────────────────

/**
 * Validate D5-a event shape (minimal check).
 *
 * forward compat: 未知 field 許容、required field のみ check。
 */
function isValidEvent(value: unknown): value is RedactedObservationEvent {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.mode !== "string") return false;
  if (typeof obj.activation !== "boolean") return false;
  if (typeof obj.shouldEmit !== "boolean") return false;
  if (!Array.isArray(obj.reasonCodes)) return false;
  return true;
}

// ─────────────────────────────────────────────
// Helper: distribution shape detector (人間超越 Idea J)
// ─────────────────────────────────────────────

function detectDistributionShape(
  bucketCounts: Record<ConfidenceBucket, number>,
): DistributionShape {
  const total =
    bucketCounts.none_0 +
    bucketCounts.low_0_to_30 +
    bucketCounts.mid_30_to_70 +
    bucketCounts.high_70_plus;
  if (total === 0) return "no_data";
  if (bucketCounts.none_0 === total) return "all_in_none_bucket";
  if (bucketCounts.high_70_plus === total) return "all_in_high_bucket";

  const lowAndNone = bucketCounts.none_0 + bucketCounts.low_0_to_30;
  const highAndMid = bucketCounts.high_70_plus + bucketCounts.mid_30_to_70;
  const lowRatio = lowAndNone / total;
  const highRatio = highAndMid / total;

  if (lowRatio >= 0.8) return "skewed_to_low";
  if (highRatio >= 0.8) return "skewed_to_high";
  return "balanced";
}

// ─────────────────────────────────────────────
// Helper: empty bucket counters (initialization)
// ─────────────────────────────────────────────

function emptyConfidenceBuckets(): Record<ConfidenceBucket, number> {
  return {
    none_0: 0,
    low_0_to_30: 0,
    mid_30_to_70: 0,
    high_70_plus: 0,
  };
}

function emptySignalCountBuckets(): Record<SignalCountBucket, number> {
  return {
    none_0: 0,
    low_1_to_2: 0,
    mid_3_to_5: 0,
    high_6_plus: 0,
  };
}

const PATTERN_CONTEXT_FIELDS: ReadonlyArray<keyof PatternContextFlags> = [
  "infoMissing",
  "uncertaintyHigh",
  "needFraming",
  "oneSidedFatigue",
  "needTranslation",
  "relationshipSignalsClear",
  "relationshipNoiseHigh",
];

const SIGNAL_COUNT_CATEGORIES: ReadonlyArray<string> = [
  "infoMissing",
  "uncertainty",
  "framing",
  "fatigue",
  "translation",
  "relationshipClear",
  "relationshipNoise",
];

// ─────────────────────────────────────────────
// Helper: deterministic key-sorted record (人間超越 Idea G)
// ─────────────────────────────────────────────

function sortRecordKeys<T>(record: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    sorted[key] = record[key];
  }
  return sorted;
}

// ─────────────────────────────────────────────
// Helper: recommended next action derivation (人間超越 Idea M)
// ─────────────────────────────────────────────

function deriveRecommendedNextAction(
  sampleQuality: SampleQuality,
  warnings: CalibrationWarning[],
  bucketShapes: BucketDistributionShapes,
): RecommendedNextAction {
  // anomaly priority 1: anomalies present → investigate
  if (
    warnings.includes("activation_true_anomaly_detected") ||
    warnings.includes("should_emit_true_anomaly_detected")
  ) {
    return "investigate_anomalies";
  }
  // schema drift → investigate
  if (
    warnings.includes("schema_version_drift_detected") ||
    warnings.includes("detector_version_drift_detected")
  ) {
    return "investigate_schema_drift";
  }
  // insufficient sample → collect more
  if (sampleQuality === "insufficient_sample" || sampleQuality === "low_sample") {
    return "collect_more_samples";
  }
  // skewed distribution → consider threshold adjust
  const shapeValues = Object.values(bucketShapes);
  const skewedToHighCount = shapeValues.filter((s) => s === "skewed_to_high").length;
  const skewedToLowCount = shapeValues.filter((s) => s === "skewed_to_low").length;
  if (skewedToHighCount > shapeValues.length / 2) {
    return "consider_higher_threshold";
  }
  if (skewedToLowCount > shapeValues.length / 2) {
    return "consider_lower_threshold";
  }
  // sufficient + balanced → keep
  if (sampleQuality === "sufficient_sample") {
    return "escalate_to_d6b_review";
  }
  return "keep_provisional_threshold";
}

// ─────────────────────────────────────────────
// Main: calibration analyzer (pure function、deterministic、stateless)
// ─────────────────────────────────────────────

/**
 * Analyze redacted observation events (pure function).
 *
 * **本関数は純関数**: 同じ input → 同じ output、副作用なし、
 * `Math.random` 不使用、`Date.now()` / timestamp 不使用、
 * external state 参照なし、external API 不使用、storage 触らない、
 * console.log 呼ばない、Sentry 呼ばない、DB 触らない。
 *
 * **fact / recommendation separation (人間超越 Idea B)**:
 *   - `byMode` / `byDetectorVersion` / 等は factual aggregation (生集計)
 *   - `recommendedNextAction` / `provisionalThresholdNotes` は provisional
 *
 * **fail-closed**:
 *   - events 空 → `insufficient_sample` + `empty_input_fail_closed` reason
 *   - malformed events → 無視 + `malformed_events_present` warning
 *   - throw しない (production stability)
 *
 * **anomaly invariant**:
 *   - 全 event で activation === false / shouldEmit === false **期待値**
 *   - 違反 → calibrationWarnings に追加 + 集計のみ (実行・送信・発火しない)
 *
 * @param input CalibrationAnalyzerInput
 * @returns CalibrationSummary (fixed-shape、emit / 実送信しない)
 */
export function analyzeCalibrationEvents(
  input: CalibrationAnalyzerInput,
): CalibrationSummary {
  const reasonCodes: CalibrationReasonCode[] = [];
  const warnings: CalibrationWarning[] = [];
  const notes: ProvisionalThresholdNote[] = [];

  // Constant markers (常に追加)
  notes.push("thresholds_are_provisional_not_final");
  notes.push("calibration_not_yet_authoritative");
  notes.push("use_only_for_offline_review");
  reasonCodes.push("factual_aggregation_only");
  reasonCodes.push("recommendations_are_provisional");
  reasonCodes.push("no_telemetry_send");
  reasonCodes.push("no_storage_no_db");
  reasonCodes.push("no_console_output");
  reasonCodes.push("deterministic_no_timestamp");

  const totalCount = input.events.length;

  // Empty input fail-closed
  if (totalCount === 0) {
    reasonCodes.push("empty_input_fail_closed");
    warnings.push("sample_size_below_minimum");
    return buildEmptySummary(reasonCodes, warnings, notes);
  }

  // Initialize counters
  const byMode: ByModeAggregation = { off: 0, observe: 0, live: 0 };
  const byDetectorVersion: ByDetectorVersionAggregation = {};
  const bySkippedReason: BySkippedReasonAggregation = {};
  const byConfidenceBucket: ByConfidenceBucketAggregation = {};
  const bySignalCountBucket: BySignalCountBucketAggregation = {};
  const patternContextFlagCounts: Record<string, { trueCount: number; totalCount: number }> = {};

  // Initialize per-field counters
  for (const field of PATTERN_CONTEXT_FIELDS) {
    byConfidenceBucket[field] = emptyConfidenceBuckets();
    patternContextFlagCounts[field] = { trueCount: 0, totalCount: 0 };
  }
  for (const cat of SIGNAL_COUNT_CATEGORIES) {
    bySignalCountBucket[cat] = emptySignalCountBuckets();
  }

  // Invariant counters
  let activationFalseCount = 0;
  let activationTrueCount = 0;
  let shouldEmitFalseCount = 0;
  let shouldEmitTrueCount = 0;
  let malformedCount = 0;
  let validCount = 0;
  const schemaVersions = new Set<string>();
  const detectorVersions = new Set<string>();

  // Process events
  for (const evRaw of input.events) {
    if (!isValidEvent(evRaw)) {
      malformedCount++;
      continue;
    }
    const ev = evRaw;
    validCount++;

    // schemaVersion tracking
    if (typeof ev.schemaVersion === "string") {
      schemaVersions.add(ev.schemaVersion);
    }
    // detectorVersion tracking
    const dv = ev.detectorVersion ?? "<unknown>";
    detectorVersions.add(dv);
    byDetectorVersion[dv] = (byDetectorVersion[dv] ?? 0) + 1;

    // byMode
    if (ev.mode === "off" || ev.mode === "observe" || ev.mode === "live") {
      byMode[ev.mode] = byMode[ev.mode] + 1;
    }

    // bySkippedReason
    const skipKey = (ev.skippedReason as Gap4RouteObservationSkipReason | undefined) ?? "<not_skipped>";
    bySkippedReason[skipKey] = (bySkippedReason[skipKey] ?? 0) + 1;

    // activation invariant
    if (ev.activation === false) {
      activationFalseCount++;
    } else {
      activationTrueCount++;
    }

    // shouldEmit invariant
    if (ev.shouldEmit === false) {
      shouldEmitFalseCount++;
    } else {
      shouldEmitTrueCount++;
    }

    // patternContextFlags rates
    if (ev.patternContextFlags !== undefined) {
      for (const field of PATTERN_CONTEXT_FIELDS) {
        const value = ev.patternContextFlags[field];
        patternContextFlagCounts[field].totalCount++;
        if (value === true) patternContextFlagCounts[field].trueCount++;
      }
    }

    // confidenceBuckets aggregation
    if (ev.confidenceBuckets !== undefined) {
      for (const field of PATTERN_CONTEXT_FIELDS) {
        const bucket = ev.confidenceBuckets[field];
        if (
          bucket === "none_0" ||
          bucket === "low_0_to_30" ||
          bucket === "mid_30_to_70" ||
          bucket === "high_70_plus"
        ) {
          byConfidenceBucket[field][bucket]++;
        }
      }
    }

    // signalCountBuckets aggregation
    if (ev.signalCountBuckets !== undefined) {
      const sigBuckets = ev.signalCountBuckets as unknown as Record<string, SignalCountBucket>;
      for (const cat of SIGNAL_COUNT_CATEGORIES) {
        const bucket = sigBuckets[cat];
        if (
          bucket === "none_0" ||
          bucket === "low_1_to_2" ||
          bucket === "mid_3_to_5" ||
          bucket === "high_6_plus"
        ) {
          bySignalCountBucket[cat][bucket]++;
        }
      }
    }
  }

  // Pattern flag rates calculation
  const patternContextFlagRates: PatternContextFlagRates = {
    infoMissing: 0,
    uncertaintyHigh: 0,
    needFraming: 0,
    oneSidedFatigue: 0,
    needTranslation: 0,
    relationshipSignalsClear: 0,
    relationshipNoiseHigh: 0,
  };
  for (const field of PATTERN_CONTEXT_FIELDS) {
    const counts = patternContextFlagCounts[field];
    patternContextFlagRates[field] =
      counts.totalCount > 0 ? counts.trueCount / counts.totalCount : 0;
  }

  // Distribution shapes
  const bucketDistributionShapes: BucketDistributionShapes = {};
  for (const field of PATTERN_CONTEXT_FIELDS) {
    bucketDistributionShapes[field] = detectDistributionShape(byConfidenceBucket[field]);
  }

  // Sample quality
  const sampleQuality = classifySampleQuality(validCount);
  const confidenceInBucketRates = classifyConfidenceInBucketRates(validCount);

  // Schema / detector drift detection
  const schemaVersionDriftDetected = schemaVersions.size > 1;
  const detectorVersionDriftDetected = detectorVersions.size > 1;

  // Warnings
  if (sampleQuality === "insufficient_sample") {
    warnings.push("sample_size_below_minimum");
  }
  if (malformedCount > 0) {
    warnings.push("malformed_events_present");
  }
  if (activationTrueCount > 0) {
    warnings.push("activation_true_anomaly_detected");
    notes.push("anomaly_present_avoid_calibration");
  }
  if (shouldEmitTrueCount > 0) {
    warnings.push("should_emit_true_anomaly_detected");
    if (!notes.includes("anomaly_present_avoid_calibration")) {
      notes.push("anomaly_present_avoid_calibration");
    }
  }
  if (schemaVersionDriftDetected) {
    warnings.push("schema_version_drift_detected");
  }
  if (detectorVersionDriftDetected) {
    warnings.push("detector_version_drift_detected");
  }
  const allSkipped = validCount > 0 && (bySkippedReason["<not_skipped>"] ?? 0) === 0;
  if (allSkipped) {
    warnings.push("all_skipped_no_useful_data");
  }
  // Distribution skew warning
  const extremeSkewCount = Object.values(bucketDistributionShapes).filter(
    (s) => s === "all_in_none_bucket" || s === "all_in_high_bucket",
  ).length;
  if (extremeSkewCount >= 4) {
    warnings.push("distribution_extremely_skewed");
    notes.push("sample_distribution_may_bias_results");
  }

  // Reason codes
  reasonCodes.push("summary_built");
  reasonCodes.push("sample_quality_classified");
  reasonCodes.push("by_axis_aggregation_applied");
  reasonCodes.push("pattern_flag_rates_computed");
  reasonCodes.push("bucket_distribution_analyzed");
  reasonCodes.push("activation_invariant_verified");
  reasonCodes.push("should_emit_invariant_verified");
  if (warnings.length > 0) reasonCodes.push("anomalies_detected");
  if (schemaVersionDriftDetected) reasonCodes.push("schema_drift_detected");

  // Recommended next action
  const recommendedNextAction = deriveRecommendedNextAction(
    sampleQuality,
    warnings,
    bucketDistributionShapes,
  );

  // Build summary
  const summary: CalibrationSummary = {
    schemaVersion: CALIBRATION_SUMMARY_SCHEMA_VERSION,
    analyzerVersion: CALIBRATION_ANALYZER_VERSION,
    sampleCount: totalCount,
    validSampleCount: validCount,
    sampleQuality,
    confidenceInBucketRates,
    byMode,
    byDetectorVersion: sortRecordKeys(byDetectorVersion),
    bySkippedReason: sortRecordKeys(bySkippedReason),
    byConfidenceBucket: sortRecordKeys(byConfidenceBucket),
    bySignalCountBucket: sortRecordKeys(bySignalCountBucket),
    patternContextFlagRates,
    bucketDistributionShapes: sortRecordKeys(bucketDistributionShapes),
    activationInvariant: {
      expectedFalseCount: activationFalseCount,
      unexpectedTrueCount: activationTrueCount,
      invariantHeld: activationTrueCount === 0,
    },
    shouldEmitInvariant: {
      expectedFalseCount: shouldEmitFalseCount,
      unexpectedTrueCount: shouldEmitTrueCount,
      invariantHeld: shouldEmitTrueCount === 0,
    },
    recommendedNextAction,
    provisionalThresholdNotes: dedupAndSort(notes),
    calibrationWarnings: dedupAndSort(warnings),
    reasonCodes: dedupAndSort(reasonCodes),
    schemaVersionDriftDetected,
    detectorVersionDriftDetected,
  };

  return summary;
}

// ─────────────────────────────────────────────
// Helper: empty summary (fail-closed minimal)
// ─────────────────────────────────────────────

function buildEmptySummary(
  reasonCodes: CalibrationReasonCode[],
  warnings: CalibrationWarning[],
  notes: ProvisionalThresholdNote[],
): CalibrationSummary {
  const emptyBuckets: Record<string, Record<ConfidenceBucket, number>> = {};
  const emptySignalBuckets: Record<string, Record<SignalCountBucket, number>> = {};
  const emptyShapes: BucketDistributionShapes = {};
  for (const field of PATTERN_CONTEXT_FIELDS) {
    emptyBuckets[field] = emptyConfidenceBuckets();
    emptyShapes[field] = "no_data";
  }
  for (const cat of SIGNAL_COUNT_CATEGORIES) {
    emptySignalBuckets[cat] = emptySignalCountBuckets();
  }

  return {
    schemaVersion: CALIBRATION_SUMMARY_SCHEMA_VERSION,
    analyzerVersion: CALIBRATION_ANALYZER_VERSION,
    sampleCount: 0,
    validSampleCount: 0,
    sampleQuality: "insufficient_sample",
    confidenceInBucketRates: "low",
    byMode: { off: 0, observe: 0, live: 0 },
    byDetectorVersion: {},
    bySkippedReason: {},
    byConfidenceBucket: sortRecordKeys(emptyBuckets),
    bySignalCountBucket: sortRecordKeys(emptySignalBuckets),
    patternContextFlagRates: {
      infoMissing: 0,
      uncertaintyHigh: 0,
      needFraming: 0,
      oneSidedFatigue: 0,
      needTranslation: 0,
      relationshipSignalsClear: 0,
      relationshipNoiseHigh: 0,
    },
    bucketDistributionShapes: sortRecordKeys(emptyShapes),
    activationInvariant: {
      expectedFalseCount: 0,
      unexpectedTrueCount: 0,
      invariantHeld: true,
    },
    shouldEmitInvariant: {
      expectedFalseCount: 0,
      unexpectedTrueCount: 0,
      invariantHeld: true,
    },
    recommendedNextAction: "collect_more_samples",
    provisionalThresholdNotes: dedupAndSort(notes),
    calibrationWarnings: dedupAndSort(warnings),
    reasonCodes: dedupAndSort(reasonCodes),
    schemaVersionDriftDetected: false,
    detectorVersionDriftDetected: false,
  };
}

// ─────────────────────────────────────────────
// Helper: deterministic dedup + sort
// ─────────────────────────────────────────────

function dedupAndSort<T extends string>(arr: T[]): T[] {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

// ─────────────────────────────────────────────
// PII forbidden field list (人間超越 Idea I 継承、audit reviewer 用)
// ─────────────────────────────────────────────

/**
 * PII forbidden field names (本 analyzer は構造的にこれらを作らない).
 *
 * audit reviewer が「本 analyzer が PII field を作らないこと」を機械的に検証する
 * ために exported。test で summary shape にこれらが含まれないことを assert する。
 */
export const CALIBRATION_PII_FORBIDDEN_FIELD_NAMES = [
  "userId",
  "user_id",
  "pairId",
  "pair_id",
  "threadId",
  "thread_id",
  "message",
  "raw_message",
  "rawMessage",
  "userMessage",
  "user_message",
  "url",
  "email",
  "phone",
  "name",
  "displayName",
  "display_name",
  "ipAddress",
  "ip_address",
  "timestamp",
  "createdAt",
  "created_at",
  "emittedAt",
  "emitted_at",
] as const;

// ─────────────────────────────────────────────
// Re-export (caller convenience)
// ─────────────────────────────────────────────

export type {
  RedactedObservationEvent,
  Gap4ObservationMode,
  Gap4RouteObservationSkipReason,
  ConfidenceBucket,
  SignalCountBucket,
  PatternContextFlags,
  RedactionLevel,
};
