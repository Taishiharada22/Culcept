import "server-only";

// lib/stargazer/growthOrchestrator.ts
// 2-Layer Growth Orchestrator
// Layer 1: Safety / Maintenance -- pool minimum, cooling, quality recalculation
// Layer 2: Exploration / Strategy -- lens discovery, probe expansion, diversification
// Runs via cron or manual trigger with concurrency control

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ObservationLens,
  PoolStats,
  LensQualityMetrics,
  ProbeType,
  ProbeTypeExtended,
} from "./questionPoolTypes";
import { ALL_PROBE_TYPES } from "./questionPoolTypes";
import { TRAIT_AXIS_KEYS, type TraitAxisKey } from "./traitAxes";
import {
  discoverLenses,
  checkActivationReadiness,
  activateLens,
  coolLens,
} from "./lensDiscovery";
import { saveLens } from "./lensDiscovery";
import {
  expandQuestions,
  toExpandedPoolInsert,
  generateUxHint,
} from "./questionExpander";
import {
  generateQuestions,
  buildQuestionKey,
  toPoolInsert,
} from "./questionGenerator";
import {
  recalculateQualityScores,
  identifyLowQualityQuestions,
} from "./questionQuality";
import { persistStargazerGenerationCandidates } from "./trainingAssets";

// ═══ Constants ═══

/** Max AI calls per growth cycle */
const BUDGET = 10;

// ═══ Types ═══

export type GrowthAction =
  // Layer 0: Cold Start (runs once, idempotent)
  | { type: "backfill_lens_associations" }
  // Layer 1: Safety / Maintenance
  | { type: "fill_pool_minimum"; axisId: string; count: number }
  | { type: "cool_low_quality"; questionKeys: string[] }
  | { type: "recalculate_quality" }
  // Layer 2: Exploration / Strategy
  | { type: "discover_lens"; focusHint: string }
  | { type: "activate_proposed_lens"; lensId: string }
  | {
      type: "expand_probe";
      lensId: string;
      probeType: string;
      depthScore: number;
      axisId: string;
    }
  | { type: "diversify_observation"; probeType: string }
  | { type: "noop"; reason: string };

export interface PoolAnalysis {
  totalActive: number;
  /** Questions with primary_lens_id = NULL (pre-growth seed) */
  orphanCount: number;
  lensHealth: {
    lensId: string;
    status: string;
    total: number;
    probeTypes: Record<string, number>;
    depthDistribution: Record<number, number>;
    avgQuality: number;
  }[];
  proposedLenses: string[];
  probeTypeCoverage: Record<string, number>;
  depthDistribution: Record<number, number>;
  axisCoverage: Record<string, number>;
  coolingCount: number;
  lowQualityCount: number;
  dominantProbeTypes: string[];
  underservedProbeTypes: string[];
}

export interface GrowthRunResult {
  runId: string | null;
  skipped?: boolean;
  reason?: string;
  actions: GrowthAction[];
  lensesDiscovered: number;
  questionsGenerated: number;
  questionsCooled: number;
}

// ═══ Main Entry Point ═══

/**
 * Execute a single growth cycle with concurrency control.
 * Only one run at a time; stale runs (past expires_at) are marked as "timeout".
 */
