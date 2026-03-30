import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/auth/isAdmin";

/**
 * GET /api/admin/rendezvous/reports — 通報キュー（ユーザー名付き + 統計）
 * PATCH /api/admin/rendezvous/reports — 通報処理（resolve/dismiss/ban）
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user || !isAdminEmail(auth.user.email)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("rendezvous_reports")
      .select("id, reporter_id, reported_id, candidate_id, reason, details, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      return NextResponse.json({ ok: true, reports: [], stats: { resolved7d: 0, banned7d: 0 } });
    }

    // Enrich with display names
    const reports = data ?? [];
    const userIds = new Set<string>();
    reports.forEach((r) => {
      userIds.add(r.reporter_id);
      userIds.add(r.reported_id);
    });

    let nameMap = new Map<string, string>();
    let safetyMap = new Map<string, { safety_flag: boolean; is_paused: boolean }>();
    if (userIds.size > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("rendezvous_profiles")
        .select("user_id, display_name, safety_flag, is_paused")
        .in("user_id", Array.from(userIds));

      (profiles ?? []).forEach((p: any) => {
        nameMap.set(p.user_id, p.display_name);
        safetyMap.set(p.user_id, {
          safety_flag: p.safety_flag ?? false,
          is_paused: p.is_paused ?? false,
        });
      });
    }

    // 対象ユーザーごとの通報件数を取得
    const reportedIds = [...new Set(reports.map((r) => r.reported_id))];
    const reportCountMap = new Map<string, number>();
    for (const rid of reportedIds) {
      const { count } = await supabaseAdmin
        .from("rendezvous_reports")
        .select("id", { count: "exact", head: true })
        .eq("reported_id", rid);
      reportCountMap.set(rid, count ?? 0);
    }

    const enriched = reports.map((r) => ({
      ...r,
      reporter_name: nameMap.get(r.reporter_id) ?? "不明",
      reported_name: nameMap.get(r.reported_id) ?? "不明",
      safety_flag: safetyMap.get(r.reported_id)?.safety_flag ?? false,
      is_paused: safetyMap.get(r.reported_id)?.is_paused ?? false,
      report_count: reportCountMap.get(r.reported_id) ?? 0,
    }));

    // Stats for last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: resolvedCount } = await supabaseAdmin
      .from("rendezvous_reports")
      .select("*", { count: "exact", head: true })
      .in("status", ["resolved", "banned"])
      .gte("resolved_at", weekAgo);

    const { count: bannedCount } = await supabaseAdmin
      .from("rendezvous_reports")
      .select("*", { count: "exact", head: true })
      .eq("status", "banned")
      .gte("resolved_at", weekAgo);

    return NextResponse.json({
      ok: true,
      reports: enriched,
      stats: {
        resolved7d: resolvedCount ?? 0,
        banned7d: bannedCount ?? 0,
      },
    });
  } catch (err: unknown) {
    console.error("[admin/rendezvous/reports] GET error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user || !isAdminEmail(auth.user.email)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { reportId, action } = body;

    if (!reportId || !["resolve", "dismiss", "ban"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "reportId and action (resolve/dismiss/ban) required" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    if (action === "ban") {
      // Get the report to find reported user
      const { data: report } = await supabaseAdmin
        .from("rendezvous_reports")
        .select("reported_id, reporter_id")
        .eq("id", reportId)
        .single();

      if (!report) {
        return NextResponse.json({ ok: false, error: "Report not found" }, { status: 404 });
      }

      // Block the reported user
      await supabaseAdmin
        .from("rendezvous_blocks")
        .insert({
          blocker_id: report.reporter_id,
          blocked_id: report.reported_id,
          reason: "admin_ban",
        })
        .then(() => {});

      // Disable the reported user's profile
      await supabaseAdmin
        .from("rendezvous_profiles")
        .update({ is_enabled: false })
        .eq("user_id", report.reported_id);

      // Update report status
      await supabaseAdmin
        .from("rendezvous_reports")
        .update({ status: "banned", resolved_by: auth.user.id, resolved_at: now })
        .eq("id", reportId);
    } else {
      const newStatus = action === "resolve" ? "resolved" : "dismissed";
      const { error } = await supabaseAdmin
        .from("rendezvous_reports")
        .update({ status: newStatus, resolved_by: auth.user.id, resolved_at: now })
        .eq("id", reportId);

      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[admin/rendezvous/reports] PATCH error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
