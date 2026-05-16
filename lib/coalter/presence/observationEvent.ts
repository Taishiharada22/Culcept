/**
 * CoAlter Gap 4 — Redacted Observation Event Builder (D5-a phase)
 *
 * 正本:
 *   - docs/coalter-master-design.md (Gap 4 phase plan)
 *   - lib/coalter/presence/contextDetector.ts (Gap 4 D2、PR #130)
 *   - lib/coalter/presence/contextDetectionMode.ts (Gap 4 D3、PR #141)
 *   - lib/coalter/presence/clientObservationReceive.ts (Gap 4 D4、PR #142)
 *
 * 役割:
 *   D4 client receive helper が受け取った validated observation を、
 *   将来の calibration / telemetry (D5-b 別 PR) に渡せる **redacted event
 *   payload** に変換する pure function を提供する。
 *
 *   **本 D5-a phase の目的は payload builder only**:
 *     - input: validated observation (D4 output) または raw observation
 *     - output: redacted fixed-shape event (raw text / PII 構造的に不含)
 *     - **shouldEmit: false 固定** (本 PR では emit 判断を持たない)
 *     - 実送信 / Sentry / telemetry / console / storage は **一切しない**
 *     - emit logic は D5-b (別 PR・別 CEO 判断) で扱う
 *
 * **重要な区別 (CEO 2026-05-16)**:
 *   - D5-a (本 PR): 「安全な観測 payload を作れるようにする」だけ
 *   - D5-b (別 PR): 実際に Sentry / telemetry へ送る (CEO 戦略判断必須)
 *
 * 構造的安全設計 (D2/D3/D4 継承 + D5-a 強化):
 *   1. **raw text leakage 構造的防止** (型レベル enforcement + runtime redaction):
 *      - input は D4 validated observation のみ (型レベルで raw text 不含)
 *      - output は fixed-shape event (enum + boolean + bucket、free text 不含)
 *      - userId / pairId / threadId / message / URL / email を構造的に作らない
 *   2. **shouldEmit: false 固定** (CEO 重要):
 *      - builder は emit 判断を持たない
 *      - 戻り値の `shouldEmit: false` で「本 PR では emit しない」明示
 *      - D5-b で別 layer に emit logic を実装
 *   3. **fail-closed default**:
 *      - input undefined / malformed → minimal event を返す (undefined 返さない)
 *      - skippedReason: "invalid_observation_input" 等で明示
 *   4. **bucketing (人間超越 Idea A + B)**:
 *      - 生の confidence 数値ではなく bucket (low / mid / high)
 *      - signal count も bucket 化
 *      - profile fingerprinting / 操作量推定 リスク削減
 *   5. **deterministic**:
 *      - 純関数、Math.random 不使用、timestamp 不使用、external state 参照なし
 *      - 同 input → 同 output、100 回連続呼出完全一致
 *   6. **no side effect**:
 *      - localStorage / sessionStorage / cookie 保存しない
 *      - console.log / console.warn / console.error 呼ばない
 *      - Sentry / telemetry SDK 接続しない
 *      - external API / fetch 呼ばない
 *
 * 後続 phase (本 PR scope 外):
 *   - D5-b: telemetry / Sentry 実送信 (別 PR、CEO 戦略判断)
 *   - D6: calibration (threshold 確定) (別 PR)
 *   - D7: live activation (Pattern variant 発火) (別 PR、CEO 戦略判断)
 *
 * 本 PR の不可触 (CEO 2026-05-16 制約):
 *   - Sentry / telemetry 実装
 *   - console.log / console.warn / console.error
 *   - localStorage / sessionStorage / cookie
 *   - ChatClient / UpperLayerMount / UI 変更
 *   - Pattern activation / variant 発火
 *   - production env / Vercel env 変更
 *   - external API / API key
 *   - Supabase migration
 *   - DD4 / Travel T6 / Activity AD5 / Movie Path α env 操作
 *   - bug1 / Stargazer pivot
 */

import type {
  Gap4ObservationMode,
  Gap4RouteObservationField,
  Gap4RouteObservationSkipReason,
} from "./contextDetectionMode";

// ─────────────────────────────────────────────
// const exports (event name / schema version、固定)
// ─────────────────────────────────────────────

/**
 * Fixed event name (typo 防止、grep 容易、人間超越 Idea E).
 *
 * **本 PR では実送信しない**。D5-b で receiver 側がこの name で identify する用。
 */
export const OBSERVATION_EVENT_NAME = "coalter.gap4.context_observation" as const;

