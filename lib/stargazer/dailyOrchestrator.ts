// lib/stargazer/dailyOrchestrator.ts
// 日次観測プラン生成 — 毎日の観測対象を動的に選択する
// Pool優先 → フォールバックで既存ハードコード23問

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TraitAxisKey } from "./traitAxes";
import { type AdaptiveObservationPlan, getAdaptiveBoostMap } from "./adaptiveObservationTargeting";
import {
  ALL_QUESTION_VARIANTS,
  getVariantsByLayer,
  CONTINUOUS_OBSERVATION_AXES,
  type QuestionVariant,
  type ProbeContext,
} from "./questionVariants";
import {
  selectMultiAxisFromPool,
  selectFromPool,
  getRecentlyShownKeys,
  mapStateToPoolDimensions,
} from "./questionPool";
import type { EnergyTarget, SubjectContext } from "./questionPoolTypes";
import { calculateDepthReadiness } from "./depthReadiness";
import {
  selectDailyShadowPlay,
  type ShadowPlayQuestion,
} from "./shadowPlayQuestions";
import { type Stage3Question } from "./stage3Questions";
import { selectStage3Question } from "./stage3Bridge";
import {
  generateAdaptiveFollowUps,
  type FollowUpQuestion,
  type AdaptiveFollowUpContext,
} from "./adaptiveFollowUp";
import type { TraitEvolutionResult } from "./traitEvolution";
import {
  selectByEIG,
  type QuestionEIGScore,
} from "./informationGain";
import type { BeliefSet } from "./bayesianAxisUpdater";

export interface DeltaCheck {
  axisId: TraitAxisKey;
  previousScore: number;
  previousDate: string;
  prompt: string;
  options: { id: string; label: string; delta: number }[];
}

/** 再観測: 過去に聞いた同じ質問を再度出して揺らぎを測る */
export interface ReobservationQuestion {
  variant: QuestionVariant;
  previousScore: number;
  previousDate: string;
  previousVariantId: string;
  isReobservation: true;
}

/** フレーミング効果質問: 同じ軸をポジティブ/ネガティブの異なる枠組みで問う */
export interface FramingEffectQuestion {
  /** 対象軸 */
  axisId: TraitAxisKey;
  /** ポジティブフレーミング版 */
  positiveVariant: QuestionVariant;
  /** ネガティブフレーミング版 */
  negativeVariant: QuestionVariant;
  /** 前回のスコア（比較用） */
  previousScore?: number;
}

export interface DailyObservationPlan {
  stateQuestions: QuestionVariant[];   // 5-6問（今の状態）
  contextQuestions: QuestionVariant[];  // 0-2問（文脈紐づき）
  deepQuestions: (QuestionVariant & { uxHint?: string })[]; // 0-2問（深化質問）
  shadowPlayQuestion?: ShadowPlayQuestion; // 0-1問（影絵: 投影法による深層観測）
  stage3Question?: Stage3Question;      // 0-1問（Stage 3: 深層シナリオ質問）
  deltaChecks: DeltaCheck[];            // 0-2問（過去との差分確認）
  reobservation?: ReobservationQuestion; // 0-1問（再観測: 同じ質問を再度）
  followUpProbes: FollowUpQuestion[];   // 0-2問（適応的フォローアップ: 回避・矛盾検出時）
  /** フレーミング効果質問: 同じ概念を異なる枠組みで問い、フレーミング感受性を測定 */
  framingEffectQuestion?: FramingEffectQuestion;
  /** Prochaska 変容ステージに基づく推奨質問タイプ */
  preferredQuestionType?: "awareness" | "conflict" | "behavioral_scenario" | "stability_check";
  sessionLabel: string;                // UI表示用
  /** 後方互換: 旧フィールドアクセス用 */
  contextQuestion?: QuestionVariant;
  deepQuestion?: QuestionVariant & { uxHint?: string };
  deltaCheck?: DeltaCheck;
}

interface AxisObservationHistory {
  axisId: string;
  totalObservations: number;
  lastObservedAt: string | null;
  recentVariantIds: string[];          // 直近7日で使用したバリアントID
  contextCounts: Record<string, number>; // context → 観測回数
  lastScore?: number;
  lastScoreDate?: string;
  // 再観測用: 過去に使ったバリアントとスコアの履歴
  variantHistory?: { variantId: string; score: number; date: string }[];
}

/** Pool統合オプション */
export interface DailyPlanPoolOptions {
  supabase?: SupabaseClient;
  userId?: string;
  observationState?: { energy?: string; emotion?: string; social?: string } | null;
  /** Prochaska 変容ステージ（traitEvolution.ts の analyzeTraitEvolution() から取得） */
  changeStage?: TraitEvolutionResult["changeStage"];
  /** Adaptive Observation Targeting からのブーストマップ */
  adaptivePlan?: AdaptiveObservationPlan;
  /** ベイズ信念（EIG ベース質問選択に使用） */
  beliefs?: BeliefSet;
}

