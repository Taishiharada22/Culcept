"use client";

import {
  formatShoeWidthCode,
  normalizeShoeWidthCode,
  type ShoeWidthAudience,
  type ShoeWidthCode,
} from "@/lib/shoeWidth";

export type ShoeWidthResolveClientResult = {
  audience: ShoeWidthAudience;
  widthCode: ShoeWidthCode | null;
  displayValue: string;
};

export async function resolveShoeWidthCodeClient(input: {
  audience?: ShoeWidthAudience | null;
  footLengthCm?: number | null;
  footGirthCm?: number | null;
  subcategoryId?: string | null;
}): Promise<ShoeWidthResolveClientResult> {
  const response = await fetch("/api/shoe-width/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  const widthCode = normalizeShoeWidthCode(data?.width_code);
  return {
    audience: data?.audience === "men" ? "men" : "women",
    widthCode,
    displayValue: formatShoeWidthCode(widthCode),
  };
}
