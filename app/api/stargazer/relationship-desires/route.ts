import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getQuestionsForCategory,
  computeRelationshipQualities,
} from "@/lib/stargazer/relationshipDesireQuestions";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

// =============================================================================
// GET /api/stargazer/relationship-desires?category=romantic
// カテゴリ別の「相手に求めるもの」質問取得 + 既存の relationship_qualities
//
// GET /api/stargazer/relationship-desires (カテゴリなし)
// → 全カテゴリのうち最初に見つかった relationship_qualities を返す
//   (設定画面のスライダー初期値用)
//
// POST /api/stargazer/relationship-desires
// 回答保存 or スライダー値保存 → rendezvous_ideal_partner_profiles 更新
// =============================================================================

const VALID_CATEGORIES: RendezvousCategory[] = ["romantic", "friendship", "cocreation", "community", "partner"];

export async function GET(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const category = url.searchParams.get("category") as RendezvousCategory | null;

    // カテゴリ指定あり → 質問セット + 既存プロフィール
    if (category && VALID_CATEGORIES.includes(category)) {
      const questions = getQuestionsForCategory(category);

      const { data: existing } = await supabaseAdmin
        .from("rendezvous_ideal_partner_profiles")
        .select("relationship_qualities, preferred_face_types, desired_traits, source")
        .eq("user_id", auth.user.id)
        .eq("category", category)
        .maybeSingle();

      return NextResponse.json({
        ok: true,
        questions: questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          options: q.options.map((o) => ({ label: o.label })),
        })),
        qualities: existing?.relationship_qualities ?? null,
        source: existing?.source ?? null,
        existingProfile: existing ?? null,
      });
    }

    // カテゴリなし → 全カテゴリから最初のプロフィールを返す（設定画面用）
    const { data: profiles } = await supabaseAdmin
      .from("rendezvous_ideal_partner_profiles")
      .select("category, relationship_qualities, source")
      .eq("user_id", auth.user.id)
      .order("updated_at", { ascending: false })
      .limit(1);

    const first = profiles?.[0];
    return NextResponse.json({
      ok: true,
      qualities: first?.relationship_qualities ?? null,
      source: first?.source ?? null,
      category: first?.category ?? null,
    });
  } catch (err) {
    console.error("[relationship-desires GET] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      category, categories, answers, qualities: directQualities,
      preferredFaceTypes,
      preferredHeightMinCm, preferredHeightMaxCm,
      preferredAgeMin, preferredAgeMax,
      preferredGenders, preferredPrefecture,
      smokingPreference, drinkingPreference, similarityPreference,
      preferredAppearance, preferredLanguages,
    } = body as {
      category?: RendezvousCategory;
      categories?: RendezvousCategory[];
      answers?: { questionId: string; selectedIndex: number }[];
      qualities?: Record<string, number>;
      preferredFaceTypes?: string[];
      preferredHeightMinCm?: number | null;
      preferredHeightMaxCm?: number | null;
      preferredAgeMin?: number | null;
      preferredAgeMax?: number | null;
      preferredGenders?: string[];
      preferredPrefecture?: string | null;
      smokingPreference?: string | null;
      drinkingPreference?: string | null;
      similarityPreference?: string | null;
      preferredAppearance?: Record<string, unknown>;
      preferredLanguages?: string[];
    };

    // relationship_qualities: スライダー直接値 or 回答算出
    const computedQualities = directQualities
      ?? (answers?.length ? computeRelationshipQualities(answers) : undefined);

    // 対象カテゴリ
    const targetCategories = categories?.length
      ? categories.filter((c) => VALID_CATEGORIES.includes(c))
      : category && VALID_CATEGORIES.includes(category)
        ? [category]
        : ["romantic" as RendezvousCategory];

    // 各カテゴリにupsert
    const rows = targetCategories.map((cat) => {
      const upsertRow: Record<string, unknown> = {
        user_id: auth.user.id,
        category: cat,
        source: "user",
        updated_at: new Date().toISOString(),
      };
      if (computedQualities) upsertRow.relationship_qualities = computedQualities;
      if (preferredFaceTypes !== undefined) upsertRow.preferred_face_types = preferredFaceTypes;
      if (preferredHeightMinCm !== undefined) upsertRow.preferred_height_min_cm = preferredHeightMinCm;
      if (preferredHeightMaxCm !== undefined) upsertRow.preferred_height_max_cm = preferredHeightMaxCm;
      if (preferredAgeMin !== undefined) upsertRow.preferred_age_min = preferredAgeMin;
      if (preferredAgeMax !== undefined) upsertRow.preferred_age_max = preferredAgeMax;
      if (preferredGenders !== undefined) upsertRow.preferred_genders = preferredGenders;
      if (preferredPrefecture !== undefined) upsertRow.preferred_prefecture = preferredPrefecture;
      if (smokingPreference !== undefined) upsertRow.smoking_preference = smokingPreference;
      if (drinkingPreference !== undefined) upsertRow.drinking_preference = drinkingPreference;
      if (similarityPreference !== undefined) upsertRow.similarity_preference = similarityPreference;
      if (preferredAppearance !== undefined) upsertRow.preferred_appearance = preferredAppearance;
      if (preferredLanguages !== undefined) upsertRow.preferred_languages = preferredLanguages;
      return upsertRow;
    });

    const { error } = await supabaseAdmin
      .from("rendezvous_ideal_partner_profiles")
      .upsert(rows, { onConflict: "user_id,category" });

    if (error) {
      console.error("[relationship-desires POST] Error:", error);
      return NextResponse.json({ ok: false, error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      qualities: computedQualities,
      categoriesSaved: targetCategories,
    });
  } catch (err) {
    console.error("[relationship-desires POST] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
