import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isCeoEmail } from "@/lib/auth/isCeo";

/**
 * GET /api/ceo/verification-summary
 * CEO専用: 本人確認の集計サマリーを返す（件数のみ、個人情報なし）
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user || !isCeoEmail(auth.user.email)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // 全 review_status 件数を一括取得
    const { data: allProfiles, error } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select(
        "review_status, verification_submitted_at, frozen_at",
      );

    if (error) {
      console.error("[ceo/verification-summary] query error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    const rows = allProfiles ?? [];

    // 今日 00:00 UTC
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let frozen = 0;
    let todayNew = 0;

    for (const row of rows) {
      if (row.review_status === "pending") pending++;
      if (row.review_status === "approved") approved++;
      if (row.review_status === "rejected") rejected++;
      if (row.frozen_at) frozen++;

      // 今日提出されたもの
      if (
        row.verification_submitted_at &&
        row.verification_submitted_at >= todayISO
      ) {
        todayNew++;
      }
    }

    return NextResponse.json({
      ok: true,
      pending,
      todayNew,
      approved,
      rejected,
      frozen,
    });
  } catch (err: unknown) {
    console.error("[ceo/verification-summary] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