/**
 * 軸カテゴリ分類 — relationship(対人関係) と emotional(感情・自己調整) の均等配分を保証
 */
const AXIS_CATEGORY: Record<string, "relationship" | "emotional"> = {
  intimacy_pace: "relationship",
  boundary_awareness: "relationship",
  independence_vs_harmony: "relationship",
  public_private_gap: "relationship",
  emotional_variability: "emotional",
  stress_isolation_vs_social: "emotional",
  reassurance_need: "emotional",
  emotional_regulation: "emotional",
};

function getAxisCategory(axisId: string): "relationship" | "emotional" {
  return AXIS_CATEGORY[axisId] ?? "emotional";
}

/**
 * 直近の観測データから今日の観測優先軸を算出
 *
 * v2: BeliefSet が提供されている場合は EIG（期待情報利得）ベースで選択。
 *     これにより5つのヒューリスティック因子を1つの情報理論的指標で置き換える。
 *
 * フォールバック: beliefs が無い場合は従来のヒューリスティックを維持。
 */
function computeAdaptivePriorities(
  history: AxisObservationHistory[],
  beliefs?: BeliefSet,
): Map<string, number> {
  const priorities = new Map<string, number>();

  // ── EIG ベース（beliefs がある場合）──
  if (beliefs) {
    for (const h of history) {
      const axisId = h.axisId as TraitAxisKey;
      const belief = beliefs[axisId];
      if (!belief) continue;

      // EIG = 0.5 × ln(1 + evidencePrecision / priorPrecision)
      // 質問の平均的な証拠精度 ≈ 0.4（daily weight）
      const estimatedEvidence = 0.4;
      const eig = 0.5 * Math.log(1 + estimatedEvidence / belief.precision);

      // 相関軸への波及EIGも加算（informationGain.ts と同じロジック）
      // ここでは簡易版: 直接EIGのみ（相関はrankQuestionsByEIGで完全計算）
      priorities.set(h.axisId, eig);
    }
    return priorities;
  }

  // ── フォールバック: 従来のヒューリスティック ──
  const now = Date.now();

  for (const h of history) {
    let priority = 0;

    if (h.lastObservedAt) {
      const daysSince = (now - new Date(h.lastObservedAt).getTime()) / 86400000;
      priority += Math.min(daysSince / 7, 1) * 0.3;
    } else {
      priority += 0.3;
    }

    if (h.totalObservations < 5) {
      priority += (1 - h.totalObservations / 5) * 0.2;
    }

    if (h.lastScore !== undefined && Math.abs(h.lastScore) > 0.6) {
      priority += 0.15;
    }

    if (h.variantHistory && h.variantHistory.length >= 3) {
      const scores = h.variantHistory.slice(0, 5).map(v => v.score);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
      if (variance > 0.1) {
        priority += Math.min(variance, 0.5) * 0.35;
      }
    }

    if (h.variantHistory && h.variantHistory.length >= 2) {
      const scores = h.variantHistory.map(v => v.score);
      const n = scores.length;
      const mean = scores.reduce((a, b) => a + b, 0) / n;
      const stdDev = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
      const se = stdDev / Math.sqrt(n);
      if (se > 0.3) {
        priority += Math.min(se, 0.8) * 0.25;
      }
    }

    priorities.set(h.axisId, priority);
  }

  return priorities;
}

/**
 * 日次観測プランを生成
 * Pool優先 → フォールバックで既存ハードコード23問
 * @param history 各軸の観測履歴
 * @param totalSessions ユーザーの総セッション数
 * @param poolOptions Pool統合用オプション（省略時はハードコードのみ）
 */
