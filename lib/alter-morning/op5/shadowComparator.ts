/**
 * shadowComparator — OP-5.2 (CEO 2026-05-06)
 *
 * 既存 runtime (= legacyAdapter / morningPipeline) の出力と OP-5
 * shadowOrchestrator の出力を比較する pure layer。
 *
 * 設計の核 — boundary 守り:
 *   入力:
 *     - LegacyShadowSnapshot (= caller が組む。 raw label を含むが、 内部参照のみ)
 *     - ShadowOrchestratorResult (= OP-5.1 internal、 raw 含む)
 *   出力:
 *     - ShadowComparison (= boolean / enum / count / category 中心、 raw を含まない)
 *
 * **核心**: comparator 内部で raw label を参照して等価判定するが、 出力に raw を
 * **絶対に含めない**。
 *
 * mismatchCategory enum (CEO 修正点 3):
 *   - "match"               → 一致
 *   - "missing_in_op5"      → legacy あり、 op5 不在
 *   - "missing_in_legacy"   → op5 あり、 legacy 不在
 *   - "different_kind"      → kind (= known_exact / known_label_only / unknown) が違う
 *   - "different_source"    → kind 一致だが AnchorSource が違う
 *   - "different_label"     → kind / source 一致だが label が違う
 *
 *   注: enum value としての `"different_label"` は raw ではない (= 差分理由の記号)。
 *   key 名としての `label` / `rawLabel` は出力に含めない。
 *
 * 永続化:
 *   OP-5.2 では永続化しない (= caller が将来 OP-5.3 で telemetry に流す責務)。
 *
 * 規律 (OP-5.2):
 *   - flags.ts / shadowOrchestrator.ts / redaction.ts に変更を入れない
 *     (= 既存 file は不変、 index.ts のみ export 追加で接続)
 *   - morningPipeline / route / legacyAdapter / DB 全て不変
 *   - PR #75 系 module 参照なし
 */

import type {
  AnchorSource,
  JourneyAnchorState,
} from "../journey/anchorState";
import type { ShadowOrchestratorResult } from "./shadowOrchestrator";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 入力: LegacyShadowSnapshot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * caller (= 将来の OP-5.3 morningPipeline) が既存 runtime 出力から組む snapshot。
 *
 * label field は **comparator 内部参照のみ**。 出力 `ShadowComparison` には
 * 含まれない (= raw 漏洩防止)。
 */
export interface LegacyShadowSnapshot {
  /** 既存 runtime の plan.date (= "YYYY-MM-DD" or null) */
  targetDate: string | null;

  /** 既存 runtime の journeyOrigin.kind */
  journeyOriginKind: JourneyAnchorState["kind"] | null;
  /** 既存 runtime の journeyOrigin.source (= kind が unknown 時は null) */
  journeyOriginSource: AnchorSource | null;
  /**
   * 既存 runtime の journeyOrigin.label (= internal 参照のみ、 出力には含めない)。
   * kind が unknown の場合は null。
   */
  journeyOriginLabel: string | null;

  /** 既存 runtime の journeyEnd.kind */
  journeyEndKind: JourneyAnchorState["kind"] | null;
  /** 既存 runtime の journeyEnd.source */
  journeyEndSource: AnchorSource | null;
  /**
   * 既存 runtime の journeyEnd.label (= internal 参照のみ、 出力には含めない)。
   */
  journeyEndLabel: string | null;

