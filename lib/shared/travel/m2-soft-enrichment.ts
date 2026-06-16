/**
 * F B — M2 Travel Soft Enrichment mapper（**pure・fixture・M2 runtime HOLD**）
 *
 * 設計正本: docs/t11-f-m2-soft-enrichment-provider-design.md（§6/§7 + CEO 補正）
 *
 * 役割: bounded fixture `M2TravelSoftPreference` → soft `ExtractedSlot[]`
 *   （surface `profile_prior` / status `normalized` / 既定 visibility `private`・soft key のみ）。
 *
 * 厳守:
 *   - **destination_area / date_or_range / participantIds を産出しない**（hard 前提を満たさない）。
 *   - ★ avoid 傾向 → **soft_preference descriptor（descriptorKey "avoid"）**・**hard `red_line` を産出しない**。
 *   - **raw score-like / 無制限 dump を受けない**（型に無い + normalizeSlot が band/enum を強制し不正を drop）。
 *   - health/sleep/route/weather/place/price/availability を推定しない。
 *   - M2 runtime / provider / engine / display を import/呼出しない（slot-normalizer のみ使用）。
 */

import { normalizeSlot } from "./slot-normalizer";
import { SURFACE_INITIAL_STATUS } from "./slot-types";
import type { DescriptorKey, ExtractedSlot } from "./slot-types";
import type {
  M2ConfidenceBand,
  M2TravelSoftEnrichment,
  M2TravelSoftPreference,
  M2TravelSoftPreferenceKind,
} from "./m2-soft-enrichment-types";

/** kind → soft_preference descriptorKey（★ 全て soft・avoid も soft_preference・red_line にしない）。 */
const KIND_TO_DESCRIPTOR_KEY: Record<M2TravelSoftPreferenceKind, DescriptorKey> = {
  avoid: "avoid",
  food: "food_focus",
  lodging: "prefer",
  quietness: "atmosphere",
  crowd: "atmosphere",
  novelty: "prefer",
  morning_night: "scene",
  fatigue: "atmosphere",
  weather_tolerance: "prefer",
};

function confidenceToNum(c: M2ConfidenceBand | undefined): number {
  return c === "high" ? 0.9 : c === "low" ? 0.3 : c === "medium" ? 0.6 : 0.5;
}

/**
 * M2 fixture soft preference → soft ExtractedSlot[]（profile_prior/normalized・既定 private）。
 *   ctx.participantId は private slot の owner（M2 由来傾向の本人・auth user を caller が注入）。
 */
export function mapM2SoftEnrichmentToSlots(
  input: M2TravelSoftPreference,
  ctx: { participantId: string },
): ExtractedSlot[] {
  if (!input || typeof input !== "object" || !ctx || typeof ctx.participantId !== "string") return [];
  const recordVisibility = input.visibility ?? "private"; // ★ 既定 private
  const confidence = confidenceToNum(input.confidence);
  const surface = "profile_prior" as const; // M2 由来 surface 固定
  const status = SURFACE_INITIAL_STATUS.profile_prior; // "normalized"

  let seq = 0;
  const raw: unknown[] = [];
  const push = (key: string, value: unknown, visibility: "private" | "shared") => {
    seq += 1;
    raw.push({
      key,
      value,
      status, // normalized（profile_prior 由来）
      fillState: "filled",
      confidence,
      // private は participant owner 必須（normalizer 整合）。M2 傾向は本人由来。
      owner: visibility === "private" ? { kind: "participant", participantId: ctx.participantId } : { kind: "shared" },
      visibility,
      evidence: [{ surface, refId: `m2:${key}:${seq}` }],
    });
  };

  if (input.pace !== undefined) push("pace", input.pace, recordVisibility);
  if (input.mobility !== undefined) push("mobility_tolerance", input.mobility, recordVisibility);
  if (input.budgetBand !== undefined) push("budget_band", input.budgetBand, recordVisibility);
  for (const d of Array.isArray(input.descriptors) ? input.descriptors : []) {
    if (!d || typeof d.value !== "string") continue;
    const descriptorKey = KIND_TO_DESCRIPTOR_KEY[d.kind];
    if (!descriptorKey) continue; // 未知 kind → skip（捏造しない）
    // ★ avoid も soft_preference（hard red_line を産出しない）
    push("soft_preference", { descriptorKey, descriptorValue: d.value }, d.visibility ?? recordVisibility);
  }

  // ★ normalizeSlot で band/enum 強制（raw score-like/不正値を drop・private→participant owner 検証）。
  const slots: ExtractedSlot[] = [];
  for (const r of raw) {
    const res = normalizeSlot(r);
    if (res.ok) slots.push(res.slot);
  }
  return slots;
}

/** server-only envelope に包む（profile_prior soft slot のみ）。 */
export function buildM2SoftEnrichment(
  input: M2TravelSoftPreference,
  ctx: { participantId: string },
): M2TravelSoftEnrichment {
  return { outcome: "m2_soft_enrichment", serverOnly: true, slots: mapM2SoftEnrichmentToSlots(input, ctx) };
}
