import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { apiOk, apiUnauthorized, apiBadRequest, apiError, apiCatch } from "@/lib/api/response";
import { assessResponseQuality } from "@/lib/stargazer/validation/responseQuality";
import { aggregateContextProfiles } from "@/lib/stargazer/contextProfileAggregator";
import { deriveIdealPartner, toIdealPartnerRow } from "@/lib/stargazer/deriveIdealPartner";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { initializeFromOnboarding, serializeBeliefs, updateFromMicroAxes, beliefsToScores } from "@/lib/stargazer/bayesianAxisUpdater";
import { syncProcessProfile } from "@/lib/rendezvous/syncProcessProfile";

type SupabaseErrorLike = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message: string;
};

type ObservationRowInput = Record<string, unknown> & {
  answered_at?: string;
  phase: string;
  question_id: string;
  response_time_ms?: number | null;
};

function serializeForLog(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return `[unserializable payload: ${
      error instanceof Error ? error.message : String(error)
    }]`;
  }
}

function logPayload(label: string, payload: unknown) {
  console.log(`[Stargazer API] ${label}:`, serializeForLog(payload));
}

function describeDbError(error: SupabaseErrorLike): string {
  const parts = [`message=${error.message}`];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.details) parts.push(`details=${error.details}`);
  if (error.hint) parts.push(`hint=${error.hint}`);
  return parts.join(" | ");
}

function buildObservationRow(
  userId: string,
  row: ObservationRowInput
): Record<string, unknown> {
  const responseTimeMs =
    typeof row.response_time_ms === "number" && Number.isFinite(row.response_time_ms)
      ? Math.max(0, row.response_time_ms)
      : 0;

  const answeredAt =
    typeof row.answered_at === "string" && !Number.isNaN(new Date(row.answered_at).getTime())
      ? row.answered_at
      : new Date().toISOString();

  return {
    ...row,
    user_id: userId,
    response_time_ms: responseTimeMs,
    shown_at: new Date(new Date(answeredAt).getTime() - responseTimeMs).toISOString(),
    answered_at: answeredAt,
  };
}

export async function POST(request: Request) {
  try {
    // Runtime env logging for DNS debugging
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "(undefined)";
    console.log("[Stargazer API] POST called. Supabase URL:", supabaseUrl.substring(0, 50));

    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return apiUnauthorized();
    }

    const body = await request.json();
    logPayload("Request body", body);

    // ── Semantic Differential 一括保存 ──
    if (body.type === "semantic_differential") {
      return handleSemanticDifferential(supabase, user.id, body);
    }

    // ── Stage 1 多肢選択 一括保存 ──
    if (body.type === "stage1_multichoice") {
      return handleStage1MultiChoice(supabase, user.id, body);
    }

    // ── Stage 2 プローブ保存 ──
    if (body.type === "stage2_probe") {
      return handleStage2Probe(supabase, user.id, body);
    }

    // ── 朝の一問 保存 ──
    if (body.type === "morning_question") {
      return handleMorningQuestion(supabase, user.id, body);
    }

    // ── HOME ロボ経由の観測保存 ──
    if (body.type === "home_bridge") {
      return handleHomeBridge(supabase, user.id, body);
    }

    // ── パッシブセンサー（足跡 → 軸スコア反映） ──
    if (body.type === "passive_sensor") {
      return handlePassiveSensor(supabase, user.id, body);
    }

    // ── メタ観測リアクション保存 ──
    if (body.type === "meta_observation") {
      return handleMetaObservation(supabase, user.id, body);
    }

    // ── 既存の Binary A/B 保存 ──
    const {
      questionId,
      binaryChoice,
      responseTimeMs,
      confidenceSelfReport,
      reasonChipId,
      situationId,
    } = body;

    if (!questionId || !binaryChoice) {
      return apiBadRequest("Missing required fields");
    }

    const observationPayload = buildObservationRow(user.id, {
      question_id: questionId,
      phase: "core",
      answer: {
        type: "core_observation",
        questionId,
        binaryChoice,
        reasonChipId: reasonChipId ?? null,
        situationId: situationId ?? null,
        responseTimeMs: responseTimeMs || 0,
      },
      response_time_ms: responseTimeMs || 0,
      confidence_self_report: confidenceSelfReport,
      reason_chip_id: reasonChipId,
      situation_id: situationId,
    });
    logPayload("Core observation payload", observationPayload);

    const { error: insertError } = await supabase
      .from("stargazer_observations")
      .insert(observationPayload);

    if (insertError) {
      console.error(
        "[Stargazer API] Failed to save core observation:",
        insertError,
        "payload:",
        serializeForLog(observationPayload)
      );
      return apiError("Failed to save", 500, { detail: describeDbError(insertError) });
    }

    const { count } = await supabase
      .from("stargazer_observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    return apiOk({
      saved: true,
      observationCount: count || 0,
      message: "観測データを保存しました",
      dimensionsUpdated: [],
      liveSkyChanged: false,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errCause = error instanceof Error && (error as any).cause
      ? ` [cause: ${(error as any).cause?.message ?? String((error as any).cause)}]`
      : "";
    console.error(
      "[Stargazer API] FATAL exception in POST:",
      errMsg + errCause,
      "\nSupabase URL:", (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "(undefined)").substring(0, 50)
    );
    return apiError("Internal error", 500, { detail: errMsg + errCause });
  }
}