/**
 * Schema version (semver、forward compat、人間超越 Idea C).
 *
 * 本 D5-a 初版 = "0.1.0"。
 * D5-b/D6/D7 phase で field 追加時 MINOR up、破壊的変更時 MAJOR up。
 */
export const OBSERVATION_EVENT_SCHEMA_VERSION = "0.1.0";

/**
 * Builder version (本 builder の version、independent of schemaVersion).
 *
 * 本 D5-a 初版 = "0.1.0"。
 * builder logic 変更時 increment。
 */
export const OBSERVATION_EVENT_BUILDER_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// Bucketing types (人間超越 Idea A + B、PII / fingerprinting 防止)
// ─────────────────────────────────────────────

/**
 * Confidence bucket (生 0-1 数値ではなく離散 bucket).
 *
 * 個別の "0.832" 等の数値で user profile を fingerprinting されるリスクを削減。
 *
 *   - "none_0": confidence === 0 (signal なし)
 *   - "low_0_to_30": 0 < confidence < 0.3
 *   - "mid_30_to_70": 0.3 <= confidence < 0.7
 *   - "high_70_plus": 0.7 <= confidence
 */
export type ConfidenceBucket = "none_0" | "low_0_to_30" | "mid_30_to_70" | "high_70_plus";

/**
 * Signal count bucket (生 count ではなく離散 bucket).
 *
 * 個別 count で操作量を fingerprinting されるリスクを削減。
 *
 *   - "none_0": count === 0
 *   - "low_1_to_2": 1-2
 *   - "mid_3_to_5": 3-5
 *   - "high_6_plus": 6+
 */
export type SignalCountBucket = "none_0" | "low_1_to_2" | "mid_3_to_5" | "high_6_plus";

// ─────────────────────────────────────────────
// Redaction level (人間超越 Idea D、audit 容易化)
// ─────────────────────────────────────────────

/**
 * Redaction level marker (event payload の redact 程度を明示).
 *
 *   - "full_redaction": 標準 (raw text / PII / 個別数値全 redact)
 *   - "bucketed_redaction": confidence / count を bucket 化済
 *   - "minimal_redaction": event 構造のみ、observation 詳細不在 (fail-closed minimal)
 */
export type RedactionLevel = "full_redaction" | "bucketed_redaction" | "minimal_redaction";

// ─────────────────────────────────────────────
// Reason code (event 内部の状態、enum only)
// ─────────────────────────────────────────────

export type RedactedEventReasonCode =
  | "valid_observation_redacted"
  | "skipped_observation_redacted"
  | "invalid_observation_input"
  | "missing_observation"
  | "activation_held_false"
  | "pattern_context_summarized"
  | "confidence_bucketed"
  | "signal_count_bucketed"
  | "raw_text_forbidden_by_design"
  | "pii_forbidden_by_design"
  | "fixed_schema_applied"
  | "no_emit_in_d5a"
  | "deterministic_no_timestamp";

// ─────────────────────────────────────────────
// Pattern context flags (boolean snapshot、人間超越設計)
// ─────────────────────────────────────────────

/**
 * Pattern context summary as boolean flags.
 *
 * D2 `PatternContext` の 7 field を boolean flag で summarize。
 * raw signal value は含めない、true/false のみ。
 *
 * 未確定 (D2 で field 不在) は false。
 */
export interface PatternContextFlags {
  infoMissing: boolean;
  uncertaintyHigh: boolean;
  needFraming: boolean;
  oneSidedFatigue: boolean;
  needTranslation: boolean;
  relationshipSignalsClear: boolean;
  relationshipNoiseHigh: boolean;
}

/**
 * Confidence buckets per pattern context field.
 */
export interface ConfidenceBuckets {
  infoMissing: ConfidenceBucket;
  uncertaintyHigh: ConfidenceBucket;
  needFraming: ConfidenceBucket;
  oneSidedFatigue: ConfidenceBucket;
  needTranslation: ConfidenceBucket;
  relationshipSignalsClear: ConfidenceBucket;
  relationshipNoiseHigh: ConfidenceBucket;
}

/**
 * Signal count buckets per category.
 */
export interface SignalCountBuckets {
  infoMissing: SignalCountBucket;
  uncertainty: SignalCountBucket;
  framing: SignalCountBucket;
  fatigue: SignalCountBucket;
  translation: SignalCountBucket;
  relationshipClear: SignalCountBucket;
  relationshipNoise: SignalCountBucket;
}

// ─────────────────────────────────────────────
// Redacted observation event (fixed shape、本 D5-a の output)
// ─────────────────────────────────────────────

