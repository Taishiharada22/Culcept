import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMunicipalityCoords } from "@/lib/shared/municipalityCoords";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Baseline 編集 + Alter 始終点接続
// 仕様: docs/baseline-edit-spec-v1.md
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VALID_PLACE_TYPES = ["home", "other"] as const;
const HOME_LABEL_MAX_LENGTH = 40;

/**
 * 市区町村 → { lat, lng } を解決。未収録 or city NULL は null を返す。
 * DB カラムは lat/lng だが MUNICIPALITY_COORDS の形式は lon なので変換する。
 */
function resolveHomeCoords(city: string | null | undefined): { lat: number; lng: number } | null {
  if (!city) return null;
  const m = getMunicipalityCoords(city);
  if (!m) return null;
  return { lat: m.lat, lng: m.lon };
}

/**
 * coords_status 導出:
 *   lat/lng あり → resolved
 *   lat/lng NULL かつ prefecture 有効 → fallback (runtime resolver が県で解決)
 *   prefecture NULL or 無効 → unresolved
 */
function computeCoordsStatus(
  prefecture: string | null,
  lat: number | null,
): "resolved" | "fallback" | "unresolved" {
  if (!prefecture || !PREFECTURES.includes(prefecture as (typeof PREFECTURES)[number])) {
    return "unresolved";
  }
  if (lat !== null) return "resolved";
  return "fallback";
}

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
    .select(
      "gender, date_of_birth, prefecture, city, occupation, occupation_detail, baseline_completed_at, baseline_home_label, baseline_home_place_type, baseline_home_lat, baseline_home_lng",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[baseline] GET error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const prefecture = data?.prefecture ?? null;
  const homeLat = data?.baseline_home_lat !== undefined && data?.baseline_home_lat !== null
    ? Number(data.baseline_home_lat)
    : null;
  const homeLng = data?.baseline_home_lng !== undefined && data?.baseline_home_lng !== null
    ? Number(data.baseline_home_lng)
    : null;
  const coordsStatus = computeCoordsStatus(prefecture, homeLat);

  return NextResponse.json({
    ok: true,
    baseline: {
      gender: data?.gender ?? null,
      dateOfBirth: data?.date_of_birth ?? null,
      prefecture,
      city: data?.city ?? null,
      occupation: data?.occupation ?? null,
      occupationDetail: data?.occupation_detail ?? null,
      completedAt: data?.baseline_completed_at ?? null,
      // ─── baseline home (1日の始点・終点) ───
      homeLabel: data?.baseline_home_label ?? null,
      homePlaceType: (data?.baseline_home_place_type as "home" | "other" | undefined) ?? "home",
      homeCoords: homeLat !== null && homeLng !== null ? { lat: homeLat, lng: homeLng } : null,
      coordsStatus,
    },
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/baseline — ベースラインデータを保存
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const VALID_GENDERS = ["male", "female", "non_binary", "prefer_not_to_say"] as const;

const VALID_OCCUPATIONS = [
  "ceo", "manager", "project_manager",
  "designer", "writer", "content_creator", "musician_artist", "ux_designer",
  "researcher", "data_scientist", "strategist",
  "sales", "marketing", "hr", "public_relations", "community_manager",
  "admin", "accountant", "legal",
  "engineer", "product_manager", "ai_ml_engineer", "craftsperson", "growth_hacker",
  "teacher", "counselor", "nurse_care",
  "entrepreneur", "freelancer", "investor",
  "doctor", "lawyer", "tax_accountant",
  "student", "homemaker", "job_seeking", "other",
] as const;

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
    occupation?: string;
    occupationDetail?: string;
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

  const { occupation, occupationDetail } = body;
  if (occupation && !VALID_OCCUPATIONS.includes(occupation as typeof VALID_OCCUPATIONS[number])) {
    return NextResponse.json({ ok: false, error: "invalid occupation" }, { status: 400 });
  }
  if (occupationDetail && typeof occupationDetail !== "string") {
    return NextResponse.json({ ok: false, error: "invalid occupationDetail" }, { status: 400 });
  }

  // ─── Update profiles (service role で RLS をバイパス) ───
  const updatePayload: Record<string, unknown> = {
    baseline_completed_at: new Date().toISOString(),
  };
  if (gender) updatePayload.gender = gender;
  if (dateOfBirth) updatePayload.date_of_birth = dateOfBirth;
  if (prefecture) updatePayload.prefecture = prefecture;
  if (city) updatePayload.city = city;
  if (occupation) updatePayload.occupation = occupation;
  if (occupationDetail) updatePayload.occupation_detail = occupationDetail;

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
    if (city) wsPayload.city = city;
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PATCH /api/baseline — /my-page からの部分更新
// 仕様: docs/baseline-edit-spec-v1.md §3
// 差分のみ送信可。完了済みフラグ (baseline_completed_at) は touch しない。
// prefecture/city が変わった場合のみ lat/lng を再解決する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function PATCH(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    homeLabel?: string | null;
    homePlaceType?: string;
    prefecture?: string;
    city?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // ─── Validation ───
  if (body.homeLabel !== undefined && body.homeLabel !== null) {
    if (typeof body.homeLabel !== "string") {
      return NextResponse.json({ ok: false, error: "invalid homeLabel" }, { status: 400 });
    }
    const trimmed = body.homeLabel.trim();
    if (trimmed.length === 0 || trimmed.length > HOME_LABEL_MAX_LENGTH) {
      return NextResponse.json(
        { ok: false, error: "homeLabel must be 1-40 chars" },
        { status: 400 },
      );
    }
    body.homeLabel = trimmed;
  }

  if (
    body.homePlaceType !== undefined
    && !VALID_PLACE_TYPES.includes(body.homePlaceType as (typeof VALID_PLACE_TYPES)[number])
  ) {
    return NextResponse.json({ ok: false, error: "invalid homePlaceType" }, { status: 400 });
  }

  if (
    body.prefecture !== undefined
    && !PREFECTURES.includes(body.prefecture as (typeof PREFECTURES)[number])
  ) {
    return NextResponse.json({ ok: false, error: "invalid prefecture" }, { status: 400 });
  }

  if (body.city !== undefined && body.city !== null && typeof body.city !== "string") {
    return NextResponse.json({ ok: false, error: "invalid city" }, { status: 400 });
  }

  // ─── Build update payload (差分のみ) ───
  const updatePayload: Record<string, unknown> = {};
  if (body.homeLabel !== undefined) updatePayload.baseline_home_label = body.homeLabel;
  if (body.homePlaceType !== undefined) updatePayload.baseline_home_place_type = body.homePlaceType;
  if (body.prefecture !== undefined) updatePayload.prefecture = body.prefecture;
  if (body.city !== undefined) updatePayload.city = body.city;

  // ─── Coords 再解決（prefecture or city が変わった場合のみ）───
  const coordsReResolve = body.prefecture !== undefined || body.city !== undefined;
  if (coordsReResolve) {
    // city の最終値を決める（body に含まれていなければ現行値を参照するため fetch）
    let finalCity: string | null | undefined = body.city;
    if (finalCity === undefined) {
      const { data: current } = await supabaseAdmin
        .from("profiles")
        .select("city")
        .eq("id", user.id)
        .maybeSingle();
      finalCity = (current?.city as string | null | undefined) ?? null;
    }
    const coords = resolveHomeCoords(finalCity);
    updatePayload.baseline_home_lat = coords?.lat ?? null;
    updatePayload.baseline_home_lng = coords?.lng ?? null;
  }

  // 何も変更がない場合は短絡（空 PATCH は no-op で成功扱い）
  if (Object.keys(updatePayload).length > 0) {
    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .update(updatePayload)
      .eq("id", user.id);
    if (upErr) {
      console.error("[baseline] PATCH error:", upErr);
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    // ─── Sync prefecture/city to user_weather_settings (POST と同等) ───
    if (body.prefecture !== undefined || body.city !== undefined) {
      const { data: latest } = await supabaseAdmin
        .from("profiles")
        .select("prefecture, city")
        .eq("id", user.id)
        .maybeSingle();
      if (latest?.prefecture) {
        const wsPayload: Record<string, unknown> = { user_id: user.id, prefecture: latest.prefecture };
        if (latest.city) wsPayload.city = latest.city;
        await supabaseAdmin
          .from("user_weather_settings")
          .upsert(wsPayload, { onConflict: "user_id" })
          .then(({ error: wsError }) => {
            if (wsError) console.warn("[baseline] weather_settings sync failed (non-fatal):", wsError);
          });
      }
    }
  }

  // ─── 最新状態を GET 同型で返す ───
  const { data: latest, error: fetchErr } = await supabaseAdmin
    .from("profiles")
    .select(
      "gender, date_of_birth, prefecture, city, occupation, occupation_detail, baseline_completed_at, baseline_home_label, baseline_home_place_type, baseline_home_lat, baseline_home_lng",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (fetchErr) {
    console.error("[baseline] PATCH fetch-after-update error:", fetchErr);
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }

  const prefectureOut = latest?.prefecture ?? null;
  const homeLat = latest?.baseline_home_lat !== undefined && latest?.baseline_home_lat !== null
    ? Number(latest.baseline_home_lat)
    : null;
  const homeLng = latest?.baseline_home_lng !== undefined && latest?.baseline_home_lng !== null
    ? Number(latest.baseline_home_lng)
    : null;
  const coordsStatus = computeCoordsStatus(prefectureOut, homeLat);

  return NextResponse.json({
    ok: true,
    baseline: {
      gender: latest?.gender ?? null,
      dateOfBirth: latest?.date_of_birth ?? null,
      prefecture: prefectureOut,
      city: latest?.city ?? null,
      occupation: latest?.occupation ?? null,
      occupationDetail: latest?.occupation_detail ?? null,
      completedAt: latest?.baseline_completed_at ?? null,
      homeLabel: latest?.baseline_home_label ?? null,
      homePlaceType: (latest?.baseline_home_place_type as "home" | "other" | undefined) ?? "home",
      homeCoords: homeLat !== null && homeLng !== null ? { lat: homeLat, lng: homeLng } : null,
      coordsStatus,
    },
  });
}
