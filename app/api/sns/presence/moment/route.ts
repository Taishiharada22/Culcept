// app/api/sns/presence/moment/route.ts
// Micro-Moment — 今日の気づきを1つ生成

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { buildContradictionMap, type ContradictionMap } from "@/lib/stargazer/contradictionMap";
import { buildTrajectory, type AxisTrajectory } from "@/lib/stargazer/trajectoryQuery";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

export type MomentType =
  | "contradiction" // 新しい矛盾検出
  | "axis_shift"    // 軸スコアの有意な変化
  | "temporal_diff"  // 時間差分
  | "pattern"       // 新しいパターン検出
  | "prediction";   // 共鳴予測

export interface MicroMomentData {
  type: MomentType;
  title: string;
  body: string;
  source: string;
  icon: string;
  magnitude?: number; // 0-1 signal strength
}

export interface MomentResponse {
  ok: boolean;
  hasData: boolean;
  moment: MicroMomentData | null;
}

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 軸スコアを取得
    const { data: resolvedType } = await supabase
      .from("stargazer_resolved_types")
      .select("axis_scores")
      .eq("user_id", user.id)
      .single();

    if (!resolvedType?.axis_scores || Object.keys(resolvedType.axis_scores).length === 0) {
      return NextResponse.json({
        ok: true,
        hasData: false,
        moment: null,
      } satisfies MomentResponse);
    }

    // 三面鏡スナップショットを取得（矛盾検出用）
    const { data: mirrorSnapshots } = await supabase
      .from("stargazer_mirror_snapshots")
      .select("axis_id, self_portrait_score, footprint_score, shadow_play_score, divergence_type, divergence_magnitude")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    // 軸スナップショットを取得（変化検出用）
    const { data: axisSnapshots } = await supabase
      .from("stargazer_axis_snapshots")
      .select("axis_id, score, session_date, context")
      .eq("user_id", user.id)
      .order("session_date", { ascending: false })
      .limit(100);

    const today = new Date().toISOString().slice(0, 10);
    // 日付ベースのシードで一貫性を持たせる
    const daySeed = today.split("-").reduce((acc, v) => acc + parseInt(v, 10), 0);

    const moments: MicroMomentData[] = [];

    // 優先度1: 矛盾検出
    if (mirrorSnapshots && mirrorSnapshots.length > 0) {
      const highDivergence = mirrorSnapshots.filter(
        (s) => (s.divergence_magnitude ?? 0) > 0.3
      );
      if (highDivergence.length > 0) {
        const pick = highDivergence[daySeed % highDivergence.length];
        const meaningMap: Record<string, string> = {
          self_vs_footprint: "あなたが語る自分と、行動が映す自分にズレがあります",
          self_vs_shadow: "自覚している自分と、無意識の価値基準が異なっています",
          footprint_vs_shadow: "環境への適応行動と、本来の志向が異なっています",
          all_diverged: "3つの観測源が全て異なる結果を示しています",
        };
        moments.push({
          type: "contradiction",
          title: "矛盾の発見",
          body: meaningMap[pick.divergence_type ?? ""] ?? "新しい矛盾パターンが検出されました",
          source: `軸: ${pick.axis_id}`,
          icon: "🎭",
        });
      }
    }

    // 優先度2: 有意な軸変化（閾値チェック付き）
    if (axisSnapshots && axisSnapshots.length >= 2) {
      const axisIds = [...new Set(axisSnapshots.map((s) => s.axis_id))] as TraitAxisKey[];
      for (const axisId of axisIds) {
        const axisData = axisSnapshots.filter((s) => s.axis_id === axisId);
        if (axisData.length < 3) continue; // 最低3データポイント必要
        const trajectory = buildTrajectory(axisId, axisData);
        // 閾値ゲート: variance > 0.05 かつ最新が平均から0.15以上離れている
        if (
          (trajectory.trend === "rising" || trajectory.trend === "falling") &&
          trajectory.variance > 0.05
        ) {
          const scores = axisData.map((d) => Number(d.score) || 0);
          const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
          const latest = scores[0];
          const deviation = Math.abs(latest - mean);
          if (deviation < 0.15) continue; // ノイズレベルの変化はスキップ

          const direction = trajectory.trend === "rising" ? "上昇" : "下降";
          const magnitude = Math.min(1, deviation * 2);
          moments.push({
            type: "axis_shift",
            title: "変化の兆し",
            body: `「${axisId}」が${direction}傾向にあり、最近の観測で平均から${(deviation * 100).toFixed(0)}%の変化が確認されています。`,
            source: `変動幅: ${trajectory.variance.toFixed(2)} | 偏差: ${deviation.toFixed(2)}`,
            icon: trajectory.trend === "rising" ? "📈" : "📉",
            magnitude,
          });
        }
      }
    }

    // 優先度3: 軸の特性に基づく豊かなフォールバック
    if (moments.length === 0) {
      const axisScores = resolvedType.axis_scores as Record<string, number>;
      const entries = Object.entries(axisScores);

      if (entries.length > 0 && axisSnapshots && axisSnapshots.length > 0) {
        // 軸ごとの分散を計算
        const axisByVariance: { axis: string; variance: number; mean: number; count: number }[] = [];
        const axisGroups = new Map<string, number[]>();
        for (const snap of axisSnapshots) {
          const scores = axisGroups.get(snap.axis_id) ?? [];
          scores.push(Number(snap.score) || 0);
          axisGroups.set(snap.axis_id, scores);
        }
        for (const [axis, scores] of axisGroups) {
          if (scores.length < 2) continue;
          const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
          const variance = scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / scores.length;
          axisByVariance.push({ axis, variance, mean, count: scores.length });
        }
        axisByVariance.sort((a, b) => b.variance - a.variance);

        // 最も安定した軸 = あなたの基盤
        const stableAxis = axisByVariance.length > 0
          ? axisByVariance[axisByVariance.length - 1]
          : null;
        // 最も揺れやすい軸 = 揺れゾーン
        const volatileAxis = axisByVariance.length > 0
          ? axisByVariance[0]
          : null;

        const candidates: MicroMomentData[] = [];

        if (stableAxis && stableAxis.variance < 0.03 && Math.abs(stableAxis.mean) > 0.2) {
          candidates.push({
            type: "pattern",
            title: "あなたの基盤",
            body: `「${stableAxis.axis}」はどんな状況でも揺れにくい、あなたの芯です。${stableAxis.count}回の観測を通じて一貫しています。`,
            source: `安定度: ${(1 - stableAxis.variance).toFixed(2)}`,
            icon: "🏛️",
            magnitude: 0.6,
          });
        }

        if (volatileAxis && volatileAxis.variance > 0.08) {
          candidates.push({
            type: "pattern",
            title: "揺れゾーン",
            body: `「${volatileAxis.axis}」は状況によって大きく変わる柔軟な領域です。この変動は適応力の表れかもしれません。`,
            source: `変動度: ${volatileAxis.variance.toFixed(2)}`,
            icon: "🌊",
            magnitude: 0.5,
          });
        }

        // コンテキスト依存の軸を検出
        const contextGroups = new Map<string, Map<string, number[]>>();
        for (const snap of axisSnapshots) {
          const ctx = snap.context ?? "global";
          const axisMap = contextGroups.get(snap.axis_id) ?? new Map<string, number[]>();
          const scores = axisMap.get(ctx) ?? [];
          scores.push(Number(snap.score) || 0);
          axisMap.set(ctx, scores);
          contextGroups.set(snap.axis_id, axisMap);
        }
        for (const [axis, ctxMap] of contextGroups) {
          if (ctxMap.size < 2) continue;
          const avgs = [...ctxMap.entries()].map(([ctx, scores]) => ({
            ctx,
            avg: scores.reduce((a, b) => a + b, 0) / scores.length,
          }));
          const maxDiff = Math.abs(
            Math.max(...avgs.map((a) => a.avg)) - Math.min(...avgs.map((a) => a.avg))
          );
          if (maxDiff > 0.25) {
            const high = avgs.sort((a, b) => b.avg - a.avg)[0];
            const low = avgs[avgs.length - 1];
            candidates.push({
              type: "pattern",
              title: "状況で変わるあなた",
              body: `「${axis}」は場面で変化します。${high.ctx}では強く、${low.ctx}では控えめに。環境があなたの別の面を引き出しています。`,
              source: `文脈差: ${maxDiff.toFixed(2)}`,
              icon: "🔀",
              magnitude: Math.min(1, maxDiff * 2),
            });
            break;
          }
        }

        if (candidates.length > 0) {
          moments.push(candidates[daySeed % candidates.length]);
        } else {
          // 最終フォールバック
          const [axis, score] = entries[daySeed % entries.length];
          const intensity = Math.abs(Number(score));
          moments.push({
            type: "pattern",
            title: "今日のあなた",
            body: intensity > 0.5
              ? `「${axis}」はあなたの中で特に際立つ傾向です。この特徴が日常のどんな場面に現れているか、意識してみてください。`
              : `「${axis}」はバランスの取れた領域です。状況によって柔軟に変化するこの特性が、あなたの適応力の源かもしれません。`,
            source: `スコア: ${Number(score).toFixed(2)}`,
            icon: "✧",
            magnitude: 0.3,
          });
        }
      } else if (entries.length > 0) {
        const [axis, score] = entries[daySeed % entries.length];
        moments.push({
          type: "pattern",
          title: "今日のあなた",
          body: `「${axis}」の傾向が見えてきています。観測を重ねることで、より深い気づきが得られます。`,
          source: `スコア: ${Number(score).toFixed(2)}`,
          icon: "✧",
          magnitude: 0.2,
        });
      }
    }

    // 日付シードで1つ選出
    const moment = moments.length > 0 ? moments[daySeed % moments.length] : null;

    return NextResponse.json({
      ok: true,
      hasData: moment !== null,
      moment,
    } satisfies MomentResponse);
  } catch (error) {
    console.error("Moment API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
