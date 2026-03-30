// ============================================================
// Orbiter Delta Engine
// 「あなたの選び方がどう変わったか」を伝える
//
// 候補者の分析ではなく、ユーザー自身の判断パターンの変化を検出。
// "前回より迷いが減っている"
// "選ぶタイプが変わってきた"
// "判断が早くなった"
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrbiterDelta, DeltaItem, DeltaType } from "./types";

// ── Snapshot ──

export interface DeltaSnapshot {
  userId: string;
  decisionCount: number;
  avgDecisionTimeMs: number | null;
  likeRate: number;
  topPreferredAxes: string[];
  avgVisitCount: number;
  createdAt: string;
}

// ── Loading ──

export async function loadPreviousSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<DeltaSnapshot | null> {
  const { data } = await supabase
    .from("orbiter_delta_snapshots")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    userId: data.user_id,
    decisionCount: data.decision_count,
    avgDecisionTimeMs: data.avg_decision_time_ms != null
      ? Number(data.avg_decision_time_ms)
      : null,
    likeRate: Number(data.like_rate),
    topPreferredAxes: (data.top_preferred_axes ?? []) as string[],
    avgVisitCount: Number(data.avg_visit_count),
    createdAt: data.created_at,
  };
}

/**
 * 現在のスナップショットを保存する (fire-and-forget)
 */
export function persistSnapshot(
  supabase: SupabaseClient,
  snapshot: DeltaSnapshot,
): void {
  void (async () => {
    const { error } = await supabase.from("orbiter_delta_snapshots").insert({
      user_id: snapshot.userId,
      decision_count: snapshot.decisionCount,
      avg_decision_time_ms: snapshot.avgDecisionTimeMs,
      like_rate: snapshot.likeRate,
      top_preferred_axes: snapshot.topPreferredAxes,
      avg_visit_count: snapshot.avgVisitCount,
    });
    if (error) {
      console.error("[orbiter/delta] failed to persist snapshot:", error);
    }
  })();
}

// ── Delta Computation ──

/**
 * 前回のスナップショットと現在を比較し、ユーザーの変化を検出。
 * 初回 or データ不足: null
 */
export function computeDelta(
  current: DeltaSnapshot,
  previous: DeltaSnapshot | null,
): OrbiterDelta | null {
  if (!previous) return null;
  if (current.decisionCount < 3 || previous.decisionCount < 3) return null;

  const items: DeltaItem[] = [];

  // ── 1. Decision Speed Change ──
  if (
    current.avgDecisionTimeMs != null &&
    previous.avgDecisionTimeMs != null &&
    previous.avgDecisionTimeMs > 0
  ) {
    const ratio = current.avgDecisionTimeMs / previous.avgDecisionTimeMs;
    if (ratio < 0.7) {
      items.push({
        type: "decision_speed_change",
        description: "迷いが減っている。判断が早くなった。",
        magnitude: Math.min(1, (1 - ratio) * 2),
      });
    } else if (ratio > 1.4) {
      items.push({
        type: "decision_speed_change",
        description: "以前より慎重に判断している。",
        magnitude: Math.min(1, (ratio - 1) * 1.5),
      });
    }
  }

  // ── 2. Preference Shift ──
  const prevAxes = new Set(previous.topPreferredAxes);
  const currAxes = new Set(current.topPreferredAxes);
  const newAxes = current.topPreferredAxes.filter((a) => !prevAxes.has(a));
  const droppedAxes = previous.topPreferredAxes.filter((a) => !currAxes.has(a));

  if (newAxes.length >= 1 || droppedAxes.length >= 1) {
    items.push({
      type: "preference_shift",
      description: "惹かれるポイントが変わってきている。",
      magnitude: Math.min(1, (newAxes.length + droppedAxes.length) * 0.3),
    });
  }

  // ── 3. Visit Pattern Change ──
  const visitDiff = current.avgVisitCount - previous.avgVisitCount;
  if (Math.abs(visitDiff) > 0.5) {
    items.push({
      type: "visit_pattern_change",
      description: visitDiff > 0
        ? "以前よりじっくり見るようになった。"
        : "見極めが早くなった。",
      magnitude: Math.min(1, Math.abs(visitDiff) * 0.5),
    });
  }

  // ── 4. Confidence Change ──
  // like率が0.5に近づく = 選別眼がついた
  const prevBalance = Math.abs(previous.likeRate - 0.5);
  const currBalance = Math.abs(current.likeRate - 0.5);
  const balanceDiff = prevBalance - currBalance; // positive = improvement

  if (Math.abs(balanceDiff) > 0.1) {
    items.push({
      type: "confidence_change",
      description: balanceDiff > 0
        ? "判断にバランスが出てきた。"
        : "好みがはっきりしてきた。",
      magnitude: Math.min(1, Math.abs(balanceDiff) * 3),
    });
  }

  if (items.length === 0) {
    return {
      items: [],
      overallDirection: "stable",
      narrative: "選び方は安定している。",
    };
  }

  // ── Overall Direction ──
  const hasSpeedImprovement = items.some(
    (i) => i.type === "decision_speed_change" && i.description.includes("減っている"),
  );
  const hasConfidenceImprovement = items.some(
    (i) => i.type === "confidence_change" && i.description.includes("バランス"),
  );
  const hasPrefShift = items.some((i) => i.type === "preference_shift");

  let overallDirection: OrbiterDelta["overallDirection"];
  if (hasSpeedImprovement || hasConfidenceImprovement) {
    overallDirection = "growing";
  } else if (hasPrefShift) {
    overallDirection = "shifting";
  } else {
    overallDirection = "stable";
  }

  // ── Narrative ──
  const topItem = items.sort((a, b) => b.magnitude - a.magnitude)[0];
  const narrative = topItem.description;

  return { items, overallDirection, narrative };
}

// ── Build Current Snapshot from JudgmentProfile ──

export function buildCurrentSnapshot(
  userId: string,
  profile: {
    totalDecisions: number;
    avgDecisionTimeMs: number | null;
    likeRate: number;
    patterns: { type: string; relatedAxes?: string[] }[];
  },
  avgVisitCount: number,
): DeltaSnapshot {
  // Extract top preferred axes from consistent_preference patterns
  const topAxes = profile.patterns
    .filter((p) => p.type === "consistent_preference")
    .flatMap((p) => p.relatedAxes ?? [])
    .slice(0, 5);

  return {
    userId,
    decisionCount: profile.totalDecisions,
    avgDecisionTimeMs: profile.avgDecisionTimeMs,
    likeRate: profile.likeRate,
    topPreferredAxes: topAxes,
    avgVisitCount,
    createdAt: new Date().toISOString(),
  };
}
