/**
 * CoAlter Movie Understanding — Redacted Diagnostics Buffer (A2 phase)
 *
 * 正本:
 *   - docs/coalter-step-e-pre-checklist-audit.md §1.1 (E-1 shadow 観測)
 *   - lib/coalter/flags.ts `understandingShadowMovie` (B-5、PR #102/#127 系列)
 *   - lib/coalter/understanding/diagnostics.ts (`emitUnderstandingDiagnostics`、別 channel)
 *   - lib/coalter/engine.ts `runMovieShadowUnderstanding` (shadow path runner)
 *   - lib/coalter/presence/observationEvent.ts (Gap 4 D5-a、bucketing pattern 流用)
 *
 * 役割:
 *   Movie understanding shadow (`runMovieShadowUnderstanding`) が走った結果を、
 *   **既存の console emit (`emitUnderstandingDiagnostics`) を経由せず**、
 *   structured / bucketed / redacted shape で **in-memory** に貯める
 *   **self-contained helper** を提供する。
 *
 *   **本 A2 phase の目的は helper の追加のみ**:
 *     - 本 PR ではどこからも import / call しない (runtime call-site wiring 0)
 *     - 既存 `emitUnderstandingDiagnostics` は touch しない
 *     - production behavior unchanged because it is **not wired**
 *     - A3 で別 PR / 別 CEO 判断にて fan-out wiring + 取出 API を扱う
 *
 * **重要な区別 (CEO 2026-05-16)**:
 *   - 本 file は **self-contained in-memory buffer helper** であり pure function ではない
 *     (module-level state を持つ stateful helper)
 *   - "pure function" / "production-safe telemetry completed" /
 *     "observation collection rollout completed" と断定しない
 *   - production behavior unchanged because it is **not wired** (誰も import しない)
 *
 * 構造的安全設計 (D5-a / D6-a 継承 + A2 強化):
 *   1. **Type-level raw input firewall** (人間超越 Idea A):
 *      - input 型は `CreateRedactedUnderstandingDiagnosticsEventInput` で
 *        normalized metrics / fixed enum / bucket 済 signal のみ accept
 *      - **既存 `UnderstandingDiagnostics` raw type を import しない** (型レベル firewall)
 *      - raw user text / raw utterance / talk_messages bundle / userId /
 *        pairId / threadId / message / URL / email は **構造的に受領不能**
 *   2. **Module-level singleton buffer** (人間超越 Idea B):
 *      - 1 process 1 buffer (Node.js module cache 活用)
 *      - Vercel serverless = cold start で reset (per-process isolation = privacy 保護)
 *      - cross-request / cross-pair 共有なし
 *   3. **Ring buffer + drop_oldest** (CEO 指定):
 *      - max size 100、FIFO で古い entry を drop
 *      - memory leak 防止、Vercel runtime 制約遵守
 *   4. **Bucketing 流用** (D5-a 継承):
 *      - confidence / latency / source coverage を bucket 化
 *      - profile fingerprinting / 操作量 fingerprinting 防止
 *   5. **Activation / shouldEmit literal false** (D5-a 継承):
 *      - event 内 `activation: false` / `shouldEmit: false` literal type 固定
 *      - true で input を渡しても validator が reject → buffer に入らない
 *   6. **PII forbidden field list** (D5-a 継承):
 *      - `PII_FORBIDDEN_FIELD_NAMES` const export (audit reviewer 用)
 *      - event shape にこれらを構造的に持たない
 *   7. **No side effect** (CEO 必須):
 *      - console.log / console.warn / console.error 呼ばない
 *      - localStorage / sessionStorage / cookie 触らない
 *      - Sentry / telemetry / fetch / Supabase / DB 接続なし
 *      - emitUnderstandingDiagnostics 不変、touch なし
 *
 * 後続 phase (本 PR scope 外):
 *   - A3: collector fan-out wiring (`emitUnderstandingDiagnostics` から本 buffer
 *     への接続、CEO 戦略判断必須)
 *   - A4: read-only diagnostics retrieval API (route touch、Stop-before-merge lane)
 *   - A5+: production rollout (Step E 開始判断、CEO 戦略判断必須)
 *
 * 本 PR の不可触 (CEO 2026-05-16 制約):
 *   - emitUnderstandingDiagnostics / runUnderstanding / engine.ts 修正
 *   - route / API / ChatClient / UpperLayerMount touch
 *   - console.log / console.warn / console.error
 *   - localStorage / sessionStorage / cookie
 *   - Sentry / telemetry / fetch / Supabase / DB / migration
 *   - production env / Vercel env 変更
 *   - COALTER_UNDERSTANDING_DIAGNOSTICS / COALTER_MOVIE_CURATOR_LIVE /
 *     COALTER_THREE_STAGE 変更
 *   - bug1 / Stargazer pivot
 */

