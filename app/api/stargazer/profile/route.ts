import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isBetaTesterEmail } from "@/lib/auth/betaTesters";
import { createEmptyAxisScores, TRAIT_AXES, type TraitAxisKey } from "@/lib/stargazer/traitAxes";
import {
  computeAllDistributions,
  detectFluctuationPatterns,
  generateCompanionInsights,
  type AxisSnapshot,
} from "@/lib/stargazer/fluctuationEngine";
import { resolveArchetype, resolveArchetypeWithUncertainty } from "@/lib/stargazer/archetypeResolver";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import { todayJST } from "@/lib/stargazer/sharedRouteUtils";
import { resolveTypeFromScores } from "@/lib/stargazer/typeResolver";
import { estimateCognitiveFromTraits, deriveCognitiveFitDisplay } from "@/lib/stargazer/cognitiveFitScoring";
import { applyCollinearityCorrection } from "@/lib/stargazer/multicollinearityCorrection";
import { runFullInference, type InferenceResult } from "@/lib/stargazer/axisInferenceEngine";
import { validateWithResonanceCascade } from "@/lib/stargazer/innovativeMechanisms";
import { applyLayerInteractions } from "@/lib/stargazer/layerInteractions";
import { deserializeBeliefs, serializeBeliefs, beliefsToScores, type BeliefSet } from "@/lib/stargazer/bayesianAxisUpdater";
import { computeSyncPercentage } from "@/lib/stargazer/informationGain";
import { computeOverallTypeConfidenceV2 } from "@/lib/stargazer/confidenceEngine";
import { generateCrossAxisInsights } from "@/lib/stargazer/crossAxisPatterns";

type DailyRawAnswersPayload = {
  answers?: { responseTimeMs?: number }[];
  reobservationAnswer?: { responseTimeMs?: number } | null;
  shadowPlayAnswers?: { responseTimeMs?: number }[] | null;
  isPartial?: boolean;
} | null;

function mergeAxisScores(
  target: Record<TraitAxisKey, number>,
  source: unknown,
) {
  if (!source || typeof source !== "object") return;

  const record = source as Record<string, unknown>;
  for (const axis of TRAIT_AXES) {
    const rawValue = record[axis.id];
    const numericValue =
      typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (Number.isFinite(numericValue)) {
      target[axis.id] = Math.max(-1, Math.min(1, numericValue));
    }
  }
}

function extractDailyResponseTimes(rawAnswers: DailyRawAnswersPayload): number[] {
  if (!rawAnswers || rawAnswers.isPartial) {
    return [];
  }

  const responseTimes: number[] = [];

  for (const answer of rawAnswers.answers ?? []) {
    if (typeof answer.responseTimeMs === "number") {
      responseTimes.push(answer.responseTimeMs);
    }
  }

  if (typeof rawAnswers.reobservationAnswer?.responseTimeMs === "number") {
    responseTimes.push(rawAnswers.reobservationAnswer.responseTimeMs);
  }

  for (const answer of rawAnswers.shadowPlayAnswers ?? []) {
    if (typeof answer.responseTimeMs === "number") {
      responseTimes.push(answer.responseTimeMs);
    }
  }

  return responseTimes;
}

function normalizeAccuracyPercent(value: unknown): number {
  const numericValue =
    typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }
  const percentValue = numericValue <= 1 ? numericValue * 100 : numericValue;
  return Math.max(0, Math.min(100, percentValue));
}

