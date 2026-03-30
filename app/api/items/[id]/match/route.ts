import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { selectUserStyleSummaryMaybeSingle } from "@/lib/userStyleSummary";
import { calcFitScore as calcLegacyFitScore, calcColorScore as calcLegacyColorScore } from "@/lib/match/fitColorScore";
import { calcStyleScore } from "@/lib/matchScore/style";
import type {
  BodyMeasurements,
  GarmentColorProfile,
  GarmentFitProfile,
  UserBodyProfile,
  UserPersonalColorProfile,
} from "@/types/body-color";

export const runtime = "nodejs";

type MatchBand = "green" | "yellow" | "red";

type DropRow = {
  id: string;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  brand: string | null;
  user_id: string | null;
};

type StyleSummaryRow = {
  style_tags: string[] | null;
  mood_keywords: string[] | null;
  favorite_colors: string[] | null;
};

type ShopRow = {
  style_tags: string[] | null;
};

type FitPart = {
  key: string;
  label: string;
  score: number;
};

type FitDetail = {
  score: number;
  ease: number;
  target: [number, number];
};

type FitBreakdown = {
  score: number;
  parts: FitPart[];
  detail: Record<string, FitDetail>;
  reasons: string[];
};

type FitPreference = "slim" | "regular" | "relaxed" | "oversized";
type MatchCategory = "outer" | "tops" | "bottoms" | "shoes";

const STYLE_ALIASES: Record<string, string[]> = {
  minimal: ["minimal", "ミニマル"],
  street: ["street", "ストリート"],
  vintage: ["vintage", "ヴィンテージ", "古着"],
  sporty: ["sporty", "スポーティ", "スポーツ"],
  luxury: ["luxury", "ラグジュアリー"],
  daily: ["daily", "デイリー"],
  elegant: ["elegant", "エレガント"],
  workwear: ["workwear", "ワーク", "ワークウェア"],
  outdoor: ["outdoor", "アウトドア"],
  casual: ["casual", "カジュアル"],
  classic: ["classic", "クラシック"],
};

const MOOD_ALIASES: Record<string, string[]> = {
  clean: ["clean", "クリーン", "清潔感"],
  classic: ["classic", "クラシック"],
  bold: ["bold", "ボールド", "強め"],
  relaxed: ["relaxed", "リラックス"],
  mode: ["mode", "モード"],
  feminine: ["feminine", "フェミニン"],
  masculine: ["masculine", "マスキュリン"],
  natural: ["natural", "ナチュラル"],
};

const CATEGORY_ALIASES: Record<MatchCategory, string[]> = {
  outer: ["outer", "アウター", "jacket", "coat", "blouson", "puffer", "parka"],
  tops: ["tops", "トップス", "shirt", "tee", "t-shirt", "knit", "sweat", "hoodie", "vest"],
  bottoms: ["bottoms", "ボトムス", "pants", "jeans", "denim", "slacks", "skirt", "trousers"],
  shoes: ["shoes", "シューズ", "boots", "sneakers", "loafer", "sandals"],
};

const FIT_RANGE_MAP: Record<
  MatchCategory,
  Record<
    FitPreference,
    Partial<Record<"chest" | "shoulder" | "waist" | "hip" | "sleeve" | "length" | "inseam" | "thigh" | "foot_length" | "foot_width", [number, number]>>
  >
> = {
  tops: {
    slim: { chest: [4, 8], shoulder: [-0.5, 0.5], sleeve: [-2, 2], length: [-3, 3] },
    regular: { chest: [8, 14], shoulder: [0, 1.5], sleeve: [-2, 2], length: [-3, 3] },
    relaxed: { chest: [14, 22], shoulder: [1, 3], sleeve: [-2, 2], length: [-3, 3] },
    oversized: { chest: [22, 32], shoulder: [2, 5], sleeve: [-2, 2], length: [-3, 3] },
  },
  outer: {
    slim: { chest: [10, 18], shoulder: [0, 2], sleeve: [-2, 2], length: [-4, 4] },
    regular: { chest: [14, 24], shoulder: [1, 3], sleeve: [-2, 2], length: [-4, 4] },
    relaxed: { chest: [22, 32], shoulder: [2, 4], sleeve: [-2, 2], length: [-4, 4] },
    oversized: { chest: [30, 44], shoulder: [3, 6], sleeve: [-2, 2], length: [-4, 4] },
  },
  bottoms: {
    slim: { waist: [0, 2], hip: [2, 5], inseam: [-2, 2], thigh: [0, 3] },
    regular: { waist: [2, 5], hip: [4, 9], inseam: [-2, 2], thigh: [1, 4] },
    relaxed: { waist: [5, 9], hip: [8, 14], inseam: [-2, 2], thigh: [3, 7] },
    oversized: { waist: [8, 14], hip: [12, 20], inseam: [-2, 2], thigh: [5, 10] },
  },
  shoes: {
    slim: { foot_length: [0.3, 1], foot_width: [0, 0.8] },
    regular: { foot_length: [0.3, 1], foot_width: [0, 0.8] },
    relaxed: { foot_length: [0.3, 1.2], foot_width: [0, 1] },
    oversized: { foot_length: [0.5, 1.4], foot_width: [0, 1.1] },
  },
};

