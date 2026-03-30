import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/auth/isAdmin";

/**
 * GET /api/admin/verification — 本人確認一覧（全ステータス）
 * POST /api/admin/verification — 承認 / リジェクト処理
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user || !isAdminEmail(auth.user.email)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get("status"); // "pending" | "approved" | "rejected" | null(all)

    let query = supabaseAdmin
      .from("rendezvous_verification")
      .select("*")
      .order("created_at", { ascending: true });

    if (status && ["pending", "approved", "rejected"].includes(status)) {
      query = query.eq("status", status);
    }

    const { data: verifications, error } = await query.limit(100);

    if (error) {
      console.error("[admin/verification] GET error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Fetch user profiles for display names
    const userIds = (verifications ?? []).map((v) => v.user_id);
    let profiles: Record<string, { display_name: string | null }> = {};

    if (userIds.length > 0) {
      const { data: profileData } = await supabaseAdmin
        .from("rendezvous_profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);

      if (profileData) {
        for (const p of profileData) {
          profiles[p.user_id] = { display_name: p.display_name };
        }
      }
    }

    // Enrich verifications with display names
    const enriched = (verifications ?? []).map((v) => ({
      ...v,
      display_name: profiles[v.user_id]?.display_name ?? "Unknown",
    }));

    return NextResponse.json({ ok: true, verifications: enriched });
  } catch (err: unknown) {
    console.error("[admin/verification] GET error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user || !isAdminEmail(auth.user.email)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { verificationId, action, reason } = body as {
      verificationId?: string;
      action?: string;
      reason?: string;
    };

    if (!verificationId || !action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "verificationId and action (approve/reject) required" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      status: action === "approve" ? "approved" : "rejected",
      reviewed_by: auth.user.id,
      reviewed_at: now,
      updated_at: now,
    };

    if (action === "reject" && reason) {
      updateData.rejection_reason = reason;
    }

    const { error } = await supabaseAdmin
      .from("rendezvous_verification")
      .update(updateData)
      .eq("id", verificationId);

    if (error) {
      console.error("[admin/verification] POST error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[admin/verification] POST error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
