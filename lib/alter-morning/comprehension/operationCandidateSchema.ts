/**
 * Operation Candidate JSON Schema — OP-2 (CEO 2026-05-05)
 *
 * 未接続 V2 schema 一式:
 *   - JOURNEY_ORIGIN_SCHEMA / JOURNEY_END_SCHEMA / SEGMENT_SCHEMA / SEGMENTS_SCHEMA
 *     (= reusable sub-schemas、 単独 validation 可)
 *   - PLAN_OPERATION_CANDIDATE_SCHEMA (= 新 5 種 operation 単位)
 *   - L1_COMPREHENSION_V2_SCHEMA (= top-level V2、 active L1_COMPREHENSION_SCHEMA と独立)
 *   - L1_RESPONSE_FORMAT_V2 (= V2 response format、 OP-2 では未接続)
 *
 * 設計原則:
 *   - active `structuredSchema.ts` は **完全不変**
 *   - sub-schemas (= PROVENANCE / EVENT / OPERATION 等) は **独自重複定義** (= active 完全独立保証)
 *   - V2 schema は **未接続**。 OP-2 では provider / dispatcher / legacyAdapter から参照されない
 *   - LLM prompt / active runtime は影響ゼロ
 *
 * OpenAI strict mode 制約:
 *   - 全 properties は `required` 配列に含まれる必要 (= 真の optional は不可)
 *   - 「該当なし」 は **nullable** で表現 (= `type: ["X", "null"]` で `null` を返す)
 *   - GPT 言う「optional」 は `required + nullable + null を許容` で実現
 *   - `null` / `[]` は normalizer で internal default に変換
 *
 * day-level / segment-level 分離 (= PR #75 規律継承):
 *   - `journeyOrigin` (= 1 日の起点) と `segmentOrigin` (= 移動区間の起点) は **完全分離**
 *   - 「X から Y へ」 だけでは journeyOrigin を埋めない (= journeyOrigin.kind = "unknown")
 *
 * 設計書: docs/alter-morning-operation-pipeline-unification-design.md § 2 / § 3
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROVENANCE_SCHEMA_V2 (= active と同等構造、 独立定義)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 既存 active `structuredSchema.ts:24` の PROVENANCE_SCHEMA を **export していない**
// ため、 V2 では独自重複定義する (= active 完全不変保証)。
// drift 防止: active 修正時は本 schema も同期して修正する責務を持つ。
// 統合は OP-3+ で active から V2 へ正式移行する PR で対応。

const PROVENANCE_SCHEMA_V2 = {
  type: "object",
  additionalProperties: false,
  properties: {
    source_type: {
      type: "string",
      enum: ["utterance", "baseline", "inferred", "tool"],
    },
    source_span: {
      type: "array",
      items: { type: "string" },
    },
    provenance_confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
    from_utterance: { type: "boolean" },
  },
  required: ["source_type", "source_span", "provenance_confidence", "from_utterance"],
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JOURNEY_ORIGIN_SCHEMA (= 1 日の起点、 OpenAI strict mode 準拠 nullable)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * day-level の起点を表現する schema。
 *
 * - kind: "explicit_day_origin" (= 明示 signal あり) | "unknown" (= signal なし、 default)
 * - label: explicit_day_origin 時のみ非 null
 * - classification / confidence: nullable
 * - provenance: 必須 (= 既存 PR-50 pattern)
 *
 * 規律 (= PR #75 継承):
 *   「X から Y へ」 だけでは kind = "unknown"。
 *   明示的 day-origin signal (= 「自宅から始まる」 等) がある時のみ "explicit_day_origin"。
 */
export const JOURNEY_ORIGIN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: ["explicit_day_origin", "unknown"],
    },
    label: { type: ["string", "null"] },
    classification: { type: ["string", "null"] },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    provenance: PROVENANCE_SCHEMA_V2,
  },
  required: ["kind", "label", "classification", "confidence", "provenance"],
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JOURNEY_END_SCHEMA (= 1 日の終点、 同形)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * day-level の終点を表現する schema。 JOURNEY_ORIGIN_SCHEMA と同形。
 *
 * - kind: "explicit_day_end" (= 明示 signal あり) | "unknown"
 * - 明示 signal (= 「家に帰る」「終点は自宅」 等) がある時のみ "explicit_day_end"
 * - registered_home は確定値ではなく fallback candidate (= OP-3+ で別 source 経由)
 */
export const JOURNEY_END_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: ["explicit_day_end", "unknown"],
    },
    label: { type: ["string", "null"] },
    classification: { type: ["string", "null"] },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    provenance: PROVENANCE_SCHEMA_V2,
  },
  required: ["kind", "label", "classification", "confidence", "provenance"],
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEGMENT_SCHEMA / SEGMENTS_SCHEMA (= segment-level 移動 edges)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SEGMENT_PLACE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string" },
    classification: { type: "string" },
  },
  required: ["label", "classification"],
} as const;

/**
 * 移動 segment 1 つ分の schema。
 *
 * 「X から Y へ」「X を出て Y へ」「X 発で Y へ」 等の移動表現。
 *
 * 規律 (= PR #75 継承):
 *   - segmentOrigin = 移動区間の起点 (= 1 日の起点ではない)
 *   - segmentDestination = 移動区間の終点 (= 1 日の終点ではない)
 *   - day-level の journeyOrigin / journeyEnd とは **完全独立**
 */
