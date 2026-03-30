import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/rendezvous/age-verify
 * 年齢確認済みかどうかチェック
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ verified: false }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("age_verified_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    return NextResponse.json({ verified: !!profile?.age_verified_at });
  } catch {
    return NextResponse.json({ verified: false });
  }
}

/**
 * POST /api/rendezvous/age-verify
 * 年齢確認（自己申告: 18歳以上のみ利用可）
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { birthDate } = body as { birthDate?: string };

    if (!birthDate) {
      return NextResponse.json({ ok: false, error: "生年月日を入力してください" }, { status: 400 });
    }

    // Parse and validate
    const bd = new Date(birthDate);
    if (isNaN(bd.getTime())) {
      return NextResponse.json({ ok: false, error: "無効な日付です" }, { status: 400 });
    }

    // Age check: must be 18+
    const today = new Date();
    let age = today.getFullYear() - bd.getFullYear();
    const monthDiff = today.getMonth() - bd.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < bd.getDate())) {
      age--;
    }

    if (age < 18) {
      return NextResponse.json(
        { ok: false, error: "Rendezvousのご利用には18歳以上であることが必要です" },
        { status: 400 },
      );
    }

    // Update profile
    const { error: updateErr } = await supabaseAdmin
      .from("rendezvous_profiles")
      .update({
        birth_date: birthDate,
        age_verified_at: new Date().toISOString(),
      })
      .eq("user_id", auth.user.id);

    if (updateErr) {
      console.error("[age-verify] update error:", updateErr);
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[age-verify] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
