import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/auth/isAdmin";

/**
 * GET /api/admin/rendezvous/metrics
 * 管理者向けRendezvousファネルメトリクス
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user || !isAdminEmail(auth.user.email)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // ── 既存ファネルメトリクス ──
    const [
      totalProfiles,
      activeProfiles,
      totalEncounters7d,
      totalCandidates7d,
      mutualLikes7d,
      chatsOpened7d,
      totalMessages30d,
      pendingStories,
      totalReferrals,
    ] = await Promise.all([
      supabaseAdmin.from("rendezvous_profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("rendezvous_profiles").select("id", { count: "exact", head: true }).eq("is_enabled", true),
      supabaseAdmin.from("encounter_events").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
      supabaseAdmin.from("rendezvous_candidates").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
      supabaseAdmin.from("rendezvous_candidates").select("id", { count: "exact", head: true }).eq("state", "mutual_liked").gte("updated_at", sevenDaysAgo),
      supabaseAdmin.from("rendezvous_candidates").select("id", { count: "exact", head: true }).eq("state", "chat_opened").gte("updated_at", sevenDaysAgo),
      supabaseAdmin.from("rendezvous_messages").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
      supabaseAdmin.from("rendezvous_success_stories").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("rendezvous_referrals").select("id", { count: "exact", head: true }).eq("status", "claimed"),
    ]);

    // ── Partner 本人確認メトリクス ──
    const [
      // verification_level 分布
      levelL0, levelL1, levelL2, levelL3, levelL4,
      // review_status 分布
      reviewNotSubmitted, reviewPending, reviewApproved, reviewRejected,
      // 凍結
      frozenCount,
      // Partner カテゴリのファネル
      partnerCandidates7d,
      partnerLikes7d,
      partnerMutual7d,
      partnerChats7d,
      // 監査ログ（30日）
      auditSubmit30d, auditApprove30d, auditReject30d, auditFreeze30d,
    ] = await Promise.all([
      // Level 分布
      supabaseAdmin.from("rendezvous_profiles").select("id", { count: "exact", head: true }).eq("verification_level", 0),
      supabaseAdmin.from("rendezvous_profiles").select("id", { count: "exact", head: true }).eq("verification_level", 1),
      supabaseAdmin.from("rendezvous_profiles").select("id", { count: "exact", head: true }).eq("verification_level", 2),
      supabaseAdmin.from("rendezvous_profiles").select("id", { count: "exact", head: true }).eq("verification_level", 3),
      supabaseAdmin.from("rendezvous_profiles").select("id", { count: "exact", head: true }).eq("verification_level", 4),
      // review_status 分布
      supabaseAdmin.from("rendezvous_profiles").select("id", { count: "exact", head: true }).eq("review_status", "not_submitted"),
      supabaseAdmin.from("rendezvous_profiles").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
      supabaseAdmin.from("rendezvous_profiles").select("id", { count: "exact", head: true }).eq("review_status", "approved"),
      supabaseAdmin.from("rendezvous_profiles").select("id", { count: "exact", head: true }).eq("review_status", "rejected"),
      // 凍結中
      supabaseAdmin.from("rendezvous_profiles").select("id", { count: "exact", head: true }).not("frozen_at", "is", null),
      // Partner ファネル（7日）
      supabaseAdmin.from("rendezvous_candidates").select("id", { count: "exact", head: true }).eq("category", "partner").gte("created_at", sevenDaysAgo),
      supabaseAdmin.from("rendezvous_candidates").select("id", { count: "exact", head: true }).eq("category", "partner").in("state", ["a_liked", "b_liked", "mutual_liked", "chat_opened"]).gte("updated_at", sevenDaysAgo),
      supabaseAdmin.from("rendezvous_candidates").select("id", { count: "exact", head: true }).eq("category", "partner").eq("state", "mutual_liked").gte("updated_at", sevenDaysAgo),
      supabaseAdmin.from("rendezvous_candidates").select("id", { count: "exact", head: true }).eq("category", "partner").eq("state", "chat_opened").gte("updated_at", sevenDaysAgo),
      // 監査ログ（30日）
      supabaseAdmin.from("verification_audit_logs").select("id", { count: "exact", head: true }).eq("action", "submit").gte("created_at", thirtyDaysAgo),
      supabaseAdmin.from("verification_audit_logs").select("id", { count: "exact", head: true }).eq("action", "approve").gte("created_at", thirtyDaysAgo),
      supabaseAdmin.from("verification_audit_logs").select("id", { count: "exact", head: true }).eq("action", "reject").gte("created_at", thirtyDaysAgo),
      supabaseAdmin.from("verification_audit_logs").select("id", { count: "exact", head: true }).eq("action", "freeze").gte("created_at", thirtyDaysAgo),
    ]);

    // ── 3枠イベント計測（rendezvous_analytics テーブル）──
    const lanes = ["romance", "connection", "partner"] as const;
    const analyticsEvents = [
      "rendezvous_hub_view",
      "rendezvous_lane_click",
      "rendezvous_list_view",
      "rendezvous_candidate_open",
      "rendezvous_candidate_like",
      "rendezvous_candidate_pass",
      "rendezvous_mutual",
      "rendezvous_chat_start",
      "romance_gate_view",
      "romance_gate_pass",
      "romance_swipe",
      "connection_submode_switch",
      "partner_onboarding_start",
      "partner_lifeplan_save",
      "partner_verification_gate_block",
      "rendezvous_dropout",
    ];

    // Per-lane event counts (7d)
    const laneAnalyticsPromises = lanes.map(async (lane) => {
      const { data } = await supabaseAdmin
        .from("rendezvous_analytics")
        .select("event")
        .eq("lane", lane)
        .gte("created_at", sevenDaysAgo);

      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.event] = (counts[row.event] ?? 0) + 1;
      }
      return { lane, counts };
    });

    // Hub-level (no lane) events
    const hubAnalyticsPromise = supabaseAdmin
      .from("rendezvous_analytics")
      .select("event")
      .is("lane", null)
      .gte("created_at", sevenDaysAgo);

    // Connection submode breakdown (7d)
    const submodeAnalyticsPromise = supabaseAdmin
      .from("rendezvous_analytics")
      .select("event, submode")
      .eq("lane", "connection")
      .not("submode", "is", null)
      .gte("created_at", sevenDaysAgo);

    // Unique users per lane (7d)
    const uniqueUsersPromises = lanes.map(async (lane) => {
      const { data } = await supabaseAdmin
        .from("rendezvous_analytics")
        .select("user_id")
        .eq("lane", lane)
        .gte("created_at", sevenDaysAgo);

      const uniqueUsers = new Set((data ?? []).map((r) => r.user_id));
      return { lane, uniqueUsers: uniqueUsers.size };
    });

    const [laneAnalyticsResults, hubResult, submodeResult, ...uniqueUsersResults] = await Promise.all([
      Promise.all(laneAnalyticsPromises),
      hubAnalyticsPromise,
      submodeAnalyticsPromise,
      ...uniqueUsersPromises,
    ]);

    // Build lane analytics summary
    const laneAnalytics: Record<string, Record<string, number>> = {};
    for (const { lane, counts } of laneAnalyticsResults as Array<{ lane: string; counts: Record<string, number> }>) {
      laneAnalytics[lane] = counts;
    }

    // Hub events
    const hubCounts: Record<string, number> = {};
    for (const row of hubResult.data ?? []) {
      hubCounts[row.event] = (hubCounts[row.event] ?? 0) + 1;
    }

    // Submode breakdown
    const submodeBreakdown: Record<string, Record<string, number>> = {};
    for (const row of (submodeResult.data ?? []) as Array<{ event: string; submode: string }>) {
      if (!submodeBreakdown[row.submode]) submodeBreakdown[row.submode] = {};
      submodeBreakdown[row.submode][row.event] = (submodeBreakdown[row.submode][row.event] ?? 0) + 1;
    }

    // Unique users
    const uniqueUsersByLane: Record<string, number> = {};
    for (const { lane, uniqueUsers } of uniqueUsersResults as Array<{ lane: string; uniqueUsers: number }>) {
      uniqueUsersByLane[lane] = uniqueUsers;
    }

    // 算出メトリクス
    const totalSubmissions30d = (auditSubmit30d.count ?? 0);
    const totalApprovals30d = (auditApprove30d.count ?? 0);
    const totalRejections30d = (auditReject30d.count ?? 0);
    const l2ToL3Rate = (levelL2.count ?? 0) + (levelL3.count ?? 0) + (levelL4.count ?? 0) > 0
      ? ((levelL3.count ?? 0) + (levelL4.count ?? 0)) / ((levelL2.count ?? 0) + (levelL3.count ?? 0) + (levelL4.count ?? 0))
      : null;
    const verificationDropoutRate = totalSubmissions30d > 0
      ? 1 - (totalApprovals30d + totalRejections30d) / totalSubmissions30d
      : null;
    const rejectionRate = totalSubmissions30d > 0
      ? totalRejections30d / totalSubmissions30d
      : null;
    const freezeRate = (totalProfiles.count ?? 0) > 0
      ? (frozenCount.count ?? 0) / (totalProfiles.count ?? 0)
      : null;

    return NextResponse.json({
      ok: true,
      metrics: {
        // 既存
        totalProfiles: totalProfiles.count ?? 0,
        activeProfiles: activeProfiles.count ?? 0,
        encounters7d: totalEncounters7d.count ?? 0,
        candidates7d: totalCandidates7d.count ?? 0,
        mutualLikes7d: mutualLikes7d.count ?? 0,
        chatsOpened7d: chatsOpened7d.count ?? 0,
        messages30d: totalMessages30d.count ?? 0,
        pendingStories: pendingStories.count ?? 0,
        totalReferrals: totalReferrals.count ?? 0,
      },
      // Partner 本人確認メトリクス
      verification: {
        levelDistribution: {
          L0: levelL0.count ?? 0,
          L1: levelL1.count ?? 0,
          L2: levelL2.count ?? 0,
          L3: levelL3.count ?? 0,
          L4: levelL4.count ?? 0,
        },
        reviewStatus: {
          notSubmitted: reviewNotSubmitted.count ?? 0,
          pending: reviewPending.count ?? 0,
          approved: reviewApproved.count ?? 0,
          rejected: reviewRejected.count ?? 0,
        },
        frozen: frozenCount.count ?? 0,
        // 算出レート
        l2ToL3MigrationRate: l2ToL3Rate,        // L2以上のうちL3+に到達した割合
        verificationDropoutRate: verificationDropoutRate, // 提出後、審査完了に至らなかった割合
        rejectionRate: rejectionRate,             // 提出のうち却下された割合
        freezeRate: freezeRate,                   // 全プロフィールのうち凍結中の割合
        // 30日の絶対数
        submissions30d: totalSubmissions30d,
        approvals30d: totalApprovals30d,
        rejections30d: totalRejections30d,
        freezes30d: auditFreeze30d.count ?? 0,
      },
      // Partner ファネル（7日）
      partnerFunnel7d: {
        candidates: partnerCandidates7d.count ?? 0,
        likes: partnerLikes7d.count ?? 0,
        mutualLikes: partnerMutual7d.count ?? 0,
        chatsOpened: partnerChats7d.count ?? 0,
      },
      // ── 3枠イベント計測（7日）──
      analytics7d: {
        hub: hubCounts,
        perLane: laneAnalytics,
        uniqueUsersByLane,
        connectionSubmodes: submodeBreakdown,
        // 算出ファネル指標
        funnelRates: {
          romance: {
            gatePassRate: (laneAnalytics.romance?.romance_gate_pass ?? 0) /
              Math.max(1, laneAnalytics.romance?.romance_gate_view ?? 1),
            likeRate: (laneAnalytics.romance?.rendezvous_candidate_like ?? 0) /
              Math.max(1, laneAnalytics.romance?.romance_swipe ?? 1),
          },
          connection: {
            detailReachRate: (laneAnalytics.connection?.rendezvous_candidate_open ?? 0) /
              Math.max(1, laneAnalytics.connection?.rendezvous_list_view ?? 1),
          },
          partner: {
            onboardingRate: (laneAnalytics.partner?.partner_onboarding_start ?? 0) /
              Math.max(1, laneAnalytics.partner?.rendezvous_list_view ?? 1),
            lifePlanSaveRate: (laneAnalytics.partner?.partner_lifeplan_save ?? 0) /
              Math.max(1, laneAnalytics.partner?.partner_onboarding_start ?? 1),
          },
        },
      },
    });
  } catch (err: any) {
    console.error("[admin/rendezvous/metrics] error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
