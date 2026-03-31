import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { APPEARANCE_SHARED_CATEGORY } from "@/lib/rendezvous/appearanceShared";

const VALID_PRIORITY_VALUES = new Set(["face", "style", "personality"]);

/**
 * Validate matching_priority structure.
 * Must be { priorities: ("face"|"style"|"personality")[] } with 0-3 unique items.
 */
function validateMatchingPriority(
  value: unknown,
): { valid: true; data: { priorities: string[] } } | { valid: false; error: string } {
  if (value === null) return { valid: true, data: { priorities: [] } };
  if (typeof value !== "object" || value === undefined)
    return { valid: false, error: "matchingPriority must be an object or null" };

  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.priorities))
    return { valid: false, error: "matchingPriority.priorities must be an array" };

  const priorities = obj.priorities as unknown[];
  if (priorities.length > 3)
    return { valid: false, error: "matchingPriority.priorities must have at most 3 items" };

  const seen = new Set<string>();
  for (const p of priorities) {
    if (typeof p !== "string" || !VALID_PRIORITY_VALUES.has(p))
      return {
        valid: false,
        error: `Invalid priority value: ${String(p)}. Must be one of: face, style, personality`,
      };
    if (seen.has(p))
      return { valid: false, error: `Duplicate priority value: ${p}` };
    seen.add(p);
  }

  return { valid: true, data: { priorities: priorities as string[] } };
}

/**
 * GET /api/rendezvous/appearance-preferences
 * Load user's appearance preferences from rendezvous_ideal_partner_profiles
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const userId = auth.user.id;
    // 外見の好みは恋愛・パートナー共通。常に共通カテゴリから読む
    const category = APPEARANCE_SHARED_CATEGORY;

    const { data, error } = await supabaseAdmin
      .from("rendezvous_ideal_partner_profiles")
      .select(
        "matching_priority, preferred_body_types, preferred_personal_color_seasons, preferred_hair_features, appearance_priority_order",
      )
      .eq("user_id", userId)
      .eq("category", category)
      .maybeSingle();

    if (error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );

    const defaultPrefs = {
      matchingPriority: { priorities: ["personality", "face", "style"] },
      preferredBodyTypes: [] as string[],
      preferredPersonalColorSeasons: [] as string[],
      preferredHairFeatures: {},
      appearancePriorityOrder: [] as string[],
    };

    return NextResponse.json({
      ok: true,
      preferences: data
        ? {
            matchingPriority: data.matching_priority ?? defaultPrefs.matchingPriority,
            preferredBodyTypes: data.preferred_body_types ?? [],
            preferredPersonalColorSeasons:
              data.preferred_personal_color_seasons ?? [],
            preferredHairFeatures: data.preferred_hair_features ?? {},
            appearancePriorityOrder: data.appearance_priority_order ?? [],
          }
        : defaultPrefs,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal error";
    console.error("[rendezvous/appearance-preferences] GET error:", err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

/**
 * POST /api/rendezvous/appearance-preferences
 * Upsert appearance preferences into rendezvous_ideal_partner_profiles
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const userId = auth.user.id;
    const body = await request.json();

    // 外見の好みは恋愛・パートナー共通。常に共通カテゴリに保存
    const category = APPEARANCE_SHARED_CATEGORY;

    // Validate matchingPriority if provided
    if (body.matchingPriority !== undefined) {
      const validation = validateMatchingPriority(body.matchingPriority);
      if (!validation.valid) {
        return NextResponse.json(
          { ok: false, error: (validation as { valid: false; error: string }).error },
          { status: 400 },
        );
      }
    }

    // Build upsert payload - only include provided fields
    const updateData: Record<string, unknown> = {
      user_id: userId,
      category,
      updated_at: new Date().toISOString(),
    };

    if (body.matchingPriority !== undefined)
      updateData.matching_priority = body.matchingPriority;
    if (body.preferredBodyTypes !== undefined)
      updateData.preferred_body_types = body.preferredBodyTypes;
    if (body.preferredPersonalColorSeasons !== undefined)
      updateData.preferred_personal_color_seasons =
        body.preferredPersonalColorSeasons;
    if (body.preferredHairFeatures !== undefined)
      updateData.preferred_hair_features = body.preferredHairFeatures;
    if (body.appearancePriorityOrder !== undefined)
      updateData.appearance_priority_order = body.appearancePriorityOrder;

    const { data, error } = await supabaseAdmin
      .from("rendezvous_ideal_partner_profiles")
      .upsert(updateData, { onConflict: "user_id,category" })
      .select(
        "matching_priority, preferred_body_types, preferred_personal_color_seasons, preferred_hair_features, appearance_priority_order",
      )
      .single();

    if (error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );

    return NextResponse.json({
      ok: true,
      preferences: {
        matchingPriority: data.matching_priority ?? { priorities: ["personality", "face", "style"] },
        preferredBodyTypes: data.preferred_body_types ?? [],
        preferredPersonalColorSeasons:
          data.preferred_personal_color_seasons ?? [],
        preferredHairFeatures: data.preferred_hair_features ?? {},
        appearancePriorityOrder: data.appearance_priority_order ?? [],
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal error";
    console.error("[rendezvous/appearance-preferences] POST error:", err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