export async function runGrowthCycle(
  supabase: SupabaseClient,
  trigger: "cron" | "manual" = "cron",
): Promise<GrowthRunResult> {
  const runStartedAt = Date.now();
  // ── Step 1: Concurrency check ──
  const { data: existingRuns } = await supabase
    .from("stargazer_growth_runs")
    .select("id, status, expires_at")
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingRuns && existingRuns.length > 0) {
    const existing = existingRuns[0];
    const expiresAt = new Date(existing.expires_at);
    const now = new Date();

    if (expiresAt > now) {
      // Another run is active and not stale
      return {
        runId: null,
        skipped: true,
        reason: `Another growth run (${existing.id}) is still active`,
        actions: [],
        lensesDiscovered: 0,
        questionsGenerated: 0,
        questionsCooled: 0,
      };
    }

    // Stale run -- mark as timeout
    await supabase
      .from("stargazer_growth_runs")
      .update({
        status: "timeout",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    console.warn(
      `[growthOrchestrator] Stale run ${existing.id} marked as timeout`,
    );
  }

  // ── Step 2: Create new run ──
  const runId = `grow_${Date.now().toString(36)}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // +15 minutes
  const { error: insertError } = await supabase
    .from("stargazer_growth_runs")
    .insert({
      id: runId,
      run_type: "full_cycle",
      status: "running",
      trigger,
      started_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (insertError) {
    console.error(
      "[growthOrchestrator] Failed to create growth run:",
      insertError,
    );
    return {
      runId: null,
      skipped: true,
      reason: `Failed to create growth run record: ${insertError.message}`,
      actions: [],
      lensesDiscovered: 0,
      questionsGenerated: 0,
      questionsCooled: 0,
    };
  }

  try {
    // ── Step 3: Analyze → Decide → Execute ──
    const analysis = await analyzePoolState(supabase);
    const actions = decideGrowthActions(analysis, BUDGET);
    const result = await executeGrowth(actions, supabase);

    // ── Step 4: Record results ──
    const now = new Date().toISOString();
    await supabase
      .from("stargazer_growth_runs")
      .update({
        status: "completed",
        pool_snapshot: analysis,
        decisions: actions,
        result_summary: {
          actions: actions.map((a) => a.type),
          lensesDiscovered: result.lensesDiscovered,
          questionsGenerated: result.questionsGenerated,
          questionsCooled: result.questionsCooled,
          analysis: {
            totalActive: analysis.totalActive,
            orphanCount: analysis.orphanCount,
            coolingCount: analysis.coolingCount,
            lowQualityCount: analysis.lowQualityCount,
            proposedLenses: analysis.proposedLenses.length,
          },
        },
        lenses_discovered: result.lensesDiscovered,
        questions_generated: result.questionsGenerated,
        questions_cooled: result.questionsCooled,
        ai_run_ids: result.aiRunIds,
        duration_ms: Date.now() - runStartedAt,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", runId);

    console.info(
      `[growthOrchestrator] Run ${runId} completed: ${result.questionsGenerated} questions, ${result.lensesDiscovered} lenses, ${result.questionsCooled} cooled`,
    );

    return {
      runId,
      actions,
      ...result,
    };
  } catch (err) {
    // ── Error handling ──
    console.error(`[growthOrchestrator] Run ${runId} failed:`, err);

    await supabase
      .from("stargazer_growth_runs")
      .update({
        status: "error",
        result_summary: {
          error: err instanceof Error ? err.message : String(err),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return {
      runId,
      actions: [],
      lensesDiscovered: 0,
      questionsGenerated: 0,
      questionsCooled: 0,
    };
  }
}

// ═══ Pool State Analysis ═══

/**
 * Analyze the current state of the question pool.
 * Queries DB for counts by axis, probe_type, depth_score, and lens health.
 */
export async function analyzePoolState(
  supabase: SupabaseClient,
): Promise<PoolAnalysis> {
  // Fetch all active questions with relevant dimensions
  const { data: questions } = await supabase
    .from("stargazer_question_pool")
    .select(
      "axis_id, probe_type, depth_score, primary_lens_id, quality_score, times_answered, question_status",
    )
    .eq("is_active", true);

  const activeQuestions = questions ?? [];

  // Fetch all lenses
  const { data: lenses } = await supabase
    .from("stargazer_observation_lenses")
    .select("id, status, avg_quality");

  const allLenses = lenses ?? [];

  // ── Count by axis ──
  const axisCoverage: Record<string, number> = {};
  for (const key of TRAIT_AXIS_KEYS) {
    axisCoverage[key] = 0;
  }

  // ── Count by probe_type ──
  const probeTypeCoverage: Record<string, number> = {};
  for (const pt of ALL_PROBE_TYPES) {
    probeTypeCoverage[pt] = 0;
  }

  // ── Count by depth_score ──
  const depthDistribution: Record<number, number> = {};

  // ── Orphan and cooling counts ──
  let orphanCount = 0;
  let coolingCount = 0;
  let lowQualityCount = 0;

  // ── Per-lens stats ──
  const lensStatsMap = new Map<
    string,
    {
      total: number;
      probeTypes: Record<string, number>;
      depthDistribution: Record<number, number>;
      qualitySum: number;
    }
  >();

  for (const q of activeQuestions) {
    const axisId = q.axis_id as string;
    const probeType = (q.probe_type as string) ?? "surface";
    const depth = (q.depth_score as number) ?? 1;
    const lensId = q.primary_lens_id as string | null;
    const qualityScore = (q.quality_score as number) ?? 0.5;
    const timesAnswered = (q.times_answered as number) ?? 0;
    const status = q.question_status as string;

    // Orphan count (no lens assigned)
    if (!lensId) {
      orphanCount++;
    }

    // Axis coverage
    if (axisId in axisCoverage) {
      axisCoverage[axisId] = (axisCoverage[axisId] ?? 0) + 1;
    }

    // Probe type coverage
    probeTypeCoverage[probeType] = (probeTypeCoverage[probeType] ?? 0) + 1;

    // Depth distribution
    depthDistribution[depth] = (depthDistribution[depth] ?? 0) + 1;

    // Cooling count
    if (status === "cooling") {
      coolingCount++;
    }

    // Low quality count
    if (qualityScore < 0.25 && timesAnswered >= 10) {
      lowQualityCount++;
    }

    // Per-lens stats
    if (lensId) {
      if (!lensStatsMap.has(lensId)) {
        lensStatsMap.set(lensId, {
          total: 0,
          probeTypes: {},
          depthDistribution: {},
          qualitySum: 0,
        });
      }
      const ls = lensStatsMap.get(lensId)!;
      ls.total++;
      ls.probeTypes[probeType] = (ls.probeTypes[probeType] ?? 0) + 1;
      ls.depthDistribution[depth] = (ls.depthDistribution[depth] ?? 0) + 1;
      ls.qualitySum += qualityScore;
    }
  }

  // Build lens health array
  const lensHealth = allLenses.map((lens) => {
    const stats = lensStatsMap.get(lens.id);
    return {
      lensId: lens.id as string,
      status: lens.status as string,
      total: stats?.total ?? 0,
      probeTypes: stats?.probeTypes ?? {},
      depthDistribution: stats?.depthDistribution ?? {},
      avgQuality:
        stats && stats.total > 0
          ? stats.qualitySum / stats.total
          : (lens.avg_quality as number) ?? 0,
    };
  });

  // Proposed lenses
  const proposedLenses = allLenses
    .filter((l) => l.status === "proposed")
    .map((l) => l.id as string);

  // Dominant/underserved probe types
  const totalActive = activeQuestions.length;
  const dominantProbeTypes: string[] = [];
  const underservedProbeTypes: string[] = [];

  if (totalActive > 0) {
    for (const [pt, count] of Object.entries(probeTypeCoverage)) {
      const ratio = count / totalActive;
      if (ratio > 0.3) {
        dominantProbeTypes.push(pt);
      }
      if (ratio < 0.05) {
        underservedProbeTypes.push(pt);
      }
    }
  } else {
    // If pool is empty, all probe types are underserved
    underservedProbeTypes.push(...ALL_PROBE_TYPES);
  }

  return {
    totalActive,
    orphanCount,
    lensHealth,
    proposedLenses,
    probeTypeCoverage,
    depthDistribution,
    axisCoverage,
    coolingCount,
    lowQualityCount,
    dominantProbeTypes,
    underservedProbeTypes,
  };
}

// ═══ Growth Decision Engine ═══

/**
 * Decide which growth actions to take based on pool analysis.
 *
 * Layer 1 (Safety/Maintenance) is always evaluated first.
 * Layer 2 (Exploration/Strategy) uses remaining budget.
 */
export function decideGrowthActions(
  analysis: PoolAnalysis,
  budget: number = BUDGET,
): GrowthAction[] {
  const actions: GrowthAction[] = [];
  let remaining = budget;

  // ────────────────────────────────────
  // Layer 0: Cold Start Detection
  // ────────────────────────────────────
  // If pool has questions but no lens has any → seed was run before growth engine.
  // Backfill lens associations from axis_id ↔ lens.related_axes mapping.
  // Idempotent: if orphanCount = 0, this block is skipped entirely.

  const lensAssignedTotal = analysis.lensHealth.reduce((s, l) => s + l.total, 0);
  if (analysis.orphanCount > 0 && lensAssignedTotal === 0 && analysis.totalActive > 0) {
    actions.push({ type: "backfill_lens_associations" });
    // No AI budget consumed — pure SQL operation.
    // After backfill the rest of the cycle re-analyzes,
    // so we return early and let the NEXT cycle handle expansion.
    return actions;
  }

  // ────────────────────────────────────
  // Layer 1: Safety / Maintenance
  // ────────────────────────────────────

  // 1a. Pool minimum check: totalActive < 100 → fill weakest 3 axes
  if (analysis.totalActive < 100) {
    const sortedAxes = Object.entries(analysis.axisCoverage)
      .sort(([, a], [, b]) => a - b)
      .slice(0, 3);

    for (const [axisId, count] of sortedAxes) {
      if (remaining <= 0) break;
      const needed = Math.max(1, Math.min(5, 10 - count));
      actions.push({ type: "fill_pool_minimum", axisId, count: needed });
      remaining--;
    }
  }

  // 1b. Cool low quality questions
  if (analysis.lowQualityCount > 20 && remaining > 0) {
    // We'll resolve the actual keys in executeGrowth
    actions.push({ type: "cool_low_quality", questionKeys: [] });
    // Does not consume AI budget -- it's a DB operation
  }

  // 1c. Recalculate quality scores periodically
  if (remaining > 0) {
    actions.push({ type: "recalculate_quality" });
    // Does not consume AI budget -- it's a DB operation
  }

  // ────────────────────────────────────
  // Layer 2: Exploration / Strategy
  // ────────────────────────────────────

  // 2a. Activate proposed lenses that meet readiness criteria
  for (const lensId of analysis.proposedLenses) {
    if (remaining <= 0) break;
    // Find lens health data
    const health = analysis.lensHealth.find((l) => l.lensId === lensId);
    if (health && health.total >= 10) {
      actions.push({ type: "activate_proposed_lens", lensId });
      // Activation itself doesn't require AI, but we count it conservatively
    }
  }

  // 2b. Expand underserved probe types
  if (analysis.underservedProbeTypes.length > 0 && remaining > 0) {
    // Pick the best active lens for expansion
    const bestActiveLens = analysis.lensHealth
      .filter((l) => l.status === "active" && l.total > 0)
      .sort((a, b) => b.avgQuality - a.avgQuality)[0];

    if (bestActiveLens) {
      for (const probeType of analysis.underservedProbeTypes.slice(0, 2)) {
        if (remaining <= 0) break;

        // Pick an axis with the most data for context
        const bestAxis = Object.entries(analysis.axisCoverage)
          .sort(([, a], [, b]) => b - a)[0]?.[0];

        if (bestAxis) {
          actions.push({
            type: "expand_probe",
            lensId: bestActiveLens.lensId,
            probeType,
            depthScore: 2,
            axisId: bestAxis,
          });
          remaining--;
        }
      }
    }
  }

  // 2c. Deepen lenses that have low max depth
  const shallowLenses = analysis.lensHealth
    .filter((l) => l.status === "active" && l.total > 0)
    .filter((l) => {
      const maxDepth = Math.max(
        0,
        ...Object.keys(l.depthDistribution).map(Number),
      );
      return maxDepth < 3;
    })
    .sort((a, b) => b.avgQuality - a.avgQuality);

  for (const lens of shallowLenses.slice(0, 2)) {
    if (remaining <= 0) break;

    const currentMaxDepth = Math.max(
      1,
      ...Object.keys(lens.depthDistribution).map(Number),
    );
    const targetDepth = currentMaxDepth + 1;

    // Pick a probe type that this lens already covers well
    const bestProbe = Object.entries(lens.probeTypes)
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? "reason";

    // Pick an axis with the most data
    const bestAxis = Object.entries(analysis.axisCoverage)
      .sort(([, a], [, b]) => b - a)[0]?.[0];

    if (bestAxis) {
      actions.push({
        type: "expand_probe",
        lensId: lens.lensId,
        probeType: bestProbe,
        depthScore: targetDepth,
        axisId: bestAxis,
      });
      remaining--;
    }
  }

  // 2d. Discover new lenses if active count is low
  const activeLensCount = analysis.lensHealth.filter(
    (l) => l.status === "active",
  ).length;
  if (activeLensCount < 10 && remaining > 0) {
    // Focus hint based on underserved areas
    const focusHint =
      analysis.underservedProbeTypes.length > 0
        ? `underserved probes: ${analysis.underservedProbeTypes.join(", ")}`
        : "general diversification";
    actions.push({ type: "discover_lens", focusHint });
    remaining--;
  }

  // 2e. Deepen the best quality lens further (if budget remains)
  if (remaining > 0) {
    const bestLens = analysis.lensHealth
      .filter((l) => l.status === "active" && l.total >= 5)
      .sort((a, b) => b.avgQuality - a.avgQuality)[0];

    if (bestLens) {
      const currentMaxDepth = Math.max(
        1,
        ...Object.keys(bestLens.depthDistribution).map(Number),
      );

      if (currentMaxDepth < 6) {
        const targetDepth = currentMaxDepth + 1;
        const bestProbe = Object.entries(bestLens.probeTypes)
          .sort(([, a], [, b]) => b - a)[0]?.[0] ?? "reason";

        const bestAxis = Object.entries(analysis.axisCoverage)
          .sort(([, a], [, b]) => b - a)[0]?.[0];

        if (bestAxis) {
          actions.push({
            type: "expand_probe",
            lensId: bestLens.lensId,
            probeType: bestProbe,
            depthScore: targetDepth,
            axisId: bestAxis,
          });
          remaining--;
        }
      }
    }
  }

  // If no actions were generated, return noop
  if (actions.length === 0) {
    actions.push({ type: "noop", reason: "Pool is healthy, no actions needed" });
  }

  return actions;
}

// ═══ Growth Execution ═══

/**
 * Execute a list of growth actions against the database.
 * Tracks AI calls and stops if budget is exceeded.
 */
export async function executeGrowth(
  actions: GrowthAction[],
  supabase: SupabaseClient,
): Promise<{
  lensesDiscovered: number;
  questionsGenerated: number;
  questionsCooled: number;
  aiRunIds: string[];
}> {
  let aiCallsMade = 0;
  let lensesDiscovered = 0;
  let questionsGenerated = 0;
  let questionsCooled = 0;
  const aiRunIds: string[] = [];

  const batchId = `growth_${Date.now().toString(36)}`;

  for (const action of actions) {
    // Budget guard
    if (aiCallsMade >= BUDGET) {
      console.warn(
        `[growthOrchestrator] AI budget exhausted (${aiCallsMade}/${BUDGET}), stopping execution`,
      );
      break;
    }

    try {
      switch (action.type) {
        // ────────────────────────────
        // Layer 0: Cold Start
        // ────────────────────────────

        case "backfill_lens_associations": {
          // Match questions.axis_id against lens.related_axes via SQL.
          // Assigns primary_lens_id = first matching lens (deterministic by id),
          // secondary_lens_ids = remaining matching lenses.
          // Only touches rows where primary_lens_id IS NULL.
          const { data: backfillResult, error: backfillError } = await supabase
            .rpc("backfill_lens_associations");

          if (backfillError) {
            // Fallback: do it in JS if the RPC doesn't exist yet
            console.warn(
              "[growthOrchestrator] RPC backfill_lens_associations not found, running JS fallback",
            );
            const updated = await backfillLensAssociationsJS(supabase);
            questionsGenerated = 0; // backfill doesn't generate new questions
            console.info(
              `[growthOrchestrator] backfill_lens_associations (JS): ${updated} questions updated`,
            );
          } else {
            const count = typeof backfillResult === "number" ? backfillResult : 0;
            console.info(
              `[growthOrchestrator] backfill_lens_associations (RPC): ${count} questions updated`,
            );
          }
          // No AI budget consumed
          break;
        }

        // ────────────────────────────
        // Layer 1: Safety / Maintenance
        // ────────────────────────────

        case "fill_pool_minimum": {
          const axisId = action.axisId as TraitAxisKey;
          const result = await generateQuestions({
            axisId,
            subject: "self",
            energyTarget: "neutral",
            phrasingStyle: "scenario",
            angle: "self_reflection",
            count: action.count,
          });
          aiCallsMade++;
          if (result.aiRunId) aiRunIds.push(result.aiRunId);

          const acceptedAudit = result.audit.filter((entry) => entry.accepted);
          if (result.questions.length > 0) {
            const inserts = result.questions.map((q, i) => {
              const key = buildQuestionKey(axisId, "self", "scenario", i);
              if (acceptedAudit[i]) {
                acceptedAudit[i] = {
                  ...acceptedAudit[i],
                  acceptedEntityId: key,
                };
              }
              return toPoolInsert(q, {
                axisId,
                subject: "self",
                energyTarget: "neutral",
                phrasingStyle: "scenario",
                angle: "self_reflection",
                count: action.count,
              }, key, batchId, result.aiRunId);
            });

            const { error } = await supabase
              .from("stargazer_question_pool")
              .insert(inserts);

            if (error) {
              console.error(
                `[growthOrchestrator] fill_pool_minimum insert failed for ${axisId}:`,
                error.message,
              );
              await persistStargazerGenerationCandidates({
                supabase,
                aiRunId: result.aiRunId,
                batchId,
                taskType: "stargazer_question_generation",
                sourceStage: "growth_fill",
                requestContext: {
                  axisId,
                  subject: "self",
                  energyTarget: "neutral",
                  phrasingStyle: "scenario",
                  angle: "self_reflection",
                  count: action.count,
                },
                entries: [
                  ...acceptedAudit.map((entry) => ({
                    ...entry,
                    accepted: false,
                    acceptedEntityId: null,
                    rejectionReason: `pool_insert_failed:${error.message}`,
                  })),
                  ...result.audit.filter((entry) => !entry.accepted),
                ],
              });
            } else {
              await persistStargazerGenerationCandidates({
                supabase,
                aiRunId: result.aiRunId,
                batchId,
                taskType: "stargazer_question_generation",
                sourceStage: "growth_fill",
                requestContext: {
                  axisId,
                  subject: "self",
                  energyTarget: "neutral",
                  phrasingStyle: "scenario",
                  angle: "self_reflection",
                  count: action.count,
                },
                entries: [
                  ...acceptedAudit,
                  ...result.audit.filter((entry) => !entry.accepted),
                ],
              });
              questionsGenerated += result.questions.length;
              console.info(
                `[growthOrchestrator] fill_pool_minimum: +${result.questions.length} questions for ${axisId}`,
              );
            }
          } else if (result.audit.length > 0) {
            await persistStargazerGenerationCandidates({
              supabase,
              aiRunId: result.aiRunId,
              batchId,
              taskType: "stargazer_question_generation",
              sourceStage: "growth_fill",
              requestContext: {
                axisId,
                subject: "self",
                energyTarget: "neutral",
                phrasingStyle: "scenario",
                angle: "self_reflection",
                count: action.count,
              },
              entries: result.audit,
            });
          }
          break;
        }

        case "cool_low_quality": {
          // Resolve actual low quality question keys from DB
          const lowKeys = await identifyLowQualityQuestions(supabase, 0.25);
          const keysToCool = lowKeys.slice(0, 50); // Cap at 50 per cycle

          if (keysToCool.length > 0) {
            const { error } = await supabase
              .from("stargazer_question_pool")
              .update({
                question_status: "cooling",
                updated_at: new Date().toISOString(),
              })
              .in("question_key", keysToCool);

            if (error) {
              console.error(
                "[growthOrchestrator] cool_low_quality update failed:",
                error.message,
              );
            } else {
              questionsCooled += keysToCool.length;
              console.info(
                `[growthOrchestrator] cool_low_quality: ${keysToCool.length} questions set to cooling`,
              );
            }
          }
          // Does not consume AI budget
          break;
        }

        case "recalculate_quality": {
          const result = await recalculateQualityScores(supabase);
          console.info(
            `[growthOrchestrator] recalculate_quality: ${result.updated} questions updated`,
          );
          // Does not consume AI budget
          break;
        }

        // ────────────────────────────
        // Layer 2: Exploration / Strategy
        // ────────────────────────────

        case "discover_lens": {
          // Build pool stats for lens discovery context
          const poolStats = await buildPoolStats(supabase);

          // Fetch existing lenses for dedup
          const { data: existingLensRows } = await supabase
            .from("stargazer_observation_lenses")
            .select("*");

          const existingLenses: ObservationLens[] = (existingLensRows ?? []).map(
            toLensObject,
          );

          const result = await discoverLenses({
            poolStats,
            existingLenses,
            focusCategory: action.focusHint,
            count: 3,
          });
          aiCallsMade++;
          if (result.aiRunId) aiRunIds.push(result.aiRunId);

          // Save discovered lenses
          const savedLensIds = new Set<string>();
          for (const lens of result.lenses) {
            try {
              await saveLens(lens, batchId, supabase);
              savedLensIds.add(lens.id);
              lensesDiscovered++;
            } catch (saveErr) {
              console.error(
                `[growthOrchestrator] Failed to save lens ${lens.id}:`,
                saveErr,
              );
            }
          }

          if (result.audit.length > 0) {
            await persistStargazerGenerationCandidates({
              supabase,
              aiRunId: result.aiRunId,
              batchId,
              taskType: "stargazer_lens_discovery",
              sourceStage: "growth_lens_discovery",
              requestContext: {
                focusHint: action.focusHint,
                count: 3,
              },
              entries: result.audit.map((entry) => {
                if (!entry.accepted) return entry;
                if (!entry.acceptedEntityId || savedLensIds.has(entry.acceptedEntityId)) {
                  return entry;
                }
                return {
                  ...entry,
                  accepted: false,
                  acceptedEntityId: null,
                  rejectionReason: "lens_save_failed",
                };
              }),
            });
          }

          console.info(
            `[growthOrchestrator] discover_lens: ${result.lenses.length} lenses discovered`,
          );
          break;
        }

        case "activate_proposed_lens": {
          const readiness = await checkActivationReadiness(
            action.lensId,
            supabase,
          );

          if (readiness.ready) {
            await activateLens(action.lensId, supabase);
            console.info(
              `[growthOrchestrator] activate_proposed_lens: ${action.lensId} activated`,
            );
          } else {
            console.info(
              `[growthOrchestrator] activate_proposed_lens: ${action.lensId} not ready (${readiness.unmetCriteria.join(", ")})`,
            );
          }
          // Does not consume AI budget
          break;
        }

        case "expand_probe": {
          // Fetch the lens from DB
          const { data: lensRow } = await supabase
            .from("stargazer_observation_lenses")
            .select("*")
            .eq("id", action.lensId)
            .single();

          if (!lensRow) {
            console.warn(
              `[growthOrchestrator] expand_probe: lens ${action.lensId} not found`,
            );
            break;
          }

          const lens = toLensObject(lensRow);
          const axisId = action.axisId as TraitAxisKey;

          // Fetch shallower questions for context
          const { data: shallowerRows } = await supabase
            .from("stargazer_question_pool")
            .select("variant_json, probe_type, depth_score")
            .eq("primary_lens_id", action.lensId)
            .eq("axis_id", axisId)
            .lt("depth_score", action.depthScore)
            .eq("is_active", true)
            .order("depth_score", { ascending: true })
            .limit(5);

          const shallowerQuestions = (shallowerRows ?? []).map((r) => ({
            prompt:
              (r.variant_json as Record<string, unknown>)?.prompt as string ??
              "",
            probeType: (r.probe_type as string) ?? "surface",
            depth: (r.depth_score as number) ?? 1,
          }));

          const result = await expandQuestions({
            lens,
            targetDepth: action.depthScore,
            probeType: action.probeType as ProbeTypeExtended,
            axisId,
            subject: "self",
            shallowerQuestions,
            count: 3,
          });
          aiCallsMade++;
          if (result.aiRunId) aiRunIds.push(result.aiRunId);

          const acceptedAudit = result.audit.filter((entry) => entry.accepted);
          if (result.questions.length > 0) {
            const inserts = result.questions.map((q, i) => {
              const key = `expand_${action.lensId}_${action.probeType}_d${action.depthScore}_${Date.now().toString(36)}_${i}`;
              if (acceptedAudit[i]) {
                acceptedAudit[i] = {
                  ...acceptedAudit[i],
                  acceptedEntityId: key,
                };
              }
              return toExpandedPoolInsert(
                q,
                {
                  lens,
                  targetDepth: action.depthScore,
                  probeType: action.probeType as ProbeTypeExtended,
                  axisId,
                  subject: "self",
                  shallowerQuestions,
                  count: 3,
                },
                key,
                batchId,
                result.aiRunId,
              );
            });

            const { error } = await supabase
              .from("stargazer_question_pool")
              .insert(inserts);

            if (error) {
              console.error(
                `[growthOrchestrator] expand_probe insert failed:`,
                error.message,
              );
              await persistStargazerGenerationCandidates({
                supabase,
                aiRunId: result.aiRunId,
                batchId,
                taskType: "stargazer_question_expansion",
                sourceStage: "growth_expand",
                requestContext: {
                  lensId: action.lensId,
                  probeType: action.probeType,
                  targetDepth: action.depthScore,
                  axisId,
                  subject: "self",
                  shallowerQuestions,
                  count: 3,
                },
                entries: [
                  ...acceptedAudit.map((entry) => ({
                    ...entry,
                    accepted: false,
                    acceptedEntityId: null,
                    rejectionReason: `pool_insert_failed:${error.message}`,
                  })),
                  ...result.audit.filter((entry) => !entry.accepted),
                ],
              });
            } else {
              await persistStargazerGenerationCandidates({
                supabase,
                aiRunId: result.aiRunId,
                batchId,
                taskType: "stargazer_question_expansion",
                sourceStage: "growth_expand",
                requestContext: {
                  lensId: action.lensId,
                  probeType: action.probeType,
                  targetDepth: action.depthScore,
                  axisId,
                  subject: "self",
                  shallowerQuestions,
                  count: 3,
                },
                entries: [
                  ...acceptedAudit,
                  ...result.audit.filter((entry) => !entry.accepted),
                ],
              });
              questionsGenerated += result.questions.length;
              console.info(
                `[growthOrchestrator] expand_probe: +${result.questions.length} questions (lens=${action.lensId}, probe=${action.probeType}, depth=${action.depthScore})`,
              );
            }
          } else if (result.audit.length > 0) {
            await persistStargazerGenerationCandidates({
              supabase,
              aiRunId: result.aiRunId,
              batchId,
              taskType: "stargazer_question_expansion",
              sourceStage: "growth_expand",
              requestContext: {
                lensId: action.lensId,
                probeType: action.probeType,
                targetDepth: action.depthScore,
                axisId,
                subject: "self",
                shallowerQuestions,
                count: 3,
              },
              entries: result.audit,
            });
          }
          break;
        }

        case "diversify_observation": {
          // Pick an active lens and expand the underserved probe type
          const { data: activeLensRows } = await supabase
            .from("stargazer_observation_lenses")
            .select("*")
            .eq("status", "active")
            .limit(1);

          const lensRow = activeLensRows?.[0];
          if (!lensRow) {
            console.warn(
              "[growthOrchestrator] diversify_observation: no active lens found",
            );
            break;
          }

          const lens = toLensObject(lensRow);

          // Pick the best axis for context
          const { data: axisCountRows } = await supabase
            .from("stargazer_question_pool")
            .select("axis_id")
            .eq("is_active", true)
            .eq("primary_lens_id", lens.id)
            .limit(100);

          const axisCountMap: Record<string, number> = {};
          for (const r of axisCountRows ?? []) {
            const a = r.axis_id as string;
            axisCountMap[a] = (axisCountMap[a] ?? 0) + 1;
          }

          const bestAxis =
            Object.entries(axisCountMap).sort(([, a], [, b]) => b - a)[0]?.[0] ??
            "introvert_vs_extrovert";

          const result = await expandQuestions({
            lens,
            targetDepth: 2,
            probeType: action.probeType as ProbeTypeExtended,
            axisId: bestAxis as TraitAxisKey,
            subject: "self",
            shallowerQuestions: [],
            count: 3,
          });
          aiCallsMade++;
          if (result.aiRunId) aiRunIds.push(result.aiRunId);

          const acceptedAudit = result.audit.filter((entry) => entry.accepted);
          if (result.questions.length > 0) {
            const inserts = result.questions.map((q, i) => {
              const key = `diversify_${lens.id}_${action.probeType}_${Date.now().toString(36)}_${i}`;
              if (acceptedAudit[i]) {
                acceptedAudit[i] = {
                  ...acceptedAudit[i],
                  acceptedEntityId: key,
                };
              }
              return toExpandedPoolInsert(
                q,
                {
                  lens,
                  targetDepth: 2,
                  probeType: action.probeType as ProbeTypeExtended,
                  axisId: bestAxis as TraitAxisKey,
                  subject: "self",
                  shallowerQuestions: [],
                  count: 3,
                },
                key,
                batchId,
                result.aiRunId,
              );
            });

            const { error } = await supabase
              .from("stargazer_question_pool")
              .insert(inserts);

            if (error) {
              console.error(
                `[growthOrchestrator] diversify_observation insert failed:`,
                error.message,
              );
              await persistStargazerGenerationCandidates({
                supabase,
                aiRunId: result.aiRunId,
                batchId,
                taskType: "stargazer_question_expansion",
                sourceStage: "growth_diversify",
                requestContext: {
                  lensId: lens.id,
                  probeType: action.probeType,
                  targetDepth: 2,
                  axisId: bestAxis,
                  subject: "self",
                  shallowerQuestions: [],
                  count: 3,
                },
                entries: [
                  ...acceptedAudit.map((entry) => ({
                    ...entry,
                    accepted: false,
                    acceptedEntityId: null,
                    rejectionReason: `pool_insert_failed:${error.message}`,
                  })),
                  ...result.audit.filter((entry) => !entry.accepted),
                ],
              });
            } else {
              await persistStargazerGenerationCandidates({
                supabase,
                aiRunId: result.aiRunId,
                batchId,
                taskType: "stargazer_question_expansion",
                sourceStage: "growth_diversify",
                requestContext: {
                  lensId: lens.id,
                  probeType: action.probeType,
                  targetDepth: 2,
                  axisId: bestAxis,
                  subject: "self",
                  shallowerQuestions: [],
                  count: 3,
                },
                entries: [
                  ...acceptedAudit,
                  ...result.audit.filter((entry) => !entry.accepted),
                ],
              });
              questionsGenerated += result.questions.length;
              console.info(
                `[growthOrchestrator] diversify_observation: +${result.questions.length} questions (probe=${action.probeType})`,
              );
            }
          } else if (result.audit.length > 0) {
            await persistStargazerGenerationCandidates({
              supabase,
              aiRunId: result.aiRunId,
              batchId,
              taskType: "stargazer_question_expansion",
              sourceStage: "growth_diversify",
              requestContext: {
                lensId: lens.id,
                probeType: action.probeType,
                targetDepth: 2,
                axisId: bestAxis,
                subject: "self",
                shallowerQuestions: [],
                count: 3,
              },
              entries: result.audit,
            });
          }
          break;
        }

        case "noop": {
          console.info(
            `[growthOrchestrator] noop: ${action.reason}`,
          );
          break;
        }

        default: {
          const _exhaustive: never = action;
          console.warn(
            `[growthOrchestrator] Unknown action type:`,
            _exhaustive,
          );
        }
      }
    } catch (actionErr) {
      console.error(
        `[growthOrchestrator] Action ${action.type} failed:`,
        actionErr,
      );
      // Continue with remaining actions
    }
  }

  return {
    lensesDiscovered,
    questionsGenerated,
    questionsCooled,
    aiRunIds,
  };
}

// ═══ Cold Start: Lens Backfill ═══

/**
 * JS fallback for backfilling lens associations when the SQL RPC is not deployed.
 * Matches question.axis_id → lens.related_axes to assign primary_lens_id.
 * Returns the number of questions updated.
 */
async function backfillLensAssociationsJS(
  supabase: SupabaseClient,
): Promise<number> {
  // 1. Fetch all active lenses with their related_axes
  const { data: lensRows } = await supabase
    .from("stargazer_observation_lenses")
    .select("id, related_axes")
    .eq("status", "active");

  if (!lensRows || lensRows.length === 0) return 0;

  // Build axis → lenses lookup
  const axisToLenses = new Map<string, string[]>();
  for (const lens of lensRows) {
    const axes = (lens.related_axes as string[]) ?? [];
    for (const axis of axes) {
      const existing = axisToLenses.get(axis) ?? [];
      existing.push(lens.id as string);
      axisToLenses.set(axis, existing);
    }
  }

  // 2. Fetch orphan questions (no lens assigned)
  const { data: orphans } = await supabase
    .from("stargazer_question_pool")
    .select("question_key, axis_id")
    .is("primary_lens_id", null)
    .eq("is_active", true);

  if (!orphans || orphans.length === 0) return 0;

  // 3. Batch update by axis → lens mapping
  let updated = 0;
  const lensCountUpdates = new Map<string, number>();

  // Group orphans by their target lens assignment for batch updates
  const updatesByLens = new Map<string, { keys: string[]; secondaries: string[] }>();

  for (const q of orphans) {
    const axisId = q.axis_id as string;
    const matchingLenses = axisToLenses.get(axisId);
    if (!matchingLenses || matchingLenses.length === 0) continue;

    // Sort for determinism
    const sorted = [...matchingLenses].sort();
    const primary = sorted[0];
    const secondaries = sorted.slice(1);

    const compositeKey = `${primary}|${secondaries.join(",")}`;
    if (!updatesByLens.has(compositeKey)) {
      updatesByLens.set(compositeKey, { keys: [], secondaries });
    }
    updatesByLens.get(compositeKey)!.keys.push(q.question_key as string);

    // Track lens question counts
    lensCountUpdates.set(primary, (lensCountUpdates.get(primary) ?? 0) + 1);
  }

  // Execute batch updates (one per unique primary+secondary combination)
  for (const [compositeKey, { keys, secondaries }] of updatesByLens) {
    const primary = compositeKey.split("|")[0];

    // Process in chunks of 200 to avoid query size limits
    for (let i = 0; i < keys.length; i += 200) {
      const chunk = keys.slice(i, i + 200);
      const { error } = await supabase
        .from("stargazer_question_pool")
        .update({
          primary_lens_id: primary,
          secondary_lens_ids: secondaries,
        })
        .in("question_key", chunk);

      if (error) {
        console.error(
          `[backfillLensAssociationsJS] Update failed for lens ${primary}:`,
          error.message,
        );
      } else {
        updated += chunk.length;
      }
    }
  }

  // 4. Update questions_generated counts on lenses
  for (const [lensId, count] of lensCountUpdates) {
    await supabase.rpc("increment_lens_question_count", {
      p_lens_id: lensId,
      p_increment: count,
    }).then(({ error }) => {
      if (error) {
        // Fallback: direct update
        supabase
          .from("stargazer_observation_lenses")
          .update({
            questions_generated: count, // Will be approximate
            updated_at: new Date().toISOString(),
          })
          .eq("id", lensId)
          .then(() => {});
      }
    });
  }

  console.info(
    `[backfillLensAssociationsJS] Assigned lenses to ${updated}/${orphans.length} orphan questions`,
  );
  return updated;
}

// ═══ Helper Functions ═══

/**
 * Build PoolStats from current DB state.
 * Used as context for lens discovery.
 */
async function buildPoolStats(supabase: SupabaseClient): Promise<PoolStats> {
  const { data: questions } = await supabase
    .from("stargazer_question_pool")
    .select(
      "axis_id, subject, phrasing_style, primary_lens_id, probe_type, depth_score, quality_score",
    )
    .eq("is_active", true);

  const rows = questions ?? [];

  const byAxis: Record<string, number> = {};
  const bySubject: Record<string, number> = {};
  const byStyle: Record<string, number> = {};
  const byLens: Record<string, number> = {};
  const byProbeType: Record<string, number> = {};
  const byDepth: Record<number, number> = {};
  let qualitySum = 0;

  for (const r of rows) {
    const axis = r.axis_id as string;
    const subject = (r.subject as string) ?? "self";
    const style = (r.phrasing_style as string) ?? "direct";
    const lens = (r.primary_lens_id as string) ?? "none";
    const probe = (r.probe_type as string) ?? "surface";
    const depth = (r.depth_score as number) ?? 1;
    const quality = (r.quality_score as number) ?? 0.5;

    byAxis[axis] = (byAxis[axis] ?? 0) + 1;
    bySubject[subject] = (bySubject[subject] ?? 0) + 1;
    byStyle[style] = (byStyle[style] ?? 0) + 1;
    byLens[lens] = (byLens[lens] ?? 0) + 1;
    byProbeType[probe] = (byProbeType[probe] ?? 0) + 1;
    byDepth[depth] = (byDepth[depth] ?? 0) + 1;
    qualitySum += quality;
  }

  return {
    totalActive: rows.length,
    byAxis,
    bySubject,
    byStyle,
    byLens,
    byProbeType,
    byDepth,
    avgQuality: rows.length > 0 ? qualitySum / rows.length : 0,
  };
}

/**
 * Convert a Supabase lens row to the ObservationLens interface.
 */
function toLensObject(row: Record<string, unknown>): ObservationLens {
  return {
    id: row.id as string,
    nameJa: (row.name_ja as string) ?? "",
    description: (row.description as string) ?? "",
    probingTargets: (row.probing_targets as string[]) ?? [],
    relatedAxes: (row.related_axes as string[]) ?? [],
    exampleSituations: (row.example_situations as string[]) ?? [],
    discoverySource: (row.discovery_source as string) ?? "unknown",
    status: (row.status as ObservationLens["status"]) ?? "proposed",
    questionsGenerated: (row.questions_generated as number) ?? 0,
    qualityMetrics: (row.quality_metrics as LensQualityMetrics) ?? {},
    avgQuality: (row.avg_quality as number) ?? 0,
  };
}
