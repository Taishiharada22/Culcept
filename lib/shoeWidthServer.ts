import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  formatShoeWidthCode,
  inferShoeWidthAudience,
  normalizeShoeWidthAudience,
  normalizeShoeWidthCode,
  roundFootLengthToHalf,
  type ShoeWidthCode,
  type ShoeWidthResolveInput,
} from "@/lib/shoeWidth";

type ShoeWidthResolveResult = {
  audience: "women" | "men";
  roundedFootLengthCm: number | null;
  widthCode: ShoeWidthCode | null;
  displayValue: string;
};

function isMissingRelationError(error: any) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return code === "42P01" || message.includes("shoe_width_master") || message.includes("resolve_shoe_width_code");
}

export async function resolveShoeWidthCodeServer(
  input: ShoeWidthResolveInput
): Promise<ShoeWidthResolveResult> {
  const footLengthCm = Number(input.footLengthCm ?? NaN);
  const footGirthCm = Number(input.footGirthCm ?? NaN);
  const audience = inferShoeWidthAudience(input);

  if (!Number.isFinite(footLengthCm) || !Number.isFinite(footGirthCm)) {
    return {
      audience,
      roundedFootLengthCm: null,
      widthCode: null,
      displayValue: "",
    };
  }

  const roundedFootLengthCm = roundFootLengthToHalf(footLengthCm);

  const rpc = await supabaseAdmin.rpc("resolve_shoe_width_code", {
    _audience: audience,
    _foot_length_cm: roundedFootLengthCm,
    _foot_girth_cm: footGirthCm,
  });

  if (!rpc.error) {
    const widthCode = normalizeShoeWidthCode(rpc.data) ?? "manual_required";
    return {
      audience,
      roundedFootLengthCm,
      widthCode,
      displayValue: formatShoeWidthCode(widthCode),
    };
  }

  if (!isMissingRelationError(rpc.error)) {
    throw rpc.error;
  }

  const fallback = await supabaseAdmin
    .from("shoe_width_master")
    .select("width_code")
    .eq("audience", audience)
    .eq("foot_length_cm", roundedFootLengthCm)
    .gte("max_foot_girth_cm", footGirthCm)
    .order("width_rank", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallback.error && !isMissingRelationError(fallback.error)) {
    throw fallback.error;
  }

  const widthCode = normalizeShoeWidthCode(fallback.data?.width_code) ?? "manual_required";
  return {
    audience,
    roundedFootLengthCm,
    widthCode,
    displayValue: formatShoeWidthCode(widthCode),
  };
}

export function readStoredWidthAudience(value: unknown) {
  return normalizeShoeWidthAudience(value);
}
