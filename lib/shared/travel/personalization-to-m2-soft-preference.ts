/**
 * UX-6a — Personalization → M2 Travel Soft Preference bridge（**pure・bounded・raw score 非漏洩・捏造なし**）
 *
 * 役割: M2 PersonalizationPort の derive 出力（`PlanParams` / `TravelTraitsV0`）を、Travel soft enrichment が
 *   受ける bounded な `M2TravelSoftPreference`（band/enum/descriptor）へ写す。
 *   ★ これは「derive 出力 → soft preference」の **唯一欠けていた継手**。snapshot/DB は読まない
 *     （caller が `derivePlanParams`/`deriveTravelTraits` 済みの値を渡す前提）。
 *
 * 厳守:
 *   - **raw axis score / 連続値そのものを出さない**（pace は enum・傾向は descriptor 語のみ）。
 *   - **source !== "derived" / confidence < floor / neutral(deadzone 内) は emit しない**（不確実・中立を押し付けない）。
 *   - **budget / mobility は emit しない**（budgetPosture→band 数値化や mobility 源泉欠如は捏造になるため）。
 *   - destination / date / red_line を産出しない（hard 前提は M2 から作らない）。visibility 既定 private。
 *   - personalization 側を **read するだけ**（snapshotReader/DB/engine/display/M2 runtime を呼ばない）。
 */

import type { DerivedValue, PlanParams, TravelTraitsV0 } from "@/lib/shared/personalization/types";
import type { Pace } from "./core-types";
import type { M2ConfidenceBand, M2TravelDescriptorPreference, M2TravelSoftPreference } from "./m2-soft-enrichment-types";

/** derive と整合: これ未満の confidence は中立として扱い emit しない。 */
export const PERSONALIZATION_BRIDGE_CONFIDENCE_FLOOR = 0.3;
/** |value| がこの範囲は neutral とみなし descriptor を emit しない（中立を押し付けない）。 */
export const PERSONALIZATION_BRIDGE_NEUTRAL_DEADZONE = 0.2;

/** derived ∧ confidence 十分な enum 値のみ通す（それ以外 null）。 */
function usableEnum<T extends string>(d: DerivedValue<T> | undefined): { value: T; confidence: number } | null {
  if (!d || d.source !== "derived" || d.confidence < PERSONALIZATION_BRIDGE_CONFIDENCE_FLOOR) return null;
  return { value: d.value, confidence: d.confidence };
}

/** derived ∧ confidence 十分 ∧ neutral でない符号付き数値のみ通す（raw 値は外へ出さず符号のみ使う）。 */
function usableSignedNum(d: DerivedValue<number> | undefined): { value: number; confidence: number } | null {
  if (!d || d.source !== "derived" || d.confidence < PERSONALIZATION_BRIDGE_CONFIDENCE_FLOOR) return null;
  if (Math.abs(d.value) <= PERSONALIZATION_BRIDGE_NEUTRAL_DEADZONE) return null;
  return { value: d.value, confidence: d.confidence };
}

function toBand(avgConfidence: number): M2ConfidenceBand {
  return avgConfidence >= 0.7 ? "high" : avgConfidence >= 0.4 ? "medium" : "low";
}

/**
 * `PlanParams` + `TravelTraitsV0` → bounded `M2TravelSoftPreference`。
 *   emit できる傾向が無ければ `{ visibility: "private" }`（空 record・enrichment は 0 slot）。
 */
export function mapPersonalizationToM2SoftPreference(
  planParams: PlanParams,
  travelTraits: TravelTraitsV0,
): M2TravelSoftPreference {
  const confidences: number[] = [];
  const descriptors: M2TravelDescriptorPreference[] = [];

  // pace（enum 直写・行程密度の事前値）。proposal angle の hard 選別に効く（slow↔intense は conflict）。
  const pace = usableEnum<Pace>(planParams.paceDefault);
  if (pace) confidences.push(pace.confidence);

  // novelty: noveltyBias(-1..+1) 優先・無ければ traits.noveltySeeking。+ 新奇 / - 定番（符号のみ使う）。
  const novelty = usableSignedNum(planParams.noveltyBias) ?? usableSignedNum(travelTraits.traits.noveltySeeking);
  if (novelty) {
    descriptors.push({ kind: "novelty", value: novelty.value > 0 ? "novelty" : "classic" });
    confidences.push(novelty.confidence);
  }

  // crowd/quietness: crowdTolerance(-1..+1)。- 人混み回避→calm(quietness) / + 平気→crowd(crowd)。
  const crowd = usableSignedNum(travelTraits.traits.crowdTolerance);
  if (crowd) {
    descriptors.push(crowd.value < 0 ? { kind: "quietness", value: "calm" } : { kind: "crowd", value: "crowd" });
    confidences.push(crowd.confidence);
  }

  const out: M2TravelSoftPreference = { visibility: "private" };
  if (pace) out.pace = pace.value;
  if (descriptors.length > 0) out.descriptors = descriptors;
  if (confidences.length > 0) out.confidence = toBand(confidences.reduce((a, b) => a + b, 0) / confidences.length);
  return out;
}
