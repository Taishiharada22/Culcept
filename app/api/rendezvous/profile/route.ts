import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ---------------------------------------------------------------------------
// GET — プロフィール編集用データ取得
// settings API の profile + profile_details を ProfileEditClient 形式で返す
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: row, error } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select(
        "display_name, prefecture, occupation_category, hobbies, profile_details",
      )
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    const details =
      row?.profile_details && typeof row.profile_details === "object"
        ? (row.profile_details as Record<string, unknown>)
        : {};

    const profile = {
      displayName: row?.display_name ?? "",
      age: (details.age as number) ?? null,
      prefecture: row?.prefecture ?? "",
      city: (details.city as string) ?? "",
      occupationCategory: row?.occupation_category ?? "",
      occupationFreeText: (details.occupationFreeText as string) ?? "",
      meetingPurpose: (details.meetingPurpose as string[]) ?? [],
      availability: (details.availability as string[]) ?? [],
      hobbies: (row?.hobbies as string[]) ?? [],
      interests: (details.interests as string[]) ?? [],
      lifestyle: (details.lifestyle as Record<string, number>) ?? {
        morningNight: 50,
        indoorOutdoor: 50,
        aloneGroup: 50,
      },
      foodPreferences: (details.foodPreferences as string[]) ?? [],
      travelStyle: (details.travelStyle as string) ?? "",
      pets: (details.pets as string) ?? "",
      selfIntro: (details.selfIntro as string) ?? "",
      marriageIntent: (details.marriageIntent as string) ?? "",
      childrenPreference: (details.childrenPreference as string) ?? "",
      partnerValues: (details.partnerValues as string) ?? "",
    };

    return NextResponse.json({ profile });
  } catch (err) {
    console.error("[rendezvous/profile] GET error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PUT — プロフィール編集データ保存
// 直接カラム (display_name, prefecture, occupation_category, hobbies) +
// profile_details JSONB に残りを格納
// ---------------------------------------------------------------------------
export async function PUT(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { profile } = (await req.json()) as {
      profile: Record<string, unknown>;
    };
    if (!profile)
      return NextResponse.json(
        { error: "profile is required" },
        { status: 400 },
      );

    // profile_details に格納する追加フィールド
    const profileDetails: Record<string, unknown> = {};
    for (const key of [
      "age",
      "city",
      "occupationFreeText",
      "meetingPurpose",
      "availability",
      "interests",
      "lifestyle",
      "foodPreferences",
      "travelStyle",
      "pets",
      "selfIntro",
      "marriageIntent",
      "childrenPreference",
      "partnerValues",
    ]) {
      if (profile[key] !== undefined) {
        profileDetails[key] = profile[key];
      }
    }

    const updateData: Record<string, unknown> = {
      user_id: auth.user.id,
      updated_at: new Date().toISOString(),
    };

    if (profile.displayName !== undefined)
      updateData.display_name = profile.displayName;
    if (profile.prefecture !== undefined)
      updateData.prefecture = profile.prefecture;
    if (profile.occupationCategory !== undefined)
      updateData.occupation_category = profile.occupationCategory;
    if (profile.hobbies !== undefined) updateData.hobbies = profile.hobbies;
    if (Object.keys(profileDetails).length > 0) {
      // 既存の profile_details とマージ
      const { data: existing } = await supabaseAdmin
        .from("rendezvous_profiles")
        .select("profile_details")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      const merged = {
        ...((existing?.profile_details as Record<string, unknown>) ?? {}),
        ...profileDetails,
      };
      updateData.profile_details = merged;
    }

    const { error } = await supabaseAdmin
      .from("rendezvous_profiles")
      .upsert(updateData, { onConflict: "user_id" })
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[rendezvous/profile] PUT error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
