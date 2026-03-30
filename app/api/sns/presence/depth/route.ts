// app/api/sns/presence/depth/route.ts
// 深層データ — 矛盾マップ、エントロピー署名、未観測領域

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  buildContradictionMap,
  type ContradictionMap,
  type ContradictionEntry,
} from "@/lib/stargazer/contradictionMap";
import type { MirrorAxisScore } from "@/lib/stargazer/threeMirrors";
import { TRAIT_AXES, type TraitAxisKey } from "@/lib/stargazer/traitAxes";

export interface EntropySignatureData {
  structureType: "crystallized" | "fluid" | "fragmented" | "evolving";
  label: string;
  description: string;
  axisEntropy: { axisId: string; entropy: number }[];
}

export interface DarkMatterItem {
  axisId: string;
  axisLabel: string;
  confidence: number;
  resonancePrediction: number | null;
  explorationPriority: "high" | "medium" | "low";
  reason: string;
}

export interface DepthResponse {
  ok: boolean;
  hasData: boolean;
  contradictions: ContradictionEntry[];
  contradictionSummary: string;
  primaryTheme: string;
  totalContradictions: number;
  alignedAxes: number;
  entropy: EntropySignatureData | null;
  darkMatter: DarkMatterItem[];
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

    // 三面鏡データ
    const { data: mirrorSnapshots } = await supabase
      .from("stargazer_mirror_snapshots")
      .select("axis_id, self_portrait_score, footprint_score, shadow_play_score, divergence_type, divergence_magnitude, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    // 軸スコア
    const { data: resolvedType } = await supabase
      .from("stargazer_resolved_types")
      .select("axis_scores")
      .eq("user_id", user.id)
      .single();

    // 観測カウント per axis (with created_at for recency)
    const { data: observations } = await supabase
      .from("stargazer_observations")
      .select("axis_id, created_at")
      .eq("user_id", user.id);

    const axisScores = (resolvedType?.axis_scores ?? {}) as Record<string, number>;

    if (Object.keys(axisScores).length === 0) {
      return NextResponse.json({
        ok: true,
        hasData: false,
        contradictions: [],
        contradictionSummary: "",
        primaryTheme: "",
        totalContradictions: 0,
        alignedAxes: 0,
        entropy: null,
        darkMatter: [],
      } satisfies DepthResponse);
    }

    // ━━━━━━ 矛盾マップ構築 ━━━━━━
    let contradictionMap: ContradictionMap = {
      entries: [],
      totalContradictions: 0,
      alignedAxes: 0,
      summary: "",
      primaryTheme: "",
    };

    if (mirrorSnapshots && mirrorSnapshots.length > 0) {
      // 最新のスナップショットを軸ごとに集約
      const latestByAxis = new Map<string, MirrorAxisScore>();
      for (const snap of mirrorSnapshots) {
        if (!latestByAxis.has(snap.axis_id)) {
          latestByAxis.set(snap.axis_id, {
            axisId: snap.axis_id as TraitAxisKey,
            selfPortrait: snap.self_portrait_score ?? undefined,
            footprint: snap.footprint_score ?? undefined,
            shadowPlay: snap.shadow_play_score ?? undefined,
            counts: {
              selfPortrait: snap.self_portrait_score != null ? 1 : 0,
              footprint: snap.footprint_score != null ? 1 : 0,
              shadowPlay: snap.shadow_play_score != null ? 1 : 0,
            },
          });
        }
      }

      // Build Partial<Record<TraitAxisKey, MirrorAxisScore>> for buildContradictionMap
      const mirrorProfile: Partial<Record<TraitAxisKey, MirrorAxisScore>> = {};
      latestByAxis.forEach((score, axisId) => {
        mirrorProfile[axisId as TraitAxisKey] = score;
      });

      contradictionMap = buildContradictionMap(mirrorProfile);
    }

    // ━━━━━━ エントロピー署名（簡易計算） ━━━━━━
    let entropy: EntropySignatureData | null = null;
    if (mirrorSnapshots && mirrorSnapshots.length > 0) {
      // 各軸の分散からエントロピーを推定
      const axisGroups = new Map<string, number[]>();
      for (const snap of mirrorSnapshots) {
        const scores = [snap.self_portrait_score, snap.footprint_score, snap.shadow_play_score].filter(
          (s): s is number => s !== null && s !== undefined
        );
        if (scores.length > 0) {
          const existing = axisGroups.get(snap.axis_id) ?? [];
          existing.push(...scores);
          axisGroups.set(snap.axis_id, existing);
        }
      }

      const axisEntropy: { axisId: string; entropy: number }[] = [];
      let totalEntropy = 0;
      for (const [axisId, scores] of axisGroups) {
        if (scores.length < 2) {
          axisEntropy.push({ axisId, entropy: 0 });
          continue;
        }
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / scores.length;
        const e = Math.min(1, Math.sqrt(variance) * 2); // normalize to 0-1
        axisEntropy.push({ axisId, entropy: e });
        totalEntropy += e;
      }
      const avgEntropy = axisEntropy.length > 0 ? totalEntropy / axisEntropy.length : 0;
      const highEntropyCount = axisEntropy.filter((a) => a.entropy > 0.5).length;

      let structureType: EntropySignatureData["structureType"];
      let label: string;
      let description: string;
      if (avgEntropy < 0.2) {
        structureType = "crystallized";
        label = "結晶型";
        description = "あなたの人格は一貫性が高く、どの観測源からも安定した像が得られています。芯がしっかりしている証拠です。";
      } else if (avgEntropy < 0.4) {
        structureType = "evolving";
        label = "変容中";
        description = "いくつかの軸で変化の兆しが見えています。今まさに新しい自分が形作られつつある時期です。";
      } else if (highEntropyCount > axisEntropy.length * 0.5) {
        structureType = "fragmented";
        label = "多面体型";
        description = "複数の独立した「自分」が共存しています。状況によって全く違う顔を見せるのは、多面性の証です。";
      } else {
        structureType = "fluid";
        label = "流体型";
        description = "環境や状況に応じて柔軟に変化する性質を持っています。適応力の高さがここに表れています。";
      }

      entropy = { structureType, label, description, axisEntropy };
    }

    // ━━━━━━ 未観測の闇（Dark Matter） ━━━━━━
    const obsCountByAxis = new Map<string, number>();
    const obsLatestByAxis = new Map<string, string>();
    const obsContextByAxis = new Map<string, Set<string>>();
    if (observations) {
      for (const obs of observations) {
        obsCountByAxis.set(obs.axis_id, (obsCountByAxis.get(obs.axis_id) ?? 0) + 1);
        // Track latest observation date per axis
        const prev = obsLatestByAxis.get(obs.axis_id);
        if (obs.created_at && (!prev || obs.created_at > prev)) {
          obsLatestByAxis.set(obs.axis_id, obs.created_at);
        }
      }
    }

    // ミラーカバレッジ（軸ごとに3面鏡のうちいくつあるか）
    const mirrorCoverageByAxis = new Map<string, number>();
    if (mirrorSnapshots) {
      for (const snap of mirrorSnapshots) {
        if (!mirrorCoverageByAxis.has(snap.axis_id)) {
          let coverage = 0;
          if (snap.self_portrait_score != null) coverage++;
          if (snap.footprint_score != null) coverage++;
          if (snap.shadow_play_score != null) coverage++;
          mirrorCoverageByAxis.set(snap.axis_id, coverage);
        }
        // Track latest observation date per axis
        if (!obsLatestByAxis.has(snap.axis_id) && snap.created_at) {
          obsLatestByAxis.set(snap.axis_id, snap.created_at);
        }
      }
    }

    // 矛盾に関わる軸のセット（exploration priority判定用）
    const contradictionAxes = new Set<string>(
      contradictionMap.entries.map((e) => e.axisId)
    );

    const now = Date.now();
    function computeConfidence(axisId: string): number {
      const obsCount = obsCountByAxis.get(axisId) ?? 0;
      const mirrorCoverage = mirrorCoverageByAxis.get(axisId) ?? 0;
      const latestDate = obsLatestByAxis.get(axisId);

      // 観測数: 15回で飽和 (40%)
      const countFactor = Math.min(1, obsCount / 15);
      // 鮮度: 90日で0.3に減衰 (20%)
      const recencyFactor = latestDate
        ? Math.max(0.3, 1 - (now - new Date(latestDate).getTime()) / (90 * 86400000))
        : 0.1;
      // ミラーカバレッジ: 3面中いくつ (20%)
      const mirrorFactor = mirrorCoverage / 3;
      // 文脈多様性: obsCountの平方根で近似 (20%)
      const contextFactor = Math.min(1, Math.sqrt(obsCount) / 3);

      return Math.min(1, countFactor * 0.4 + recencyFactor * 0.2 + mirrorFactor * 0.2 + contextFactor * 0.2);
    }

    const allAxes = TRAIT_AXES.map((d) => d.id);
    const darkMatter: DarkMatterItem[] = allAxes
      .map((axisId) => {
        const confidence = computeConfidence(axisId);
        const axisDef = TRAIT_AXES.find((d) => d.id === axisId);
        const label = axisDef?.labelLeft && axisDef?.labelRight
          ? `${axisDef.labelLeft} ↔ ${axisDef.labelRight}`
          : axisId;

        // 矛盾交差チェック: 矛盾に関わり、かつ低confidenceなら重要
        const involvedInContradiction = contradictionAxes.has(axisId);
        const hasScore = axisScores[axisId] != null;

        let explorationPriority: "high" | "medium" | "low";
        let reason: string;
        if (involvedInContradiction && confidence < 0.4) {
          explorationPriority = "high";
          reason = "矛盾パターンに関わる未探索領域。観測が深まれば自己理解が大きく進む可能性";
        } else if (confidence < 0.2) {
          explorationPriority = "high";
          reason = "ほぼ未知の領域。あなたのこの側面はまだ見えていない";
        } else if (confidence < 0.35) {
          explorationPriority = "medium";
          reason = "断片的な観測のみ。もう少し観測が集まれば像が結ばれる";
        } else {
          explorationPriority = "low";
          reason = "輪郭は見えつつあるが、まだ確信には至っていない";
        }

        // 共鳴予測: 低confidence時、近隣軸の矛盾パターンから推測
        let resonancePrediction: number | null = null;
        if (confidence < 0.3 && hasScore) {
          // 矛盾に関わる場合は矛盾magnitude方向のズレを予測
          const relatedContradiction = contradictionMap.entries.find(
            (e) => e.axisId === axisId
          );
          if (relatedContradiction) {
            // 矛盾がある場合: 乖離の方向性を示す
            resonancePrediction = relatedContradiction.magnitude * (axisScores[axisId] > 0 ? 1 : -1);
          } else {
            resonancePrediction = axisScores[axisId] ?? null;
          }
        }

        return {
          axisId,
          axisLabel: label,
          confidence,
          resonancePrediction,
          explorationPriority,
          reason,
        };
      })
      .filter((item) => item.confidence < 0.5)
      .sort((a, b) => {
        // Priority first (high > medium > low), then confidence ascending
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const pDiff = priorityOrder[a.explorationPriority] - priorityOrder[b.explorationPriority];
        return pDiff !== 0 ? pDiff : a.confidence - b.confidence;
      });

    // explorationPromptフォールバック
    for (const entry of contradictionMap.entries) {
      if (!entry.explorationPrompt) {
        entry.explorationPrompt = `この「${entry.axisLabel ?? entry.axisId}」の矛盾について、どんな場面で最も強く感じますか？`;
      }
    }

    return NextResponse.json({
      ok: true,
      hasData: true,
      contradictions: contradictionMap.entries,
      contradictionSummary: contradictionMap.summary,
      primaryTheme: contradictionMap.primaryTheme,
      totalContradictions: contradictionMap.totalContradictions,
      alignedAxes: contradictionMap.alignedAxes,
      entropy,
      darkMatter,
    } satisfies DepthResponse);
  } catch (error) {
    console.error("Depth API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
