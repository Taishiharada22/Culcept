/**
 * Comprehension Normalizer — OP-2 (CEO 2026-05-05)
 *
 * V2 schema 出力 (= LLM が `null` / `[]` を返す nullable / array fields) を
 * internal required type に正規化する pure function。
 *
 * 設計目的:
 *   OpenAI strict mode 制約により V2 schema の `journeyOrigin / journeyEnd` は
 *   `type: ["object", "null"]` で nullable、 `segments` は array (= `[]` 許容)。
 *   LLM が「該当なし」 で `null` / `[]` を返す。 normalizer がこれを internal
 *   default に変換することで、 internal layer は **必ず required な型** で扱える。
 *
 * defensive default:
 *   - journeyOrigin: null → `{ kind: "unknown", label: null, ..., provenance: inferred }`
 *   - journeyEnd:    null → `{ kind: "unknown", label: null, ..., provenance: inferred }`
 *   - segments:      undefined / [] → `[]`
 *
 * OP-2 規律:
 *   - V2 fixture 専用 (= active runtime には流れない)
 *   - dispatcher / legacyAdapter に **接続しない**
 *   - 副作用なし、 pure function
 *
 * 設計書: docs/alter-morning-operation-pipeline-unification-design.md § 2 / § 4.5
 */

import type { Provenance } from "./eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal required types (= normalizer 出力型)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface NormalizedJourneyOrigin {
  kind: "explicit_day_origin" | "unknown";
  label: string | null;
  classification: string | null;
  confidence: "high" | "medium" | "low";
  provenance: Provenance;
}

export interface NormalizedJourneyEnd {
  kind: "explicit_day_end" | "unknown";
  label: string | null;
  classification: string | null;
  confidence: "high" | "medium" | "low";
  provenance: Provenance;
}

export interface NormalizedSegment {
  segmentOrigin: { label: string; classification: string };
  segmentDestination: { label: string; classification: string };
  segmentDepartureTime: string | null;
  segmentArrivalTime: string | null;
  transport: string | null;
  matchedSpan: string;
}

export interface ComprehensionExtras {
  journeyOrigin: NormalizedJourneyOrigin;
  journeyEnd: NormalizedJourneyEnd;
  segments: NormalizedSegment[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Defensive defaults (= LLM が null / [] を返した時の fallback)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const INFERRED_PROVENANCE: Provenance = {
  source_type: "inferred",
  source_span: [],
  provenance_confidence: "low",
  from_utterance: false,
};

const DEFAULT_JOURNEY_ORIGIN: NormalizedJourneyOrigin = {
  kind: "unknown",
  label: null,
  classification: null,
  confidence: "low",
  provenance: INFERRED_PROVENANCE,
};

const DEFAULT_JOURNEY_END: NormalizedJourneyEnd = {
  kind: "unknown",
  label: null,
  classification: null,
  confidence: "low",
  provenance: INFERRED_PROVENANCE,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input shape (= V2 schema LLM 出力相当、 nullable / optional 許容)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ComprehensionExtrasInput {
  journeyOrigin?: NormalizedJourneyOrigin | null;
  journeyEnd?: NormalizedJourneyEnd | null;
  segments?: NormalizedSegment[] | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// normalizeComprehensionExtras (= pure function)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * V2 schema 由来の comprehension extras を internal required type に正規化する。
 *
 * 動作:
 *   - input が null / undefined → 全 default で埋める
 *   - journeyOrigin が null → DEFAULT_JOURNEY_ORIGIN
 *   - journeyEnd が null → DEFAULT_JOURNEY_END
 *   - segments が undefined / null → []
 *   - 値あり → そのまま retain (= 元 reference を保持、 mutate しない)
 *
 * @param input V2 LLM 出力相当 (= nullable / optional)
 * @returns internal required type (= journeyOrigin / journeyEnd / segments 全 required)
 */
export function normalizeComprehensionExtras(
  input: ComprehensionExtrasInput | null | undefined,
): ComprehensionExtras {
  if (!input) {
    return {
      journeyOrigin: DEFAULT_JOURNEY_ORIGIN,
      journeyEnd: DEFAULT_JOURNEY_END,
      segments: [],
    };
  }
  return {
    journeyOrigin: input.journeyOrigin ?? DEFAULT_JOURNEY_ORIGIN,
    journeyEnd: input.journeyEnd ?? DEFAULT_JOURNEY_END,
    segments: input.segments ?? [],
  };
}
