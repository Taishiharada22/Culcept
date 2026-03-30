// app/api/stargazer/cross-system-sync/route.ts
// ═══════════════════════════════════════════════════════════════
// 横断システム同期API
// Origin/Rendezvous → Stargazer 逆方向フィードバック + 矛盾検出
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { buildAxisScores } from "@/lib/stargazer/sharedRouteUtils";
import { loadOriginClientState } from "@/lib/origin/v7/server";
import { deriveEchoTimeline } from "@/lib/origin/v7/echoTimeline";
import {
  synthesize,
  computeOriginToStargazerFeedback,
  computeRendezvousToStargazerFeedback,
  type SynthesizerInput,
  type CrossSystemContradiction,
  type OriginAxisFeedback,
  type RendezvousAxisFeedback,
} from "@/lib/stargazer/contradictionSynthesizer";
import type { MatchingVector } from "@/lib/rendezvous/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET: 横断矛盾検出 + フィードバック算出 ──
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── 1. Stargazer 軸スコア取得 ──
    const [{ data: profile }, { data: resolvedTypeRow }] = await Promise.all([
      supabase
        .from("stargazer_profiles")
        .select("dimensions")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("stargazer_resolved_types")
        .select("axis_scores")
        .eq("user_id", user.id)
        .single(),
    ]);
    const { axisScores } = buildAxisScores(
      profile?.dimensions ?? null,
      resolvedTypeRow?.axis_scores ?? null,
    );

    // ── 2. Origin データ取得 ──
    let originChapters: import("@/lib/origin/v7/types").MemoryChapter[] | undefined;
    let originEchoes: import("@/lib/origin/v7/echoTimeline").EchoTrajectory[] | undefined;
    try {
      const originState = await loadOriginClientState(supabase, user.id);
      originChapters = originState.save.chapters;
      originEchoes = deriveEchoTimeline(originState.save).trajectories;
    } catch {
      // Origin未使用の場合は無視
    }

    // ── 3. Presence 他者評価データ取得 ──
    let presenceScores: SynthesizerInput["presenceScores"];
    try {
      const { data: partnerObs } = await supabase
        .from("stargazer_partner_observations")
        .select("axis_id, score")
        .eq("target_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (partnerObs && partnerObs.length > 0) {
        const axisMap: Record<string, { sum: number; count: number }> = {};
        for (const obs of partnerObs) {
          if (!axisMap[obs.axis_id]) axisMap[obs.axis_id] = { sum: 0, count: 0 };
          axisMap[obs.axis_id].sum += obs.score;
          axisMap[obs.axis_id].count += 1;
        }
        presenceScores = {} as any;
        for (const [axis, data] of Object.entries(axisMap)) {
          (presenceScores as any)[axis] = data.sum / data.count;
        }
      }
    } catch {
      // Presence未使用の場合は無視
    }

    // ── 4. Style 行動ログ取得 ──
    let styleActions: SynthesizerInput["styleActions"];
    try {
      const { data: actions } = await supabase
        .from("recommendation_actions")
        .select("action, meta")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (actions && actions.length > 10) {
        const likes: string[] = [];
        const dislikes: string[] = [];
        for (const a of actions) {
          const meta = a.meta as Record<string, unknown> | null;
          const cat = String(meta?.category ?? "");
          if (a.action === "save" || String(meta?.original_action ?? "").toLowerCase() === "like") {
            if (cat) likes.push(cat);
          } else if (a.action === "skip" || String(meta?.original_action ?? "").toLowerCase() === "dislike") {
            if (cat) dislikes.push(cat);
          }
        }
        // 最も多いカテゴリを dominant style に
        const freq = new Map<string, number>();
        for (const c of likes) freq.set(c, (freq.get(c) ?? 0) + 1);
        const dominant = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

        styleActions = {
          likeCategories: [...new Set(likes)],
          dislikeCategories: [...new Set(dislikes)],
          dominantStyle: dominant,
          actionCount: actions.length,
        };
      }
    } catch {
      // Style未使用の場合は無視
    }

    // ── 5. Rendezvous MatchingVector 取得 ──
    let rendezvousVector: MatchingVector | undefined;
    let rendezvousAnswerCount = 0;
    try {
      const { data: rvProfile } = await supabase
        .from("rendezvous_preferences")
        .select("matching_vector, answered_question_count")
        .eq("user_id", user.id)
        .single();

      if (rvProfile?.matching_vector) {
        rendezvousVector = rvProfile.matching_vector as MatchingVector;
        rendezvousAnswerCount = rvProfile.answered_question_count ?? 0;
      }
    } catch {
      // Rendezvous未使用の場合は無視
    }

    // ── 6. 観測数取得 ──
    const { count: totalObservations } = await supabase
      .from("stargazer_observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    // ── 7. 横断矛盾検出 ──
    const input: SynthesizerInput = {
      axisScores,
      originChapters,
      originEchoes,
      presenceScores,
      styleActions,
      rendezvousVector,
      totalObservations: totalObservations ?? 0,
    };

    const contradictions = synthesize(input);

    // ── 8. 逆方向フィードバック算出 ──
    let originFeedback: OriginAxisFeedback[] = [];
    if (originChapters && originEchoes) {
      originFeedback = computeOriginToStargazerFeedback(originChapters, originEchoes);
    }

    let rendezvousFeedback: RendezvousAxisFeedback[] = [];
    if (rendezvousVector) {
      rendezvousFeedback = computeRendezvousToStargazerFeedback(
        axisScores,
        rendezvousVector,
        rendezvousAnswerCount
      );
    }

    return NextResponse.json({
      ok: true,
      contradictions,
      feedback: {
        origin: originFeedback,
        rendezvous: rendezvousFeedback,
      },
      meta: {
        systemsConnected: {
          stargazer: Object.keys(axisScores).length > 0,
          origin: (originChapters?.length ?? 0) > 0,
          presence: presenceScores != null,
          style: styleActions != null,
          rendezvous: rendezvousVector != null,
        },
        totalObservations: totalObservations ?? 0,
      },
    });
  } catch (error) {
    console.error("[cross-system-sync]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST: 逆方向フィードバックを軸スコアに適用 ──
export async function POST() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // まずGETと同じデータを取得
    const [{ data: postProfile }, { data: postResolvedType }] = await Promise.all([
      supabase
        .from("stargazer_profiles")
        .select("dimensions")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("stargazer_resolved_types")
        .select("axis_scores")
        .eq("user_id", user.id)
        .single(),
    ]);
    const { axisScores } = buildAxisScores(
      postProfile?.dimensions ?? null,
      postResolvedType?.axis_scores ?? null,
    );

    let originFeedback: OriginAxisFeedback[] = [];
    try {
      const originState = await loadOriginClientState(supabase, user.id);
      const echoes = deriveEchoTimeline(originState.save).trajectories;
      originFeedback = computeOriginToStargazerFeedback(originState.save.chapters, echoes);
    } catch { /* noop */ }

    let rendezvousFeedback: RendezvousAxisFeedback[] = [];
    try {
      const { data: rvProfile } = await supabase
        .from("rendezvous_preferences")
        .select("matching_vector, answered_question_count")
        .eq("user_id", user.id)
        .single();

      if (rvProfile?.matching_vector) {
        rendezvousFeedback = computeRendezvousToStargazerFeedback(
          axisScores,
          rvProfile.matching_vector as MatchingVector,
          rvProfile.answered_question_count ?? 0
        );
      }
    } catch { /* noop */ }

    // フィードバックを軸スナップショットに適用
    const allFeedback = [
      ...originFeedback.map(f => ({ axis: f.axis, adjustment: f.adjustment, confidence: f.confidence, source: "origin" as const })),
      ...rendezvousFeedback.map(f => ({ axis: f.axis, adjustment: f.adjustment, confidence: f.confidence, source: "rendezvous" as const })),
    ];

    const applied: { axis: string; oldScore: number; newScore: number; adjustment: number; source: string }[] = [];

    for (const fb of allFeedback) {
      const currentScore = axisScores[fb.axis];
      if (currentScore === undefined) continue;

      // 信頼度で調整量を減衰
      const effectiveAdjustment = fb.adjustment * fb.confidence;
      if (Math.abs(effectiveAdjustment) < 0.005) continue;

      const newScore = Math.max(-1, Math.min(1, currentScore + effectiveAdjustment));

      // 軸スナップショットを更新 (upsert)
      const { error } = await supabase
        .from("stargazer_axis_snapshots")
        .upsert({
          user_id: user.id,
          axis_id: fb.axis,
          score: newScore,
          source: `cross_system_${fb.source}`,
          created_at: new Date().toISOString(),
        }, {
          onConflict: "user_id,axis_id",
        });

      if (!error) {
        applied.push({
          axis: fb.axis,
          oldScore: currentScore,
          newScore,
          adjustment: effectiveAdjustment,
          source: fb.source,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      applied,
      summary: `${applied.length}軸を更新しました（Origin: ${originFeedback.length}件, Rendezvous: ${rendezvousFeedback.length}件）`,
    });
  } catch (error) {
    console.error("[cross-system-sync POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
