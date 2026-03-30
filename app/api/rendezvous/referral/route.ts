import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

/**
 * GET /api/rendezvous/referral — 自分の紹介コード取得（なければ生成）
 * POST /api/rendezvous/referral — 紹介コードを使用
 */

function generateCode(): string {
  return "RDV-" + randomBytes(4).toString("hex").toUpperCase();
}

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Check for existing active referral code
    const { data: existing } = await supabase
      .from("rendezvous_referrals")
      .select("id, referral_code, status, created_at, referred_id")
      .eq("referrer_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Find an unclaimed code or create new
    const activeCode = existing?.find((r) => r.status === "pending" && !r.referred_id);

    if (activeCode) {
      const claimedCount = existing?.filter((r) => r.status === "claimed").length ?? 0;
      return NextResponse.json({
        ok: true,
        referralCode: activeCode.referral_code,
        totalReferred: claimedCount,
      });
    }

    // Generate new code
    const code = generateCode();
    const { error: insertError } = await supabase
      .from("rendezvous_referrals")
      .insert({
        referrer_id: auth.user.id,
        referral_code: code,
      });

    if (insertError) throw insertError;

    const claimedCount = existing?.filter((r) => r.status === "claimed").length ?? 0;
    return NextResponse.json({
      ok: true,
      referralCode: code,
      totalReferred: claimedCount,
    });
  } catch (err: any) {
    console.error("[referral] GET error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { code } = body;
    if (!code) {
      return NextResponse.json({ ok: false, error: "code required" }, { status: 400 });
    }

    // Find the referral
    const { data: referral, error } = await supabase
      .from("rendezvous_referrals")
      .select("id, referrer_id, status, referred_id, expires_at")
      .eq("referral_code", code.toUpperCase())
      .maybeSingle();

    if (error || !referral) {
      return NextResponse.json({ ok: false, error: "無効なコードです" }, { status: 404 });
    }

    if (referral.referrer_id === auth.user.id) {
      return NextResponse.json({ ok: false, error: "自分のコードは使えません" }, { status: 400 });
    }

    if (referral.status !== "pending") {
      return NextResponse.json({ ok: false, error: "このコードは既に使用されています" }, { status: 400 });
    }

    if (new Date(referral.expires_at) < new Date()) {
      return NextResponse.json({ ok: false, error: "コードの有効期限が切れています" }, { status: 400 });
    }

    // Claim the referral
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("rendezvous_referrals")
      .update({
        referred_id: auth.user.id,
        status: "claimed",
        claimed_at: now,
      })
      .eq("id", referral.id);

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, message: "紹介コードを適用しました" });
  } catch (err: any) {
    console.error("[referral] POST error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