/**
 * Redacted observation event payload (fixed shape).
 *
 * **構造的安全 (CEO 必須)**:
 *   - userId / pairId / threadId / message / URL / email を **構造的に含まない**
 *   - raw text / raw utterance を含まない (型レベル enforcement)
 *   - confidence / signal count は bucket 化済 (生数値含まない)
 *   - **shouldEmit: false 固定** (本 PR では emit 判断を持たない)
 *
 * **forward compatibility (人間超越 Idea L)**:
 *   - 全 optional field は D5-b 側の receiver が partial schema を扱える
 *   - schemaVersion で互換性管理
 */
export interface RedactedObservationEvent {
  /** Fixed event name (typo 防止) */
  eventName: typeof OBSERVATION_EVENT_NAME;
  /** Schema version (semver、forward compat) */
  schemaVersion: string;
  /** Builder version (本 builder の version) */
  builderVersion: string;
  /** Observation mode (enum、3 値) */
  mode: Gap4ObservationMode;
  /** Detector version (D2 から pass-through、optional) */
  detectorVersion?: string;
  /** Activation flag (**本 D5-a で常に false** 強制) */
  activation: false;
  /** Skipped reason (D3 から、optional) */
  skippedReason?: Gap4RouteObservationSkipReason;
  /** Pattern context flags (boolean snapshot、optional) */
  patternContextFlags?: PatternContextFlags;
  /** Confidence buckets (生数値ではなく bucket、optional) */
  confidenceBuckets?: ConfidenceBuckets;
  /** Signal count buckets (生 count ではなく bucket、optional) */
  signalCountBuckets?: SignalCountBuckets;
  /** Reason codes (enum only、deterministic sort) */
  reasonCodes: RedactedEventReasonCode[];
  /** Redaction level marker */
  redactionLevel: RedactionLevel;
  /**
   * **Should emit flag (本 D5-a で常に false 固定、CEO 重要)**.
   *
   * builder は emit 判断を持たない。D5-b で別 layer に emit logic を実装。
   */
  shouldEmit: false;
}

// ─────────────────────────────────────────────
// Builder input
// ─────────────────────────────────────────────

/**
 * Build options for `buildRedactedObservationEvent`.
 *
 * input は D4 validated observation のみ受領 (型レベル enforcement)。
 * raw user text / raw utterance を含む shape は受領不可。
 */
export interface BuildRedactedEventInput {
  /** Validated observation (D4 から) or undefined */
  observation: Gap4RouteObservationField | undefined;
}

// ─────────────────────────────────────────────
// Bucket helpers (pure、人間超越 Idea A + B)
// ─────────────────────────────────────────────

/**
 * Bucket a confidence value (0-1) into discrete bucket.
 *
 * Pure deterministic mapping。生数値で profile fingerprinting されるリスクを削減。
 *
 * @param value confidence (expected 0-1、out-of-range は clamp)
 * @returns ConfidenceBucket
 */
export function bucketConfidence(value: number | undefined): ConfidenceBucket {
  if (value === undefined || value === null) return "none_0";
  if (Number.isNaN(value)) return "none_0";
  // clamp to [0, 1]
  const clamped = Math.max(0, Math.min(1, value));
  if (clamped === 0) return "none_0";
  if (clamped < 0.3) return "low_0_to_30";
  if (clamped < 0.7) return "mid_30_to_70";
  return "high_70_plus";
}

/**
 * Bucket a signal count into discrete bucket.
 *
 * Pure deterministic mapping。
 *
 * @param count signal count (expected >= 0)
 * @returns SignalCountBucket
 */
export function bucketSignalCount(count: number | undefined): SignalCountBucket {
  if (count === undefined || count === null) return "none_0";
  if (Number.isNaN(count)) return "none_0";
  if (count <= 0) return "none_0";
  if (count <= 2) return "low_1_to_2";
  if (count <= 5) return "mid_3_to_5";
  return "high_6_plus";
}

// ─────────────────────────────────────────────
// Pattern context flag derivation (pure)
// ─────────────────────────────────────────────

/**
 * Derive boolean flags from D2 partial pattern context.
 *
 * 未確定 (field 不在) は false。
 */
function derivePatternContextFlags(
  partial: Gap4RouteObservationField["patternContext"],
): PatternContextFlags {
  return {
    infoMissing: partial?.infoMissing === true,
    uncertaintyHigh: partial?.uncertaintyHigh === true,
    needFraming: partial?.needFraming === true,
    oneSidedFatigue: partial?.oneSidedFatigue === true,
    needTranslation: partial?.needTranslation === true,
    relationshipSignalsClear: partial?.relationshipSignalsClear === true,
    relationshipNoiseHigh: partial?.relationshipNoiseHigh === true,
  };
}

/**
 * Derive confidence buckets from D2 confidence record.
 */
