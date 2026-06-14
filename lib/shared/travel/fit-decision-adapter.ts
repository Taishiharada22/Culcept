/**
 * T11-F-C — Fit-to-Decision / T9 composition adapter（**pure・未配線**）
 *
 * 設計: fit-decision-adapter-types.ts + composition plan（+ CEO/GPT 修正 2 点）
 *
 * 役割: caller 供給の `ProposalFitInput[]`（candidateId keyed FitResult）を、
 *   **既存 proposal id に厳格 join** し、packet 用の **engine-safe bounded summary** に射影する。
 *   合成は **adapter の唯一の責務**（safe join + projection）。entity 生成・place 解決・dominance 変更は **しない**。
 *
 * 厳守（純・決定論・境界）:
 *   - fit input 無 → **no-op**（呼び出し側 packet は不変）。
 *   - **raw FitResult を返さない**（bounded summary のみ）。
 *   - shared summary は **toSharedFitView 由来**から再導出（private を構造的に持ち込まない）。
 *   - authoritative summary は grade のみ full label（private 反映可）・他は shared-safe 集計のみ。
 *   - join は **fail-closed**（exact id・未知=diagnostic・重複=全棄却・推論/捏造なし）。
 *   - 外部データ/route/weather/place/API/DB/UI なし。import は travel fit core/types のみ。
 */

import { toSharedFitView } from "./fit-core";
import type { FitResult, MismatchReason, RiskFlag } from "./fit-types";
import type {
  FitConfidenceBand,
  ProposalFitComposition,
  ProposalFitInput,
  ProposalFitSummary,
} from "./fit-decision-adapter-types";

// 非 opaque: confidence band 閾値（公開）
export const FIT_CONFIDENCE_BAND_LOW = 0.4;
export const FIT_CONFIDENCE_BAND_HIGH = 0.7;

const band = (c: number): FitConfidenceBand =>
  c < FIT_CONFIDENCE_BAND_LOW ? "low" : c < FIT_CONFIDENCE_BAND_HIGH ? "medium" : "high";

/** shared-safe な risk code のみ（private 由来は除外・sorted/dedup） */
const sharedRiskCodes = (flags: RiskFlag[]): string[] =>
  [...new Set(flags.filter((f) => f.visibility === "shared" && f.derivedFrom === "shared").map((f) => f.code))].sort();

/** shared-safe な mismatch 数のみ（理由文/descriptor は数えるだけで載せない） */
const sharedMismatchCount = (ms: MismatchReason[]): number =>
  ms.filter((m) => m.visibility === "shared" && m.derivedFrom === "shared").length;

const missingFieldsOf = (fit: FitResult): string[] =>
  [...new Set(fit.missingDataQuestions.map((q) => q.field))].sort();

/** authoritative summary: grade は full label（private 反映可）・他は shared-safe 集計のみ */
function authoritativeSummary(candidateId: string, fit: FitResult): ProposalFitSummary {
  return {
    candidateId,
    grade: fit.fitLabel,
    labelCap: fit.labelCap,
    labelStability: fit.labelStability,
    confidenceBand: band(fit.confidence),
    mismatchCount: sharedMismatchCount(fit.mismatchReasons),
    riskCodes: sharedRiskCodes(fit.riskFlags),
    missingFields: missingFieldsOf(fit),
  };
}

/** shared summary: 全て toSharedFitView 由来（private を構造的に持ち込まない） */
function sharedSummary(candidateId: string, fit: FitResult): ProposalFitSummary {
  const s = toSharedFitView(fit);
  return {
    candidateId,
    grade: s.fitLabel,
    labelCap: s.labelCap,
    labelStability: s.labelStability,
    confidenceBand: band(s.confidence),
    mismatchCount: sharedMismatchCount(s.mismatchReasons),
    riskCodes: sharedRiskCodes(s.riskFlags),
    missingFields: missingFieldsOf(s),
  };
}

/**
 * caller 供給 fit evidence を proposal id に厳格 join し bounded summary に射影。
 *   - `fitInputs` 無/空 → no-op（summaries 空・diagnostics 空）。
 *   - 重複 candidateId → **fail-closed 全棄却**（deterministic・任意採用しない）→ duplicateIds。
 *   - proposal に無い id → 無視 + unknownIds（diagnostic）。
 *   - mode: authoritative = full grade 反映 / shared = toSharedFitView 由来。
 */
export function deriveProposalFitSummaries(
  proposalIds: readonly string[],
  fitInputs: readonly ProposalFitInput[] | undefined,
  mode: "authoritative" | "shared",
): ProposalFitComposition {
  if (!fitInputs || fitInputs.length === 0) {
    return { summaries: [], diagnostics: { unknownIds: [], duplicateIds: [] } };
  }
  const valid = new Set(proposalIds);

  // 重複検出（同一 candidateId が複数供給）→ 当該 id を全棄却（fail-closed）
  const counts = new Map<string, number>();
  for (const f of fitInputs) counts.set(f.candidateId, (counts.get(f.candidateId) ?? 0) + 1);
  const duplicateIds = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id).sort();
  const dupSet = new Set(duplicateIds);

  const unknownIds: string[] = [];
  const summaries: ProposalFitSummary[] = [];
  for (const f of fitInputs) {
    if (dupSet.has(f.candidateId)) continue; // 重複 → 採用しない
    if (!valid.has(f.candidateId)) {
      unknownIds.push(f.candidateId); // 未知 id → 無視 + diagnostic（推論/捏造しない）
      continue;
    }
    summaries.push(mode === "authoritative" ? authoritativeSummary(f.candidateId, f.fit) : sharedSummary(f.candidateId, f.fit));
  }
  return {
    summaries: summaries.sort((a, b) => a.candidateId.localeCompare(b.candidateId)),
    diagnostics: { unknownIds: [...new Set(unknownIds)].sort(), duplicateIds },
  };
}