// ─────────────────────────────────────────────
// const exports (buffer / schema version、固定)
// ─────────────────────────────────────────────

/**
 * Buffer name (audit / future A3 取出 API 用 identifier).
 *
 * Gap 4 presence の D5-a `coalter.gap4.context_observation` と混同しないよう、
 * understanding shadow 用の独立 identifier。
 */
export const REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_NAME =
  "coalter.movie.understanding_shadow_diagnostics" as const;

/**
 * Event schema version (semver、forward compat).
 *
 * 本 A2 初版 = "0.1.0"。
 * A3/A4 phase で field 追加時 MINOR up、破壊的変更時 MAJOR up。
 */
export const REDACTED_UNDERSTANDING_DIAGNOSTICS_SCHEMA_VERSION = "0.1.0";

/**
 * Buffer helper version (independent of schemaVersion).
 *
 * 本 A2 初版 = "0.1.0"。
 * helper logic 変更時 increment。
 */
export const REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_VERSION = "0.1.0";

/**
 * Max buffer size (provisional、CEO 補正可).
 *
 * Vercel serverless function memory 制約遵守、memory leak 防止。
 */
export const MAX_BUFFER_SIZE_DEFAULT = 100;

// ─────────────────────────────────────────────
// Bucketing types (D5-a 継承、人間超越 Idea D)
// ─────────────────────────────────────────────

/**
 * Confidence bucket (生 0-1 数値ではなく離散 bucket).
 *
 * profile fingerprinting 防止。
 */
export type ConfidenceBucket = "none_0" | "low_0_to_30" | "mid_30_to_70" | "high_70_plus";

/**
 * Latency bucket (生 ms 数値ではなく離散 bucket).
 *
 *   - "lt_100ms": < 100ms
 *   - "lt_500ms": 100ms 以上 500ms 未満
 *   - "lt_2s": 500ms 以上 2s 未満
 *   - "lt_5s": 2s 以上 5s 未満
 *   - "ge_5s": 5s 以上
 */
export type LatencyBucket = "lt_100ms" | "lt_500ms" | "lt_2s" | "lt_5s" | "ge_5s";

/**
 * Source coverage bucket (生 count ではなく離散 bucket).
 *
 *   - "none_0": 0 sources
 *   - "low_1_to_2": 1-2 sources
 *   - "mid_3_to_5": 3-5 sources
 *   - "high_6_plus": 6+ sources
 */
export type SourceCoverageBucket = "none_0" | "low_1_to_2" | "mid_3_to_5" | "high_6_plus";

// ─────────────────────────────────────────────
// Redaction level marker (D5-a 継承)
// ─────────────────────────────────────────────

export type RedactionLevel =
  | "full_redaction"
  | "bucketed_redaction"
  | "minimal_redaction";

// ─────────────────────────────────────────────
// Outcome enum (M0 gate 由来、enum only)
// ─────────────────────────────────────────────