function deriveConfidenceBuckets(
  confidence: Gap4RouteObservationField["confidence"],
): ConfidenceBuckets {
  return {
    infoMissing: bucketConfidence(confidence?.infoMissing),
    uncertaintyHigh: bucketConfidence(confidence?.uncertaintyHigh),
    needFraming: bucketConfidence(confidence?.needFraming),
    oneSidedFatigue: bucketConfidence(confidence?.oneSidedFatigue),
    needTranslation: bucketConfidence(confidence?.needTranslation),
    relationshipSignalsClear: bucketConfidence(confidence?.relationshipSignalsClear),
    relationshipNoiseHigh: bucketConfidence(confidence?.relationshipNoiseHigh),
  };
}

/**
 * Derive signal count buckets from D2 signalCounts record.
 */
function deriveSignalCountBuckets(
  signalCounts: Gap4RouteObservationField["signalCounts"],
): SignalCountBuckets {
  return {
    infoMissing: bucketSignalCount(signalCounts?.infoMissing),
    uncertainty: bucketSignalCount(signalCounts?.uncertainty),
    framing: bucketSignalCount(signalCounts?.framing),
    fatigue: bucketSignalCount(signalCounts?.fatigue),
    translation: bucketSignalCount(signalCounts?.translation),
    relationshipClear: bucketSignalCount(signalCounts?.relationshipClear),
    relationshipNoise: bucketSignalCount(signalCounts?.relationshipNoise),
  };
}

// ─────────────────────────────────────────────
// Main builder (pure function、deterministic、stateless)
// ─────────────────────────────────────────────

/**
 * Build a redacted observation event payload (pure function).
 *
 * **本関数は純関数**: 同じ input → 同じ output、副作用なし、
 * `Math.random` 不使用、`Date.now()` / timestamp 不使用、
 * external state 参照なし、external API 不使用。
 *
 * **本関数は emit しない (CEO 重要)**:
 *   - 戻り値の `shouldEmit: false` 固定
 *   - console.log / Sentry / telemetry / fetch 一切呼ばない
 *   - localStorage / sessionStorage / cookie 一切触らない
 *   - emit logic は D5-b (別 PR・別 CEO 判断) で扱う
 *
 * **構造的安全 (raw text leakage 防止)**:
 *   - input observation は D4 validated 済 (raw text 不含)
 *   - output に userId / pairId / threadId / message / URL / email を構造的に含めない
 *   - confidence / signal count は bucket 化済 (生数値含まない)
 *
 * **fail-closed**:
 *   - observation undefined → minimal event を返す (`missing_observation` reason)
 *   - input 異常 → minimal event を返す (`invalid_observation_input` reason)
 *   - throw しない (production stability)
 *
 * @param input BuildRedactedEventInput
 * @returns RedactedObservationEvent (fixed-shape、emit しない)
 */
export function buildRedactedObservationEvent(
  input: BuildRedactedEventInput,
): RedactedObservationEvent {
  const reasonCodes: RedactedEventReasonCode[] = [];

  // 1. Common reason codes (常に追加、constraint markers)
  reasonCodes.push("activation_held_false");
  reasonCodes.push("raw_text_forbidden_by_design");
  reasonCodes.push("pii_forbidden_by_design");
  reasonCodes.push("fixed_schema_applied");
  reasonCodes.push("no_emit_in_d5a");
  reasonCodes.push("deterministic_no_timestamp");

  // 2. observation undefined / null → minimal event (fail-closed)
  if (input.observation === undefined || input.observation === null) {
    reasonCodes.push("missing_observation");
    return buildMinimalEvent(reasonCodes);
  }

  // 3. observation の shape を簡易再 validate (D4 が validated 済の前提だが二重防御)
  if (
    typeof input.observation !== "object" ||
    typeof input.observation.mode !== "string" ||
    typeof input.observation.activation !== "boolean"
  ) {
    reasonCodes.push("invalid_observation_input");
    return buildMinimalEvent(reasonCodes);
  }

  const obs = input.observation;

  // 4. observation 内に redactable な PII / raw text っぽい field が紛れていないか
  //    確認 (構造的安全、D4 validator で reject 済だが二重防御):
  //    - patternContext / confidence / signalCounts のみ accept
  //    - 想定外の string field (例: rawMessage) があれば skip (本 D5-a では含めない)

  // 5. skipped 系の判定
  const isSkipped =
    obs.skippedReason !== undefined ||
    obs.patternContext === undefined ||
    Object.keys(obs.patternContext ?? {}).length === 0;

  if (isSkipped) {
    reasonCodes.push("skipped_observation_redacted");
  } else {
    reasonCodes.push("valid_observation_redacted");
    reasonCodes.push("pattern_context_summarized");
  }

  // 6. bucketing
  if (obs.confidence !== undefined) {
    reasonCodes.push("confidence_bucketed");
  }
  if (obs.signalCounts !== undefined) {
    reasonCodes.push("signal_count_bucketed");
  }

  // 7. event 構築
  const event: RedactedObservationEvent = {
    eventName: OBSERVATION_EVENT_NAME,
    schemaVersion: OBSERVATION_EVENT_SCHEMA_VERSION,
    builderVersion: OBSERVATION_EVENT_BUILDER_VERSION,
    mode: obs.mode,
    // **activation 強制 false** (CEO 重要、D3 + D4 + D5-a 三重 gate)
    activation: false,
    skippedReason: obs.skippedReason,
    detectorVersion: obs.detectorVersion,
    reasonCodes: sortReasonCodes(reasonCodes),
    redactionLevel: "bucketed_redaction",
    shouldEmit: false,
  };

  // 8. optional fields (patternContext / confidence / signalCounts)
  if (obs.patternContext !== undefined) {
    event.patternContextFlags = derivePatternContextFlags(obs.patternContext);
  }
  if (obs.confidence !== undefined) {
    event.confidenceBuckets = deriveConfidenceBuckets(obs.confidence);
  }
  if (obs.signalCounts !== undefined) {
    event.signalCountBuckets = deriveSignalCountBuckets(obs.signalCounts);
  }

  return event;
}