const FIT_WEIGHTS: Record<MatchCategory, Record<string, number>> = {
  tops: { chest: 0.45, shoulder: 0.25, sleeve: 0.15, length: 0.15 },
  outer: { chest: 0.5, shoulder: 0.2, sleeve: 0.15, length: 0.15 },
  bottoms: { waist: 0.35, hip: 0.35, inseam: 0.2, thigh: 0.1 },
  shoes: { foot_length: 0.65, foot_width: 0.35 },
};

const FIT_OVERSHOOT: Record<string, number> = {
  chest: 12,
  shoulder: 4,
  waist: 10,
  hip: 12,
  sleeve: 6,
  inseam: 8,
  length: 10,
  thigh: 10,
  foot_length: 1,
  foot_width: 1,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown) {
  const num = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isFinite(num) ? num : null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function inferCategory(drop: DropRow, fitProfile: GarmentFitProfile | null): MatchCategory {
  const fromProfile = String(fitProfile?.category ?? "").toLowerCase();
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES) as Array<[MatchCategory, string[]]>) {
    if (aliases.some((alias) => fromProfile.includes(alias))) return category;
  }

  const raw = [drop.title, drop.description, ...(drop.tags ?? [])].join(" ").toLowerCase();
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES) as Array<[MatchCategory, string[]]>) {
    if (aliases.some((alias) => raw.includes(alias))) return category;
  }

  return "tops";
}

function buildSearchText(drop: DropRow, shopStyleTags: string[]) {
  return [drop.title, drop.description, drop.brand, ...(drop.tags ?? []), ...shopStyleTags]
    .map((item) => String(item ?? "").toLowerCase())
    .join(" ");
}

