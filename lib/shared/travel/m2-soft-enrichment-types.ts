/**
 * F A — M2 Travel Soft Enrichment 型（**pure types only・fixture contract・M2 runtime HOLD**）
 *
 * 設計正本: docs/t11-f-m2-soft-enrichment-provider-design.md（§4/§6 + CEO 補正: avoid は soft のみ・hard red_line にしない）
 *
 * 役割: M2/Stargazer 由来の **bounded な soft 個人傾向**（band/enum/descriptor）を表す fixture 入力型と、
 *   それを soft `ExtractedSlot[]`（profile_prior/normalized/private）へ写すための契約。
 *
 * 厳守:
 *   - **raw axis score / 無制限 personality dump field を持たない**（band/enum/descriptor のみ）。
 *   - destination/date/participant の hard 前提 field を持たない。
 *   - display packet / projection / cues / engine output / TravelPlanEngineInput を持たない。
 *   - ★ avoid 傾向は **soft_preference descriptor**（hard `red_line` にしない・explicit user のみ red_line）。
 */

import type { Pace, BudgetBand } from "./core-types";
import type { ExtractedSlot, MobilityToleranceValue } from "./slot-types";

export type M2ConfidenceBand = "low" | "medium" | "high";
export type M2TravelSoftPreferenceVisibility = "private" | "shared";

/** M2 由来 soft preference の意味カテゴリ（descriptor として soft_preference に写る）。 */
export type M2TravelSoftPreferenceKind =
  | "lodging"
  | "food"
  | "quietness"
  | "crowd"
  | "novelty"
  | "morning_night"
  | "fatigue"
  | "weather_tolerance"
  | "avoid"; // ★ soft 回避傾向（hard red_line でない）

/** 1 つの descriptor 系 soft preference（bounded・正規化語・PII 自由文でない）。 */
export interface M2TravelDescriptorPreference {
  kind: M2TravelSoftPreferenceKind;
  /** descriptor value（正規化語・例 "calm"/"local"/"nature"/"crowd"）。 */
  value: string;
  /** 任意・既定は record の visibility（最終既定 private）。 */
  visibility?: M2TravelSoftPreferenceVisibility;
}

/** ★ fixture 入力（bounded・raw score なし）。 */
export interface M2TravelSoftPreference {
  pace?: Pace;
  mobility?: MobilityToleranceValue;
  budgetBand?: BudgetBand;
  descriptors?: M2TravelDescriptorPreference[];
  confidence?: M2ConfidenceBand;
  /** record 既定 visibility（最終既定 private）。 */
  visibility?: M2TravelSoftPreferenceVisibility;
  // ★ 非所持: 生 axis score / 任意 personality dump / health・sleep / route・weather・place facts / price・availability
}

/** M2 由来の中立診断（任意）。 */
export interface M2TravelSoftEnrichmentDiagnostic {
  droppedCount: number; // band/enum 不正で drop した件数（中立）
}

/**
 * ★ server-only soft enrichment envelope（profile_prior/normalized soft slot のみ）。
 *   非所持: display packet / projection / cues / engine output / raw score / hard slot。
 */
export interface M2TravelSoftEnrichment {
  outcome: "m2_soft_enrichment";
  serverOnly: true;
  /** profile_prior / normalized / 既定 private な soft slot のみ。 */
  slots: ExtractedSlot[];
  diagnostic?: M2TravelSoftEnrichmentDiagnostic;
}
