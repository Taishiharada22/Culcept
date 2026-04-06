import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/baseline — 現在のベースライン状態を返す
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function GET() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("gender, date_of_birth, prefecture, baseline_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[baseline] GET error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    baseline: {
      gender: data?.gender ?? null,
      dateOfBirth: data?.date_of_birth ?? null,
      prefecture: data?.prefecture ?? null,
      completedAt: data?.baseline_completed_at ?? null,
    },
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/baseline — ベースラインデータを保存
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const VALID_GENDERS = ["male", "female", "non_binary", "prefer_not_to_say"] as const;

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    gender?: string;
    dateOfBirth?: string;
    prefecture?: string;
    city?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // ─── Validation ───
  const { gender, dateOfBirth, prefecture } = body;

  if (gender && !VALID_GENDERS.includes(gender as typeof VALID_GENDERS[number])) {
    return NextResponse.json({ ok: false, error: "invalid gender" }, { status: 400 });
  }

  if (dateOfBirth) {
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) {
      return NextResponse.json({ ok: false, error: "invalid date_of_birth" }, { status: 400 });
    }
    // 13歳未満の拒否
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
      age--;
    }
    if (age < 13) {
      return NextResponse.json({ ok: false, error: "must_be_13_or_older" }, { status: 400 });
    }
  }

  if (prefecture && !PREFECTURES.includes(prefecture as typeof PREFECTURES[number])) {
    return NextResponse.json({ ok: false, error: "invalid prefecture" }, { status: 400 });
  }

  const { city } = body as { city?: string };
  if (city && typeof city !== "string") {
    return NextResponse.json({ ok: false, error: "invalid city" }, { status: 400 });
  }

  // ─── Update profiles (service role で RLS をバイパス) ───
  const updatePayload: Record<string, unknown> = {
    baseline_completed_at: new Date().toISOString(),
  };
  if (gender) updatePayload.gender = gender;
  if (dateOfBirth) updatePayload.date_of_birth = dateOfBirth;
  if (prefecture) updatePayload.prefecture = prefecture;
  // city はマイグレーション実行後に有効化
  // TODO: 20260407100000_profiles_add_city.sql 適用後にコメント解除
  // if (city) updatePayload.city = city;

  const { error } = await supabaseAdmin
    .from("profiles")
    .update(updatePayload)
    .eq("id", user.id);

  if (error) {
    console.error("[baseline] POST error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // ─── Sync prefecture to user_weather_settings ───
  if (prefecture) {
    const wsPayload: Record<string, unknown> = { user_id: user.id, prefecture };
    // TODO: city はマイグレーション適用後に有効化
    // if (city) wsPayload.city = city;
    await supabaseAdmin
      .from("user_weather_settings")
      .upsert(wsPayload, { onConflict: "user_id" })
      .then(({ error: wsError }) => {
        if (wsError) console.warn("[baseline] weather_settings sync failed (non-fatal):", wsError);
      });
  }

  // ─── Sync to rendezvous_profiles if exists ───
  if (gender || dateOfBirth || prefecture) {
    const rvUpdate: Record<string, unknown> = {};
    if (gender) rvUpdate.gender = gender;
    if (dateOfBirth) rvUpdate.date_of_birth = dateOfBirth;
    if (prefecture) rvUpdate.prefecture = prefecture;

    await supabaseAdmin
      .from("rendezvous_profiles")
      .update(rvUpdate)
      .eq("user_id", user.id)
      .then(({ error: rvError }) => {
        if (rvError) {
          // rendezvous_profiles がまだ存在しない場合はスキップ（非致命的）
          if (rvError.code !== "PGRST116") {
            console.warn("[baseline] rendezvous_profiles sync failed (non-fatal):", rvError);
          }
        }
      });
  }

  return NextResponse.json({ ok: true });
}
