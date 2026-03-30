export const SHOE_WIDTH_CODES = ["E", "2E", "3E", "4E", "5E", "manual_required"] as const;

export type ShoeWidthCode = (typeof SHOE_WIDTH_CODES)[number];
export type ShoeWidthAudience = "women" | "men";

export type ShoeWidthResolveInput = {
  audience?: ShoeWidthAudience | null;
  footLengthCm?: number | null;
  footGirthCm?: number | null;
  subcategoryId?: string | null;
};

export function isShoeWidthCode(value: unknown): value is ShoeWidthCode {
  return SHOE_WIDTH_CODES.includes(String(value) as ShoeWidthCode);
}

export function normalizeShoeWidthCode(value: unknown): ShoeWidthCode | null {
  const normalized = String(value ?? "").trim();
  return isShoeWidthCode(normalized) ? normalized : null;
}

export function normalizeShoeWidthAudience(value: unknown): ShoeWidthAudience | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "women" || normalized === "men") return normalized;
  return null;
}

export function roundFootLengthToHalf(value: number) {
  return Math.round(value * 2) / 2;
}

export function inferShoeWidthAudience(input: ShoeWidthResolveInput): ShoeWidthAudience {
  const explicit = normalizeShoeWidthAudience(input.audience);
  if (explicit) return explicit;

  const subcategoryId = String(input.subcategoryId ?? "").toLowerCase();
  if (subcategoryId.includes("heal") || subcategoryId.includes("heel")) return "women";
  if (subcategoryId.includes("derby")) return "men";

  const footLength = Number(input.footLengthCm ?? NaN);
  if (Number.isFinite(footLength) && footLength >= 27.5) return "men";

  return "women";
}

export function formatShoeWidthCode(code: ShoeWidthCode | null | undefined) {
  if (!code) return "";
  if (code === "manual_required") return "手動確認";
  return code;
}