export async function generateDailyPlan(
  history: AxisObservationHistory[],
  totalSessions: number,
  poolOptions?: DailyPlanPoolOptions,
): Promise<DailyObservationPlan> {
  // Fetch active lens IDs for pool query enrichment
  let activeLensIds: string[] = [];
  if (poolOptions?.supabase) {
    try {
      const { data: lenses } = await poolOptions.supabase
        .from("stargazer_observation_lenses")
        .select("id")
        .eq("status", "active")
        .limit(20);
      activeLensIds = (lenses ?? []).map((l: { id: string }) => l.id);
    } catch { /* lenses are optional enrichment */ }
  }

  const stateQuestions = await selectStateQuestions(history, totalSessions, poolOptions, activeLensIds);
  const contextQuestions = await selectContextQuestions(history, totalSessions, poolOptions, activeLensIds);

  const deepQuestions: (QuestionVariant & { uxHint?: string })[] = [];
  if (poolOptions) {
    // 2問まで深化質問を取得
    const dq1 = await selectDeepQuestion(poolOptions);
    if (dq1) deepQuestions.push(dq1);
    if (totalSessions >= 10) {
      const dq2 = await selectDeepQuestion(poolOptions, dq1?.id);
      if (dq2) deepQuestions.push(dq2);
    }
  }

  // 影絵質問: 3セッション目以降、毎セッションで出題
  const shadowPlayQuestion = selectShadowPlayForPlan(totalSessions, poolOptions?.userId);

  // Stage 3 深層シナリオ質問: 20セッション目以降、5セッションに1問
  const today = new Date().toISOString().split("T")[0];
  const stage3Seed = today + (poolOptions?.userId ?? "");
  const stage3Question = selectStage3Question(totalSessions, stage3Seed) ?? undefined;

  const deltaChecks = selectDeltaChecks(history);
  const reobservation = selectReobservation(history, totalSessions);

  const sessionLabel = getSessionLabel(totalSessions);

  // ── Adaptive Follow-Up Probes ──
  // 回避・矛盾が検出された軸に対してフォローアッププローブを生成する
  const followUpProbes = selectFollowUpProbes(history, totalSessions);

  // ── Framing Effect Question ──
  // 10セッション以降、4セッションに1回、同じ軸をポジ/ネガの異なるフレームで出題
  const framingEffectQuestion = selectFramingEffectQuestion(history, totalSessions);

  // ── Prochaska Stage → preferredQuestionType ──
  const preferredQuestionType = mapChangeStageToQuestionType(poolOptions?.changeStage);

  return {
    stateQuestions,
    contextQuestions,
    deepQuestions,
    shadowPlayQuestion: shadowPlayQuestion || undefined,
    stage3Question,
    deltaChecks,
    reobservation: reobservation || undefined,
    followUpProbes,
    framingEffectQuestion: framingEffectQuestion || undefined,
    preferredQuestionType,
    sessionLabel,
    // 後方互換
    contextQuestion: contextQuestions[0],
    deepQuestion: deepQuestions[0],
    deltaCheck: deltaChecks[0],
  };
}

/**
 * State Questions: 3-5問を選択
 * Pool優先 → フォールバックでハードコード
 */
async function selectStateQuestions(
  history: AxisObservationHistory[],
  totalSessions: number,
  poolOptions?: DailyPlanPoolOptions,
  activeLensIds?: string[],
): Promise<QuestionVariant[]> {
  const targetCount = totalSessions < 3 ? 6 : totalSessions < 7 ? 5 : 5;

  // ── Pool優先: supabase + userId がある場合 ──
  if (poolOptions?.supabase && poolOptions?.userId) {
    try {
      const recentKeys = await getRecentlyShownKeys(
        poolOptions.userId,
        14, // 14日窓（Poolは質問数が多いので広めに）
        poolOptions.supabase,
      );

      // 既存ハードコードの最近使用分も除外に含める
      const recentVariantSet = new Set<string>(recentKeys);
      for (const h of history) {
        for (const vid of h.recentVariantIds) {
          recentVariantSet.add(vid);
        }
      }

      const dims = mapStateToPoolDimensions(poolOptions.observationState ?? null);

      const poolQuestions = await selectMultiAxisFromPool(
        [...CONTINUOUS_OBSERVATION_AXES],
        targetCount,
        [...recentVariantSet],
        dims.energyTarget,
        dims.preferredSubjects,
        poolOptions.supabase,
        poolOptions.userId,
        activeLensIds,
        poolOptions.beliefs,
      );

      if (poolQuestions.length >= targetCount) {
        return poolQuestions;
      }

      // Pool不足分をハードコードで補完
      if (poolQuestions.length > 0) {
        const remaining = targetCount - poolQuestions.length;
        const usedAxes = new Set(poolQuestions.map((q) => q.axisId));
        const fallback = selectHardcodedStateQuestions(
          history,
          remaining,
          usedAxes,
          poolOptions.userId,
          undefined,
          poolOptions.beliefs,
        );
        return [...poolQuestions, ...fallback];
      }
    } catch (e) {
      console.warn("[dailyOrchestrator] Pool selection failed, using hardcoded:", e);
    }
  }

  // ── フォールバック: 既存ハードコードロジック ──
  return selectHardcodedStateQuestions(history, targetCount, undefined, poolOptions?.userId, poolOptions?.adaptivePlan, poolOptions?.beliefs);
}

/**
 * 既存ハードコードからState Questionsを選択
 *
 * v2: BeliefSet が提供されている場合は EIG ベースで質問を選択。
 *     情報利得が最大の質問を優先しつつ、カテゴリバランスを保つ。
 *
 * フォールバック: beliefs が無い場合は従来のヒューリスティック。
 */