// ─────────────────────────────────────────────
// Helper: minimal event (fail-closed、人間超越 Idea K)
// ─────────────────────────────────────────────

/**
 * Build a minimal (fail-closed) event when observation is absent / invalid.
 *
 * 構造的に空に近い event を返す。undefined を返さず、caller 側ロジックを簡素化。
 */
function buildMinimalEvent(reasonCodes: RedactedEventReasonCode[]): RedactedObservationEvent {
  return {
    eventName: OBSERVATION_EVENT_NAME,
    schemaVersion: OBSERVATION_EVENT_SCHEMA_VERSION,
    builderVersion: OBSERVATION_EVENT_BUILDER_VERSION,
    mode: "off",
    activation: false,
    reasonCodes: sortReasonCodes(reasonCodes),
    redactionLevel: "minimal_redaction",
    shouldEmit: false,
  };
}

// ─────────────────────────────────────────────
// Helper: deterministic reason code sort (人間超越 Idea J)
// ─────────────────────────────────────────────

/**
 * Sort reason codes lexicographically (deterministic、duplicate removal).
 *
 * 同 input → 同 output 保証、deduplication 容易化。
 */
function sortReasonCodes(codes: RedactedEventReasonCode[]): RedactedEventReasonCode[] {
  const unique = Array.from(new Set(codes));
  return unique.sort((a, b) => a.localeCompare(b));
}

// ─────────────────────────────────────────────
// Test-only emit accessor (人間超越 Idea N)
// ─────────────────────────────────────────────

/**
 * Get emit decision from an event (always returns false in D5-a phase).
 *
 * **本 D5-a phase では常に false 返し** (CEO 2026-05-16 指示厳守)。
 *
 * Production code path では本関数の戻り値を使わない (no-op for production)。
 * Test では emit decision = false を構造的に確認できる pure accessor。
 *
 * D5-b phase で emit logic を実装する際は、本関数を切替える設計。
 *
 * @param event RedactedObservationEvent
 * @returns always `false` in D5-a phase
 */
export function getEventEmitDecision(event: RedactedObservationEvent): false {
  // event.shouldEmit は constant `false`、本 accessor も literal `false` 返し
  // 二重 gate: builder 側で false、accessor 側でも false 強制
  void event;
  return false;
}

// ─────────────────────────────────────────────
// PII forbidden field list (人間超越 Idea I、audit reviewer 用)
// ─────────────────────────────────────────────

/**
 * PII forbidden field names (audit reviewer 用、本 builder は構造的にこれらを作らない).
 *
 * 本 const は **runtime で使われない** (event shape は型レベルで上記を含まない)。
 * audit reviewer が「本 builder が PII field を作らないこと」を機械的に検証する
 * ために exported。test で event shape にこれらが含まれないことを assert する。
 */
export const PII_FORBIDDEN_FIELD_NAMES = [
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
] as const;

// ─────────────────────────────────────────────
// Re-export (caller convenience)
// ─────────────────────────────────────────────

export type {
  Gap4ObservationMode,
  Gap4RouteObservationField,
  Gap4RouteObservationSkipReason,
};