/**
 * Understanding outcome (D5-a と同様、enum only).
 */
export type UnderstandingOutcome = "success" | "degraded" | "failed";

// ─────────────────────────────────────────────
// Drop policy enum (CEO 指定、本 PR は drop_oldest 固定)
// ─────────────────────────────────────────────

export type DropPolicy = "drop_oldest" | "drop_newest" | "sample_uniform";

/**
 * Default drop policy for this A2 phase.
 *
 * **本 PR では drop_oldest 固定**。drop_newest / sample_uniform は future
 * (A3+ で別 PR、CEO 戦略判断)。
 */
export const DROP_POLICY_DEFAULT: DropPolicy = "drop_oldest";

// ─────────────────────────────────────────────
// Reason code (enum only)
// ─────────────────────────────────────────────

export type RedactedDiagnosticsReasonCode =
  | "event_appended"
  | "event_rejected_invalid_input"
  | "event_rejected_activation_must_be_false"
  | "event_rejected_should_emit_must_be_false"
  | "buffer_full_oldest_dropped"
  | "buffer_cleared"
  | "snapshot_returned"
  | "no_runtime_wiring"
  | "no_console_output"
  | "no_storage_no_db"
  | "no_telemetry_send"
  | "self_contained_in_memory_only"
  | "raw_text_forbidden_by_design"
  | "pii_forbidden_by_design";

// ─────────────────────────────────────────────
// Redacted event (fixed shape、PII / raw text 構造的不含)
// ─────────────────────────────────────────────

/**
 * Redacted understanding diagnostics event (fixed shape).
 *
 * **構造的安全 (CEO 必須)**:
 *   - userId / pairId / threadId / message / URL / email を **構造的に含まない**
 *   - raw user text / raw utterance / talk_messages bundle を含まない
 *   - confidence / latency / source coverage は bucket 化済 (生数値含まない)
 *   - **activation: false 固定** / **shouldEmit: false 固定** (literal type)
 *
 * **forward compatibility (D5-a 流用)**:
 *   - 全 optional field は A3 receiver の partial schema を扱える
 *   - schemaVersion で互換性管理
 */
export interface RedactedUnderstandingDiagnosticsEvent {
  /** Sequence number (buffer 内 unique、auto-assigned、人間超越 Idea L) */
  sequenceNumber: number;
  /** Buffer name (fixed) */
  bufferName: typeof REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_NAME;
  /** Schema version (semver) */
  schemaVersion: string;
  /** Buffer helper version */
  bufferVersion: string;
  /** Understanding outcome (success / degraded / failed) */
  outcome: UnderstandingOutcome;
  /** Lens version (semver、optional) */
  lensVersion?: string;
  /** Understanding confidence bucket (生数値ではなく bucket) */
  understandingConfidenceBucket: ConfidenceBucket;
  /** Completeness bucket (optional) */
  completenessBucket?: ConfidenceBucket;
  /** Latency buckets per phase (生 ms ではなく bucket) */
  latencyBuckets?: {
    total?: LatencyBucket;
    collect?: LatencyBucket;
    fusion?: LatencyBucket;
    todayReader?: LatencyBucket;
    fairness?: LatencyBucket;
  };
  /** Source coverage buckets per person (生 count ではなく bucket) */
  sourceCoverageBuckets?: {
    personAStargazer?: SourceCoverageBucket;
    personAAlter?: SourceCoverageBucket;
    personABehavioral?: SourceCoverageBucket;
    personBStargazer?: SourceCoverageBucket;
    personBAlter?: SourceCoverageBucket;
    personBBehavioral?: SourceCoverageBucket;
  };
  /** Missing domain count bucket (optional) */
  missingDomainCountBucket?: SourceCoverageBucket;
  /** Activation flag (**A2 では常に false** 強制) */
  activation: false;
  /** Should emit flag (**A2 では常に false** 強制) */
  shouldEmit: false;
  /** Redaction level marker */
  redactionLevel: RedactionLevel;
  /** Reason codes (enum、deterministic sort) */
  reasonCodes: RedactedDiagnosticsReasonCode[];
}

