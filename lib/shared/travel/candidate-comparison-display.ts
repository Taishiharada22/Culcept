/**
 * B2-D2 — Candidate Comparison Display projection helper（pure・client-safe）
 *
 * 設計正本: docs/t11-bundle2-dominance-display-preview-preflight.md（§6/§7/§8 + 補正: join 規律）
 *
 * 役割: `DisplayCandidateCollection` + `CandidateDominanceOverlay` → `DisplayCandidateComparison`
 *   （per-card 自然文 note・card 順保持・sort/除去なし）。
 *
 * 厳守:
 *   - join は **candidateId のみ**。表示順は `DisplayCandidateCollection.cards` の順。
 *   - **sort/reorder/除去をしない**・collection/overlay を mutate しない。
 *   - frontier note は **"best" を含まない**・dominated note は **"worst" を含まない**。
 *   - 0/1 card は **no_comparable_yet** のみ（ranking note を作らない）。
 *   - **生 dominatedBy id を出さない**・"Pareto" を一般向け copy に出さない。
 *   - **欠落 overlay entry**: 該当 card は `not_comparable_yet`（捏造しない・private 推定しない）。
 *   - **未知 overlay id**（card に対応無）: client 出力に**含めない**（join は card 側基準）。
 *   - **重複 overlay entry**: 該当 id は **fail-closed → 該当 card に note を作らない**（join 不能）。
 *   - rank 番号 / scalar score / totalOrder / 権限 / acceptance を作らない。
 *   - converter / engine / compareProposals / decide / CoAlter Pareto / display projection を呼ばない。
 *   - fetch/API/DB/Supabase/外部/M2/app/UI なし（pure）。
 */

import type { CandidateDominanceOverlay, TradeoffAxisRelation } from "./candidate-dominance-types";
import type { DisplayCandidateCollection } from "./candidate-collection-display-types";
import type {
  DisplayCandidateComparison,
  DisplayCandidateDominanceNote,
} from "./candidate-comparison-display-types";

/** shared-safe な日本語軸ラベル（生 axis key を出さない・ranking でない説明用）。 */
const AXIS_LABEL: Record<"cost" | "distance" | "fatigue" | "experienceVariety", string> = {
  cost: "費用",
  distance: "移動距離",
  fatigue: "疲労",
  experienceVariety: "体験の幅",
};

const ORDER_DISCLAIMER = "順番はおすすめ順位ではありません。これは自動決定ではありません。";

/** dominator 軸 deltas の worse 軸を shared-safe 日本語ラベル集合に縮約（重複排除・順保持）。 */
function collectWeakerAxes(
  axisDeltas: ReadonlyArray<{ axes: Record<string, TradeoffAxisRelation> }> | undefined,
): string[] {
  if (!axisDeltas || axisDeltas.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of axisDeltas) {
    for (const k of ["cost", "distance", "fatigue", "experienceVariety"] as const) {
      if (d.axes[k] === "worse") {
        const label = AXIS_LABEL[k];
        if (!seen.has(label)) {
          seen.add(label);
          out.push(label);
        }
      }
    }
  }
  return out;
}

/**
 * DisplayCandidateCollection + CandidateDominanceOverlay → DisplayCandidateComparison。
 *   card 順保持・join は candidateId のみ・重複 overlay は該当 id を fail-closed。
 */
export function projectCandidateComparisonMemo(
  collection: DisplayCandidateCollection,
  overlay: CandidateDominanceOverlay,
): DisplayCandidateComparison {
  // overlay を candidateId で索引化。重複は fail-closed の印（null）に潰す。
  const indexed = new Map<string, CandidateDominanceOverlay["entries"][number] | null>();
  for (const e of overlay.entries) {
    if (indexed.has(e.candidateId)) {
      indexed.set(e.candidateId, null); // 重複 → 該当 id を fail-closed
    } else {
      indexed.set(e.candidateId, e);
    }
  }

  const totalCards = collection.cards.length;
  const notes: DisplayCandidateDominanceNote[] = collection.cards.map((card) => {
    const id = card.candidateId;
    // 0/1 card は ranking 概念が成立しない → not_comparable_yet
    if (totalCards <= 1) {
      return { candidateId: id, kind: "not_comparable_yet", text: "比較対象がまだありません。" };
    }
    const entry = indexed.get(id);
    // 欠落 / 重複(fail-closed) → 捏造せず not_comparable_yet
    if (entry === undefined || entry === null) {
      return { candidateId: id, kind: "not_comparable_yet", text: "比較対象がまだありません。" };
    }
    if (entry.paretoOptimal) {
      return {
        candidateId: id,
        kind: "no_clear_weakness",
        text: "比較上、明確に劣る軸はありません。ただし、これは順位ではありません。",
      };
    }
    const weakerAxes = collectWeakerAxes(entry.axisDeltas);
    const axesText = weakerAxes.length > 0 ? `（${weakerAxes.join("・")}）` : "";
    return {
      candidateId: id,
      kind: "has_clearly_stronger_alternative",
      text: `他候補の方が明確に優る軸があります${axesText}。ただし、これは順位ではありません。`,
      ...(weakerAxes.length > 0 ? { weakerAxes } : {}),
    };
  });

  return { status: "candidate_comparison_memo", orderDisclaimer: ORDER_DISCLAIMER, notes };
}