function extractAliases(text: string, source: Record<string, string[]>) {
  return Object.entries(source)
    .filter(([, aliases]) => aliases.some((alias) => text.includes(alias.toLowerCase())))
    .map(([key]) => key);
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function scoreRange(value: number, min: number, max: number, maxOvershoot: number) {
  const mid = (min + max) / 2;
  const half = (max - min) / 2;
  if (value >= min && value <= max) {
    const ratio = half === 0 ? 0 : Math.abs(value - mid) / half;
    return clamp(Math.round(100 - 20 * ratio), 80, 100);
  }
  const overshoot = value < min ? min - value : value - max;
  return clamp(Math.round(80 - 80 * (overshoot / Math.max(maxOvershoot, 0.1))), 0, 80);
}

function pickMeasurement(measurements: BodyMeasurements | null, keys: Array<keyof BodyMeasurements>) {
  if (!measurements) return null;
  for (const key of keys) {
    const value = toNumber(measurements[key]);
    if (value != null) return value;
  }
  return null;
}

function resolveFitPreference(value: string | null | undefined): FitPreference {
  if (value === "slim" || value === "regular" || value === "relaxed" || value === "oversized") {
    return value;
  }
  return "regular";
}

function buildFitBreakdown(
  category: MatchCategory,
  fitPreference: FitPreference,
  measurements: BodyMeasurements | null,
  fitProfile: GarmentFitProfile | null,
  legacyScore: number,
): FitBreakdown {
  const parts: FitPart[] = [];
  const detail: Record<string, FitDetail> = {};
  const reasons: string[] = [];
  const pattern = fitProfile?.pattern ?? {};

  const definitions: Record<
    MatchCategory,
    Array<{
      key: keyof typeof FIT_OVERSHOOT;
      label: string;
      bodyKeys: Array<keyof BodyMeasurements>;
      garmentKey: keyof NonNullable<GarmentFitProfile["pattern"]>;
    }>
  > = {
    tops: [
      { key: "chest", label: "胸囲", bodyKeys: ["chest", "chest_circ"], garmentKey: "chest_cm" },
      { key: "shoulder", label: "肩幅", bodyKeys: ["shoulder", "shoulder_breadth"], garmentKey: "shoulder_cm" },
      { key: "sleeve", label: "袖丈", bodyKeys: ["sleeve", "sleeve_length"], garmentKey: "sleeve_cm" },
      { key: "length", label: "着丈", bodyKeys: ["back_length"], garmentKey: "length_cm" },
    ],
    outer: [
      { key: "chest", label: "胸囲", bodyKeys: ["chest", "chest_circ"], garmentKey: "chest_cm" },
      { key: "shoulder", label: "肩幅", bodyKeys: ["shoulder", "shoulder_breadth"], garmentKey: "shoulder_cm" },
      { key: "sleeve", label: "袖丈", bodyKeys: ["sleeve", "sleeve_length"], garmentKey: "sleeve_cm" },
      { key: "length", label: "着丈", bodyKeys: ["back_length"], garmentKey: "length_cm" },
    ],
    bottoms: [
      { key: "waist", label: "ウエスト", bodyKeys: ["waist", "waist_circ"], garmentKey: "waist_cm" },
      { key: "hip", label: "ヒップ", bodyKeys: ["hip", "hip_circ"], garmentKey: "hip_cm" },
      { key: "inseam", label: "股下", bodyKeys: ["inseam"], garmentKey: "inseam_cm" },
      { key: "thigh", label: "わたり", bodyKeys: ["thigh", "thigh_circ"], garmentKey: "thigh_cm" },
    ],
    shoes: [
      { key: "foot_length", label: "足長", bodyKeys: ["foot_length_cm"], garmentKey: "length_cm" },
      { key: "foot_width", label: "足幅", bodyKeys: ["foot_width_cm"], garmentKey: "waist_cm" },
    ],
  };

  const targetMap = FIT_RANGE_MAP[category][fitPreference];
  const weights = FIT_WEIGHTS[category];
  let weightedTotal = 0;
  let totalWeight = 0;
  let fatal = false;

  for (const definition of definitions[category]) {
    const bodyValue = pickMeasurement(measurements, definition.bodyKeys);
    const garmentValue = toNumber(pattern[definition.garmentKey]);
    const target = targetMap[definition.key as keyof typeof targetMap];
    if (bodyValue == null || garmentValue == null || !target) continue;

    const ease = Number((garmentValue - bodyValue).toFixed(1));
    if ((category === "tops" || category === "outer") && definition.key === "chest" && ease < 0) fatal = true;
    if (category === "bottoms" && definition.key === "waist" && ease < -1) fatal = true;
    if (category === "bottoms" && definition.key === "hip" && ease < 0) fatal = true;
    if (category === "shoes" && definition.key === "foot_length" && ease < 0) fatal = true;

    const partScore = scoreRange(ease, target[0], target[1], FIT_OVERSHOOT[definition.key]);
    detail[definition.key] = { score: partScore, ease, target };
    parts.push({ key: definition.key, label: definition.label, score: partScore });

    const weight = weights[definition.key] ?? 0;
    weightedTotal += partScore * weight;
    totalWeight += weight;
  }

  parts.sort((left, right) => right.score - left.score);

  if (fatal) {
    reasons.push("実寸上、致命的にタイトな部位があります");
    return { score: 0, parts, detail, reasons };
  }

  const breakdownScore = totalWeight > 0 ? Math.round(weightedTotal / totalWeight) : legacyScore;
  const sortedByWeakness = [...parts].sort((left, right) => left.score - right.score);
  if (sortedByWeakness[0] && sortedByWeakness[0].score < 60) {
    reasons.push(`${sortedByWeakness[0].label}が目標レンジから外れています`);
  }
  if (sortedByWeakness[1] && sortedByWeakness[1].score < 70) {
    reasons.push(`${sortedByWeakness[1].label}は調整余地があります`);
  }
  if (reasons.length === 0 && parts[0]) {
    reasons.push(`${parts[0].label}の収まりが良好です`);
  }

  return {
    score: clamp(breakdownScore, 0, 100),
    parts,
    detail,
    reasons,
  };
}

function calcBand(total300: number, styleScore: number, colorScore: number, fitScore: number): MatchBand {
  if (fitScore < 60) return "red";
  let base: MatchBand = total300 >= 240 ? "green" : total300 >= 195 ? "yellow" : "red";
  if ((colorScore < 50 || styleScore < 50) && base === "green") {
    base = "yellow";
  }
  return base;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const [
      dropRes,
      styleSummaryRes,
      bodyProfileRes,
      bodyMeasurementsRes,
      colorProfileRes,
      fitProfileRes,
      garmentColorRes,
    ] = await Promise.all([
      supabase.from("drops").select("id,title,description,tags,brand,user_id").eq("id", id).maybeSingle(),
      selectUserStyleSummaryMaybeSingle(supabase, auth.user.id, "style_tags,mood_keywords,favorite_colors", "style_tags"),
      supabase.from("user_body_profiles").select("*").eq("user_id", auth.user.id).maybeSingle(),
      supabase
        .from("user_body_measurements")
        .select("measurements,measured_at")
        .eq("user_id", auth.user.id)
        .order("measured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("user_personal_color_profiles").select("*").eq("user_id", auth.user.id).maybeSingle(),
      supabase.from("garment_fit_profiles").select("*").eq("product_id", id).maybeSingle(),
      supabase.from("garment_color_profiles").select("*").eq("product_id", id).maybeSingle(),
    ]);

    const drop = (dropRes.data ?? null) as DropRow | null;
    if (!drop) {
      return NextResponse.json({ ok: false, error: "Item not found" }, { status: 404 });
    }

    let shopStyleTags: string[] = [];
    if (drop.user_id) {
      const shopRes = await supabase
        .from("shops")
        .select("style_tags")
        .eq("owner_id", drop.user_id)
        .eq("is_active", true)
        .maybeSingle();
      shopStyleTags = normalizeStringArray((shopRes.data as ShopRow | null)?.style_tags);
    }

    const styleSummary = (styleSummaryRes.data ?? null) as StyleSummaryRow | null;
    const bodyProfile = (bodyProfileRes.data ?? null) as UserBodyProfile | null;
    const bodyMeasurements = (bodyMeasurementsRes.data?.measurements ?? null) as BodyMeasurements | null;
    const colorProfile = (colorProfileRes.data ?? null) as UserPersonalColorProfile | null;
    const fitProfile = (fitProfileRes.data ?? null) as GarmentFitProfile | null;
    const garmentColor = (garmentColorRes.data ?? null) as GarmentColorProfile | null;

    const category = inferCategory(drop, fitProfile);
    const searchText = buildSearchText(drop, shopStyleTags);
    const itemStyleTags = unique([
      ...extractAliases(searchText, STYLE_ALIASES),
      ...shopStyleTags,
    ]);
    const itemMoodTags = unique(extractAliases(searchText, MOOD_ALIASES));

    const styleResult = calcStyleScore({
      userLanes: normalizeStringArray(styleSummary?.style_tags),
      userMoodKeywords: normalizeStringArray(styleSummary?.mood_keywords),
      itemStyleTags,
      itemMoodTags,
    });

    const legacyFit = calcLegacyFitScore({
      bodyProfile,
      measurements: bodyMeasurements,
      garment: fitProfile,
    });

    const fitBreakdown = buildFitBreakdown(
      category,
      resolveFitPreference(fitProfile?.intended_fit ?? null),
      bodyMeasurements,
      fitProfile,
      legacyFit.score,
    );

    const fitScore =
      fitBreakdown.parts.length > 0
        ? Math.round(legacyFit.score * 0.45 + fitBreakdown.score * 0.55)
        : legacyFit.score;

    const colorResult = calcLegacyColorScore({
      colorProfile,
      garment: garmentColor,
    });

    const total300 = clamp(styleResult.score + colorResult.score + fitScore, 0, 300);
    const avg100 = Math.round((total300 / 3) * 10) / 10;
    const band = calcBand(total300, styleResult.score, colorResult.score, fitScore);

    let confidence = 0;
    if (bodyMeasurements && fitProfile?.pattern) confidence += 0.5;
    else if (bodyMeasurements || fitProfile?.pattern) confidence += 0.25;
    if (colorProfile && garmentColor?.dominant_colors?.length) confidence += 0.25;
    if (
      (normalizeStringArray(styleSummary?.style_tags).length > 0 || normalizeStringArray(styleSummary?.mood_keywords).length > 0) &&
      (itemStyleTags.length > 0 || itemMoodTags.length > 0)
    ) {
      confidence += 0.25;
    }

    return NextResponse.json({
      ok: true,
      item: {
        id: drop.id,
        title: drop.title,
        category,
      },
      total300,
      avg100,
      band,
      style: {
        score: styleResult.score,
        reasons: styleResult.reasons,
        tags: itemStyleTags,
        moods: itemMoodTags,
      },
      color: {
        score: colorResult.score,
        reasons: colorResult.reasons,
      },
      fit: {
        score: fitScore,
        reasons: unique([...fitBreakdown.reasons, ...legacyFit.reasons]).slice(0, 4),
        parts: fitBreakdown.parts
          .sort((left, right) => {
            const desiredOrder = Object.keys(FIT_WEIGHTS[category]);
            return desiredOrder.indexOf(left.key) - desiredOrder.indexOf(right.key);
          }),
        detail: fitBreakdown.detail,
      },
      confidence: Math.round(clamp(confidence, 0, 1) * 100) / 100,
    });
  } catch (error) {
    console.error("item match route error:", error);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