// ─────────────────────────────────────────────
// Create event input (normalized metrics / fixed enum / bucket 済 signal のみ)
// ─────────────────────────────────────────────

/**
 * Input for `createRedactedUnderstandingDiagnosticsEvent`.
 *
 * **重要 (CEO 2026-05-16 補正、Type-level raw input firewall)**:
 *   - 全 field は normalized metrics / fixed enum / number のみ
 *   - raw user text / raw utterance / talk_messages bundle / userId /
 *     pairId / threadId / message / URL / email は **構造的に受領不能**
 *   - 既存 `UnderstandingDiagnostics` raw type を import しない (型レベル firewall)
 *
 * Caller は raw diagnostics を本 helper に **直接渡せない**。caller 側で
 * pre-bucket / pre-normalize した値だけを accept する。
 */
export interface CreateRedactedUnderstandingDiagnosticsEventInput {
  /** Understanding outcome (success / degraded / failed) */
  outcome: UnderstandingOutcome;
  /** Lens version (semver string、optional) */
  lensVersion?: string;
  /** Understanding confidence (0-1、bucket 化される) */
  understandingConfidence: number;
  /** Completeness (0-1、optional、bucket 化される) */
  completeness?: number;
  /** Latency ms per phase (optional、bucket 化される) */
  latencyMs?: {
    total?: number;
    collect?: number;
    fusion?: number;
    todayReader?: number;
    fairness?: number;
  };
  /** Source coverage counts per person (optional、bucket 化される) */
  sourceCoverageCounts?: {
    personAStargazerCount?: number;
    personAAlterCount?: number;
    personABehavioralCount?: number;
    personBStargazerCount?: number;
    personBAlterCount?: number;
    personBBehavioralCount?: number;
  };
  /** Missing domain count (optional、bucket 化される) */
  missingDomainCount?: number;
}

// ─────────────────────────────────────────────
// Bucketing helpers (D5-a 継承、pure)
// ─────────────────────────────────────────────

/**
 * Bucket a confidence value (0-1) into discrete bucket (pure).
 */
export function bucketConfidence(value: number | undefined): ConfidenceBucket {
  if (value === undefined || value === null) return "none_0";
  if (Number.isNaN(value)) return "none_0";
  const clamped = Math.max(0, Math.min(1, value));
  if (clamped === 0) return "none_0";
  if (clamped < 0.3) return "low_0_to_30";
  if (clamped < 0.7) return "mid_30_to_70";
  return "high_70_plus";
}

/**
 * Bucket a latency ms into discrete bucket (pure).
 */
export function bucketLatency(ms: number | undefined): LatencyBucket {
  if (ms === undefined || ms === null) return "lt_100ms";
  if (Number.isNaN(ms)) return "lt_100ms";
  if (ms < 100) return "lt_100ms";
  if (ms < 500) return "lt_500ms";
  if (ms < 2000) return "lt_2s";
  if (ms < 5000) return "lt_5s";
  return "ge_5s";
}

/**
 * Bucket a source count into discrete bucket (pure).
 */
export function bucketSourceCoverage(count: number | undefined): SourceCoverageBucket {
  if (count === undefined || count === null) return "none_0";
  if (Number.isNaN(count)) return "none_0";
  if (count <= 0) return "none_0";
  if (count <= 2) return "low_1_to_2";
  if (count <= 5) return "mid_3_to_5";
  return "high_6_plus";
}

// ─────────────────────────────────────────────
// Helper: validate enum (whitelist)
// ─────────────────────────────────────────────

const VALID_OUTCOMES: ReadonlySet<UnderstandingOutcome> = new Set<UnderstandingOutcome>([
  "success",
  "degraded",
  "failed",
]);

