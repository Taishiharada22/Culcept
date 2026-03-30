import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { checkStargazerTier } from "@/lib/stargazer/tierGuard";
import {
  buildUnseenMap,
  type UnseenMapInput,
  type AxisObservationQuality,
  type MirrorSource,
} from "@/lib/stargazer/unseenMap";
import { TRAIT_AXIS_KEYS, type TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { buildAxisScores } from "@/lib/stargazer/sharedRouteUtils";
import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "@/lib/stargazer/studentTrack";

export const runtime = "nodejs";

// ── GET: Unseen Map を取得 ──
export async function GET() {
  try {
    const tierCheck = await checkStargazerTier("unseen_map");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId } = tierCheck;

    const supabase = await supabaseServer();

    // 全データを並列取得
    const [
      { data: mapRows },
      { data: profile },
      { data: resolvedTypeRow },
      { data: axisSnapshots },
    ] = await Promise.all([
      supabase
        .from("stargazer_unseen_map")
        .select("*")
        .eq("user_id", userId),
      supabase
        .from("stargazer_profiles")
        .select("dimensions")
        .eq("user_id", userId)
        .single(),
      supabase
        .from("stargazer_resolved_types")
        .select("axis_scores")
        .eq("user_id", userId)
        .single(),
      supabase
        .from("stargazer_axis_snapshots")
        .select("axis_id, score, confidence, context, observation_layer, session_date")
        .eq("user_id", userId)
        .order("session_date", { ascending: false })
        .limit(500),
    ]);

    // 軸スコアを構築
    const { axisScores } = buildAxisScores(
      profile?.dimensions ?? null,
      resolvedTypeRow?.axis_scores ?? null,
    );

    // DB + snapshots から observationQualities を構築
    const observationQualities: Partial<Record<TraitAxisKey, AxisObservationQuality>> = {};

    // まず DB の unseen_map テーブルからデータを取得
    if (mapRows && mapRows.length > 0) {
      for (const row of mapRows) {
        const key = row.axis_key as TraitAxisKey;
        const rawSources = row.mirror_sources;
        const mirrorSources: MirrorSource[] = Array.isArray(rawSources)
          ? rawSources.filter((s: string): s is MirrorSource =>
              ["self", "footprint", "shadow"].includes(s))
          : [];

        observationQualities[key] = {
          count: row.observation_count ?? 0,
          mirrorSources,
          scoreStability: Number(row.score_stability) || 0,
          averageConfidence: Number(row.confidence) || 0,
          lastObservedAt: row.last_observed_at ?? undefined,
          contradictionDetected: Boolean(row.contradiction_detected),
        };
      }
    }

    // axis_snapshots から補完
    if (axisSnapshots && axisSnapshots.length > 0) {
      const snapshotCounts: Record<string, number> = {};
      const snapshotDates: Record<string, string> = {};
      const snapshotLayers: Record<string, Set<string>> = {};
      const snapshotScores: Record<string, number[]> = {};
      const snapshotConfidences: Record<string, number[]> = {};

      for (const s of axisSnapshots) {
        const axisId = s.axis_id as string;
        snapshotCounts[axisId] = (snapshotCounts[axisId] ?? 0) + 1;

        if (!snapshotDates[axisId] || s.session_date > snapshotDates[axisId]) {
          snapshotDates[axisId] = s.session_date;
        }

        if (s.observation_layer) {
          if (!snapshotLayers[axisId]) snapshotLayers[axisId] = new Set();
          snapshotLayers[axisId].add(s.observation_layer);
        }

        // スコアの安定性計算用
        if (!snapshotScores[axisId]) snapshotScores[axisId] = [];
        snapshotScores[axisId].push(Number(s.score));

        if (s.confidence != null) {
          if (!snapshotConfidences[axisId]) snapshotConfidences[axisId] = [];
          snapshotConfidences[axisId].push(Number(s.confidence));
        }
      }

      // DB データがなかった軸をスナップショットで補完
      for (const key of TRAIT_AXIS_KEYS) {
        if (!observationQualities[key] && snapshotCounts[key]) {
          const layerSet = snapshotLayers[key];
          const mirrorSources: MirrorSource[] = [];
          if (layerSet) {
            if (layerSet.has("self")) mirrorSources.push("self");
            if (layerSet.has("footprint")) mirrorSources.push("footprint");
            if (layerSet.has("shadow")) mirrorSources.push("shadow");
          }
          if (mirrorSources.length === 0 && snapshotCounts[key] > 0) {
            mirrorSources.push("self");
          }

          // スコア安定性: 直近5回の分散の逆数 (0-1)
          const scores = (snapshotScores[key] ?? []).slice(0, 5);
          let scoreStability = 0;
          if (scores.length >= 2) {
            const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
            const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
            scoreStability = Math.max(0, Math.min(1, 1 / (1 + variance * 10)));
          }

          // 平均信頼度
          const confidences = snapshotConfidences[key] ?? [];
          const averageConfidence = confidences.length > 0
            ? confidences.reduce((s, v) => s + v, 0) / confidences.length
            : 0;

          observationQualities[key] = {
            count: snapshotCounts[key],
            mirrorSources,
            scoreStability,
            averageConfidence,
            lastObservedAt: snapshotDates[key],
            contradictionDetected: false,
          };
        }
      }
    }

    // Unseen Map を構築
    const mapInput: UnseenMapInput = {
      axisScores,
      observationQualities,
    };
    const unseenMap = buildUnseenMap(mapInput);

    // AI で未知領域の説明を生成（失敗時はテンプレート結果をそのまま使用）
    let explorationNarrative: string | null = null;
    try {
      const aiResult = await runAI({
        taskType: "stargazer_unseen_map_narrative",
        metadata: makeStargazerRunMetadata({ feature: "unseen_map" }),
        prompt: JSON.stringify({
          explorationPercentage: unseenMap.explorationPercentage,
          totalRevealed: unseenMap.totalRevealed,
          totalTiles: unseenMap.totalTiles,
          unchartedTerritories: unseenMap.unchartedTerritories.slice(0, 5),
          nextSuggested: unseenMap.nextSuggestedExploration,
          recentDiscoveries: unseenMap.recentDiscoveries.slice(0, 3),
        }),
        systemPrompt: `あなたはStargazerの「未知の地図」の案内人です。
ユーザーの内面探索の進捗を元に、探索を促すナラティブを生成してください。

ルール:
- 最大200文字
- 「きみ」で語りかける
- 地図・探索のメタファーを使う（未踏の地、霧の向こう、光の境界線 など）
- 未観測領域に対する好奇心を刺激する
- 具体的な次の探索方向を示唆する`,
        requireJson: false,
        temperature: 0.8,
        maxOutputTokens: 300,
        userId: userId,
      });

      if (aiResult.success && aiResult.text) {
        explorationNarrative = aiResult.text.slice(0, 300);
      }
    } catch (aiError) {
      // AI 強化失敗はログのみ。narrative なしで続行
      console.warn("UnseenMap AI narrative failed, using template:", aiError);
    }

    return NextResponse.json({
      ok: true,
      map: {
        tiles: unseenMap.tiles,
        explorationPercentage: unseenMap.explorationPercentage,
        totalRevealed: unseenMap.totalRevealed,
        totalTiles: unseenMap.totalTiles,
        unchartedTerritories: unseenMap.unchartedTerritories,
        recentDiscoveries: unseenMap.recentDiscoveries,
        nextSuggestedExploration: unseenMap.nextSuggestedExploration,
        explorationNarrative,
      },
    });
  } catch (error) {
    console.error("Failed to get unseen map:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