  /** 既存 runtime の travel segments の件数 */
  segmentsCount: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 出力: ShadowComparison
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * mismatch の分類 enum。
 *
 * CEO 規律: enum value としての `"different_label"` は raw ではないため許可。
 *           ただし key 名として `label` / `rawLabel` を出力に含めない。
 */
export type MismatchCategory =
  | "match"
  | "missing_in_op5"
  | "missing_in_legacy"
  | "different_kind"
  | "different_source"
  | "different_label";

/**
 * targetDate 比較結果。 match boolean のみ (= category enum なし、 単純比較)。
 */
export interface TargetDateComparison {
  match: boolean;
}

/**
 * journeyOrigin / journeyEnd 比較結果。
 *
 * **raw label を含まない**。 kind / source enum + match / category のみ。
 */
export interface AnchorComparison {
  match: boolean;
  legacyKind: JourneyAnchorState["kind"] | null;
  op5Kind: JourneyAnchorState["kind"] | null;
  legacySource: AnchorSource | null;
  op5Source: AnchorSource | null;
  /** mismatch の理由分類 (= match / missing_in_op5 / missing_in_legacy / different_kind / different_source / different_label) */
  mismatchCategory: MismatchCategory;
}

/**
 * travelEdges 比較結果。 count + boolean のみ (= 個別 envelope 内容は出さない)。
 */
export interface TravelEdgesComparison {
  legacyCount: number;
  op5Count: number;
  countMatch: boolean;
}

/**
 * shadow vs legacy の比較結果。 raw を一切含まない。
 */
export interface ShadowComparison {
  targetDate: TargetDateComparison;
  journeyOrigin: AnchorComparison;
  journeyEnd: AnchorComparison;
  travelEdges: TravelEdgesComparison;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * dispatcher の selected envelope から (kind, source, label) を取り出す
 * (= label は internal 比較のみ、 出力には流さない)。
 */
function extractAnchorTuple(
  selected:
    | ShadowOrchestratorResult["dispatchResult"]["selectedJourneyOriginCandidate"]
    | ShadowOrchestratorResult["dispatchResult"]["selectedJourneyEndCandidate"],
): {
  kind: JourneyAnchorState["kind"] | null;
  source: AnchorSource | null;
  label: string | null;
} {
  if (selected === null) {
    return { kind: null, source: null, label: null };
  }

  // resolve_place_candidate (slot=origin/end) は payload.label 直接
  if (selected.type === "resolve_place_candidate") {
    return {
      kind: "known_label_only",
      source: "user_override",
      label: selected.payload.label,
    };
  }

  // set_journey_origin / set_journey_end は payload = JourneyAnchorState
  const payload = selected.payload;
  if (payload.kind === "unknown") {
    return { kind: "unknown", source: null, label: null };
  }
  return {
    kind: payload.kind,
    source: payload.source,
    label: payload.label,
  };
}

/**
 * AnchorComparison の mismatchCategory を判定する pure helper。
 *
 * 判定順:
 *   1. 両方 absent (= kind null) → "match" (= 不在で一致)
 *   2. legacy 不在 / op5 あり → "missing_in_legacy"
 *   3. op5 不在 / legacy あり → "missing_in_op5"
 *   4. kind 違い → "different_kind"
 *   5. source 違い → "different_source"
 *   6. label 違い (= internal 比較) → "different_label"
 *   7. 全一致 → "match"
 */
function classifyAnchorMismatch(
  legacyKind: JourneyAnchorState["kind"] | null,
  legacySource: AnchorSource | null,
  legacyLabel: string | null,
  op5Kind: JourneyAnchorState["kind"] | null,
  op5Source: AnchorSource | null,
  op5Label: string | null,
): MismatchCategory {
  // 両方 unknown / null は match
  const legacyAbsent = legacyKind === null || legacyKind === "unknown";
  const op5Absent = op5Kind === null || op5Kind === "unknown";

  if (legacyAbsent && op5Absent) return "match";
  if (legacyAbsent && !op5Absent) return "missing_in_legacy";
  if (!legacyAbsent && op5Absent) return "missing_in_op5";

  // 両方 present
  if (legacyKind !== op5Kind) return "different_kind";
  if (legacySource !== op5Source) return "different_source";
  if (legacyLabel !== op5Label) return "different_label";
  return "match";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main entry: compareShadowVsLegacy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * legacy snapshot と shadow result を比較し、 raw を含まない `ShadowComparison`
 * を返す pure 関数。
 *
 * 内部規律:
 *   - raw label は内部比較で使うが、 **出力に含めない** (= type で禁止)
 *   - input mutate しない
 *   - 同 input で同 output (= deterministic)
 *
 * @param legacy  caller が組んだ legacy snapshot
 * @param op5     OP-5.1 shadowOrchestrator の出力
 * @returns       ShadowComparison (= boolean / enum / count のみ)
 */
export function compareShadowVsLegacy(
  legacy: LegacyShadowSnapshot,
  op5: ShadowOrchestratorResult,
): ShadowComparison {
  // ─── targetDate ───
  const op5TargetDate =
    op5.dispatchResult.selectedTargetDateCandidate?.payload.date ?? null;
  const targetDateMatch = legacy.targetDate === op5TargetDate;

  // ─── journeyOrigin ───
  const op5Origin = extractAnchorTuple(
    op5.dispatchResult.selectedJourneyOriginCandidate,
  );
  const originCategory = classifyAnchorMismatch(
    legacy.journeyOriginKind,
    legacy.journeyOriginSource,
    legacy.journeyOriginLabel,
    op5Origin.kind,
    op5Origin.source,
    op5Origin.label,
  );
  const journeyOrigin: AnchorComparison = {
    match: originCategory === "match",
    legacyKind: legacy.journeyOriginKind,
    op5Kind: op5Origin.kind,
    legacySource: legacy.journeyOriginSource,
    op5Source: op5Origin.source,
    mismatchCategory: originCategory,
  };

  // ─── journeyEnd ───
  const op5End = extractAnchorTuple(
    op5.dispatchResult.selectedJourneyEndCandidate,
  );
  const endCategory = classifyAnchorMismatch(
    legacy.journeyEndKind,
    legacy.journeyEndSource,
    legacy.journeyEndLabel,
    op5End.kind,
    op5End.source,
    op5End.label,
  );
  const journeyEnd: AnchorComparison = {
    match: endCategory === "match",
    legacyKind: legacy.journeyEndKind,
    op5Kind: op5End.kind,
    legacySource: legacy.journeyEndSource,
    op5Source: op5End.source,
    mismatchCategory: endCategory,
  };

  // ─── travelEdges ───
  const op5Count = op5.dispatchResult.selectedTravelEdgeCandidates.length;
  const travelEdges: TravelEdgesComparison = {
    legacyCount: legacy.segmentsCount,
    op5Count,
    countMatch: legacy.segmentsCount === op5Count,
  };

  return {
    targetDate: { match: targetDateMatch },
    journeyOrigin,
    journeyEnd,
    travelEdges,
  };
}