function selectHardcodedStateQuestions(
  history: AxisObservationHistory[],
  targetCount: number,
  excludeAxes?: Set<string>,
  userSeed?: string,
  adaptivePlan?: AdaptiveObservationPlan,
  beliefs?: BeliefSet,
): QuestionVariant[] {
  const stateVariants = getVariantsByLayer("state");

  const recentVariantSet = new Set<string>();
  for (const h of history) {
    for (const vid of h.recentVariantIds) {
      recentVariantSet.add(vid);
    }
  }

  const fresh = stateVariants.filter((v) => !recentVariantSet.has(v.id));
  const candidates = fresh.length >= targetCount ? fresh : stateVariants;

  // ── EIG ベース選択（beliefs がある場合）──
  if (beliefs) {
    const eigCandidates = candidates.map((v) => ({
      id: v.id,
      axisId: v.axisId,
      weight: 0.4, // state questions の典型的な weight
    }));

    const categoryMap: Record<string, string> = {};
    for (const v of candidates) {
      categoryMap[v.axisId] = getAxisCategory(v.axisId);
    }

    const eigSelected = selectByEIG(
      eigCandidates,
      beliefs,
      targetCount,
      excludeAxes,
      categoryMap,
    );

    // EIG スコアを持つ質問IDから元の QuestionVariant を引く
    const selectedIds = new Set(eigSelected.map((s) => s.questionId));
    const result = candidates.filter((v) => selectedIds.has(v.id));

    // EIG の順序を維持
    result.sort((a, b) => {
      const aIdx = eigSelected.findIndex((s) => s.questionId === a.id);
      const bIdx = eigSelected.findIndex((s) => s.questionId === b.id);
      return aIdx - bIdx;
    });

    // 不足分をフォールバックで補充
    if (result.length < targetCount) {
      const usedAxes = new Set(result.map((r) => r.axisId));
      for (const v of candidates) {
        if (result.length >= targetCount) break;
        if (usedAxes.has(v.axisId) || selectedIds.has(v.id)) continue;
        result.push(v);
        usedAxes.add(v.axisId);
      }
    }

    return result;
  }

  // ── フォールバック: 従来のヒューリスティック ──
  const adaptivePriorities = computeAdaptivePriorities(history);

  if (adaptivePlan) {
    const boostMap = getAdaptiveBoostMap(adaptivePlan);
    for (const [axisId, { boost }] of boostMap) {
      const current = adaptivePriorities.get(axisId) ?? 0;
      adaptivePriorities.set(axisId, current + boost);
    }
  }

  const axisObsCount = new Map<string, number>();
  for (const h of history) {
    axisObsCount.set(h.axisId, h.totalObservations);
  }

  const sorted = [...candidates].sort((a, b) => {
    const aPriority = adaptivePriorities.get(a.axisId) ?? 0;
    const bPriority = adaptivePriorities.get(b.axisId) ?? 0;
    if (Math.abs(aPriority - bPriority) > 0.05) return bPriority - aPriority;

    const aCount = axisObsCount.get(a.axisId) || 0;
    const bCount = axisObsCount.get(b.axisId) || 0;
    if (aCount !== bCount) return aCount - bCount;

    return hashStr(`${userSeed ?? ""}:${a.id}`) - hashStr(`${userSeed ?? ""}:${b.id}`);
  });

  const selected: QuestionVariant[] = [];
  const usedAxes = new Set<string>(excludeAxes ?? []);
  const categoryCount = { relationship: 0, emotional: 0 };
  const halfTarget = Math.ceil(targetCount / 2);

  for (const variant of sorted) {
    if (selected.length >= targetCount) break;
    if (usedAxes.has(variant.axisId)) continue;

    const cat = getAxisCategory(variant.axisId);
    if (categoryCount[cat] >= halfTarget) continue;

    selected.push(variant);
    usedAxes.add(variant.axisId);
    categoryCount[cat]++;
  }

  if (selected.length < targetCount) {
    for (const variant of sorted) {
      if (selected.length >= targetCount) break;
      if (usedAxes.has(variant.axisId)) continue;
      selected.push(variant);
      usedAxes.add(variant.axisId);
    }
  }

  if (selected.length < targetCount) {
    for (const variant of sorted) {
      if (selected.length >= targetCount) break;
      if (selected.some((s) => s.id === variant.id)) continue;
      selected.push(variant);
    }
  }

  return selected;
}

/**
 * Context Questions: 0-3問を選択
 * Pool優先 → フォールバックでハードコード
 * セッション数に応じて質問数が増える
 */
