import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildGarmentFitPayload, getSubmittedFitValues } from "@/lib/drops/fitProfile";
import { resolveShoeWidthCodeServer } from "@/lib/shoeWidthServer";
import { normalizeShoeWidthAudience } from "@/lib/shoeWidth";

export async function buildGarmentFitPayloadFromFormData(formData: FormData) {
  const values = getSubmittedFitValues(formData);

  const recommendedFootLength = Number(values.recommended_foot_length_cm ?? NaN);
  const recommendedFootGirth = Number(values.recommended_foot_girth_cm ?? NaN);

  if (Number.isFinite(recommendedFootLength) && Number.isFinite(recommendedFootGirth)) {
    const widthResult = await resolveShoeWidthCodeServer({
      audience: normalizeShoeWidthAudience(values.shoe_width_audience),
      footLengthCm: recommendedFootLength,
      footGirthCm: recommendedFootGirth,
      subcategoryId: values.style_subcategory_id || null,
    }).catch(() => null);

    if (widthResult?.widthCode) {
      values.recommended_width = widthResult.widthCode;
      values.recommended_width_size = widthResult.widthCode;
      values.shoe_width_audience = widthResult.audience;
    }
  }

  return buildGarmentFitPayload(values);
}

export async function upsertGarmentFitProfileFromFormData(productId: string, formData: FormData) {
  const payload = await buildGarmentFitPayloadFromFormData(formData);
  if (!payload) return null;

  const { error } = await supabaseAdmin.from("garment_fit_profiles").upsert(
    {
      product_id: productId,
      category: payload.category,
      intended_fit: payload.intended_fit,
      pattern: payload.pattern,
      fabric: payload.fabric,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_id" }
  );

  if (error) throw error;
  return payload;
}
