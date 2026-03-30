// ============================================================
// Orbiter Phase 2: Signal Accumulator
// シグナル蓄積・集計ユーティリティ
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { OrbiterSignalType, LikePassPayload } from "./types";

// ── Types ──

export interface LikeHistoryItem {
  candidateId: string;
  decision: "like" | "pass";
  timeToDecisionMs: number | null;
  counterpartAxisScores: Partial<Record<TraitAxisKey, number>>;
}

export interface SignalSummary {
  totalSignals: number;
  likeCount: number;
  passCount: number;
  revisitCount: number;
  avgViewDurationMs: number | null;
  avgTimeToDecisionMs: number | null;
}

// ── Functions ──

/**
 * ユーザーの like/pass 履歴を取得し、相手の軸スコアと結合して返す。
 * AttractionDiscovery エンジンが消費する。
 */
export async function loadLikeHistory(
  db: SupabaseClient,
  userId: string,
): Promise<LikeHistoryItem[]> {
  // orbiter_signals から like/pass シグナルを取得
  const { data: signals } = await db
    .from("orbiter_signals")
    .select("candidate_id, signal_type, payload")
    .eq("user_id", userId)
    .in("signal_type", ["like", "pass"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (!signals || signals.length === 0) return [];

  // 候補IDリストを取得
  const candidateIds = [...new Set(signals.map((s) => s.candidate_id))];

  // 各候補の相手ユーザーIDを取得
  const { data: candidates } = await db
    .from("rendezvous_candidates")
    .select("id, user_a, user_b")
    .in("id", candidateIds);

  if (!candidates) return [];

  // 相手ユーザーIDマップ
  const counterpartMap = new Map<string, string>();
  for (const c of candidates) {
    const counterpartId = c.user_a === userId ? c.user_b : c.user_a;
    counterpartMap.set(c.id, counterpartId);
  }

  // 相手の軸スコアを一括取得（各ユーザー最新）
  const counterpartIds = [...new Set(counterpartMap.values())];
  const counterpartScoresMap = new Map<
    string,
    Partial<Record<TraitAxisKey, number>>
  >();

  if (counterpartIds.length > 0) {
    const { data: axisRows } = await db
      .from("stargazer_axis_snapshots")
      .select("user_id, axis_id, score")
      .in("user_id", counterpartIds)
      .order("session_date", { ascending: false });

    if (axisRows) {
      for (const row of axisRows) {
        if (!counterpartScoresMap.has(row.user_id)) {
          counterpartScoresMap.set(row.user_id, {});
        }
        const map = counterpartScoresMap.get(row.user_id)!;
        if (!(row.axis_id in map)) {
          (map as Record<string, number>)[row.axis_id] = row.score;
        }
      }
    }
  }

  // 結合
  const items: LikeHistoryItem[] = [];
  for (const signal of signals) {
    const counterpartId = counterpartMap.get(signal.candidate_id);
    if (!counterpartId) continue;

    const payload = (signal.payload ?? {}) as LikePassPayload;
    items.push({
      candidateId: signal.candidate_id,
      decision: signal.signal_type === "like" ? "like" : "pass",
      timeToDecisionMs: payload.timeToDecisionMs ?? null,
      counterpartAxisScores:
        counterpartScoresMap.get(counterpartId) ?? {},
    });
  }

  return items;
}

/**
 * ユーザーのシグナル要約統計を取得。
 * Self State Report 等で使用。
 */
export async function loadSignalSummary(
  db: SupabaseClient,
  userId: string,
  sinceDays: number = 30,
): Promise<SignalSummary> {
  const since = new Date(
    Date.now() - sinceDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: signals } = await db
    .from("orbiter_signals")
    .select("signal_type, payload")
    .eq("user_id", userId)
    .gte("created_at", since);

  if (!signals || signals.length === 0) {
    return {
      totalSignals: 0,
      likeCount: 0,
      passCount: 0,
      revisitCount: 0,
      avgViewDurationMs: null,
      avgTimeToDecisionMs: null,
    };
  }

  let likeCount = 0;
  let passCount = 0;
  let revisitCount = 0;
  const viewDurations: number[] = [];
  const decisionTimes: number[] = [];

  for (const s of signals) {
    switch (s.signal_type as OrbiterSignalType) {
      case "like":
        likeCount++;
        if (s.payload?.timeToDecisionMs) decisionTimes.push(s.payload.timeToDecisionMs);
        break;
      case "pass":
        passCount++;
        if (s.payload?.timeToDecisionMs) decisionTimes.push(s.payload.timeToDecisionMs);
        break;
      case "revisit":
        revisitCount++;
        break;
      case "detail_view_end":
        if (s.payload?.durationMs) viewDurations.push(s.payload.durationMs);
        break;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return {
    totalSignals: signals.length,
    likeCount,
    passCount,
    revisitCount,
    avgViewDurationMs: avg(viewDurations),
    avgTimeToDecisionMs: avg(decisionTimes),
  };
}

/**
 * ユーザーの breakpoint_triggers を DB から読み込む。
 */
export async function loadBreakpointTriggers(
  db: SupabaseClient,
  userId: string,
) {
  const { data } = await db
    .from("orbiter_breakpoint_triggers")
    .select("caution_code, sensitivity, historical_outcome, sample_count")
    .eq("user_id", userId);

  if (!data) return [];

  return data.map((row) => ({
    cautionCode: row.caution_code,
    sensitivityScore: Number(row.sensitivity),
    historicalOutcome: row.historical_outcome as
      | "pass"
      | "like_then_stale"
      | "like_successful"
      | "unknown",
    sampleCount: row.sample_count,
  }));
}
