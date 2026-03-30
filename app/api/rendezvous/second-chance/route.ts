import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/rendezvous/second-chance — 期限切れ候補のうち復活可能なもの一覧
 * POST /api/rendezvous/second-chance — 期限切れ候補を復活
 */

const MAX_RECOVERY_COUNT = 1;
const RECOVERY_EXTENSION_DAYS = 7;

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Check premium
    const { data: profile } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("is_premium")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!profile?.is_premium) {
      return NextResponse.json({ ok: false, error: "Premium required", isPremiumRequired: true }, { status: 403 });
    }

    // Find expired candidates that haven't been recovered yet
    const { data: expired } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, category, sync_percent, reason_codes, recovery_count, expires_at")
      .or(`user_a.eq.${auth.user.id},user_b.eq.${auth.user.id}`)
      .eq("state", "expired")
      .lt("recovery_count", MAX_RECOVERY_COUNT)
      .order("expires_at", { ascending: false })
      .limit(10);

    // Get counterpart profiles for display
    const candidates = await Promise.all(
      (expired ?? []).map(async (c) => {
        const counterpartId = c.user_a === auth.user.id ? c.user_b : c.user_a;
        const { data: cp } = await supabaseAdmin
          .from("rendezvous_profiles")
          .select("display_name, avatar_style")
          .eq("user_id", counterpartId)
          .maybeSingle();

        return {
          candidateId: c.id,
          category: c.category,
          syncPercent: c.sync_percent,
          counterpartName: cp?.display_name ?? "???",
          expiredAt: c.expires_at,
        };
      }),
    );

    return NextResponse.json({ ok: true, candidates });
  } catch (err: any) {
    console.error("[second-chance] GET error:", err);
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

    const { candidateId } = await request.json();
    if (!candidateId) {
      return NextResponse.json({ ok: false, error: "candidateId required" }, { status: 400 });
    }

    // Check premium
    const { data: profile } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("is_premium")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!profile?.is_premium) {
      return NextResponse.json({ ok: false, error: "Premium required" }, { status: 403 });
    }

    // Verify candidate
    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, state, recovery_count")
      .eq("id", candidateId)
      .maybeSingle();

    if (!candidate) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    if (candidate.user_a !== auth.user.id && candidate.user_b !== auth.user.id) {
      return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
    }

    if (candidate.state !== "expired") {
      return NextResponse.json({ ok: false, error: "Candidate is not expired" }, { status: 400 });
    }

    if (candidate.recovery_count >= MAX_RECOVERY_COUNT) {
      return NextResponse.json({ ok: false, error: "Recovery limit reached" }, { status: 400 });
    }

    // Recover: reset state, extend expiry
    const newExpiry = new Date(Date.now() + RECOVERY_EXTENSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from("rendezvous_candidates")
      .update({
        state: "delivered",
        expires_at: newExpiry,
        recovery_count: candidate.recovery_count + 1,
        recovered_at: now,
      })
      .eq("id", candidateId);

    if (updateError) throw updateError;

    // Reset user states to unseen
    await supabaseAdmin
      .from("rendezvous_user_states")
      .update({ state: "unseen", seen_at: null, liked_at: null, passed_at: null })
      .eq("candidate_id", candidateId);

    return NextResponse.json({ ok: true, newExpiresAt: newExpiry });
  } catch (err: any) {
    console.error("[second-chance] POST error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
