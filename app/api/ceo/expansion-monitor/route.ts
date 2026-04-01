// app/api/ceo/expansion-monitor/route.ts
// P4 運用確認: 拡張軸の出題率・軸偏り・解放率・日次軽さ・価値検証指標の監視 API
// CEO専用（isCeoEmail ガード）
//
// 価値検証指標（v2追加）:
//   - 回答完了率（served vs answered）
//   - 回答時間中央値（軸別）
//   - precision改善量（軸別・期間別）
//   - lightness p90/p95
//   - visible到達率推移（週次・軸別）
//   - 解放進捗の軸間偏り

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isCeoEmail } from "@/lib/auth/isCeo";
import {
  HEAVY_SESSION_THRESHOLD,
  AXIS_BIAS_RATIO_THRESHOLD,
  COMPLETION_RATE_HEALTHY,
  COMPLETION_RATE_CAUTION,
  RESPONSE_TIME_TOO_FAST_MS,
  RESPONSE_TIME_IDEAL_MAX_MS,
  RESPONSE_TIME_P90_HEAVY_MS,
  LIGHTNESS_P90_TARGET,
  LIGHTNESS_P95_TARGET,
} from "@/lib/stargazer/expansionTuning";

export const dynamic = "force-dynamic";

const EXPANSION_AXES = [
  "energy_rhythm",
  "conflict_style",
  "novelty_threshold",
  "self_disclosure_depth",
  "decision_regret",
  "relational_investment",
] as const;

// ── helpers ──

function calcConfidence(precision: number): number {
  const cap = 0.45;
  const saturation = 15;
  return Math.min(cap, cap * (1 - Math.exp(-precision / saturation)));
}

function getTier(confidence: number): string {
  if (confidence < 0.15) return "hidden";
  if (confidence < 0.25) return "emerging";
  if (confidence < 0.35) return "forming";
  return "visible";
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return percentile(s, 50);
}