async function selectContextQuestions(
  history: AxisObservationHistory[],
  totalSessions: number,
  poolOptions?: DailyPlanPoolOptions,
  activeLensIds?: string[],
): Promise<QuestionVariant[]> {
  if (totalSessions < 2) return [];

  const targetCount = totalSessions < 5 ? 1 : 2;

  // ── Pool優先 ──
  if (poolOptions?.supabase && poolOptions?.userId) {
    try {
      const recentKeys = await getRecentlyShownKeys(
        poolOptions.userId,
        14,
        poolOptions.supabase,
      );
      const dims = mapStateToPoolDimensions(poolOptions.observationState ?? null);

      const rankedContextAxes = [...CONTINUOUS_OBSERVATION_AXES].sort((a, b) => {
        const aHistory = history.find((entry) => entry.axisId === a);
        const bHistory = history.find((entry) => entry.axisId === b);
        const aContextCount = Object.values(aHistory?.contextCounts ?? {}).reduce(
          (sum, count) => sum + count,
          0,
        );
        const bContextCount = Object.values(bHistory?.contextCounts ?? {}).reduce(
          (sum, count) => sum + count,
          0,
        );
        if (aContextCount !== bContextCount) return aContextCount - bContextCount;

        const aTotal = aHistory?.totalObservations || 0;
        const bTotal = bHistory?.totalObservations || 0;
        if (aTotal !== bTotal) return aTotal - bTotal;

        return (
          hashStr(`${poolOptions.userId}:ctx-axis:${a}`) -
          hashStr(`${poolOptions.userId}:ctx-axis:${b}`)
        );
      });

      // Prefer non-self subjects for context questions
      const contextSubjects = dims.preferredSubjects.filter((s) => s !== "self");
      if (contextSubjects.length === 0) {
        contextSubjects.push("friends", "romantic_partner", "family");
      }

      const poolResults: QuestionVariant[] = [];
      const usedAxes = new Set<string>();
      for (const targetAxis of rankedContextAxes) {
        if (poolResults.length >= targetCount) break;
        if (usedAxes.has(targetAxis)) continue;

        const results = await selectFromPool(
          {
            axisId: targetAxis,
            layer: "context_bound",
            preferredSubjects: contextSubjects as SubjectContext[],
            preferredEnergy: dims.energyTarget,
            preferredLensIds: activeLensIds,
            excludeQuestionKeys: [...recentKeys, ...poolResults.map(q => q.id)],
            minQuality: 0.2,
            limit: 1,
            userSeed: poolOptions.userId,
          },
          poolOptions.supabase,
        );

        if (results.length > 0) {
          poolResults.push(results[0]);
          usedAxes.add(targetAxis);
        }
      }

      if (poolResults.length > 0) return poolResults;
    } catch (e) {
      console.warn("[dailyOrchestrator] Pool context selection failed:", e);
    }
  }

  // ── フォールバック: ハードコード ──
  const contextVariants = getVariantsByLayer("context_bound");
  if (contextVariants.length === 0) return [];

  const ranked = [...contextVariants].sort((a, b) => {
    const aHistory = history.find((h) => h.axisId === a.axisId);
    const bHistory = history.find((h) => h.axisId === b.axisId);
    const aCount = aHistory?.contextCounts[a.context || ""] || 0;
    const bCount = bHistory?.contextCounts[b.context || ""] || 0;
    if (aCount !== bCount) return aCount - bCount;

    const aTotal = aHistory?.totalObservations || 0;
    const bTotal = bHistory?.totalObservations || 0;
    if (aTotal !== bTotal) return aTotal - bTotal;

    return (
      hashStr(`${poolOptions?.userId ?? ""}:ctx:${a.id}`) -
      hashStr(`${poolOptions?.userId ?? ""}:ctx:${b.id}`)
    );
  });

  return ranked.slice(0, targetCount);
}

/**
 * Deep Question: 0-1問を選択
 * depthReadinessに基づき、ユーザーが準備できている深さの質問を選ぶ
 */
async function selectDeepQuestion(
  poolOptions: DailyPlanPoolOptions,
  excludeId?: string,
): Promise<(QuestionVariant & { uxHint?: string }) | undefined> {
  if (!poolOptions.supabase || !poolOptions.userId) return undefined;

  const readiness = await calculateDepthReadiness(
    poolOptions.userId, null, poolOptions.supabase
  );

  if (readiness.maxSafeDepth < 2 || readiness.dataConfidence === "none") {
    return undefined;
  }

  // Find a lens the user has answered questions about
  const { data: answeredLenses } = await poolOptions.supabase
    .from("stargazer_question_shown")
    .select("question_key")
    .eq("user_id", poolOptions.userId)
    .eq("answered", true)
    .order("shown_at", { ascending: false })
    .limit(50);

  if (!answeredLenses?.length) return undefined;

  // Get pool question details to find lens IDs
  const keys = answeredLenses.map(r => r.question_key).filter(k => k.startsWith("pool_"));
  if (keys.length === 0) return undefined;

  const { data: poolQuestions } = await poolOptions.supabase
    .from("stargazer_question_pool")
    .select("primary_lens_id, depth_score")
    .in("question_key", keys.slice(0, 50))
    .not("primary_lens_id", "is", null);

  const lensIds = [...new Set((poolQuestions ?? []).map(q => q.primary_lens_id).filter(Boolean))];
  if (lensIds.length === 0) return undefined;

  // Select a deep question from these lenses
  const excludeKeys = excludeId ? [excludeId] : [];
  const results = await selectFromPool(
    {
      axisId: CONTINUOUS_OBSERVATION_AXES[0] as TraitAxisKey,  // will be overridden by lens filter
      preferredLensIds: lensIds as string[],
      maxDepth: readiness.maxSafeDepth,
      minQuality: 0.3,
      limit: 1,
      userSeed: poolOptions.userId,
      excludeQuestionKeys: excludeKeys,
    },
    poolOptions.supabase,
  );

  if (results.length === 0) return undefined;

  const variant = results[0];
  // Fetch the ux_hint from pool
  const { data: poolRow } = await poolOptions.supabase
    .from("stargazer_question_pool")
    .select("ux_hint")
    .eq("question_key", variant.id)
    .single();

  return {
    ...variant,
    uxHint: (poolRow?.ux_hint as string) || undefined,
  };
}