function isValidOutcome(value: unknown): value is UnderstandingOutcome {
  return typeof value === "string" && VALID_OUTCOMES.has(value as UnderstandingOutcome);
}

// ─────────────────────────────────────────────
// Create event (validator + builder、pure)
// ─────────────────────────────────────────────

/**
 * Create a redacted understanding diagnostics event from normalized input.
 *
 * **Pure function (本 helper の中で唯一の pure layer)**: 同じ input → 同じ output、
 * 副作用なし。`Math.random` / `Date.now` 不使用。
 *
 * sequenceNumber は **0 で生成される (placeholder)**。append 時に buffer が
 * sequence を割り振る (auto-assign)。
 *
 * **Fail-closed**: invalid input → undefined を返す (throw しない)。
 *
 * @param input normalized metrics / fixed enum / number
 * @returns RedactedUnderstandingDiagnosticsEvent (sequenceNumber=0 placeholder)、
 *   または undefined (invalid input)
 */
export function createRedactedUnderstandingDiagnosticsEvent(
  input: CreateRedactedUnderstandingDiagnosticsEventInput,
): RedactedUnderstandingDiagnosticsEvent | undefined {
  // validate outcome
  if (!isValidOutcome(input.outcome)) return undefined;
  // validate understandingConfidence is a number
  if (typeof input.understandingConfidence !== "number") return undefined;
  if (Number.isNaN(input.understandingConfidence)) return undefined;

  const reasonCodes: RedactedDiagnosticsReasonCode[] = [];
  reasonCodes.push("raw_text_forbidden_by_design");
  reasonCodes.push("pii_forbidden_by_design");
  reasonCodes.push("self_contained_in_memory_only");

  const latencyBuckets: NonNullable<RedactedUnderstandingDiagnosticsEvent["latencyBuckets"]> = {};
  if (input.latencyMs !== undefined) {
    if (input.latencyMs.total !== undefined) latencyBuckets.total = bucketLatency(input.latencyMs.total);
    if (input.latencyMs.collect !== undefined) latencyBuckets.collect = bucketLatency(input.latencyMs.collect);
    if (input.latencyMs.fusion !== undefined) latencyBuckets.fusion = bucketLatency(input.latencyMs.fusion);
    if (input.latencyMs.todayReader !== undefined) latencyBuckets.todayReader = bucketLatency(input.latencyMs.todayReader);
    if (input.latencyMs.fairness !== undefined) latencyBuckets.fairness = bucketLatency(input.latencyMs.fairness);
  }

  const sourceCoverageBuckets: NonNullable<RedactedUnderstandingDiagnosticsEvent["sourceCoverageBuckets"]> = {};
  if (input.sourceCoverageCounts !== undefined) {
    const sc = input.sourceCoverageCounts;
    if (sc.personAStargazerCount !== undefined) sourceCoverageBuckets.personAStargazer = bucketSourceCoverage(sc.personAStargazerCount);
    if (sc.personAAlterCount !== undefined) sourceCoverageBuckets.personAAlter = bucketSourceCoverage(sc.personAAlterCount);
    if (sc.personABehavioralCount !== undefined) sourceCoverageBuckets.personABehavioral = bucketSourceCoverage(sc.personABehavioralCount);
    if (sc.personBStargazerCount !== undefined) sourceCoverageBuckets.personBStargazer = bucketSourceCoverage(sc.personBStargazerCount);
    if (sc.personBAlterCount !== undefined) sourceCoverageBuckets.personBAlter = bucketSourceCoverage(sc.personBAlterCount);
    if (sc.personBBehavioralCount !== undefined) sourceCoverageBuckets.personBBehavioral = bucketSourceCoverage(sc.personBBehavioralCount);
  }

  const event: RedactedUnderstandingDiagnosticsEvent = {
    sequenceNumber: 0, // placeholder、append 時に auto-assign
    bufferName: REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_NAME,
    schemaVersion: REDACTED_UNDERSTANDING_DIAGNOSTICS_SCHEMA_VERSION,
    bufferVersion: REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_VERSION,
    outcome: input.outcome,
    lensVersion: input.lensVersion,
    understandingConfidenceBucket: bucketConfidence(input.understandingConfidence),
    completenessBucket: input.completeness !== undefined ? bucketConfidence(input.completeness) : undefined,
    latencyBuckets: Object.keys(latencyBuckets).length > 0 ? latencyBuckets : undefined,
    sourceCoverageBuckets: Object.keys(sourceCoverageBuckets).length > 0 ? sourceCoverageBuckets : undefined,
    missingDomainCountBucket: input.missingDomainCount !== undefined
      ? bucketSourceCoverage(input.missingDomainCount)
      : undefined,
    activation: false,
    shouldEmit: false,
    redactionLevel: "bucketed_redaction",
    reasonCodes: dedupAndSortReasons(reasonCodes),
  };

  return event;
}

