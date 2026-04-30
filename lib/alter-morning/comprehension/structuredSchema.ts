/**
 * L1.1 Structured Outputs Schema — Comprehension-First v1.3+ Wave 1
 *
 * 設計書: docs/alter-morning-comprehension-first-v1.3plus.md §9 Q-B
 * CEO 決定: Q-B = A' (OpenAI Structured Outputs strict + deterministic checker)
 *
 * 責務:
 *   OpenAI Chat Completions API の `response_format: { type: "json_schema", strict: true }`
 *   に直接渡せる JSON Schema を定義する。
 *   LLM はこの schema 通りの JSON を強制的に返す。deterministic checker (L1.2) が
 *   その JSON を utterance に対して検証する。
 *
 * 設計原則:
 *   - strict: true 下では全 property が required かつ additionalProperties: false が必要
 *   - nullable は `type: ["string", "null"]` で表現
 *   - enum は全値列挙
 *   - internal id (event_id) は LLM に生成させない — Zod adapter 側で補う
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Provenance schema (slot 毎に再利用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PROVENANCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    source_type: {
      type: "string",
      enum: ["utterance", "baseline", "inferred", "tool"],
      description:
        "この slot の値が由来するソース。発話に根拠文字列がある場合のみ utterance を選ぶ。LLM が文脈推論で補った場合は inferred。",
    },
    source_span: {
      type: "array",
      items: { type: "string" },
      description:
        "source_type='utterance' の場合、発話内の根拠文字列（生片）を列挙する。他の source_type では空配列。",
    },
    provenance_confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
    from_utterance: {
      type: "boolean",
      description:
        "source_type === 'utterance' と等価。後方互換フラグ。",
    },
  },
  required: ["source_type", "source_span", "provenance_confidence", "from_utterance"],
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Slot schemas
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WHEN_SLOT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    startTime: {
      type: ["string", "null"],
      description: "HH:mm 形式 or null。発話に明示時刻があれば入れる。",
    },
    timeHint: {
      type: ["string", "null"],
      enum: ["morning", "noon", "afternoon", "evening", null],
      description: "時間帯ヒント。発話が「朝」「昼」「午後」「夜」等の場合。",
    },
    provenance: PROVENANCE_SCHEMA,
  },
  required: ["startTime", "timeHint", "provenance"],
} as const;

const WHERE_SLOT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    place_ref: {
      type: ["string", "null"],
      description:
        "場所の記号（サドヤ / マック / 自宅 / カフェ 等）。発話に無い固有名は入れない（必ず inferred 降格される）。",
    },
    placeType: {
      type: ["string", "null"],
      enum: [
        "exact_proper_noun",
        "chain_brand",
        "generic_place",
        "known_base",
        null,
      ],
    },
    provenance: PROVENANCE_SCHEMA,
  },
  required: ["place_ref", "placeType", "provenance"],
} as const;

const WHAT_SLOT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    activity: {
      type: "string",
      description: "ユーザが言った活動名（生）。",
    },
    activityCanonical: {
      type: "string",
      description: "正規化された活動名（カフェ / ランチ / 打ち合わせ 等）。",
    },
    provenance: PROVENANCE_SCHEMA,
  },
  required: ["activity", "activityCanonical", "provenance"],
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Event schema
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EVENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    turn_mode: {
      type: "string",
      // CEO 2026-04-28 PR #41a Layer 1: append を追加。
      //   create: turn 1 の新規構築 / append: 既存 plan に新 event 追加 /
      //   modify: 既存 event 変更 (target_ref + change_scope 必須)
      enum: ["create", "append", "modify"],
    },
    target_ref: {
      type: ["string", "null"],
      description:
        "modify 時の対象を指す自然言語ヒント（'朝の予定' / 'ランチ' / '最後の予定' 等）。内部 event_id は使わない。create では null。",
    },
    target_ref_confidence: {
      type: ["string", "null"],
      enum: ["low", "medium", "high", null],
      description: "LLM は null を入れてよい。L2 modify router が解決・上書きする。",
    },
    change_scope: {
      type: ["string", "null"],
      enum: ["replace", "patch", "append", "remove", null],
      description: "modify 時の変更粒度。create では null。",
    },
    when: WHEN_SLOT_SCHEMA,
    where: WHERE_SLOT_SCHEMA,
    what: WHAT_SLOT_SCHEMA,
    who: {
      type: "array",
      items: { type: "string" },
    },
    transport: {
      type: ["string", "null"],
    },
    certainty: {
      type: "string",
      enum: ["asserted", "tentative", "inferred"],
    },
    missing_semantic_critical: {
      type: "array",
      items: {
        type: "string",
        enum: ["when", "where", "what"],
      },
      description:
        "LLM は空配列を入れてよい。L1.2 checker が再計算する。",
    },
    missing_solver_blockers: {
      type: "array",
      items: {
        type: "string",
        enum: ["transport", "end_time", "endpoint", "place_resolution"],
      },
    },
  },
  required: [
    "turn_mode",
    "target_ref",
    "target_ref_confidence",
    "change_scope",
    "when",
    "where",
    "what",
    "who",
    "transport",
    "certainty",
    "missing_semantic_critical",
    "missing_solver_blockers",
  ],
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Top-level schema
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const L1_COMPREHENSION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    targetDate: {
      type: "string",
      description: "today | tomorrow | day_after_tomorrow | YYYY-MM-DD",
    },
    events: {
      type: "array",
      items: EVENT_SCHEMA,
    },
    startPoint: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        place_ref: { type: ["string", "null"] },
        provenance: PROVENANCE_SCHEMA,
      },
      required: ["place_ref", "provenance"],
    },
    departureTime: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        value: {
          type: ["string", "null"],
          description: "HH:mm",
        },
        provenance: PROVENANCE_SCHEMA,
      },
      required: ["value", "provenance"],
    },
    goOut: {
      type: ["boolean", "null"],
    },
  },
  required: ["targetDate", "events", "startPoint", "departureTime", "goOut"],
} as const;

/**
 * OpenAI Structured Outputs 用の response_format パラメータ。
 * 呼び出し側: chat.completions.create({ response_format: L1_RESPONSE_FORMAT, ... })
 */
export const L1_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "AlterMorningComprehensionV1",
    strict: true,
    schema: L1_COMPREHENSION_SCHEMA,
  },
} as const;
