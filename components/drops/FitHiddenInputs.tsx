"use client";

import { ALL_FIT_FORM_KEYS, type FitFormValueMap } from "@/lib/drops/fitProfile";

export default function FitHiddenInputs({
  categoryMain,
  subcategoryId,
  values,
}: {
  categoryMain: string;
  subcategoryId: string;
  values: FitFormValueMap;
}) {
  return (
    <>
      <input type="hidden" name="style_category_main" value={categoryMain} />
      <input type="hidden" name="style_subcategory_id" value={subcategoryId} />
      {ALL_FIT_FORM_KEYS
        .filter((key) => key !== "style_category_main" && key !== "style_subcategory_id")
        .map((key) => (
          <input key={key} type="hidden" name={key} value={values[key] ?? ""} />
        ))}
    </>
  );
}