function round(v: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** ISO week string "2026-W14" */
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const jan4 = new Date(d.getUTCFullYear(), 0, 4);
  const dayDiff = (d.getTime() - jan4.getTime()) / 86_400_000;
  const weekNum = Math.ceil((dayDiff + jan4.getUTCDay() + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export async function GET() {
  // ── CEO認証 ──
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user || !isCeoEmail(auth.user.email)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  const db = supabaseAdmin;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000)
    .toISOString()
    .split("T")[0];

  try {
    // ── 並列データ取得 ──
    const [
      expansionSnapshotsRes,
      allSnapshotsRes,
      profilesWithBeliefsRes,
      dailyStatesRes,
    ] = await Promise.allSettled([
      // 拡張質問の snapshot (30日分)
      db
        .from("stargazer_axis_snapshots")
        .select("user_id, axis_id, score, variant_id, session_date, created_at")
        .like("variant_id", "exp_%")
        .gte("session_date", thirtyDaysAgo)
        .order("session_date", { ascending: false })
        .limit(5000),
      // 全 snapshot (30日分、軽さ計算用)
      db
        .from("stargazer_axis_snapshots")
        .select("user_id, session_date, variant_id")
        .gte("session_date", thirtyDaysAgo)
        .limit(50000),
      // axis_beliefs を持つプロファイル
      db
        .from("stargazer_profiles")
        .select("user_id, axis_beliefs")
        .not("axis_beliefs", "is", null),
      // daily_states の raw_answers (回答時間・完了率計算用)
      db
        .from("stargazer_daily_states")
        .select("user_id, observation_date, raw_answers")
        .gte("observation_date", thirtyDaysAgo)
        .order("observation_date", { ascending: false })
        .limit(10000),
    ]);

    const expansionSnapshots =
      expansionSnapshotsRes.status === "fulfilled"
        ? (expansionSnapshotsRes.value.data ?? [])
        : [];
    const allSnapshots =
      allSnapshotsRes.status === "fulfilled"
        ? (allSnapshotsRes.value.data ?? [])
        : [];
    const profilesWithBeliefs =
      profilesWithBeliefsRes.status === "fulfilled"
        ? (profilesWithBeliefsRes.value.data ?? [])
        : [];
    const dailyStates =
      dailyStatesRes.status === "fulfilled"
        ? (dailyStatesRes.value.data ?? [])
        : [];

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. 出題率（日別）+ 1日1問チェック
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const dailyServing: Record<
      string,
      { users: Set<string>; total: number; exceeding: number }
    > = {};
    const userDayCounts: Record<string, number> = {};

    for (const snap of expansionSnapshots) {
      const day = snap.session_date;
      if (!dailyServing[day]) {
        dailyServing[day] = { users: new Set(), total: 0, exceeding: 0 };
      }
      dailyServing[day].users.add(snap.user_id);
      dailyServing[day].total++;

      const key = `${snap.user_id}:${day}`;
      userDayCounts[key] = (userDayCounts[key] || 0) + 1;
    }

    for (const [key, count] of Object.entries(userDayCounts)) {
      if (count > 1) {
        const day = key.split(":")[1];
        if (dailyServing[day]) {
          dailyServing[day].exceeding++;
        }
      }
    }

    const servingRate = Object.entries(dailyServing)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 14)
      .map(([date, d]) => ({
        date,
        usersWithExpansion: d.users.size,
        totalSnapshots: d.total,
        usersExceeding1PerDay: d.exceeding,
      }));

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. 軸ごとの出題分布 + 回答時間
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const axisDistribution: Record<
      string,
      { count: number; users: Set<string>; scores: number[]; questions: Set<string>; responseTimes: number[] }
    > = {};
    for (const axisId of EXPANSION_AXES) {
      axisDistribution[axisId] = { count: 0, users: new Set(), scores: [], questions: new Set(), responseTimes: [] };
    }
    for (const snap of expansionSnapshots) {
      const d = axisDistribution[snap.axis_id];
      if (!d) continue;
      d.count++;
      d.users.add(snap.user_id);
      d.scores.push(Number(snap.score));
      d.questions.add(snap.variant_id);
    }

    // 回答時間 + 出題数(served count) を raw_answers から抽出
    // served = raw_answers に expansionAnswer が存在（出題された）
    // answered = axis_snapshots に exp_ が記録された（回答された）
    const axisServedCount: Record<string, number> = {};
    for (const axisId of EXPANSION_AXES) {
      axisServedCount[axisId] = 0;
    }

    for (const ds of dailyStates) {
      const raw = ds.raw_answers as {
        expansionAnswer?: { questionId?: string; responseTimeMs?: number; value?: number } | null;
      } | null;
      if (!raw?.expansionAnswer?.questionId) continue;
      const qId = raw.expansionAnswer.questionId;
      // questionId = "exp_{axisId}_{num}" → axisId を抽出
      const match = qId.match(/^exp_(.+)_\d+$/);
      if (!match) continue;
      const axisId = match[1];

      // served count（出題された回数）
      if (axisServedCount[axisId] !== undefined) {
        axisServedCount[axisId]++;
      }

      // 回答時間
      const d = axisDistribution[axisId];
      if (d && raw.expansionAnswer.responseTimeMs != null) {
        d.responseTimes.push(raw.expansionAnswer.responseTimeMs);
      }
    }

    const axisBreakdown = EXPANSION_AXES.map((axisId) => {
      const d = axisDistribution[axisId];
      const served = axisServedCount[axisId] ?? 0;
      const answered = d.count;
      const avg =
        d.scores.length > 0
          ? d.scores.reduce((a, b) => a + b, 0) / d.scores.length
          : null;
      const stddev =
        d.scores.length > 1
          ? Math.sqrt(
              d.scores.reduce((sum, s) => sum + (s - (avg ?? 0)) ** 2, 0) /
                (d.scores.length - 1),
            )
          : null;
      const sortedTimes = [...d.responseTimes].sort((a, b) => a - b);
      const medianMs = sortedTimes.length > 0 ? round(median(sortedTimes), 0) : null;
      const p90Ms = sortedTimes.length > 0 ? round(percentile(sortedTimes, 90), 0) : null;
      return {
        axisId,
        servedCount: served,
        answeredCount: answered,
        completionRatePct: served > 0 ? round((100 * answered) / served, 1) : null,
        uniqueUsers: d.users.size,
        avgScore: avg !== null ? round(avg, 3) : null,
        scoreStddev: stddev !== null ? round(stddev, 3) : null,
        uniqueQuestionsUsed: d.questions.size,
        responseTimeMedianMs: medianMs,
        responseTimeP90Ms: p90Ms,
      };
    });

    const askedCounts = axisBreakdown.map((a) => a.answeredCount).filter((c) => c > 0);
    const maxAsked = Math.max(...askedCounts, 1);
    const minAsked = Math.min(...askedCounts, 0);
    const biasAlert =
      askedCounts.length > 1 && minAsked > 0 && maxAsked / minAsked > AXIS_BIAS_RATIO_THRESHOLD
        ? `配信偏り: 最多${maxAsked}回 vs 最少${minAsked}回 (${(maxAsked / minAsked).toFixed(1)}倍)`
        : null;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3. 回答完了率
    //    served = raw_answers に expansionAnswer のキーが存在するセッション数
    //    answered = axis_snapshots に exp_ が記録されたセッション数
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let servedCount = 0;
    const answeredUserDays = new Set(
      expansionSnapshots.map((s) => `${s.user_id}:${s.session_date}`),
    );

    for (const ds of dailyStates) {
      const raw = ds.raw_answers as {
        expansionAnswer?: { questionId?: string } | null;
      } | null;
      if (raw?.expansionAnswer?.questionId) {
        servedCount++;
      }
    }
    // answered = 出題済みかつ回答記録あり
    const answeredCount = answeredUserDays.size;
    const completionRate = servedCount > 0
      ? round((100 * answeredCount) / servedCount, 1)
      : null;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 4. 解放率（tier分布）+ precision 改善量
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const tierCounts: Record<
      string,
      { hidden: number; emerging: number; forming: number; visible: number; total: number; precisions: number[] }
    > = {};
    for (const axisId of EXPANSION_AXES) {
      tierCounts[axisId] = { hidden: 0, emerging: 0, forming: 0, visible: 0, total: 0, precisions: [] };
    }

    for (const profile of profilesWithBeliefs) {
      const beliefs = profile.axis_beliefs as Record<
        string,
        { mu: number; precision: number }
      > | null;
      if (!beliefs) continue;

      for (const axisId of EXPANSION_AXES) {
        const b = beliefs[axisId];
        if (!b) continue;
        const confidence = calcConfidence(b.precision);
        const tier = getTier(confidence);
        const tc = tierCounts[axisId];
        tc.total++;
        tc.precisions.push(b.precision);
        tc[tier as keyof Omit<typeof tc, "total" | "precisions">]++;
      }
    }

    const releaseRate = EXPANSION_AXES.map((axisId) => {
      const tc = tierCounts[axisId];
      const sortedPrec = [...tc.precisions].sort((a, b) => a - b);
      return {
        axisId,
        totalUsers: tc.total,
        hidden: tc.hidden,
        emerging: tc.emerging,
        forming: tc.forming,
        visible: tc.visible,
        releaseRatePct:
          tc.total > 0
            ? round((100 * (tc.total - tc.hidden)) / tc.total, 1)
            : 0,
        visibleRatePct:
          tc.total > 0
            ? round((100 * tc.visible) / tc.total, 1)
            : 0,
        precisionMedian: sortedPrec.length > 0 ? round(median(sortedPrec), 2) : null,
        precisionP75: sortedPrec.length > 0 ? round(percentile(sortedPrec, 75), 2) : null,
        precisionMax: sortedPrec.length > 0 ? round(sortedPrec[sortedPrec.length - 1], 2) : null,
      };
    });

    // 解放進捗の軸間偏り
    const visibleRates = releaseRate.map((r) => r.visibleRatePct).filter((r) => r > 0);
    const maxVisible = Math.max(...visibleRates, 0);
    const minVisible = Math.min(...visibleRates, 0);
    const releaseProgressBiasAlert =
      visibleRates.length > 1 && minVisible > 0 && maxVisible / minVisible > AXIS_BIAS_RATIO_THRESHOLD
        ? `解放進捗偏り: visible到達率 最高${maxVisible}% vs 最低${minVisible}% (${round(maxVisible / minVisible, 1)}倍)`
        : visibleRates.length > 1 && visibleRates.some((r) => r === 0) && visibleRates.some((r) => r > 0)
          ? `解放進捗偏り: visible到達軸とゼロ軸が混在`
          : null;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 5. visible到達率の週次推移
    //    expansion snapshot の session_date から週に区切り、
    //    その週までに visible に到達したユーザー数を累計
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 週ごと・軸ごとの precision 最大値を追跡
    const weeklyAxisPrecision: Record<string, Record<string, Map<string, number>>> = {};
    // user → axis → highest precision seen by that week

    for (const profile of profilesWithBeliefs) {
      const beliefs = profile.axis_beliefs as Record<
        string,
        { mu: number; precision: number }
      > | null;
      if (!beliefs) continue;

      for (const axisId of EXPANSION_AXES) {
        const b = beliefs[axisId];
        if (!b) continue;
        const confidence = calcConfidence(b.precision);
        const tier = getTier(confidence);
        // 現在のティアを最新週にマッピング
        const week = isoWeek(new Date().toISOString().split("T")[0]);
        if (!weeklyAxisPrecision[week]) weeklyAxisPrecision[week] = {};
        if (!weeklyAxisPrecision[week][axisId]) weeklyAxisPrecision[week][axisId] = new Map();
        weeklyAxisPrecision[week][axisId].set(profile.user_id, b.precision);
      }
    }

    // snapshot の日付から過去の週を追跡（expansion snapshot ベース）
    const weeklySnapshots: Record<string, Record<string, Set<string>>> = {};
    for (const snap of expansionSnapshots) {
      const week = isoWeek(snap.session_date);
      if (!weeklySnapshots[week]) weeklySnapshots[week] = {};
      if (!weeklySnapshots[week][snap.axis_id]) weeklySnapshots[week][snap.axis_id] = new Set();
      weeklySnapshots[week][snap.axis_id].add(snap.user_id);
    }

    // 簡易版: 現在の beliefs からティア分布を週単位で集計（現在のスナップショットのみ）
    // 完全な推移は snapshot 履歴が必要だが、現時点では current state で代用
    const visibleTrend = EXPANSION_AXES.map((axisId) => {
      const tc = tierCounts[axisId];
      const weeklyActivity = Object.entries(weeklySnapshots)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, axes]) => ({
          week,
          activeUsers: axes[axisId]?.size ?? 0,
        }));
      return {
        axisId,
        currentVisibleCount: tc.visible,
        currentVisibleRatePct: tc.total > 0 ? round((100 * tc.visible) / tc.total, 1) : 0,
        weeklyActivity,
      };
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 6. 日次観測の軽さ (avg + p90 + p95)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const sessionCounts: Record<string, { totalQ: number; expQ: number }[]> = {};
    const userSessionMap: Record<string, { total: number; exp: number }> = {};

    for (const snap of allSnapshots) {
      const key = `${snap.user_id}:${snap.session_date}`;
      if (!userSessionMap[key]) {
        userSessionMap[key] = { total: 0, exp: 0 };
      }
      userSessionMap[key].total++;
      if (snap.variant_id?.startsWith("exp_")) {
        userSessionMap[key].exp++;
      }
    }

    for (const [key, counts] of Object.entries(userSessionMap)) {
      const day = key.split(":")[1];
      if (!sessionCounts[day]) sessionCounts[day] = [];
      sessionCounts[day].push({ totalQ: counts.total, expQ: counts.exp });
    }

    const lightness = Object.entries(sessionCounts)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 14)
      .map(([date, sessions]) => {
        const totals = sessions.map((s) => s.totalQ);
        const sortedTotals = [...totals].sort((a, b) => a - b);
        const expTotals = sessions.map((s) => s.expQ);
        const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
        const expAvg = expTotals.reduce((a, b) => a + b, 0) / expTotals.length;
        return {
          date,
          activeSessions: sessions.length,
          avgQuestionsPerSession: round(avg, 1),
          p90QuestionsPerSession: round(percentile(sortedTotals, 90), 1),
          p95QuestionsPerSession: round(percentile(sortedTotals, 95), 1),
          avgExpansionPerSession: round(expAvg, 2),
          maxQuestionsInSession: Math.max(...totals),
          heavySessions: totals.filter((t) => t > HEAVY_SESSION_THRESHOLD).length,
        };
      });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 7. Core逆流チェック
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const coreLeaks = expansionSnapshots.filter(
      (s) => !EXPANSION_AXES.includes(s.axis_id as typeof EXPANSION_AXES[number]),
    );
    const coreIsolationOk = coreLeaks.length === 0;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 8. アラート生成（CEO基準 2026-04-01）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    type AlertCategory =
      | "safety"           // 安全: 1日1問超過、core逆流
      | "completion"       // 完了率
      | "response_time"    // 回答時間
      | "lightness"        // 日次の軽さ
      | "serving_bias"     // 配信偏り
      | "release_bias"     // 解放進捗偏り
      | "under_served"     // 育たない理由: そもそも出ていない
      | "low_growth"       // 育たない理由: 出ているが育っていない
      | "info";            // 情報
    const alerts: { level: "info" | "warning" | "critical"; category: AlertCategory; message: string }[] = [];

    // ── 安全アラート ──

    // 1日1問超過
    const totalExceeding = Object.values(dailyServing).reduce(
      (sum, d) => sum + d.exceeding,
      0,
    );
    if (totalExceeding > 0) {
      alerts.push({
        level: "critical", category: "safety",
        message: `1日1問超過: ${totalExceeding}件検出。混入ロジックにバグの可能性`,
      });
    }

    // Core逆流
    if (!coreIsolationOk) {
      alerts.push({
        level: "critical", category: "safety",
        message: `Core逆流検出: ${coreLeaks.length}件のexpansion回答がcore軸に記録`,
      });
    }

    // ── 回答完了率（CEO基準: >=80健全, 60-79注意, <60要修正） ──
    if (completionRate !== null) {
      if (completionRate < COMPLETION_RATE_CAUTION) {
        alerts.push({
          level: "critical", category: "completion",
          message: `回答完了率 要修正: ${completionRate}%（基準${COMPLETION_RATE_CAUTION}%未満）served=${servedCount}, answered=${answeredCount}`,
        });
      } else if (completionRate < COMPLETION_RATE_HEALTHY) {
        alerts.push({
          level: "warning", category: "completion",
          message: `回答完了率 注意: ${completionRate}%（基準${COMPLETION_RATE_HEALTHY}%未満）served=${servedCount}, answered=${answeredCount}`,
        });
      }
    }

    // ── 回答時間（CEO基準: median 1.5-6s適正, p90>10s重い, median<1.5s浅い） ──
    for (const ab of axisBreakdown) {
      if (ab.responseTimeMedianMs !== null && ab.responseTimeMedianMs < RESPONSE_TIME_TOO_FAST_MS) {
        alerts.push({
          level: "warning", category: "response_time",
          message: `${ab.axisId}: 回答時間 median ${ab.responseTimeMedianMs}ms — 直感押しの可能性（基準>${RESPONSE_TIME_TOO_FAST_MS}ms）`,
        });
      }
      if (ab.responseTimeMedianMs !== null && ab.responseTimeMedianMs > RESPONSE_TIME_IDEAL_MAX_MS) {
        alerts.push({
          level: "warning", category: "response_time",
          message: `${ab.axisId}: 回答時間 median ${ab.responseTimeMedianMs}ms — 質問が重い可能性（基準<${RESPONSE_TIME_IDEAL_MAX_MS}ms）`,
        });
      }
      if (ab.responseTimeP90Ms !== null && ab.responseTimeP90Ms > RESPONSE_TIME_P90_HEAVY_MS) {
        alerts.push({
          level: "warning", category: "response_time",
          message: `${ab.axisId}: 回答時間 p90 ${ab.responseTimeP90Ms}ms（基準<=${RESPONSE_TIME_P90_HEAVY_MS}ms）`,
        });
      }
    }

    // ── lightness（CEO基準: p90<=8問, p95<=9問） ──
    const recentLightness = lightness.slice(0, 7);
    const lightnessP90Breach = recentLightness.filter(
      (d) => d.p90QuestionsPerSession > LIGHTNESS_P90_TARGET,
    );
    const lightnessP95Breach = recentLightness.filter(
      (d) => d.p95QuestionsPerSession > LIGHTNESS_P95_TARGET,
    );
    if (lightnessP90Breach.length > 0) {
      alerts.push({
        level: "warning", category: "lightness",
        message: `lightness p90>${LIGHTNESS_P90_TARGET}問の日が${lightnessP90Breach.length}日（直近7日）— 軽さが崩れ始めている`,
      });
    }
    if (lightnessP95Breach.length > 0) {
      alerts.push({
        level: "warning", category: "lightness",
        message: `lightness p95>${LIGHTNESS_P95_TARGET}問の日が${lightnessP95Breach.length}日（直近7日）`,
      });
    }

    // セッション重さ（既存互換）
    const recentHeavy = recentLightness.reduce((sum, d) => sum + d.heavySessions, 0);
    if (recentHeavy > 0) {
      alerts.push({
        level: "warning", category: "lightness",
        message: `直近7日で${HEAVY_SESSION_THRESHOLD}問超のセッション: ${recentHeavy}件`,
      });
    }

    // ── 配信偏り ──
    if (biasAlert) {
      alerts.push({ level: "warning", category: "serving_bias", message: biasAlert });
    }

    // ── 解放進捗偏り ──
    if (releaseProgressBiasAlert) {
      alerts.push({ level: "warning", category: "release_bias", message: releaseProgressBiasAlert });
    }

    // ── visibleRate低下の原因分離: under_served vs low_growth ──
    // under_served: 出題されていない軸（そもそも出ていない）
    const underServedAxes = axisBreakdown.filter((a) => a.servedCount === 0);
    if (underServedAxes.length > 0 && axisBreakdown.some((a) => a.servedCount > 0)) {
      alerts.push({
        level: "info", category: "under_served",
        message: `未出題軸: ${underServedAxes.map((a) => a.axisId).join(", ")} — 出題条件の見直しが必要な可能性`,
      });
    }

    // low_growth: 出題されているが visible に到達していない軸
    const lowGrowthAxes = axisBreakdown.filter((a) => {
      if (a.servedCount === 0) return false;
      const rr = releaseRate.find((r) => r.axisId === a.axisId);
      return rr && rr.visibleRatePct === 0;
    });
    if (lowGrowthAxes.length > 0) {
      alerts.push({
        level: "warning", category: "low_growth",
        message: `出題済みだが未visible: ${lowGrowthAxes.map((a) => a.axisId).join(", ")} — 質問の質 or precision育ちの問題`,
      });
    }

    // 出題なし
    if (expansionSnapshots.length === 0) {
      alerts.push({
        level: "info", category: "info",
        message: "拡張質問の出題実績がまだありません（対象ユーザーが条件未達の可能性）",
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 9. Health Grades（CEO一覧用）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const gradeCompletion =
      completionRate === null ? "no_data"
        : completionRate >= COMPLETION_RATE_HEALTHY ? "healthy"
          : completionRate >= COMPLETION_RATE_CAUTION ? "caution"
            : "needs_fix";

    const avgP90 = recentLightness.length > 0
      ? recentLightness.reduce((s, d) => s + d.p90QuestionsPerSession, 0) / recentLightness.length
      : 0;
    const gradeLightness =
      recentLightness.length === 0 ? "no_data"
        : avgP90 <= LIGHTNESS_P90_TARGET ? "healthy"
          : avgP90 <= LIGHTNESS_P90_TARGET + 1 ? "caution"
            : "needs_fix";

    const allResponseMedians = axisBreakdown
      .map((a) => a.responseTimeMedianMs)
      .filter((v): v is number => v !== null);
    const overallMedian = allResponseMedians.length > 0 ? median(allResponseMedians) : null;
    const gradeResponseTime =
      overallMedian === null ? "no_data"
        : overallMedian >= RESPONSE_TIME_TOO_FAST_MS && overallMedian <= RESPONSE_TIME_IDEAL_MAX_MS ? "healthy"
          : "caution";

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalExpansionUsers: new Set(expansionSnapshots.map((s) => s.user_id)).size,
        totalExpansionAnswers: expansionSnapshots.length,
        axesWithData: new Set(expansionSnapshots.map((s) => s.axis_id)).size,
        coreIsolation: coreIsolationOk ? "OK" : "BUG",
        completionRate,
        servedCount,
        answeredCount,
        alertCount: alerts.length,
      },
      healthGrades: {
        completion: gradeCompletion,
        lightness: gradeLightness,
        responseTime: gradeResponseTime,
        coreIsolation: coreIsolationOk ? "healthy" : "critical",
      },
      thresholds: {
        completionRate: { healthy: COMPLETION_RATE_HEALTHY, caution: COMPLETION_RATE_CAUTION },
        responseTime: { tooFastMs: RESPONSE_TIME_TOO_FAST_MS, idealMaxMs: RESPONSE_TIME_IDEAL_MAX_MS, p90HeavyMs: RESPONSE_TIME_P90_HEAVY_MS },
        lightness: { p90Target: LIGHTNESS_P90_TARGET, p95Target: LIGHTNESS_P95_TARGET },
      },
      servingRate,
      axisBreakdown,
      releaseRate,
      visibleTrend,
      lightness,
      alerts,
    });
  } catch (error) {
    console.error("[expansion-monitor] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
