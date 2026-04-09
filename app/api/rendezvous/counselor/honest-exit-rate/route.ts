import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { computeHonestExitRate } from "@/lib/rendezvous/counselor/honestExitRate";

/**
 * GET /api/rendezvous/counselor/honest-exit-rate
 *
 * Honest Exit Rate を取得する。
 * プラットフォーム全体 + ログインユーザーの個別指標を返す。
 *
 * クエリパラメータ:
 *   periodDays — 算出期間（デフォルト: 90日）
 */
export async function GET(request: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const url = new URL(request.url);
    const periodDays = parseInt(url.searchParams.get("periodDays") ?? "90", 10);

    const metrics = await computeHonestExitRate({
      userId: user?.id,
      periodDays: Math.max(7, Math.min(365, periodDays)),
    });

    // 公開定義の透明化（設計書 Part 2 §7.3）
    const definition = {
      name: "Honest Exit Rate",
      description:
        "AIカウンセラーの事前判断に基づき、ユーザーが納得して撤退した割合。成婚バイアスのない信頼性指標。",
      formula: "honest_exits / total_disconnects",
      denominator: "指定期間内の全切断数（event_type = 'disconnected'）",
      numerator:
        "Counselor分析（disconnect analysis）が付いており、かつ健全な撤退理由に該当する切断数",
      period: `直近${metrics.periodDays}日間`,
      includedReasonCodes: [
        "rhythm_mismatch",
        "depth_mismatch",
        "values_gap",
        "not_ready",
        "felt_unsafe",
      ],
      excludedReasonCodes: [
        "other_connection",
        "no_spark",
        "communication_gap",
        "other",
      ],
    };

    return NextResponse.json({ metrics, definition });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[honest-exit-rate] GET error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