function normalizeCategoryAccuracy(
  rawCategoryAccuracy: unknown,
): Record<string, { accuracy: number; totalPredictions: number }> {
  if (!rawCategoryAccuracy || typeof rawCategoryAccuracy !== "object") {
    return {};
  }

  const categoryAccuracy: Record<
    string,
    { accuracy: number; totalPredictions: number }
  > = {};

  for (const [category, rawValue] of Object.entries(
    rawCategoryAccuracy as Record<string, unknown>,
  )) {
    if (typeof rawValue === "number") {
      categoryAccuracy[category] = {
        accuracy: normalizeAccuracyPercent(rawValue),
        totalPredictions: 0,
      };
      continue;
    }

    if (!rawValue || typeof rawValue !== "object") {
      continue;
    }

    const record = rawValue as Record<string, unknown>;
    categoryAccuracy[category] = {
      accuracy: normalizeAccuracyPercent(
        record.accuracy ??
          record.accuracy_rate ??
          record.accuracy_percentage,
      ),
      totalPredictions: Number(
        record.totalPredictions ?? record.total_predictions ?? 0,
      ),
    };
  }

  return categoryAccuracy;
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

    // ── データ取得（全ソースから並列） ──
    const [
      { data: starMapRow },
      { data: coreStar },
      { data: profile },
      { data: resolvedTypeRow },
      { data: personalityRow },
      { data: observations },
      { data: dailyStates },
      { data: axisSnapshotsRaw },
    ] = await Promise.all([
      supabase
        .from("stargazer_star_maps")
        .select("*")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("stargazer_core_star")
        .select("*")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("stargazer_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("stargazer_resolved_types")
        .select("*")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("stargazer_personality_profile")
        .select("*")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("stargazer_observations")
        .select("response_time_ms, hesitation_level")
        .eq("user_id", user.id),
      supabase
        .from("stargazer_daily_states")
        .select("raw_answers, observation_date")
        .eq("user_id", user.id)
        .order("observation_date", { ascending: false })
        .limit(365),
      supabase
        .from("stargazer_axis_snapshots")
        .select("axis_id, score, confidence, context, observation_layer, session_date, observation_state")
        .eq("user_id", user.id)
        .order("session_date", { ascending: false })
        .limit(500),
    ]);

    const axisScores = createEmptyAxisScores();
    mergeAxisScores(axisScores, profile?.dimensions ?? null);
    mergeAxisScores(axisScores, coreStar?.core_traits ?? null);
    mergeAxisScores(axisScores, starMapRow?.core_star?.coreTraits ?? null);
    mergeAxisScores(axisScores, resolvedTypeRow?.axis_scores ?? null);

    const axisSnapshots: AxisSnapshot[] = (axisSnapshotsRaw ?? []).map((s) => ({
      axis_id: s.axis_id as TraitAxisKey,
      score: Number(s.score),
      confidence: s.confidence ? Number(s.confidence) : undefined,
      context: s.context,
      observation_layer: s.observation_layer || undefined,
      session_date: s.session_date,
      state: s.observation_state || null,
    }));

    const liveDistributions =
      axisSnapshots.length > 0 ? computeAllDistributions(axisSnapshots) : [];

    // スナップショットのスコアをオンボーディングスコアとブレンド
    // オンボーディング(100問)の重みを強力に保護し、日次観測(10問)で急変しないようにする
    // ━━ 安定化戦略 ━━
    // 1. スナップショットの影響は最大30%（それ以上はオンボーディング基盤を破壊する）
    // 2. 影響の成長は非常にゆるやか: sqrt(count/500) → 100回でも~14%、500回で30%
    // 3. 単一セッションのスパイクを抑えるため、分布の中央値ではなくトリム平均を使用
    const totalSnapshots = axisSnapshots.length;
    for (const distribution of liveDistributions) {
      const existingScore = axisScores[distribution.axis];
      if (typeof existingScore === "number" && Math.abs(existingScore) > 0.001) {
        // オンボーディングのアンカー重み: 最低70%、最大95%
        const snapshotWeight = Math.min(0.30, Math.sqrt(totalSnapshots / 500));
        const baseWeight = 1 - snapshotWeight;
        // スナップショットの分布centerとの差が大きすぎる場合はダンピング
        const rawDelta = distribution.center - existingScore;
        const maxDeltaPerBlend = 0.15; // 1回のブレンドで最大±0.15しか動かない
        const clampedDelta = Math.max(-maxDeltaPerBlend, Math.min(maxDeltaPerBlend, rawDelta * snapshotWeight));
        axisScores[distribution.axis] = existingScore + clampedDelta;
      } else {
        axisScores[distribution.axis] = distribution.center;
      }
    }

    // ── Cognitive Fit 6軸のアーキタイプ計算への統合 ──
    // CF軸（abstract_structuring, decomposition, etc.）はアーキタイプ重みマップで使われるが、
    // Core 35問では直接測定されない。CF質問の回答があればここで統合する。
    const cfSnapshotsForMerge = axisSnapshots.filter((s) => s.observation_layer === "cognitive_fit");
    if (cfSnapshotsForMerge.length > 0) {
      const cfLatest: Record<string, number> = {};
      for (const s of cfSnapshotsForMerge) {
        if (!(s.axis_id in cfLatest)) {
          cfLatest[s.axis_id] = s.score;
        }
      }
      for (const [axis, score] of Object.entries(cfLatest)) {
        const key = axis as TraitAxisKey;
        if (Math.abs(axisScores[key] ?? 0) < 0.001) {
          // 未測定軸のみ CF スコアで埋める
          axisScores[key] = score;
        } else {
          // 既に値がある場合: CF を 30% で軽くブレンド
          axisScores[key] = axisScores[key] * 0.7 + score * 0.3;
        }
      }
    }

    const hasAxisEvidence = Object.values(axisScores).some(
      (value) => Math.abs(value) > 0.001,
    );

    // ━━━ Scoring Pipeline v2: 多重共線性補正 → 推論 → カスケード検証 ━━━

    // Step 1: 多重共線性補正（同一質問からの二重計上を除去）
    let collinearityCorrected = false;
    if (hasAxisEvidence) {
      const { correctedScores, corrections } = applyCollinearityCorrection(
        axisScores,
        null, // 質問ソースマップは簡易モード（ソース不明時はデフォルト重複率で補正）
      );
      if (corrections.length > 0) {
        for (const [key, val] of Object.entries(correctedScores)) {
          if (key in axisScores) {
            axisScores[key as TraitAxisKey] = val;
          }
        }
        collinearityCorrected = true;
      }
    }

    // Step 2: 推論エンジン（深層6軸 + 安全性8軸を既存スコアから推定）
    const directlyObservedAxes = new Set<TraitAxisKey>();
    for (const s of axisSnapshots) {
      if (s.observation_layer !== "inferred") {
        directlyObservedAxes.add(s.axis_id);
      }
    }
    // オンボーディングスコアがある軸も観測済みとして扱う
    for (const axis of TRAIT_AXES) {
      if (Math.abs(axisScores[axis.id] ?? 0) > 0.001) {
        directlyObservedAxes.add(axis.id);
      }
    }

    const inferenceResults = hasAxisEvidence
      ? runFullInference(axisScores, directlyObservedAxes)
      : [];

    // 推論スコアを axisScores にマージ（直接観測がない軸のみ）
    // ルール: directly observed（Core35 + RV + CF + Daily）> inferred — 直接測定値は推論で上書きしない
    const inferredAxesMap: Record<string, InferenceResult> = {};
    const inferredAxisIds = new Set<string>();
    for (const result of inferenceResults) {
      if (!directlyObservedAxes.has(result.axis)) {
        axisScores[result.axis] = result.estimatedScore;
        inferredAxesMap[result.axis] = result;
        inferredAxisIds.add(result.axis);
      }
    }

    // Step 3: 共鳴カスケード検証（予測と観測の一致度で信頼度を調整）
    const cascadeValidation = hasAxisEvidence
      ? validateWithResonanceCascade(axisScores, directlyObservedAxes)
      : null;

    // ━━━ End Scoring Pipeline v2 ━━━

    const liveResolvedResult = hasAxisEvidence
      ? resolveTypeFromScores(
          axisScores,
          axisSnapshots.map((s) => ({
            axis_id: s.axis_id,
            score: s.score,
            session_date: s.session_date,
            variant_id: (s as unknown as Record<string, unknown>).variant_id as string | undefined,
          }))
        )
      : null;

    // ── StarMap 組み立て（live axis scores優先、なければ保存値）──
    let starMap = null;
    if (liveResolvedResult) {
      starMap = {
        coreStar: {
          reactionType: liveResolvedResult.reactionType,
          confidenceScore: liveResolvedResult.confidence,
          coreTraits: axisScores,
          // archetype fields は後段の archetypeResult 確定後に注入
        },
        liveSky: { dimensions: axisScores },
      };
    } else if (starMapRow) {
      // star_mapsテーブルにデータがある場合（observations APIが保存したJSON）
      const coreStarData = starMapRow.core_star;
      starMap = {
        coreStar: coreStarData
          ? {
              ...coreStarData,
              confidenceScore: Math.min(0.85, Number(coreStarData.confidenceScore) || 0),
            }
          : null,
        liveSky: starMapRow.live_sky || undefined,
      };
    } else if (coreStar) {
      // star_mapsがなくcore_starのみ（旧パスで保存されたデータ）
      starMap = {
        coreStar: {
          confidenceScore: Math.min(0.85, Number(coreStar.confidence_score) || 0),
          coreTraits: coreStar.core_traits || {},
        },
        liveSky: coreStar.core_traits
          ? { dimensions: coreStar.core_traits }
          : undefined,
      };
    }

    // ── ResolvedType（resolved_types優先）──
    let resolvedType = null;
    if (liveResolvedResult) {
      resolvedType = {
        reactionType: liveResolvedResult.reactionType,
        confidence: liveResolvedResult.confidence,
        axisScores,
        axisConfidences: liveResolvedResult.axisConfidences,
        family: personalityRow
          ? {
              name: personalityRow.primary_system || "",
              tagline: personalityRow.orbit_type || "",
            }
          : undefined,
        orbit: personalityRow
          ? {
              key: personalityRow.orbit_type || "",
              tagline: personalityRow.type_key || "",
            }
          : undefined,
      };
    } else if (resolvedTypeRow) {
      resolvedType = {
        reactionType: resolvedTypeRow.archetype_code ?? null,
        confidence: Math.min(0.85, Number(resolvedTypeRow.confidence) || 0),
        axisScores: resolvedTypeRow.axis_scores || {},
        family: personalityRow
          ? {
              name: personalityRow.primary_system || "",
              tagline: personalityRow.orbit_type || "",
            }
          : undefined,
        orbit: personalityRow
          ? {
              key: personalityRow.orbit_type || "",
              tagline: personalityRow.type_key || "",
            }
          : undefined,
      };
    }

    // ── PersonalityProfile ──
    let personalityProfile = null;
    if (personalityRow) {
      const dimensions: Record<string, number> = {};
      for (const key of [
        "s_order", "s_exploration", "s_resonance", "s_agency",
        "s_depth", "s_practicality", "s_sensitivity", "s_strategy",
        "o_stability", "o_adaptability", "o_defense", "o_momentum",
      ]) {
        if (personalityRow[key] != null) {
          dimensions[key] = Number(personalityRow[key]);
        }
      }
      personalityProfile = {
        userId: user.id,
        dimensions,
        tags: profile?.tags || [],
        summary: personalityRow.type_key || undefined,
        updatedAt: personalityRow.updated_at,
      };
    } else if (hasAxisEvidence || profile?.dimensions) {
      personalityProfile = {
        userId: user.id,
        dimensions: axisScores,
        tags: profile?.tags || [],
        updatedAt: profile?.updated_at ?? new Date().toISOString(),
      };
    }

    // ── DimensionDetails（15軸スコア）── Horizon Function で実データ使用
    const dimensionDetails = TRAIT_AXES.map((axis) => {
      const score = axisScores[axis.id] ?? 0;
      const distForAxis = liveDistributions.find((d) => d.axis === axis.id);
      return {
        id: axis.id,
        score,
        confidence: distForAxis?.confidence ?? Math.min(0.3, Math.abs(score) * 0.5),
        evidenceCount: distForAxis?.observationCount ?? 0,
        category: axis.category,
        labelLeft: axis.labelLeft,
        labelRight: axis.labelRight,
      };
    });

    // ── Observation Stats ──
    const dailyResponseTimes = (dailyStates ?? []).flatMap((row) =>
      extractDailyResponseTimes((row.raw_answers as DailyRawAnswersPayload) ?? null),
    );
    const observationResponseTimes = (observations ?? [])
      .map((o: Record<string, number | null>) => o.response_time_ms || 0)
      .filter((value) => value > 0);
    const allResponseTimes = [...observationResponseTimes, ...dailyResponseTimes];
    const hesitationSamples = (observations ?? [])
      .map((o: Record<string, number | null>) => o.hesitation_level)
      .filter((value): value is number => typeof value === "number");

    const stats =
      allResponseTimes.length > 0
        ? {
            totalAnswered: allResponseTimes.length,
            avgResponseTimeMs:
              allResponseTimes.reduce((sum, value) => sum + value, 0) /
              allResponseTimes.length,
            fastAnswerCount: allResponseTimes.filter((value) => value < 2000)
              .length,
            slowAnswerCount: allResponseTimes.filter((value) => value > 5000)
              .length,
            avgHesitation:
              hesitationSamples.length > 0
                ? hesitationSamples.reduce((sum, value) => sum + value, 0) /
                  hesitationSamples.length
                : 0,
          }
        : null;

    // ── stageProgress 自動修復 ──
    let stageProgress = profile?.stage_progress || null;
    if (
      (starMapRow || coreStar) &&
      (!stageProgress || stageProgress.stage === "none")
    ) {
      stageProgress = { stage: "stage1_done" };
      if (profile) {
        await supabase
          .from("stargazer_profiles")
          .update({ stage_progress: stageProgress })
          .eq("user_id", user.id);
      } else {
        await supabase.from("stargazer_profiles").upsert({
          user_id: user.id,
          dimensions: axisScores,
          tags: [],
          stage_progress: stageProgress,
          observation_mode: "continuous",
          total_sessions: 0,
        });
      }
    }

    // ── contextFaces: コンテキスト別スコア（friends / romance / work）──
    let contextFaces: Record<string, Record<string, number>> | null = null;
    if (axisSnapshots.length >= 3) {
      const ctxMap = new Map<string, Map<string, { sum: number; count: number }>>();
      for (const s of axisSnapshots) {
        if (!s.context) continue;
        if (!ctxMap.has(s.context)) ctxMap.set(s.context, new Map());
        const axisMap = ctxMap.get(s.context)!;
        const cur = axisMap.get(s.axis_id) ?? { sum: 0, count: 0 };
        cur.sum += s.score;
        cur.count += 1;
        axisMap.set(s.axis_id, cur);
      }
      if (ctxMap.size > 0) {
        contextFaces = {};
        for (const [ctx, axisMap] of ctxMap) {
          contextFaces[ctx] = {};
          for (const [axisId, { sum, count }] of axisMap) {
            contextFaces[ctx][axisId] = sum / count;
          }
        }
      }
    }
    if (resolvedType && contextFaces) {
      (resolvedType as Record<string, unknown>).contextFaces = contextFaces;
    }

    // ── stateFaces: エネルギー状態別スコア（stressed / relaxed / high_energy / low_energy）──
    let stateFaces: Record<string, Record<string, number>> | null = null;
    if (axisSnapshots.length >= 5) {
      const stateMap = new Map<string, Map<string, { sum: number; count: number }>>();
      for (const s of axisSnapshots) {
        const energy = (s.state as Record<string, string> | null)?.energy;
        if (!energy) continue;
        if (!stateMap.has(energy)) stateMap.set(energy, new Map());
        const axisMap = stateMap.get(energy)!;
        const cur = axisMap.get(s.axis_id) ?? { sum: 0, count: 0 };
        cur.sum += s.score;
        cur.count += 1;
        axisMap.set(s.axis_id, cur);
      }
      if (stateMap.size > 0) {
        stateFaces = {};
        for (const [state, axisMap] of stateMap) {
          stateFaces[state] = {};
          for (const [axisId, { sum, count }] of axisMap) {
            stateFaces[state][axisId] = sum / count;
          }
        }
      }
    }

    // ── 揺らぎエンジン: 軸分布 + パターン + インサイト ──
    let fluctuation = null;
    if (axisSnapshots.length >= 3) {
      const patterns = detectFluctuationPatterns(axisSnapshots, liveDistributions);
      const insights = generateCompanionInsights(liveDistributions, patterns);

      fluctuation = {
        distributions: liveDistributions.slice(0, 15), // 上位15軸
        patterns,
        insights,
        snapshotCount: axisSnapshots.length,
      };
    }

    // ── v3 Archetype Resolution (with Hysteresis) ──
    // 45軸スコアから4層アーキタイプを判定
    // 安定化: オンボーディング基盤スコアと現在のブレンドスコアの両方から判定し、
    // 差分が明確な場合のみ変更する（ヒステリシス）
    let archetypeResult: (ReturnType<typeof resolveArchetype> & {
      name?: string;
      emoji?: string;
      tagline?: string;
    }) | null = null;
    if (hasAxisEvidence) {
      // 本番: 従来の resolveArchetype をメインで使用
      const raw = resolveArchetype(axisScores);

      // ── 段階投入: 不確実性加重版の比較ログ ──
      // 新方式はログ出力のみ。差異があるユーザーのパターンを分析し、
      // 安全を確認してから全量切替する。
      const beliefs = profile?.axis_beliefs
        ? deserializeBeliefs(profile.axis_beliefs as Record<string, { mu: number; precision: number }>)
        : null;

      if (beliefs) {
        try {
          const uncertaintyRaw = resolveArchetypeWithUncertainty(axisScores, beliefs);
          if (uncertaintyRaw.code !== raw.code) {
            console.log(
              `[archetype-comparison] user=${user.id.slice(0, 8)} old=${raw.code}(conf=${raw.confidence.toFixed(3)}) new=${uncertaintyRaw.code}(conf=${uncertaintyRaw.confidence.toFixed(3)}) sessions=${profile?.total_sessions ?? 0}`,
            );
          }
        } catch {
          // 比較ログ失敗は無視
        }
      }

      // ヒステリシス: オンボーディング基盤のアーキタイプと比較
      const baselineScores = createEmptyAxisScores();
      mergeAxisScores(baselineScores, profile?.dimensions ?? null);
      mergeAxisScores(baselineScores, coreStar?.core_traits ?? null);
      mergeAxisScores(baselineScores, starMapRow?.core_star?.coreTraits ?? null);
      mergeAxisScores(baselineScores, resolvedTypeRow?.axis_scores ?? null);
      const hasBaseline = Object.values(baselineScores).some((v) => Math.abs(v) > 0.001);

      let finalArchetype = raw;
      if (hasBaseline) {
        const baselineArchetype = resolveArchetype(baselineScores);
        if (raw.code !== baselineArchetype.code) {
          const HYSTERESIS_THRESHOLD = 0.25;
          const layerMargins = [raw.layer1, raw.layer2, raw.layer3, raw.layer4].map((l) => {
            const sorted = Object.values(l.scores).sort((a, b) => b - a);
            const denom = Math.max(Math.abs(sorted[0]), 0.01);
            return (sorted[0] - sorted[1]) / denom;
          });
          const minMargin = Math.min(...layerMargins);

          if (minMargin < HYSTERESIS_THRESHOLD) {
            finalArchetype = baselineArchetype;
          }
        }
      }

      const def = getArchetypeByCode(finalArchetype.code);
      const interactionResult = applyLayerInteractions(finalArchetype);
      archetypeResult = {
        ...finalArchetype,
        name: def?.name,
        emoji: def?.emoji,
        tagline: def?.tagline,
        interactionInsights: interactionResult.insights,
      };
    }

    // ── 時系列データ: metamorphosisLaw / entropySignature / temporalDiff 用 ──
    let timePoints: {
      axisId: string;
      score: number;
      date: string;
      context?: string;
      energy?: string;
    }[] = [];
    let axisScoreHistory: Record<string, number[]> = {};
    let reobservationHistory: {
      axisId: string;
      currentScore: number;
      previousScore: number;
      currentDate: string;
      previousDate: string;
    }[] = [];

    if (axisSnapshots.length >= 3) {
      // timePoints: 全スナップショットを AxisTimePoint 形式に変換
      timePoints = axisSnapshots.map((s) => ({
        axisId: s.axis_id,
        score: s.score,
        date: s.session_date,
        context: s.context ?? undefined,
        energy: s.state?.energy ?? undefined,
      }));

      // axisScoreHistory: 軸ごとのスコア配列（entropySignature用）
      const grouped = new Map<string, number[]>();
      for (const s of axisSnapshots) {
        const arr = grouped.get(s.axis_id) ?? [];
        arr.push(s.score);
        grouped.set(s.axis_id, arr);
      }
      axisScoreHistory = Object.fromEntries(grouped);

      // reobservationHistory: 同一軸の前回→今回のスコア差分（temporalDiff用）
      const byAxis = new Map<string, { score: number; date: string }[]>();
      for (const s of axisSnapshots) {
        const arr = byAxis.get(s.axis_id) ?? [];
        arr.push({ score: s.score, date: s.session_date });
        byAxis.set(s.axis_id, arr);
      }
      for (const [axisId, entries] of byAxis) {
        if (entries.length < 2) continue;
        // entries は session_date desc でソートされている
        const current = entries[0];
        const previous = entries[1];
        if (current.date !== previous.date) {
          reobservationHistory.push({
            axisId,
            currentScore: current.score,
            previousScore: previous.score,
            currentDate: current.date,
            previousDate: previous.date,
          });
        }
      }
      // 変化量が大きい順に上位10軸
      reobservationHistory = reobservationHistory
        .sort((a, b) => Math.abs(b.currentScore - b.previousScore) - Math.abs(a.currentScore - a.previousScore))
        .slice(0, 10);
    }

    // 実観測数: 各daily_stateのraw_answers内の回答数を合算 + observations行数
    // daily_statesは1日1行のupsertなので行数ではなく回答数を数える
    let dailyAnswerCount = 0;
    for (const row of (dailyStates ?? [])) {
      const rawAnswers = row.raw_answers as { answers?: unknown[] } | null;
      if (rawAnswers?.answers && Array.isArray(rawAnswers.answers)) {
        dailyAnswerCount += rawAnswers.answers.length;
      } else {
        // raw_answersがない場合は最低1回答としてカウント
        dailyAnswerCount += 1;
      }
    }
    const actualObservationCount = dailyAnswerCount + (observations?.length ?? 0);

    // 初期観測（オンボーディング）完了フラグ:
    // stargazer_star_maps / stargazer_resolved_types は初期観測(semantic_differential/stage1)完了時のみ書き込まれる。
    // daily_observation や home_bridge では書き込まれないため、
    // これらの存在をもって初期観測完了を判定する。
    const hasCompletedInitialObservation = !!(starMapRow || coreStar || resolvedTypeRow);

    // 今日の観測数（行数ではなく、今日のraw_answers内の回答数を合算）
    const todayStr = todayJST();
    let todayObservationCount = 0;
    for (const row of (dailyStates ?? [])) {
      const r = row as Record<string, unknown>;
      if (typeof r.observation_date === "string" && (r.observation_date as string).startsWith(todayStr)) {
        const rawAnswers = r.raw_answers as { answers?: unknown[] } | null;
        if (rawAnswers?.answers && Array.isArray(rawAnswers.answers)) {
          todayObservationCount += rawAnswers.answers.length;
        } else {
          todayObservationCount += 1;
        }
      }
    }

    // ── Context Profiles (相手別プロファイル) ──
    let contextProfiles: Record<string, { axisScores: Record<string, number>; observationCount: number }> | undefined;
    try {
      const { data: ctxRows } = await supabase
        .from("stargazer_context_profiles")
        .select("context, axis_scores, observation_count")
        .eq("user_id", user.id);
      if (ctxRows && ctxRows.length > 0) {
        contextProfiles = {};
        for (const row of ctxRows) {
          contextProfiles[row.context] = {
            axisScores: row.axis_scores as Record<string, number>,
            observationCount: (row as Record<string, unknown>).observation_count as number ?? 0,
          };
        }
      }
    } catch {
      // テーブル未作成時のエラーを無視
    }

    // ── Prediction Accuracy (AI学習統計) ──
    let predictionAccuracy: { overallAccuracy: number; totalPredictions: number; categoryAccuracy: Record<string, { accuracy: number; totalPredictions: number }> } | undefined;
    try {
      const { data: accRow } = await supabase
        .from("stargazer_prediction_accuracy")
        .select("total_predictions, accuracy_percentage, category_accuracy")
        .eq("user_id", user.id)
        .maybeSingle();
      if (accRow) {
        const totalPredictions = Number(accRow.total_predictions ?? 0);
        const categoryAccuracy = normalizeCategoryAccuracy(accRow.category_accuracy);
        if (totalPredictions > 0 || Object.keys(categoryAccuracy).length > 0) {
          predictionAccuracy = {
            overallAccuracy: normalizeAccuracyPercent(accRow.accuracy_percentage),
            totalPredictions,
            categoryAccuracy,
          };
        }
      }
    } catch {
      // テーブル未作成時のエラーを無視
    }

    // ── Cognitive Fit スコア（実データ or トレイト推定フォールバック）──
    const cfSnapshots = axisSnapshots.filter((s) => s.observation_layer === "cognitive_fit");
    let cognitiveFit: Record<string, number> | null = null;
    let cognitiveFitSource: "observed" | "estimated" = "estimated";
    if (cfSnapshots.length > 0) {
      cognitiveFit = {};
      for (const s of cfSnapshots) {
        // 同一軸の最新スコアを採用
        if (!(s.axis_id in cognitiveFit)) {
          cognitiveFit[s.axis_id] = s.score;
        }
      }
      cognitiveFitSource = "observed";
    } else if (hasAxisEvidence) {
      // CF未回答: 既存性格軸から推定
      const estimated = estimateCognitiveFromTraits(axisScores);
      cognitiveFit = {};
      for (const [axis, score] of Object.entries(estimated)) {
        if (typeof score === "number") {
          cognitiveFit[axis] = score;
        }
      }
    }

    // ── CoreStar に archetype 情報を注入 ──
    if (starMap?.coreStar && archetypeResult) {
      starMap.coreStar.archetypeCode = archetypeResult.code;
      starMap.coreStar.archetypeLabel = archetypeResult.name ?? undefined;
      starMap.coreStar.archetypeEmoji = archetypeResult.emoji ?? undefined;
    }

    return NextResponse.json({
      ok: true,
      starMap,
      personalityProfile,
      resolvedType,
      archetypeResult,
      liveAxisScores: axisScores,
      actualObservationCount,
      hasCompletedInitialObservation,
      todayObservationCount,
      dimensionDetails: hasAxisEvidence ? dimensionDetails : [],
      observationStats: stats,
      stageProgress,
      observationMode: profile?.observation_mode || null,
      totalSessions: profile?.total_sessions || 0,
      fluctuation,
      stateFaces,
      contextProfiles,
      predictionAccuracy,
      timePoints: timePoints.length >= 2 ? timePoints : undefined,
      axisScoreHistory: Object.keys(axisScoreHistory).length >= 3 ? axisScoreHistory : undefined,
      reobservationHistory: reobservationHistory.length > 0 ? reobservationHistory : undefined,
      cognitiveFit: cognitiveFit ? {
        scores: cognitiveFit,
        source: cognitiveFitSource,
        ...deriveCognitiveFitDisplay(cognitiveFit),
      } : undefined,
      // ── Scoring Pipeline v2 outputs ──
      inferredAxes: Object.keys(inferredAxesMap).length > 0
        ? Object.fromEntries(
            Object.entries(inferredAxesMap).map(([axis, r]) => [
              axis,
              { score: r.estimatedScore, confidence: r.confidence, source: r.source, citation: r.citation },
            ])
          )
        : undefined,
      cascadeValidation: cascadeValidation
        ? {
            stats: cascadeValidation.stats,
            adjustments: cascadeValidation.confidenceAdjustments,
          }
        : undefined,
      scoringVersion: "v2",
      collinearityCorrected,
      // ── Cross-Axis Insights（軸間パターン）──
      crossAxisInsights: hasAxisEvidence ? generateCrossAxisInsights(axisScores) : undefined,
      // ── Belief-based sync percentage（エントロピーベース同期率）──
      syncPercentage: profile?.axis_beliefs
        ? computeSyncPercentage(deserializeBeliefs(profile.axis_beliefs as Record<string, { mu: number; precision: number }>))
        : undefined,
      isBetaTester: isBetaTesterEmail(user.email),
    }, {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("Failed to get profile:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
