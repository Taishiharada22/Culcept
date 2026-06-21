/**
 * F2 B — M2 Soft Enrichment merge into **READY** Travel input（**pure・ready 後専用・未配線**）
 *
 * 設計正本: docs/t11-f2-m2-soft-enrichment-merge-boundary-design.md（§5 C・§8 + CEO 命名補正）
 *
 * 役割: **provider-ready な `TravelPlanEngineInput`** に M2 由来 soft slot を enrich する。
 *   ★ readiness を**判定しない**（呼び出し側が ready の input を渡す前提）。enrichment channel のみ。
 *
 * 厳守:
 *   - readiness を決めない・`getProductionTravelInput`/provider/engine/display/M2 runtime を呼ばない。
 *   - M2 は **soft key のみ**（pace / mobility_tolerance / budget_band / soft_preference / time_window）。
 *   - **drop**: destination_area / date_or_range / red_line（hard/blocker は M2 から追加しない）。participantIds は field（slot でない）＝不変。
 *   - **explicit precedence**: ready 側に既存の single-value soft key（pace/mobility/budget/time_window）は M2 で上書きしない。
 *   - `soft_preference` は additive（(descriptorKey,descriptorValue) 重複は追加しない）。
 *   - **元 input を mutate しない**・**冪等**（同 slots で 2 回呼んでも結果不変）。
 */

import type { ExtractedSlot } from "./slot-types";
import type { TravelPlanEngineInput } from "./engine-types";

/** M2 が enrich してよい soft key。 */
const ALLOWED_SOFT_KEYS: ReadonlySet<string> = new Set(["pace", "mobility_tolerance", "budget_band", "soft_preference", "time_window"]);
/** single-value soft key（explicit が M2 に勝つ＝既存なら M2 を drop）。 */
const SINGLE_VALUE_SOFT_KEYS: ReadonlySet<string> = new Set(["pace", "mobility_tolerance", "budget_band", "time_window"]);

function descriptorKeyOf(slot: ExtractedSlot): string | undefined {
  return slot.key === "soft_preference" ? (slot.value as { descriptorKey?: string }).descriptorKey : undefined;
}
function descriptorValueOf(slot: ExtractedSlot): string | undefined {
  return slot.key === "soft_preference" ? (slot.value as { descriptorValue?: string }).descriptorValue : undefined;
}

/**
 * ready な `TravelPlanEngineInput` に M2 soft slot を enrich（explicit 優先・hard/red_line 不追加・元 input 不変）。
 *   ★ 呼び出し側は provider ready を確認済みであること（本 helper は readiness を判定しない）。
 */
export function mergeM2SoftEnrichmentIntoReadyTravelInput(
  readyInput: TravelPlanEngineInput,
  m2Slots: readonly ExtractedSlot[],
): TravelPlanEngineInput {
  const existing = readyInput.slots; // explicit（ready）
  const singleKeysPresent = new Set<string>(existing.filter((s) => SINGLE_VALUE_SOFT_KEYS.has(s.key)).map((s) => s.key));
  const softPrefSeen = new Set<string>(
    existing.filter((s) => s.key === "soft_preference").map((s) => `${descriptorKeyOf(s)}::${descriptorValueOf(s)}`),
  );

  const toAdd: ExtractedSlot[] = [];
  for (const slot of Array.isArray(m2Slots) ? m2Slots : []) {
    if (!slot || typeof slot !== "object") continue;
    // ★ allowed soft key 以外（destination_area/date_or_range/red_line・不正 key）は drop
    if (!ALLOWED_SOFT_KEYS.has(slot.key)) continue;

    if (slot.key === "soft_preference") {
      const sig = `${descriptorKeyOf(slot)}::${descriptorValueOf(slot)}`;
      if (softPrefSeen.has(sig)) continue; // 重複 descriptor は追加しない（additive・dedupe）
      softPrefSeen.add(sig);
      toAdd.push(slot);
    } else {
      // single-value soft key: explicit が既にあれば M2 を drop（explicit precedence）
      if (singleKeysPresent.has(slot.key)) continue;
      singleKeysPresent.add(slot.key);
      toAdd.push(slot);
    }
  }

  // ★ 元 input を mutate せず新 input を返す（participantIds/viewerId 等 hard field は不変で spread）。
  return { ...readyInput, slots: [...existing, ...toAdd] };
}