// ── Semantic Differential 一括保存ハンドラ ──

async function handleSemanticDifferential(
  supabase: any,
  userId: string,
  body: {
    answers: { questionId: string; value: number; responseTimeMs: number }[];
    resolvedType?: string;
    axisScores: Record<string, number>;
    confidence: number;
    topMatches?: { code: string; label: string; emoji: string; score: number }[];
    cfScores?: Record<string, number>;
    cfConfidences?: Record<string, number>;
  }
) {
  const { answers, resolvedType, axisScores, confidence, topMatches } = body;

  if (!answers?.length) {
    return apiBadRequest("Missing required fields");
  }

  // Track all errors — return 500 if any critical operation fails
  const criticalErrors: string[] = [];
  const warningErrors: string[] = [];

  // 0. 応答品質バリデーション
  const qualityResult = assessResponseQuality(
    answers.map((a) => ({
      questionId: a.questionId,
      value: a.value,
      responseTimeMs: a.responseTimeMs,
    }))
  );
  if (qualityResult.level === "unreliable") {
    console.warn("[Stargazer API] Response quality UNRELIABLE:", qualityResult.flags);
  }
  const scoringWeight = qualityResult.scoringWeight;

  // 1. 各回答を stargazer_observations に一括 insert [CRITICAL]
  const batchAnsweredAt = new Date().toISOString();
  const observationRows = answers.map((a) =>
    buildObservationRow(userId, {
      question_id: a.questionId,
      phase: "initial",
      answered_at: batchAnsweredAt,
      answer: {
        type: "semantic_differential",
        questionId: a.questionId,
        value: a.value,
        responseTimeMs: a.responseTimeMs || 0,
      },
      response_time_ms: a.responseTimeMs || 0,
    })
  );
  logPayload("Semantic observations payload", observationRows);

  const starMapPayload = {
    user_id: userId,
    core_star: {
      confidenceScore: confidence,
      coreTraits: axisScores,
      // backward compat: write resolvedType if provided
      ...(resolvedType ? { resolvedType } : {}),
    },
    live_sky: { dimensions: axisScores },
    updated_at: new Date().toISOString(),
  };
  logPayload("Semantic star_map payload", starMapPayload);

  // ベイズ信念の初期化（オンボーディング回答から）
  const bayesianInit = initializeFromOnboarding(
    answers.map((a: { questionId: string; value: number; responseTimeMs?: number }) => ({
      questionId: a.questionId,
      value: a.value,
      responseTimeMs: a.responseTimeMs,
    }))
  );

  // micro 3問の補正: クライアント送信の axisScores（micro統合済み）と
  // 51問ベースの beliefs の差分を、弱い証拠として beliefs に反映する。
  // クライアント側の computePhase1Result() と同等の処理を再現。
  const coreOnlyScores = beliefsToScores(bayesianInit.beliefs);
  const microDelta: Partial<Record<string, number>> = {};
  for (const [key, finalScore] of Object.entries(axisScores)) {
    const coreScore = coreOnlyScores[key as keyof typeof coreOnlyScores] ?? 0;
    const diff = finalScore - coreScore;
    if (Math.abs(diff) > 0.01) {
      microDelta[key] = diff;
    }
  }
  const reconciledBeliefs = Object.keys(microDelta).length > 0
    ? updateFromMicroAxes(bayesianInit.beliefs, microDelta as Partial<Record<import("@/lib/stargazer/traitAxes").TraitAxisKey, number>>)
    : bayesianInit.beliefs;

  const profilePayload = {
    user_id: userId,
    dimensions: axisScores,
    axis_beliefs: serializeBeliefs(reconciledBeliefs),
    median_response_time_ms: Math.round(
      answers.reduce((sum: number, a: { responseTimeMs?: number }) => sum + (a.responseTimeMs ?? 5000), 0) / Math.max(1, answers.length)
    ),
    tags:
      topMatches
        ?.slice(0, 3)
        .map((m) => m.label) ?? [],
    updated_at: new Date().toISOString(),
  };
  logPayload("Semantic profile payload", profilePayload);

  // 既存の _fit_feedback を保持するため、resolved_types の axis_scores をマージ
  let mergedAxisScores: Record<string, unknown> = axisScores;
  {
    const { data: existingRT } = await supabase
      .from("stargazer_resolved_types")
      .select("axis_scores")
      .eq("user_id", userId)
      .maybeSingle();
    const existingFeedback = (existingRT?.axis_scores as Record<string, unknown>)?._fit_feedback;
    if (existingFeedback) {
      mergedAxisScores = { ...axisScores, _fit_feedback: existingFeedback };
    }
  }

  const resolvedTypePayload = {
    user_id: userId,
    ...(resolvedType ? { archetype_code: resolvedType } : {}),
    top_matches: topMatches ?? [],
    axis_scores: mergedAxisScores,
    confidence,
    updated_at: new Date().toISOString(),
  };
  logPayload("Semantic resolved_type payload", resolvedTypePayload);

  const { error: obsError } = await supabase
    .from("stargazer_observations")
    .insert(observationRows);

  if (obsError) {
    console.error(
      "[Stargazer API] CRITICAL: Failed to save observations:",
      obsError,
      "payload:",
      serializeForLog(observationRows)
    );
    criticalErrors.push(`observations: ${describeDbError(obsError)}`);
  }

  // 2. stargazer_star_maps を upsert [CRITICAL]
  const { error: mapError } = await supabase
    .from("stargazer_star_maps")
    .upsert(
      starMapPayload,
      { onConflict: "user_id" }
    );

  if (mapError) {
    console.error(
      "[Stargazer API] CRITICAL: Failed to upsert star_map:",
      mapError,
      "payload:",
      serializeForLog(starMapPayload)
    );
    criticalErrors.push(`star_map: ${describeDbError(mapError)}`);
  }

  // 2.5. profiles.baseline_completed_at を自動セット（オンボーディング完了 = baseline完了）
  // mapError に関わらず実行（baseline_completed_at がユーザーの /baseline リダイレクトを防ぐ）
  {
    const { error: baselineErr } = await supabase
      .from("profiles")
      .update({ baseline_completed_at: new Date().toISOString() })
      .eq("id", userId)
      .is("baseline_completed_at", null);
    if (baselineErr) {
      console.warn("[Stargazer API] baseline_completed_at update failed (non-critical):", baselineErr.message);
    }
  }

  // 3. stargazer_profiles を upsert [CRITICAL]
  const { error: profileError } = await supabase
    .from("stargazer_profiles")
    .upsert(
      profilePayload,
      { onConflict: "user_id" }
    );

  if (profileError) {
    console.error(
      "[Stargazer API] CRITICAL: Failed to upsert profile:",
      profileError,
      "payload:",
      serializeForLog(profilePayload)
    );
    criticalErrors.push(`profile: ${describeDbError(profileError)}`);
  } else if (axisScores && Object.keys(axisScores).length > 0) {
    // Partner Process Profile を非同期で同期（Stargazer 更新時の自動再計算）
    syncProcessProfile(userId, axisScores).catch((err) => {
      console.warn("[Stargazer API] Partner process profile sync failed (non-critical):", err);
    });
  }

  // 4. stargazer_resolved_types を upsert [WARNING — non-critical]
  const { error: typeError } = await supabase
    .from("stargazer_resolved_types")
    .upsert(
      resolvedTypePayload,
      { onConflict: "user_id" }
    );

  if (typeError) {
    console.error(
      "[Stargazer API] Warning: Failed to upsert resolved_type:",
      typeError,
      "payload:",
      serializeForLog(resolvedTypePayload)
    );
    warningErrors.push(`resolved_type: ${describeDbError(typeError)}`);
  }

  // 5. Cognitive Fit スコアを stargazer_axis_snapshots に保存 [WARNING]
  if (body.cfScores && Object.keys(body.cfScores).length > 0) {
    const cfSnapshotRows = Object.entries(body.cfScores).map(([axis, score]) => ({
      id: crypto.randomUUID(),
      user_id: userId,
      axis_id: axis,
      score,
      confidence: body.cfConfidences?.[axis] ?? 0.3,
      context: null,
      observation_layer: "cognitive_fit",
      variant_id: null,
      session_date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
    }));

    const { error: cfError } = await supabase
      .from("stargazer_axis_snapshots")
      .insert(cfSnapshotRows);

    if (cfError) {
      console.error("[Stargazer API] Warning: Failed to save CF axis snapshots:", cfError);
      warningErrors.push(`cf_axis_snapshots: ${describeDbError(cfError)}`);
    } else {
      console.log("[Stargazer API] Saved", cfSnapshotRows.length, "CF axis snapshots");
    }

    // Also merge CF scores into the live_sky dimensions for the star_map
    const { error: cfMergeError } = await supabase
      .from("stargazer_star_maps")
      .upsert({
        user_id: userId,
        live_sky: { dimensions: { ...axisScores, ...body.cfScores } },
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (cfMergeError) {
      console.error("[Stargazer API] Warning: Failed to merge CF into star_map:", cfMergeError);
      warningErrors.push(`cf_star_map_merge: ${describeDbError(cfMergeError)}`);
    }
  }

  // ── CRITICAL: Return 500 if ANY critical operation failed ──
  if (criticalErrors.length > 0) {
    console.error("[Stargazer API] Save FAILED. Critical errors:", criticalErrors);
    return apiError("保存に失敗しました", 500, {
      detail: criticalErrors.join("; "),
    });
  }

  // Verify save by counting observations
  const { count, error: countError } = await supabase
    .from("stargazer_observations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countError) {
    console.error("[Stargazer API] Warning: Failed to count observations:", countError);
  }

  console.log("[Stargazer API] Save SUCCESS. Observation count:", count, "Warnings:", warningErrors);

  // ── context_profiles を非同期で再集計（Rendezvousマッチングに反映） ──
  aggregateContextProfiles(userId).catch((e) =>
    console.warn("[Stargazer API] context_profiles aggregation failed:", e)
  );

  // ── 理想の相手プロファイルを全カテゴリで自動導出 → Rendezvous テーブルに upsert ──
  syncIdealPartnerProfiles(userId, axisScores).catch((e) =>
    console.warn("[Stargazer API] ideal partner sync failed:", e)
  );

  return apiOk({
    saved: true,
    observationCount: count || 0,
    resolvedType,
    message: `${answers.length}問の観測結果を保存しました`,
    dimensionsUpdated: Object.keys(axisScores),
    liveSkyChanged: true,
    responseQuality: { quality: qualityResult.quality, level: qualityResult.level, scoringWeight },
    warnings: warningErrors.length > 0 ? warningErrors : undefined,
  });
}

// ── Stage 1 多肢選択 一括保存ハンドラ ──

async function handleStage1MultiChoice(
  supabase: any,
  userId: string,
  body: {
    answers: { questionId: string; selectedOptionId: string; responseTimeMs: number }[];
    resolvedType?: string;
    axisScores: Record<string, number>;
    confidence: number;
    topMatches?: { code: string; label: string; emoji: string; score: number }[];
  }
) {
  const { answers, resolvedType, axisScores, confidence, topMatches } = body;

  if (!answers?.length) {
    return apiBadRequest("Missing required fields");
  }

  const criticalErrors: string[] = [];

  // 1. 各回答を stargazer_observations に一括 insert [CRITICAL]
  const batchAnsweredAt = new Date().toISOString();
  const observationRows = answers.map((a) =>
    buildObservationRow(userId, {
      question_id: a.questionId,
      phase: "core",
      answered_at: batchAnsweredAt,
      answer: a.selectedOptionId,
      response_time_ms: a.responseTimeMs || 0,
      stage: "stage1",
    })
  );
  logPayload("Stage1 observations payload", observationRows);

  const { error: obsError } = await supabase
    .from("stargazer_observations")
    .insert(observationRows);

  if (obsError) {
    console.error(
      "[Stargazer API] CRITICAL: Failed to save stage1 observations:",
      obsError,
      "payload:",
      serializeForLog(observationRows)
    );
    criticalErrors.push(`observations: ${describeDbError(obsError)}`);
  }

  // 2. stargazer_star_maps を upsert [CRITICAL]
  const { error: mapError } = await supabase
    .from("stargazer_star_maps")
    .upsert(
      {
        user_id: userId,
        core_star: {
          confidenceScore: confidence,
          coreTraits: axisScores,
          ...(resolvedType ? { resolvedType } : {}),
        },
        live_sky: { dimensions: axisScores },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (mapError) {
    console.error("[Stargazer API] CRITICAL: Failed to upsert star_map:", mapError);
    criticalErrors.push(`star_map: ${describeDbError(mapError)}`);
  }

  // 2.5. profiles.baseline_completed_at を自動セット（Stage1完了 = baseline完了）
  {
    const { error: baselineErr } = await supabase
      .from("profiles")
      .update({ baseline_completed_at: new Date().toISOString() })
      .eq("id", userId)
      .is("baseline_completed_at", null);
    if (baselineErr) {
      console.warn("[Stargazer API] baseline_completed_at update failed (stage1, non-critical):", baselineErr.message);
    }
  }

  // 3. stargazer_profiles を upsert (with stage_progress) [CRITICAL]
  const { error: profileError } = await supabase
    .from("stargazer_profiles")
    .upsert(
      {
        user_id: userId,
        dimensions: axisScores,
        tags: topMatches?.slice(0, 3).map((m) => m.label) ?? [],
        stage_progress: {
          stage: "stage1_done",
          stage1: {
            answeredCount: answers.length,
            totalCount: answers.length,
            completedAt: new Date().toISOString(),
          },
          stage2: { completedThemeIds: [], totalThemes: 6 },
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (profileError) {
    console.error("[Stargazer API] CRITICAL: Failed to upsert profile:", profileError);
    criticalErrors.push(`profile: ${describeDbError(profileError)}`);
  }

  // 4. stargazer_resolved_types を upsert
  // 既存の _fit_feedback を保持するためマージ
  let stage1MergedAxisScores: Record<string, unknown> = axisScores;
  {
    const { data: existingRT } = await supabase
      .from("stargazer_resolved_types")
      .select("axis_scores")
      .eq("user_id", userId)
      .maybeSingle();
    const existingFeedback = (existingRT?.axis_scores as Record<string, unknown>)?._fit_feedback;
    if (existingFeedback) {
      stage1MergedAxisScores = { ...axisScores, _fit_feedback: existingFeedback };
    }
  }
  const { error: typeError } = await supabase
    .from("stargazer_resolved_types")
    .upsert(
      {
        user_id: userId,
        ...(resolvedType ? { archetype_code: resolvedType } : {}),
        top_matches: topMatches ?? [],
        axis_scores: stage1MergedAxisScores,
        confidence,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (typeError) {
    console.error("[Stargazer API] Warning: Failed to upsert resolved_type:", typeError);
  }

  // Return 500 if any critical operation failed
  if (criticalErrors.length > 0) {
    console.error("[Stargazer API] Stage1 save FAILED:", criticalErrors);
    return apiError("保存に失敗しました", 500, {
      detail: criticalErrors.join("; "),
    });
  }

  const { count } = await supabase
    .from("stargazer_observations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  // context_profiles 再集計（Rendezvousマッチング反映）
  aggregateContextProfiles(userId).catch((e) =>
    console.warn("[Stargazer API] context_profiles aggregation failed:", e)
  );

  // 理想の相手プロファイルを自動導出
  syncIdealPartnerProfiles(userId, axisScores).catch((e) =>
    console.warn("[Stargazer API] ideal partner sync failed:", e)
  );

  return apiOk({
    saved: true,
    observationCount: count || 0,
    resolvedType,
    message: "Stage 1 観測結果を保存しました",
    dimensionsUpdated: Object.keys(axisScores),
    liveSkyChanged: true,
  });
}

// ── Stage 2 プローブ保存ハンドラ ──

async function handleStage2Probe(
  supabase: any,
  userId: string,
  body: {
    themeId: string;
    context: string;
    answers: { step: string; selectedOptionId: string; branchKey?: string; responseTimeMs: number }[];
    axisDeltas: Record<string, number>;
  }
) {
  const { themeId, context, answers, axisDeltas } = body;

  if (!themeId || !answers?.length) {
    return apiBadRequest("Missing required fields");
  }

  const criticalErrors: string[] = [];

  // 1. 各ステップ回答を stargazer_observations に insert [CRITICAL]
  const batchAnsweredAt = new Date().toISOString();
  const observationRows = answers.map((a) =>
    buildObservationRow(userId, {
      question_id: `${themeId}_${a.step}`,
      phase: "stage2",
      answered_at: batchAnsweredAt,
      answer: a.selectedOptionId,
      response_time_ms: a.responseTimeMs || 0,
      stage: "stage2",
      answer_value: {
        themeId,
        context,
        step: a.step,
        branchKey: a.branchKey,
      },
    })
  );
  logPayload("Stage2 observations payload", observationRows);

  const { error: obsError } = await supabase
    .from("stargazer_observations")
    .insert(observationRows);

  if (obsError) {
    console.error(
      "[Stargazer API] CRITICAL: Failed to save stage2 observations:",
      obsError,
      "payload:",
      serializeForLog(observationRows)
    );
    criticalErrors.push(`observations: ${describeDbError(obsError)}`);
  }

  // 2. stargazer_profiles.dimensions を統合スコアで更新
  // まず現在の profile を取得
  const { data: currentProfile } = await supabase
    .from("stargazer_profiles")
    .select("dimensions, stage_progress")
    .eq("user_id", userId)
    .single();

  if (currentProfile) {
    const currentDimensions = currentProfile.dimensions || {};
    const currentProgress = currentProfile.stage_progress || {};

    // axisDeltas を統合
    const updatedDimensions = { ...currentDimensions };
    for (const [key, delta] of Object.entries(axisDeltas)) {
      const current = updatedDimensions[key] ?? 0;
      // Stage 2 スコアを 0.6、既存を 0.4 で統合
      updatedDimensions[key] = Math.max(-1, Math.min(1, current * 0.4 + (delta as number) * 0.6));
    }

    // stage_progress 更新
    const completedThemeIds = [
      ...(currentProgress.stage2?.completedThemeIds || []),
      themeId,
    ];
    const updatedProgress = {
      ...currentProgress,
      stage: completedThemeIds.length >= 6 ? "stage2_done" : "stage2_active",
      stage2: {
        completedThemeIds,
        totalThemes: 6,
        ...(completedThemeIds.length >= 6
          ? { completedAt: new Date().toISOString() }
          : {}),
      },
    };

    const { error: profileError } = await supabase
      .from("stargazer_profiles")
      .update({
        dimensions: updatedDimensions,
        stage_progress: updatedProgress,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (profileError) {
      console.error("[Stargazer API] CRITICAL: Failed to update profile with stage2:", profileError);
      criticalErrors.push(`profile: ${describeDbError(profileError)}`);
    } else if (updatedDimensions && Object.keys(updatedDimensions).length > 0) {
      syncProcessProfile(userId, updatedDimensions).catch((err) => {
        console.warn("[Stargazer API] Partner process profile sync failed (non-critical):", err);
      });
    }

    // 3. stargazer_resolved_types の stage2_data を更新
    const { error: typeError } = await supabase
      .from("stargazer_resolved_types")
      .update({
        stage2_data: {
          completedThemeIds,
          latestTheme: { themeId, context, axisDeltas },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (typeError) {
      console.error("[Stargazer API] Warning: Failed to update resolved_type stage2_data:", typeError);
    }
  }

  // Return 500 if any critical operation failed
  if (criticalErrors.length > 0) {
    console.error("[Stargazer API] Stage2 save FAILED:", criticalErrors);
    return apiError("保存に失敗しました", 500, {
      detail: criticalErrors.join("; "),
    });
  }

  const { count } = await supabase
    .from("stargazer_observations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  // context_profiles 再集計（Rendezvousマッチング反映）
  aggregateContextProfiles(userId).catch((e) =>
    console.warn("[Stargazer API] context_profiles aggregation failed:", e)
  );

  // 理想の相手プロファイルを自動導出
  syncIdealPartnerProfiles(userId, axisDeltas).catch((e) =>
    console.warn("[Stargazer API] ideal partner sync failed:", e)
  );

  return apiOk({
    saved: true,
    observationCount: count || 0,
    themeId,
    message: `${themeId} の深層観測を保存しました`,
    dimensionsUpdated: Object.keys(axisDeltas),
    liveSkyChanged: true,
  });
}

// ── 朝の一問 保存ハンドラ ──
async function handleMorningQuestion(
  supabase: any,
  userId: string,
  body: {
    answers: {
      variantId: string;
      score: number;
      responseTimeMs: number;
      optionId: string;
    }[];
  }
) {
  const { answers } = body;
  if (!answers?.length) {
    return apiBadRequest("No answers provided");
  }

  const answeredAt = new Date().toISOString();
  const rows = answers.map((a) =>
    buildObservationRow(userId, {
      question_id: a.variantId,
      phase: "daily",
      answered_at: answeredAt,
      answer: a.optionId,
      response_time_ms: a.responseTimeMs || 0,
      stage: "morning_question",
      answer_value: {
        score: a.score,
        optionId: a.optionId,
      },
    })
  );

  const { error: insertError } = await supabase
    .from("stargazer_observations")
    .insert(rows);

  if (insertError) {
    console.error("[Stargazer API] Failed to save morning_question:", insertError);
    return apiError("Failed to save morning question", 500, { detail: describeDbError(insertError) });
  }

  return apiOk({
    saved: true,
    savedCount: rows.length,
    message: "朝の一問を保存しました",
  });
}

// ── HOME ロボ経由の観測保存ハンドラ ──

async function handleHomeBridge(
  supabase: any,
  userId: string,
  body: {
    answers: {
      questionId: string;
      category: string;
      choiceValue: number;
      responseTimeMs: number;
      hasDrill: boolean;
    }[];
    axisDeltas: { axis: string; delta: number }[];
    source: string;
    timestamp: string;
  }
) {
  const { answers, axisDeltas, timestamp } = body;

  if (!answers?.length) {
    return apiBadRequest("No answers provided");
  }

  const criticalErrors: string[] = [];

  // 1. 各回答を stargazer_observations に保存 [CRITICAL]
  const answeredAt = timestamp || new Date().toISOString();
  const observationRows = answers.map((a) =>
    buildObservationRow(userId, {
      question_id: a.questionId,
      phase: "daily",
      answered_at: answeredAt,
      answer: String(a.choiceValue),
      response_time_ms: a.responseTimeMs || 0,
      stage: "home_bridge",
      answer_value: {
        category: a.category,
        source: "home_robot",
        hasDrill: a.hasDrill,
      },
    })
  );
  logPayload("HomeBridge observations payload", observationRows);

  const { error: obsError } = await supabase
    .from("stargazer_observations")
    .insert(observationRows);

  if (obsError) {
    console.error(
      "[Stargazer API] CRITICAL: Failed to save home_bridge observations:",
      obsError,
      "payload:",
      serializeForLog(observationRows)
    );
    criticalErrors.push(`observations: ${describeDbError(obsError)}`);
  }

  // 2. 軸デルタを stargazer_profiles.dimensions に統合
  if (axisDeltas.length > 0) {
    const { data: currentProfile } = await supabase
      .from("stargazer_profiles")
      .select("dimensions, total_sessions")
      .eq("user_id", userId)
      .single();

    if (currentProfile) {
      const currentDimensions = currentProfile.dimensions || {};
      const updatedDimensions = { ...currentDimensions };

      for (const { axis, delta } of axisDeltas) {
        const current = updatedDimensions[axis] ?? 0;
        // HOME 経由は小さなデルタなので控えめに統合
        // 既存 0.7 + デルタ 0.3 (Stage2の0.4/0.6より控えめ)
        updatedDimensions[axis] = Math.max(
          -1,
          Math.min(1, current * 0.7 + delta * 0.3)
        );
      }

      const { error: profileError } = await supabase
        .from("stargazer_profiles")
        .update({
          dimensions: updatedDimensions,
          total_sessions: (currentProfile.total_sessions || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (profileError) {
        console.error("[Stargazer API] CRITICAL: Failed to update profile from home_bridge:", profileError);
        criticalErrors.push(`profile: ${describeDbError(profileError)}`);
      } else {
        syncProcessProfile(userId, updatedDimensions).catch((err) => {
          console.warn("[Stargazer API] Partner process profile sync failed (non-critical):", err);
        });
      }
    }
  }

  // 3. stargazer_daily_states にログ
  const today = (timestamp || new Date().toISOString()).slice(0, 10);
  await supabase.from("stargazer_daily_states").upsert(
    {
      user_id: userId,
      date: today,
      observation_source: "home_robot",
      observation_count: answers.length,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,date", ignoreDuplicates: false }
  );

  // Return 500 if any critical operation failed
  if (criticalErrors.length > 0) {
    console.error("[Stargazer API] HomeBridge save FAILED:", criticalErrors);
    return apiError("保存に失敗しました", 500, {
      detail: criticalErrors.join("; "),
    });
  }

  const { count } = await supabase
    .from("stargazer_observations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  return apiOk({
    saved: true,
    observationCount: count || 0,
    message: `HOME 経由で ${answers.length} 件の観測を保存しました`,
    dimensionsUpdated: axisDeltas.map((d) => d.axis),
    liveSkyChanged: axisDeltas.length > 0,
  });
}

// ── パッシブセンサー保存ハンドラ ──
// sensorPipeline.ts から5分ごとに送信される足跡集計データを
// axis_snapshots に observation_layer: "footprint" として記録する

async function handlePassiveSensor(
  supabase: ReturnType<typeof Object>,
  userId: string,
  body: {
    source: string;
    axisDeltas: { axisId: string; delta: number; source: string; confidence: number }[];
    metadata: { signalCount: number; patternCount: number; flushTimestamp: string };
  },
) {
  const { axisDeltas, metadata } = body;

  if (!axisDeltas?.length) {
    return apiOk({ saved: false, reason: "no deltas" });
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  // 1. axis_snapshots に footprint レイヤーとして記録
  const snapshotRows = axisDeltas
    .filter((d) => Math.abs(d.delta) > 0.01)
    .map((d) => ({
      user_id: userId,
      axis_id: d.axisId,
      score: Math.max(-1, Math.min(1, d.delta)),
      observation_layer: "footprint",
      session_date: today,
      created_at: now,
    }));

  if (snapshotRows.length === 0) {
    return apiOk({ saved: false, reason: "deltas below threshold" });
  }

  const { error: snapError } = await (supabase as any)
    .from("stargazer_axis_snapshots")
    .insert(snapshotRows);

  if (snapError) {
    console.error(
      "[Stargazer API] PassiveSensor: Failed to save axis_snapshots:",
      snapError,
    );
    return apiError("snapshot save failed", 500);
  }

  // 2. footprint_summaries にサマリーを upsert
  await (supabase as any)
    .from("stargazer_footprint_summaries")
    .upsert(
      {
        user_id: userId,
        date: today,
        signal_count: metadata.signalCount,
        pattern_count: metadata.patternCount,
        axis_count: snapshotRows.length,
        updated_at: now,
      },
      { onConflict: "user_id,date" },
    )
    .then(() => {})
    .catch((err: unknown) => {
      console.warn("[Stargazer API] PassiveSensor: footprint_summaries upsert warning:", err);
    });

  console.log(
    `[Stargazer API] PassiveSensor: Saved ${snapshotRows.length} axis snapshots from ${metadata.signalCount} signals`,
  );

  return apiOk({
    saved: true,
    axisCount: snapshotRows.length,
    signalCount: metadata.signalCount,
  });
}

// ── メタ観測リアクション保存ハンドラ ──
// 観測結果に対するユーザーのリアクション（驚き・納得・否定等）を永続化
// feedbackパターンに準拠: stargazer_observations テーブルに記録

async function handleMetaObservation(
  supabase: ReturnType<typeof Object>,
  userId: string,
  body: {
    reactions: {
      axisId: string;
      reaction: "surprised" | "validated" | "denied" | "curious" | "indifferent";
      score?: number;
      comment?: string;
    }[];
    sessionDate?: string;
  },
) {
  const { reactions, sessionDate } = body;

  if (!reactions?.length) {
    return apiBadRequest("No reactions provided");
  }

  const now = new Date().toISOString();
  const date = sessionDate || now.slice(0, 10);

  // stargazer_observations に observation_type: "meta_observation" として一括記録
  const rows = reactions.map((r) => ({
    user_id: userId,
    question_id: `meta_${r.axisId}_${date}`,
    phase: "daily",
    answer: r.reaction,
    answer_value: {
      type: "meta_observation",
      axisId: r.axisId,
      reaction: r.reaction,
      score: r.score,
      comment: r.comment,
    },
    response_time_ms: 0,
    answered_at: now,
    shown_at: now,
    observation_layer: "daily",
  }));

  const { error } = await (supabase as any)
    .from("stargazer_observations")
    .insert(rows);

  if (error) {
    console.error("[Stargazer API] MetaObservation: Failed to save:", error);
    // Non-critical — localStorage backup exists
    return apiOk({ persisted: false });
  }

  console.log(
    `[Stargazer API] MetaObservation: Saved ${reactions.length} reactions for ${date}`,
  );

  return apiOk({
    persisted: true,
    count: reactions.length,
  });
}

// ── 理想の相手プロファイル自動同期 ──
// 観測保存のたびに全カテゴリで理想の相手像を再導出 → upsert

async function syncIdealPartnerProfiles(
  userId: string,
  axisScores: Record<string, number>,
): Promise<void> {
  // 軸数が少なすぎる場合はスキップ（最低5軸は必要）
  const axisCount = Object.keys(axisScores).length;
  if (axisCount < 5) return;

  const categories = ["romantic", "friendship", "cocreation", "community", "partner"] as const;

  const rows = categories.map((cat) => {
    const derived = deriveIdealPartner(axisScores, cat as any);
    return toIdealPartnerRow(userId, cat as any, derived);
  });

  const { error } = await supabaseAdmin
    .from("rendezvous_ideal_partner_profiles")
    .upsert(rows, { onConflict: "user_id,category" });

  if (error) {
    console.warn("[Stargazer API] ideal_partner_profiles upsert failed:", error);
  } else {
    console.log(`[Stargazer API] Synced ideal partner profiles for ${categories.length} categories (${axisCount} axes)`);
  }
}