/**
 * Delta Checks: 0-2問を選択
 * - 3回以上観測済み & 4日以上経過した軸がある場合のみ
 */
function selectDeltaChecks(
  history: AxisObservationHistory[]
): DeltaCheck[] {
  const fourDaysAgo = new Date();
  fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
  const cutoff = fourDaysAgo.toISOString().split("T")[0];

  const eligible = history.filter(
    (h) =>
      h.totalObservations >= 3 &&
      h.lastScoreDate &&
      h.lastScoreDate <= cutoff &&
      h.lastScore !== undefined
  );

  if (eligible.length === 0) return [];

  // 最も古い観測の軸を優先
  eligible.sort((a, b) => (a.lastScoreDate! > b.lastScoreDate! ? 1 : -1));

  const results: DeltaCheck[] = [];
  for (const target of eligible.slice(0, 2)) {
    const axis = CONTINUOUS_OBSERVATION_AXES.find((a) => a === target.axisId);
    if (!axis) continue;

    const prevScore = target.lastScore!;
    const tendencyLabel =
      prevScore > 0.3
        ? "やや強め"
        : prevScore < -0.3
        ? "やや控えめ"
        : "中間的";

    results.push({
      axisId: axis,
      previousScore: prevScore,
      previousDate: target.lastScoreDate!,
      prompt: `前回は「${tendencyLabel}」の傾向でした。今はどうですか？`,
      options: [
        { id: "same", label: "変わらない", delta: 0 },
        { id: "slightly_more", label: "少し強くなった", delta: 0.15 },
        { id: "slightly_less", label: "少し弱くなった", delta: -0.15 },
        { id: "much_changed", label: "かなり変わった", delta: prevScore > 0 ? -0.4 : 0.4 },
      ],
    });
  }

  return results;
}

/**
 * Re-observation: 0-1問を選択
 * 過去に聞いた同じ質問を再度出し、回答の揺らぎを測定する。
 * - totalSessions >= 5 の場合にのみ有効
 * - 3セッションに1回の頻度で出題
 * - 14日以上前に回答したバリアントを優先
 */
function selectReobservation(
  history: AxisObservationHistory[],
  totalSessions: number
): ReobservationQuestion | null {
  // 十分な観測回数がなければスキップ
  if (totalSessions < 5) return null;

  // 2セッションに1回の頻度
  if (totalSessions % 2 !== 0) return null;

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoff = fourteenDaysAgo.toISOString().split("T")[0];

  // バリアント履歴がある軸を探す
  const candidates: {
    variant: QuestionVariant;
    previousScore: number;
    previousDate: string;
    variantId: string;
    daysSince: number;
  }[] = [];

  for (const h of history) {
    if (!h.variantHistory || h.variantHistory.length === 0) continue;

    // 14日以上前の回答を探す
    for (const vh of h.variantHistory) {
      if (vh.date > cutoff) continue; // まだ早すぎる

      const variant = ALL_QUESTION_VARIANTS.find((v) => v.id === vh.variantId);
      if (!variant) continue;

      const daysSince = Math.round(
        (Date.now() - new Date(vh.date).getTime()) / 86400000
      );

      candidates.push({
        variant,
        previousScore: vh.score,
        previousDate: vh.date,
        variantId: vh.variantId,
        daysSince,
      });
    }
  }

  if (candidates.length === 0) return null;

  // 最も古い回答を優先 (揺らぎ検出の精度が高い)
  candidates.sort((a, b) => b.daysSince - a.daysSince);
  const best = candidates[0];

  return {
    variant: best.variant,
    previousScore: best.previousScore,
    previousDate: best.previousDate,
    previousVariantId: best.variantId,
    isReobservation: true,
  };
}

/**
 * Shadow Play (影絵) 質問を選択
 * - 3セッション目以降に有効
 * - 2セッションに1回の頻度で出題
 * - 既出のShadow Play質問IDはlocalStorageに記録して除外
 */