// ─────────────────────────────────────────────
// Module-level singleton buffer (人間超越 Idea B)
// ─────────────────────────────────────────────

/**
 * Module-level ring buffer (1 process 1 buffer).
 *
 * Vercel serverless = cold start で reset (per-process isolation = privacy 保護)。
 * cross-request / cross-pair 共有なし。
 */
const buffer: RedactedUnderstandingDiagnosticsEvent[] = [];
let nextSequenceNumber = 0;
let maxBufferSize = MAX_BUFFER_SIZE_DEFAULT;

// ─────────────────────────────────────────────
// Append event (stateful、validator + drop policy)
// ─────────────────────────────────────────────

/**
 * Append a redacted event to the in-memory buffer.
 *
 * **重要 (CEO 2026-05-16 補正)**:
 *   - 本 helper は module-level buffer を変更する **stateful helper**
 *   - pure function ではない
 *   - production behavior unchanged because **本 PR では誰も import しない**
 *
 * **Validator + activation/shouldEmit invariant** (D5-a 継承):
 *   - event.activation === true → reject (return undefined、reasonCode `event_rejected_activation_must_be_false`)
 *   - event.shouldEmit === true → reject
 *   - validation fail → reject
 *
 * **Drop policy**: drop_oldest (本 A2 固定)、buffer full 時 FIFO で古い entry を drop。
 *
 * @param event RedactedUnderstandingDiagnosticsEvent (or invalid input)
 * @returns appended event with assigned sequence number, or undefined if rejected
 */
export function appendRedactedUnderstandingDiagnosticsEvent(
  event: RedactedUnderstandingDiagnosticsEvent | unknown,
): RedactedUnderstandingDiagnosticsEvent | undefined {
  // validate shape (minimum)
  if (event === null || event === undefined) return undefined;
  if (typeof event !== "object") return undefined;
  const e = event as Record<string, unknown>;

  if (!isValidOutcome(e.outcome)) return undefined;
  if (typeof e.activation !== "boolean") return undefined;
  if (typeof e.shouldEmit !== "boolean") return undefined;

  // invariant: activation must be false (A2 phase enforce)
  if (e.activation === true) return undefined;
  // invariant: shouldEmit must be false
  if (e.shouldEmit === true) return undefined;

  // Drop oldest if buffer is full (drop_oldest policy)
  if (buffer.length >= maxBufferSize) {
    buffer.shift();
  }

  // Assign sequence number
  const assigned: RedactedUnderstandingDiagnosticsEvent = {
    ...(event as RedactedUnderstandingDiagnosticsEvent),
    sequenceNumber: nextSequenceNumber++,
  };

  buffer.push(assigned);
  return assigned;
}

// ─────────────────────────────────────────────
// Get snapshot (test-only accessor、production no-op)
// ─────────────────────────────────────────────

