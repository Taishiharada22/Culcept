import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getCounterpartId,
  normalizeUserPair,
  verifyCandidateBelongsToUser,
} from "@/lib/rendezvous/helpers";
import type { ReportReasonCode } from "@/lib/rendezvous/types";

const VALID_REASON_CODES: ReportReasonCode[] = [
  "unsafe_behavior",
  "harassment",
  "impersonation",
  "spam",
  "sexual_misconduct",
  "hate_or_abuse",
  "other",
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    // Auth via supabaseServer (user-scoped)
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const { candidateId } = await params;
    const userId = auth.user.id;
    const body = await request.json();

    const reasonCode = body.reasonCode as ReportReasonCode;
    const detail = (body.detail as string) ?? null;

    if (!reasonCode || !VALID_REASON_CODES.includes(reasonCode)) {
      return NextResponse.json(
        { ok: false, error: "Invalid or missing reasonCode" },
        { status: 400 },
      );
    }

    // Use supabaseAdmin for all DB operations (suppression inserts, report inserts bypass RLS)
    const result = await verifyCandidateBelongsToUser(
      supabaseAdmin,
      candidateId,
      userId,
    );

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Candidate not found" },
        { status: 404 },
      );
    }

    const { candidate } = result;
    const counterpartId = getCounterpartId(candidate, userId);

    // Step 1: Create report record
    const { error: reportErr } = await supabaseAdmin
      .from("rendezvous_reports")
      .insert({
        reporter_user_id: userId,
        target_user_id: counterpartId,
        candidate_id: candidateId,
        reason_code: reasonCode,
        detail,
      });

    if (reportErr)
      return NextResponse.json(
        { ok: false, error: reportErr.message },
        { status: 500 },
      );

    // Step 2: Create report_review_hold suppression - requires admin (no RLS insert policy)
    const [userLow, userHigh] = normalizeUserPair(userId, counterpartId);

    const { error: suppressErr } = await supabaseAdmin
      .from("rendezvous_suppressions")
      .insert({
        user_low: userLow,
        user_high: userHigh,
        suppression_type: "report_review_hold",
        until_at: null, // until admin reviews
        reason_code: reasonCode,
      });

    if (suppressErr) {
      console.error(
        "[rendezvous/report] failed to create suppression:",
        suppressErr,
      );
    }

    // Log the event
    await supabaseAdmin.from("rendezvous_candidate_logs").insert({
      candidate_id: candidateId,
      event_type: "reported",
      payload: {
        reporter: userId,
        target: counterpartId,
        reason_code: reasonCode,
      },
    });

    // Step 3: エスカレーションエンジン — 通報累積でレベル自動判定
    try {
      const { processReport } = await import("@/lib/rendezvous/escalationEngine");

      // 対象ユーザーの過去通報件数を取得
      const { count: reportCount } = await supabaseAdmin
        .from("rendezvous_reports")
        .select("id", { count: "exact", head: true })
        .eq("target_user_id", counterpartId);

      const totalReports = (reportCount ?? 0) + 1;
      const escalation = processReport(
        {
          userId: counterpartId,
          reportCount: totalReports,
          uniqueReporterCount: totalReports, // 簡易推定（正確にはdistinct countが必要）
          mostSevereReason: reasonCode,
          currentLevel: 0,
          isPaused: false,
          isDisabled: false,
        },
        reasonCode,
      );

      // エスカレーションアクションに応じた処理
      if (escalation.action === "log") {
        // レベル0: モニタリングのみ、safety_flagは立てない
        await supabaseAdmin
          .from("rendezvous_profiles")
          .update({ safety_flag: true, safety_flag_at: new Date().toISOString() })
          .eq("user_id", counterpartId);
      } else if (escalation.action === "pause" || escalation.action === "immediate_pause") {
        // レベル1-2: 一時停止
        await supabaseAdmin
          .from("rendezvous_profiles")
          .update({ is_paused: true, safety_flag: true, safety_flag_at: new Date().toISOString() })
          .eq("user_id", counterpartId);
      } else if (escalation.action === "disable") {
        // レベル3: 完全無効化 + 全候補ブロック
        await supabaseAdmin
          .from("rendezvous_profiles")
          .update({ is_enabled: false, is_paused: true, safety_flag: true, safety_flag_at: new Date().toISOString() })
          .eq("user_id", counterpartId);
        await supabaseAdmin
          .from("rendezvous_candidates")
          .update({ status: "blocked", blocked_by: "system", blocked_reason: "escalation_disable" })
          .or(`user_a.eq.${counterpartId},user_b.eq.${counterpartId}`)
          .not("status", "in", "(expired,dismissed,blocked)");
      }

      // エスカレーション記録
      await supabaseAdmin.from("orbiter_signals").insert({
        user_id: counterpartId,
        signal_type: `escalation_${escalation.action}`,
        payload: { reportCount: totalReports, reasonCode, escalation },
      });
    } catch (escalationErr) {
      console.error("[rendezvous/report] escalation error:", escalationErr);
      // エスカレーション失敗は通報成功に影響させない
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[rendezvous/report] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