function selectShadowPlayForPlan(
  totalSessions: number,
  userId?: string,
): ShadowPlayQuestion | null {
  // 初期セッションでは影絵質問を出さない
  if (totalSessions < 3) return null;

  // 毎セッションで出題（以前は2セッションに1回）

  const today = new Date().toISOString().split("T")[0];
  // 最近出した影絵質問IDを取得（localStorageから）
  const recentIds = getRecentShadowPlayIds();

  const selected = selectDailyShadowPlay(today + (userId ?? ""), recentIds, 1);
  if (selected.length === 0) return null;

  return selected[0];
}

/** localStorageに保存されている直近の影絵質問IDを取得 */
function getRecentShadowPlayIds(): string[] {
  if (typeof globalThis.localStorage === "undefined") return [];
  try {
    const raw = globalThis.localStorage?.getItem("culcept_sg_shadow_play_recent_v1");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// Framing Effect Questions
// ═══════════════════════════════════════════════════════════
// 同じ軸の概念をポジティブ/ネガティブの異なるフレームで問い、
// フレーミング感受性を測定する。差が大きい = フレーミングに影響されやすい。

/** フレーミング質問テンプレート */
const FRAMING_TEMPLATES: { axisId: TraitAxisKey; positive: { prompt: string; options: { id: string; label: string; score: number }[] }; negative: { prompt: string; options: { id: string; label: string; score: number }[] } }[] = [
  {
    axisId: "independence_vs_harmony" as TraitAxisKey,
    positive: {
      prompt: "自分の意見を貫くことで、最も良い結果を生み出せた経験はどれくらいある？",
      options: [
        { id: "fp_a", label: "たくさんある", score: 0.8 },
        { id: "fp_b", label: "いくつかある", score: 0.3 },
        { id: "fp_c", label: "あまりない", score: -0.3 },
        { id: "fp_d", label: "ほとんどない", score: -0.7 },
      ],
    },
    negative: {
      prompt: "周りに合わせなかったことで、関係が壊れた経験はある？",
      options: [
        { id: "fn_a", label: "何度もある", score: 0.7 },
        { id: "fn_b", label: "少しある", score: 0.2 },
        { id: "fn_c", label: "ほぼない", score: -0.3 },
        { id: "fn_d", label: "全くない", score: -0.8 },
      ],
    },
  },
  {
    axisId: "emotional_variability" as TraitAxisKey,
    positive: {
      prompt: "感情の波があることで、深い創造性や共感力を得られていると感じる？",
      options: [
        { id: "fp_a", label: "強く感じる", score: 0.8 },
        { id: "fp_b", label: "ある程度", score: 0.3 },
        { id: "fp_c", label: "あまり", score: -0.3 },
        { id: "fp_d", label: "感じない", score: -0.7 },
      ],
    },
    negative: {
      prompt: "感情が不安定で、日常生活に支障が出たことはある？",
      options: [
        { id: "fn_a", label: "よくある", score: 0.7 },
        { id: "fn_b", label: "たまにある", score: 0.2 },
        { id: "fn_c", label: "ほぼない", score: -0.3 },
        { id: "fn_d", label: "全くない", score: -0.8 },
      ],
    },
  },
  {
    axisId: "stress_isolation_vs_social" as TraitAxisKey,
    positive: {
      prompt: "一人の時間を取ることで、エネルギーを回復できるタイプだと思う？",
      options: [
        { id: "fp_a", label: "まさにそう", score: 0.8 },
        { id: "fp_b", label: "そういう面がある", score: 0.3 },
        { id: "fp_c", label: "どちらでもない", score: 0.0 },
        { id: "fp_d", label: "人といる方が回復する", score: -0.7 },
      ],
    },
    negative: {
      prompt: "ストレスを感じると、人を避けてしまって孤立する傾向はある？",
      options: [
        { id: "fn_a", label: "強い傾向がある", score: 0.7 },
        { id: "fn_b", label: "ややある", score: 0.2 },
        { id: "fn_c", label: "あまりない", score: -0.3 },
        { id: "fn_d", label: "全くない", score: -0.8 },
      ],
    },
  },
  {
    axisId: "reassurance_need" as TraitAxisKey,
    positive: {
      prompt: "信頼する人からの言葉で、自分の判断に自信を持てるようになることがある？",
      options: [
        { id: "fp_a", label: "とても大きい", score: 0.8 },
        { id: "fp_b", label: "ある程度", score: 0.3 },
        { id: "fp_c", label: "少し", score: -0.2 },
        { id: "fp_d", label: "自分で完結する", score: -0.7 },
      ],
    },
    negative: {
      prompt: "他者の承認がないと、不安になって行動できないことがある？",
      options: [
        { id: "fn_a", label: "よくある", score: 0.7 },
        { id: "fn_b", label: "時々ある", score: 0.2 },
        { id: "fn_c", label: "ほぼない", score: -0.3 },
        { id: "fn_d", label: "全くない", score: -0.8 },
      ],
    },
  },
];

/**
 * フレーミング効果質問を選択する。
 * 10セッション以降、4セッションに1回出題。
 * 過去のスコアがある軸を優先（フレーミング差の測定に有用）。
 */
function selectFramingEffectQuestion(
  history: AxisObservationHistory[],
  totalSessions: number,
): FramingEffectQuestion | null {
  if (totalSessions < 10) return null;
  if (totalSessions % 4 !== 0) return null;

  const historyMap = new Map(history.map((h) => [h.axisId, h]));

  // スコア履歴のある軸を優先
  const withHistory = FRAMING_TEMPLATES.filter((t) => {
    const h = historyMap.get(t.axisId);
    return h && h.lastScore !== undefined;
  });
  const candidates = withHistory.length > 0 ? withHistory : FRAMING_TEMPLATES;

  // 日替わり選択
  const today = new Date().toISOString().split("T")[0];
  let hash = 0;
  const seed = `framing:${today}:${totalSessions}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % candidates.length;
  const template = candidates[idx];

  const h = historyMap.get(template.axisId);

  return {
    axisId: template.axisId,
    positiveVariant: {
      id: `framing_pos_${template.axisId}`,
      axisId: template.axisId,
      prompt: template.positive.prompt,
      options: template.positive.options,
      layer: "state" as const,
    },
    negativeVariant: {
      id: `framing_neg_${template.axisId}`,
      axisId: template.axisId,
      prompt: template.negative.prompt,
      options: template.negative.options,
      layer: "state" as const,
    },
    previousScore: h?.lastScore,
  };
}

/**
 * Prochaska 変容ステージに基づき、推奨される質問タイプを返す。
 * - pre_contemplation → awareness (気づきの質問: 自己報告・観察型)
 * - contemplation → conflict (矛盾・葛藤に焦点を当てた質問)
 * - preparation / action → behavioral_scenario (行動シナリオ質問 = stage3 型)
 * - maintenance → stability_check (安定性チェック質問)
 */
function mapChangeStageToQuestionType(
  stage?: TraitEvolutionResult["changeStage"],
): DailyObservationPlan["preferredQuestionType"] {
  switch (stage) {
    case "pre_contemplation":
      return "awareness";
    case "contemplation":
      return "conflict";
    case "preparation":
    case "action":
      return "behavioral_scenario";
    case "maintenance":
      return "stability_check";
    default:
      return undefined;
  }
}

/**
 * 回避・矛盾パターンが見られる軸に対して、適応的フォローアッププローブを生成する。
 * 最大2問。セッション数が3以上でのみ有効。
 */
function selectFollowUpProbes(
  history: AxisObservationHistory[],
  totalSessions: number,
): FollowUpQuestion[] {
  if (totalSessions < 3) return [];

  const probes: FollowUpQuestion[] = [];

  for (const h of history) {
    if (probes.length >= 2) break;
    if (!h.variantHistory || h.variantHistory.length < 2) continue;

    const scores = h.variantHistory.map((v) => v.score);
    const recentAvg = scores.slice(0, 3).reduce((s, v) => s + v, 0) / Math.min(scores.length, 3);
    const latestScore = scores[0] ?? 0;

    // 矛盾検出: 最近のスコアが平均から大きく外れている
    const contradictionDetected = Math.abs(latestScore - recentAvg) > 0.4;

    // 回避検出: 中央寄りスコアが3回以上連続
    const neutralCount = scores.slice(0, 4).filter((s) => Math.abs(s) < 0.15).length;
    const avoidanceDetected = neutralCount >= 3;

    if (!contradictionDetected && !avoidanceDetected) continue;

    const ctx: AdaptiveFollowUpContext = {
      currentAxisId: h.axisId,
      currentScore: latestScore,
      responseTimeMs: 5000,         // 不明な場合はデフォルト
      averageResponseTimeMs: 5000,
      previousScoresOnAxis: scores.slice(1),
      contradictionDetected,
      avoidanceDetected,
      sessionDepth: totalSessions,
      recentEmotionalTone: null,
    };

    const followUps = generateAdaptiveFollowUps(ctx);
    if (followUps.length > 0) {
      probes.push(followUps[0]);
    }
  }

  return probes;
}

/**
 * セッション数に応じた完了メッセージ
 */
function getSessionLabel(totalSessions: number): string {
  const labels = [
    "今日の差分を記録した",
    "前回との揺らぎを更新した",
    "このテーマの輪郭が少し深くなった",
    "反応の変化を受け取った",
    "今日の状態を軌道に追記した",
  ];
  return labels[totalSessions % labels.length];
}

/** 簡易ハッシュ（日付ベースの擬似ランダム用） */
function hashStr(s: string): number {
  const today = new Date().toISOString().split("T")[0];
  const combined = s + today;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/**
 * 空の履歴を生成（初回用）
 */
export function emptyHistory(): AxisObservationHistory[] {
  return CONTINUOUS_OBSERVATION_AXES.map((axisId) => ({
    axisId,
    totalObservations: 0,
    lastObservedAt: null,
    recentVariantIds: [],
    contextCounts: {},
  }));
}