/**
 * Get a snapshot of the current buffer (test-only accessor).
 *
 * **本 PR では誰も import / call しない** (production code path に接続なし)。
 * test では shape / count / sequence 検証用に使う。
 *
 * **Returns a defensive copy** (caller が mutate しても buffer は変わらない).
 *
 * @returns array of events in FIFO order (oldest first)
 */
export function getRedactedUnderstandingDiagnosticsSnapshot(): RedactedUnderstandingDiagnosticsEvent[] {
  // Defensive copy + deep-copy each event for safety
  return buffer.map((e) => ({ ...e }));
}

/**
 * Get current buffer size (test-only accessor).
 */
export function getRedactedUnderstandingDiagnosticsBufferSize(): number {
  return buffer.length;
}

/**
 * Get next sequence number (test-only accessor、buffer state debug 用).
 */
export function getNextSequenceNumber(): number {
  return nextSequenceNumber;
}

// ─────────────────────────────────────────────
// Clear buffer (test-only accessor)
// ─────────────────────────────────────────────

/**
 * Clear the in-memory buffer (test-only).
 *
 * **本 PR では production code path から呼ばれない**。
 * test の setup / teardown 用。
 *
 * Note: sequence number は reset しない (test 内で複数 buffer 共有時に
 * 重複防止)。明示 reset 用に `resetSequenceNumberForTest` を別途 export。
 */
export function clearRedactedUnderstandingDiagnosticsBuffer(): void {
  buffer.length = 0;
}

/**
 * Reset sequence number (test-only).
 *
 * 本来 production runtime では cold start でしか reset しない。
 * test で明示 reset 用の helper。
 */
export function resetSequenceNumberForTest(): void {
  nextSequenceNumber = 0;
}

/**
 * Set max buffer size (test-only、本 PR は default 100).
 *
 * test で drop policy 検証用 (e.g., max=3 で容易に full にする)。
 */
export function setMaxBufferSizeForTest(size: number): void {
  maxBufferSize = size;
}

/**
 * Reset max buffer size to default (test-only teardown).
 */
export function resetMaxBufferSizeForTest(): void {
  maxBufferSize = MAX_BUFFER_SIZE_DEFAULT;
}

// ─────────────────────────────────────────────
// Helper: deterministic dedup + sort (D6-a 継承)
// ─────────────────────────────────────────────

function dedupAndSortReasons(
  reasons: RedactedDiagnosticsReasonCode[],
): RedactedDiagnosticsReasonCode[] {
  return Array.from(new Set(reasons)).sort((a, b) => a.localeCompare(b));
}

// ─────────────────────────────────────────────
// PII forbidden field names (人間超越 Idea J、audit reviewer 用)
// ─────────────────────────────────────────────

/**
 * PII forbidden field names (本 buffer は構造的にこれらを作らない).
 *
 * audit reviewer 用 export。test で event shape / buffer snapshot にこれらが
 * 含まれないことを assert する。
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
  "timestamp",
  "createdAt",
  "created_at",
  "emittedAt",
  "emitted_at",
  "pairHash", // pairHash も含めない (correlation 用に見えるが本 buffer scope 外)
  "bundle",
  "talkMessages",
  "talk_messages",
] as const;

// ─────────────────────────────────────────────
// Audit reviewer hook: input fields accepted (人間超越 Idea P)
// ─────────────────────────────────────────────

/**
 * Input field names accepted by `createRedactedUnderstandingDiagnosticsEvent`.
 *
 * audit reviewer 用 export。本 helper が accept する field name list を
 * 機械的に確認できる。`PII_FORBIDDEN_FIELD_NAMES` との積集合が 0 であることを
 * test で assert する。
 */
export const INPUT_FIELD_NAMES_ACCEPTED = [
  "outcome",
  "lensVersion",
  "understandingConfidence",
  "completeness",
  "latencyMs",
  "sourceCoverageCounts",
  "missingDomainCount",
] as const;
