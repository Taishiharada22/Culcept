import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { V4Feature } from "@/lib/stargazer/depthPhaseController";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type StargazerEvent =
  | "feature_view" // ユーザーが機能ページを開いた
  | "feature_interact" // ユーザーがアクション実行（天気送信、神託依頼等）
  | "prophecy_verify" // 予言を検証した
  | "alter_turn" // Alter 対話ターン完了
  | "whisper_shown" // Shadow Whisper が表示された
  | "whisper_clicked" // ユーザーが「話す？」をクリック
  | "phase_advance" // 深度フェーズが進んだ
  | "session_complete" // デイリー観測セッション完了
  // ── my-style events ──
  | "mystyle_onboarding_start"
  | "mystyle_onboarding_photo_taken"
  | "mystyle_onboarding_item_confirmed"
  | "mystyle_onboarding_complete"
  | "mystyle_today_view"
  | "mystyle_proposal_shown"
  | "mystyle_proposal_accepted"
  | "mystyle_proposal_rejected"
  | "mystyle_satisfaction_recorded"
  | "mystyle_mood_selected"
  | "mystyle_item_added"
  | "mystyle_closet_view"
  | "mystyle_self_view"
  | "mystyle_weekly_insight_shown"
  | "mystyle_gap_shown"
  | "mystyle_rendezvous_bridge"
  | "mystyle_photo_ai_correction"
  | "mystyle_failure";

export interface StargazerAnalyticsEvent {
  userId: string;
  event: StargazerEvent;
  feature?: V4Feature | string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface FeatureEngagement {
  feature: string;
  viewCount: number;
  interactCount: number;
  lastUsed: string | null;
}

export interface RetentionMetrics {
  dau: number;
  wau: number;
  mau: number;
  period: { start: string; end: string };
}

export interface FeaturePopularity {
  feature: string;
  totalEvents: number;
  uniqueUsers: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// trackStargazerEvent — イベントを stargazer_analytics に保存
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function trackStargazerEvent(
  event: StargazerAnalyticsEvent,
): Promise<boolean> {
  try {
    const supabase = await supabaseServer();
    const { error } = await supabase.from("stargazer_analytics").insert({
      user_id: event.userId,
      event: event.event,
      feature: event.feature ?? null,
      metadata: event.metadata ?? {},
      created_at: event.timestamp,
    });

    if (error) {
      console.warn("[stargazer/analytics] insert failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[stargazer/analytics] unexpected error:", err);
    return false;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// getFeatureEngagement — ユーザーごとの機能利用統計
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function getFeatureEngagement(
  userId: string,
  days: number = 30,
): Promise<FeatureEngagement[]> {
  try {
    const supabase = await supabaseServer();
    const since = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data, error } = await supabase
      .from("stargazer_analytics")
      .select("event, feature, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .not("feature", "is", null)
      .order("created_at", { ascending: false });

    if (error || !data) {
      console.warn("[stargazer/analytics] engagement query failed:", error?.message);
      return [];
    }

    // Aggregate by feature
    const map = new Map<
      string,
      { views: number; interactions: number; lastUsed: string | null }
    >();

    for (const row of data) {
      const f = row.feature as string;
      const existing = map.get(f) ?? { views: 0, interactions: 0, lastUsed: null };

      if (row.event === "feature_view") {
        existing.views++;
      } else {
        existing.interactions++;
      }

      if (
        !existing.lastUsed ||
        row.created_at > existing.lastUsed
      ) {
        existing.lastUsed = row.created_at;
      }

      map.set(f, existing);
    }

    return Array.from(map.entries()).map(([feature, stats]) => ({
      feature,
      viewCount: stats.views,
      interactCount: stats.interactions,
      lastUsed: stats.lastUsed,
    }));
  } catch (err) {
    console.warn("[stargazer/analytics] engagement error:", err);
    return [];
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// getRetentionMetrics — DAU/WAU/MAU
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function getRetentionMetrics(
  days: number = 30,
): Promise<RetentionMetrics> {
  try {
    const now = new Date();
    const endStr = now.toISOString();

    // DAU: unique users in last 24h
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    // WAU: unique users in last 7 days
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // MAU: unique users in last `days` days
    const monthAgo = new Date(
      now.getTime() - days * 24 * 60 * 60 * 1000,
    ).toISOString();

    // 全ユーザー集計のためservice_roleでRLSバイパス
    const { data, error } = await supabaseAdmin
      .from("stargazer_analytics")
      .select("user_id, created_at")
      .gte("created_at", monthAgo)
      .order("created_at", { ascending: false });

    if (error || !data) {
      console.warn("[stargazer/analytics] retention query failed:", error?.message);
      return { dau: 0, wau: 0, mau: 0, period: { start: monthAgo, end: endStr } };
    }

    const dauSet = new Set<string>();
    const wauSet = new Set<string>();
    const mauSet = new Set<string>();

    for (const row of data) {
      const uid = row.user_id as string;
      mauSet.add(uid);
      if (row.created_at >= weekAgo) wauSet.add(uid);
      if (row.created_at >= dayAgo) dauSet.add(uid);
    }

    return {
      dau: dauSet.size,
      wau: wauSet.size,
      mau: mauSet.size,
      period: { start: monthAgo, end: endStr },
    };
  } catch (err) {
    console.warn("[stargazer/analytics] retention error:", err);
    return {
      dau: 0,
      wau: 0,
      mau: 0,
      period: { start: "", end: "" },
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// getFeaturePopularity — 機能別人気ランキング
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function getFeaturePopularity(
  days: number = 30,
): Promise<FeaturePopularity[]> {
  try {
    const since = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString();

    // 全ユーザー集計のためservice_roleでRLSバイパス
    const { data, error } = await supabaseAdmin
      .from("stargazer_analytics")
      .select("feature, user_id")
      .gte("created_at", since)
      .not("feature", "is", null);

    if (error || !data) {
      console.warn("[stargazer/analytics] popularity query failed:", error?.message);
      return [];
    }

    const map = new Map<string, { total: number; users: Set<string> }>();

    for (const row of data) {
      const f = row.feature as string;
      const existing = map.get(f) ?? { total: 0, users: new Set<string>() };
      existing.total++;
      existing.users.add(row.user_id as string);
      map.set(f, existing);
    }

    return Array.from(map.entries())
      .map(([feature, stats]) => ({
        feature,
        totalEvents: stats.total,
        uniqueUsers: stats.users.size,
      }))
      .sort((a, b) => b.totalEvents - a.totalEvents);
  } catch (err) {
    console.warn("[stargazer/analytics] popularity error:", err);
    return [];
  }
}
