import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ============================================================
// Honest Exit Rate — 撤退判断の透明性指標
//
// 設計根拠（Part 2 §7.3 + §7.5）:
//   「Counselorが『進めない方がいい』と判断し、
//    ユーザーが納得して撤退した割合」
//
//   これは既存相談所が絶対に出せない指標。
//   「成婚バイアス」との決定的な差であり、
//   ユーザーへの「あなたの利益を最優先にしている」というメッセージ。
//
// 計算:
//   Honest Exit Rate = honest_exits / total_disconnects
//
//   honest_exit の条件:
//   1. Counselor が事前に「この関係は進まない可能性が高い」と
//      シグナルを出していた（温度差 significant/critical、
//      またはネガティブ feedback の蓄積）
//   2. ユーザーが切断を選択した（Counselorが強制していない）
//   3. 切断理由が安全に分類される（felt_unsafe / values_gap / depth_mismatch 等）
//
// 表示:
//   ダッシュボードで公開指標として表示。
//   「Aneurasync の○○%の切断は、AIカウンセラーの
//    事前判断に基づく健全な撤退です」
// ============================================================

// ── 型定義 ──

export type HonestExitMetrics = {
  /** 全切断数 */
  totalDisconnects: number;
  /** Counselor判断に基づく健全な撤退数 */
  honestExits: number;
  /** Honest Exit Rate（0-1） */
  rate: number;
  /** 表示用パーセンテージ */
  ratePercent: number;
  /** 算出期間 */
  periodDays: number;
  /** ユーザーの個別指標（ログインユーザー用） */
  userMetrics: {
    totalDisconnects: number;
    honestExits: number;
    rate: number;
  } | null;
};

// 健全な撤退理由（Counselorが推奨する撤退の指標）
const HEALTHY_EXIT_REASONS = new Set([
  "rhythm_mismatch",
  "depth_mismatch",
  "values_gap",
  "not_ready",
  "felt_unsafe",
]);

// ── 公開API ──

/**
 * Honest Exit Rate を算出する。
 * プラットフォーム全体 + 特定ユーザーの指標を返す。
 */
export async function computeHonestExitRate(params: {
  userId?: string;
  periodDays?: number;
}): Promise<HonestExitMetrics> {
  const { userId, periodDays = 90 } = params;
  const cutoff = new Date(
    Date.now() - periodDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // プラットフォーム全体の切断数
  const { count: totalCount } = await supabaseAdmin
    .from("rendezvous_candidate_logs")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "disconnected")
    .gte("created_at", cutoff);

  const totalDisconnects = totalCount ?? 0;

  // 健全な撤退数（Counselor分析が付いている + 健全な理由）
  const { data: disconnectLogs } = await supabaseAdmin
    .from("rendezvous_candidate_logs")
    .select("payload")
    .eq("event_type", "disconnected")
    .gte("created_at", cutoff);

  let honestExits = 0;
  for (const log of (disconnectLogs ?? [])) {
    const payload = log.payload as Record<string, unknown> | null;
    if (!payload) continue;

    const reasonCode = payload.reason_code as string | undefined;
    const hasAnalysis = !!payload.analysis_id;

    // Honest Exit の条件:
    // 1. Counselor分析（disconnect analysis）が付いている
    // 2. 切断理由が健全なカテゴリに該当する
    if (hasAnalysis && reasonCode && HEALTHY_EXIT_REASONS.has(reasonCode)) {
      honestExits++;
    }
  }

  const rate = totalDisconnects > 0 ? honestExits / totalDisconnects : 0;

  // ユーザー個別指標
  let userMetrics: HonestExitMetrics["userMetrics"] = null;
  if (userId) {
    const { data: userLogs } = await supabaseAdmin
      .from("rendezvous_candidate_logs")
      .select("payload")
      .eq("event_type", "disconnected")
      .gte("created_at", cutoff)
      .filter("payload->>user_id", "eq", userId);

    const userTotal = (userLogs ?? []).length;
    let userHonest = 0;
    for (const log of (userLogs ?? [])) {
      const payload = log.payload as Record<string, unknown> | null;
      if (!payload) continue;
      const reasonCode = payload.reason_code as string | undefined;
      const hasAnalysis = !!payload.analysis_id;
      if (hasAnalysis && reasonCode && HEALTHY_EXIT_REASONS.has(reasonCode)) {
        userHonest++;
      }
    }

    userMetrics = {
      totalDisconnects: userTotal,
      honestExits: userHonest,
      rate: userTotal > 0 ? userHonest / userTotal : 0,
    };
  }

  return {
    totalDisconnects,
    honestExits,
    rate,
    ratePercent: Math.round(rate * 100),
    periodDays,
    userMetrics,
  };
}