export const SEGMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    segmentOrigin: SEGMENT_PLACE_SCHEMA,
    segmentDestination: SEGMENT_PLACE_SCHEMA,
    segmentDepartureTime: { type: ["string", "null"] },
    segmentArrivalTime: { type: ["string", "null"] },
    transport: { type: ["string", "null"] },
    matchedSpan: { type: "string" },
  },
  required: [
    "segmentOrigin",
    "segmentDestination",
    "segmentDepartureTime",
    "segmentArrivalTime",
    "transport",
    "matchedSpan",
  ],
} as const;

/**
 * 移動 segments の array schema。 「該当なし」 は空配列 `[]` で表現。
 */
export const SEGMENTS_SCHEMA = {
  type: "array",
  items: SEGMENT_SCHEMA,
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PLAN_OPERATION_CANDIDATE_SCHEMA (= 新 5 種 operation 単位)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 新 5 種 operation を表現する schema (= 既存 OPERATION_SCHEMA とは独立)。
 *
 * type enum:
 *   - set_target_date
 *   - add_travel_edge
 *   - set_journey_origin
 *   - set_journey_end
 *   - resolve_place_candidate
 *
 * payload:
 *   各 type 別の詳細 (= 単一 schema で discriminator pattern)。
 *   OP-2 では payload 内部の strict 検証は最小限 (= type: object + additionalProperties: true)。
 *   詳細 payload schema は OP-3+ で必要に応じて追加。
 */
export const PLAN_OPERATION_CANDIDATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      enum: [
        "set_target_date",
        "add_travel_edge",
        "set_journey_origin",
        "set_journey_end",
        "resolve_place_candidate",
      ],
    },
    payload: {
      type: "object",
      additionalProperties: true,
    },
  },
  required: ["type", "payload"],
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L1_COMPREHENSION_V2_SCHEMA (= 未接続 V2 top-level schema、 OP-2 範囲)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 設計判断 (CEO 2026-05-05 D 案 + GPT 指摘):
//   active L1_COMPREHENSION_SCHEMA を完全不変に保つため、 V2 schema は active を
//   import しない自己完結 schema として独立定義。 OP-2 では未接続。
//
// 既存 events / operations / startPoint / departureTime / goOut の sub-schema は
// V2 内では **緩い定義** (= type: object + additionalProperties: true) で済ませる。
// OP-2 で完全 strict 互換を作る必要はない (= OpenAI に渡さない、 未接続)。
// OP-3+ で active と V2 を統合する PR で完全 strict 互換に拡張。
//
// 新 field (= journeyOrigin / journeyEnd / segments) は **完全 strict 定義**:
//   - JOURNEY_ORIGIN_SCHEMA: required = [kind, label, classification, confidence, provenance]
//   - JOURNEY_END_SCHEMA: 同上
//   - SEGMENTS_SCHEMA: array (= 空 [] で「該当なし」)
//
// 不変条件:
//   - L1_COMPREHENSION_V2_SCHEMA は active L1_COMPREHENSION_SCHEMA とは別 const
//   - V2 が active を import しない (= 完全独立)
//   - V2 schema は OP-2 では LLM 呼び出しに渡されない

/**
 * V2 top-level schema。 既存 active L1_COMPREHENSION_SCHEMA と独立。
 *
 * OP-2 範囲:
 *   - 新 field (= journeyOrigin / journeyEnd / segments) を strict 定義
 *   - 既存 field (= events / operations / startPoint 等) は緩い定義 (= OP-3+ で strict 化)
 *   - LLM 呼び出しから参照されない (= 未接続)
 *
 * required:
 *   全 properties が required (= OpenAI strict mode 制約)。
 *   「該当なし」 は nullable / 空配列で表現。
 */
export const L1_COMPREHENSION_V2_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    targetDate: {
      type: "string",
      description: "today | tomorrow | day_after_tomorrow | YYYY-MM-DD",
    },
    // 既存 fields (= OP-2 では緩い定義、 OP-3+ で strict 化)
    events: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    operations: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    startPoint: {
      type: ["object", "null"],
      additionalProperties: true,
    },
    departureTime: {
      type: ["object", "null"],
      additionalProperties: true,
    },
    goOut: {
      type: ["boolean", "null"],
    },
    // OP-2 新規 (= strict 定義、 day-level / segment-level 分離)
    journeyOrigin: {
      ...JOURNEY_ORIGIN_SCHEMA,
      // OpenAI strict mode 準拠: top-level での nullable 表現
      // (= LLM が「該当なし」 で null を返せる、 normalizer で default 変換)
    },
    journeyEnd: {
      ...JOURNEY_END_SCHEMA,
    },
    segments: SEGMENTS_SCHEMA,
  },
  required: [
    "targetDate",
    "events",
    "operations",
    "startPoint",
    "departureTime",
    "goOut",
    "journeyOrigin",
    "journeyEnd",
    "segments",
  ],
} as const;

/**
 * V2 response format (= 未接続)。 OP-3 以降の別判断・専用 flag 下で
 * active `L1_RESPONSE_FORMAT` と差し替え可能。
 *
 * OP-2 では宣言のみ。 LLM 呼び出しから参照しない。
 */
export const L1_RESPONSE_FORMAT_V2 = {
  type: "json_schema",
  json_schema: {
    name: "AlterMorningComprehensionV2",
    strict: true,
    schema: L1_COMPREHENSION_V2_SCHEMA,
  },
} as const;
