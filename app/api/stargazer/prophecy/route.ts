import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { checkStargazerTier } from "@/lib/stargazer/tierGuard";
import {
  generateDailyProphecy,
  calculateAccuracy,
  type ProphecyInput,
  type ProphecyCategory,
  type ProphecyVerification,
} from "@/lib/stargazer/dailyProphecy";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import {
  buildAxisScores,
  todayJST,
  calcObservationDepth,
  truncateString,
} from "@/lib/stargazer/sharedRouteUtils";
import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "@/lib/stargazer/studentTrack";
import {
  fetchPatternsForUser,
  selectAhaInsights,
} from "@/lib/stargazer/ahaEngine";
import {
  calculateAccuracyStats,
  checkNewMilestones,
  statusToLevel,
  mapToVerificationLevel,
  type VerifiedProphecy,
  type AccuracyStats,
} from "@/lib/stargazer/prophecyAccuracy";
import {
  generateAIPrediction,
  isAIPrediction,
  type AIPredictionParams,
} from "@/lib/stargazer/aiPredictionEngine";
import {
  generatePatternPredictions,
  shouldPreferPatternPrediction,
} from "@/lib/stargazer/patternPredictions";
import {
  buildInsightPreference,
  preferenceToPromptContext,
} from "@/lib/stargazer/insightPersonalizer";

export const runtime = "nodejs";

// ── GET: 今日の Daily Prophecy を取得 ──
export async function GET() {
  try {
    const tierCheck = await checkStargazerTier("prophecy");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId, isBetaTester } = tierCheck;

    const supabase = await supabaseServer();
    const today = todayJST();

    // 既存の今日の予言 + 軸スコア用データを並列取得
    const [
      { data: existingProphecy },
      { data: profile },
      { data: resolvedTypeRow },
      { data: recentProphecies },
      { data: accuracyRow },
      { data: allVerifiedRows },
    ] = await Promise.all([
      supabase
        .from("stargazer_daily_prophecies")
        .select("*")
        .eq("user_id", userId)
        .eq("prophecy_date", today)
        .limit(1),
      supabase
        .from("stargazer_profiles")
        .select("dimensions, total_sessions")
        .eq("user_id", userId)
        .single(),
      supabase
        .from("stargazer_resolved_types")
        .select("axis_scores")
        .eq("user_id", userId)
        .single(),
      supabase
        .from("stargazer_daily_prophecies")
        .select("prediction_category, accuracy_score, verified_at")
        .eq("user_id", userId)
        .order("prophecy_date", { ascending: false })
        .limit(14),
      supabase
        .from("stargazer_prediction_accuracy")
        .select("*")
        .eq("user_id", userId)
        .single(),
      // Fetch all verified prophecies for detailed stats
      supabase
        .from("stargazer_daily_prophecies")
        .select("id, prophecy_date, prediction_category, accuracy_score, verification_answer, verified_at")
        .eq("user_id", userId)
        .not("verified_at", "is", null)
        .order("prophecy_date", { ascending: true })
        .limit(200),
    ]);

    // Build detailed accuracy stats from verified prophecies
    let detailedStats: AccuracyStats | null = null;
    if (allVerifiedRows && allVerifiedRows.length > 0) {
      const verifiedProphecies: VerifiedProphecy[] = allVerifiedRows.map(
        (row: Record<string, unknown>) => ({
          id: row.id as string,
          prophecyDate: row.prophecy_date as string,
          category: (row.category as ProphecyCategory) ?? "decision",
          verificationLevel: statusToLevel(
            row.verification_answer as string ?? "",
            Number(row.accuracy_score) || 0,
          ),
          accuracyScore: Number(row.accuracy_score) || 0,
          verifiedAt: row.verified_at as string,
        }),
      );
      detailedStats = calculateAccuracyStats(verifiedProphecies);
    }

    // 今日のデータがあればそのまま返す
    if (existingProphecy && existingProphecy.length > 0) {
      const row = existingProphecy[0];
      return NextResponse.json({
        ok: true,
        prophecy: {
          id: row.id,
          prophecyDate: row.prophecy_date,
          category: row.category,
          prediction: row.prediction_text,
          confidence: Number(row.confidence),
          reasoning: row.reasoning,
          verificationPrompt: row.verification_prompt,
          verificationAnswer: row.verification_answer,
          actualBehavior: row.actual_behavior,
          accuracyScore: row.accuracy_score != null ? Number(row.accuracy_score) : null,
          verifiedAt: row.verified_at,
        },
        accuracy: accuracyRow
          ? {
              totalPredictions: accuracyRow.total_predictions,
              verifiedCount: accuracyRow.verified_count,
              accuracyRate: Number(accuracyRow.accuracy_rate),
              currentStreak: accuracyRow.current_streak,
              bestStreak: accuracyRow.best_streak,
              categoryAccuracy: accuracyRow.category_accuracy,
            }
          : null,
        detailedStats,
      });
    }

    // 軸スコアを構築
    const { axisScores, hasEvidence } = buildAxisScores(
      profile?.dimensions ?? null,
      resolvedTypeRow?.axis_scores ?? null,
      isBetaTester,
    );

    // アーキタイプコードを算出
    const archetype = hasEvidence ? resolveArchetype(axisScores) : null;
    const archetypeCode = archetype?.code ?? "HCW";

    // 観測深度（統一計算）
    const totalSessions = profile?.total_sessions ?? 0;
    const observationDepth = calcObservationDepth(totalSessions);

    // 直近の予言履歴を整形
    const recentProphecyData = (recentProphecies ?? []).map(
      (p: Record<string, unknown>) => ({
        category: p.category as ProphecyCategory,
        wasCorrect: p.verified_at != null && typeof p.accuracy_score === "number" && (p.accuracy_score as number) >= 0.5,
      }),
    );

    // ── 予言生成: 優先度順に試行 ──
    // 1. パターン駆動予測 (データ裏付け)
    // 2. AI 予測エンジン (パーソナライズ)
    // 3. テンプレートフォールバック
    const dayOfWeek = new Date().getDay();
    let predictionText: string;
    let predictionCategory: string;
    let predictionConfidence: number;
    let predictionBasis: string;
    let predictionVerificationPrompt: string;
    let predictionAlternativeOutcome: string | null = null;
    let engineUsed: "pattern" | "ai" | "template" = "template";
    let patternInsight: string | null = null;

    // ── 優先度1: パターン駆動予測 ──
    try {
      const detectedPatterns = await fetchPatternsForUser(supabase, userId);
      if (detectedPatterns.length > 0) {
        const patternPreds = generatePatternPredictions(detectedPatterns, 1);
        if (patternPreds.length > 0) {
          const pp = patternPreds[0];
          if (shouldPreferPatternPrediction(pp.confidence, 0.3, detectedPatterns.length)) {
            predictionText = pp.prediction;
            predictionCategory = pp.category;
            predictionConfidence = pp.confidence;
            predictionBasis = pp.evidence.join("; ");
            predictionVerificationPrompt = pp.testableAction;
            predictionAlternativeOutcome = pp.alternativeOutcome;
            engineUsed = "pattern";
            console.info(`[prophecy] パターン予測を使用 (user=${userId.slice(0, 8)}, category=${pp.category})`);
          }
        }
        // パターンからインサイトも取得
        const insights = await selectAhaInsights(detectedPatterns, "prophecy", 1);
        if (insights.length > 0 && insights[0].confidence > 0.5) {
          patternInsight = insights[0].formattedForTarget;
        }
      }
    } catch (patternError) {
      console.warn("[prophecy] パターン予測失敗、次のエンジンへ:", patternError);
    }

    // ── 優先度2: AI 予測エンジン ──
    if (engineUsed === "template") {
      try {
        const aiParams: AIPredictionParams = {
          userId,
          axisScores,
          observationCount: totalSessions,
          dayOfWeek,
          currentHour: new Date().getHours(),
          contradictions: [],
          detectedPatterns: [],
          axisTrends: [],
          accuracyByCategory: {},
        };

        // 矛盾データの取得を試みる
        try {
          const { data: contradictionRows } = await supabase
            .from("stargazer_contradictions")
            .select("type, description, severity")
            .eq("user_id", userId)
            .order("severity", { ascending: false })
            .limit(5);
          if (contradictionRows) {
            aiParams.contradictions = contradictionRows.map((r: Record<string, unknown>) => ({
              axisA: "",
              axisB: "",
              type: r.type as "temporal" | "cross_axis" | "self_report_vs_behavior" | "stated_vs_chosen",
              description: r.description as string,
              severity: Number(r.severity) || 0,
              insightPotential: "",
              probeQuestion: "",
            }));
          }
        } catch {
          // silent
        }

        // 過去の精度データを活用
        if (accuracyRow?.category_accuracy) {
          const catAcc = accuracyRow.category_accuracy as Record<string, unknown>;
          for (const [cat, val] of Object.entries(catAcc)) {
            if (cat === "milestones" || typeof val !== "number") continue;
            const total = (allVerifiedRows ?? []).filter(
              (r: Record<string, unknown>) => r.category === cat,
            ).length;
            const correct = Math.round(val * total);
            aiParams.accuracyByCategory[cat] = { correct, wrong: total - correct, total };
          }
        }

        const aiResult = await generateAIPrediction(aiParams);
        if (isAIPrediction(aiResult)) {
          predictionText = aiResult.prediction;
          predictionCategory = aiResult.category;
          predictionConfidence = aiResult.confidence;
          predictionBasis = aiResult.basedOn;
          predictionVerificationPrompt = aiResult.triggerScenario;
          predictionAlternativeOutcome = aiResult.alternativeOutcome;
          engineUsed = "ai";
          console.info(`[prophecy] AI予測を使用 (user=${userId.slice(0, 8)}, specificity=${aiResult.specificityScore})`);
        }
      } catch (aiErr) {
        console.warn("[prophecy] AI予測失敗、テンプレートへフォールバック:", aiErr);
      }
    }

    // ── 優先度3: テンプレートフォールバック ──
    if (engineUsed === "template") {
      const prophecyInput: ProphecyInput = {
        userId,
        archetypeCode,
        axisScores,
        dayOfWeek,
        observationDepth,
        recentProphecies: recentProphecyData,
      };
      const prophecy = generateDailyProphecy(prophecyInput);

      predictionText = prophecy.prediction;
      predictionCategory = prophecy.category;
      predictionConfidence = prophecy.confidence;
      predictionBasis = typeof prophecy.basis === "string" ? prophecy.basis : JSON.stringify(prophecy.basis);
      predictionVerificationPrompt = prophecy.verificationPrompt;
      predictionAlternativeOutcome = prophecy.alternativeOutcome ?? null;

      // ユーザー嗜好プロファイルを構築（失敗しても続行）
      let preferenceContext = "";
      try {
        const pref = await buildInsightPreference(userId, supabase);
        preferenceContext = preferenceToPromptContext(pref);
      } catch (prefError) {
        console.warn("[prophecy] Preference loading failed, continuing:", prefError);
      }

      // テンプレート予測を AI で強化（失敗時はそのまま使用）
      try {
        const weekday = new Date().toLocaleDateString("ja-JP", { weekday: "long" });
        const aiEnhanceResult = await runAI({
          taskType: "stargazer_prophecy_enhance",
          metadata: makeStargazerRunMetadata({ feature: "prophecy" }),
          prompt: JSON.stringify({
            category: predictionCategory,
            templatePrediction: predictionText,
            confidence: predictionConfidence,
            archetypeCode,
            weekday,
          }),
          systemPrompt: `あなたはStargazerの「行動予言」を書く予言者です。
テンプレートの予言を元に、より具体的で検証可能な予言に書き直してください。

ルール:
- 「〜するだろう」「〜する可能性が高い」の語尾を使う
- 最大120文字
- 検証可能な具体的行動を含める
- カテゴリ(${predictionCategory})に即した内容
- 曜日(${weekday})の文脈を活かす${preferenceContext}`,
          requireJson: false,
          temperature: 0.7,
          maxOutputTokens: 200,
          userId,
        });
        if (aiEnhanceResult.success && aiEnhanceResult.text) {
          predictionText = aiEnhanceResult.text.slice(0, 200);
        }
      } catch {
        // テンプレートのまま続行
      }
      console.info(`[prophecy] テンプレート予測を使用 (user=${userId.slice(0, 8)})`);
    }

    // prediction_category を DB CHECK 制約に合わせて正規化
    // AIは日本語 ('エネルギー配分','対人行動' 等) を返すが、DBは英語6値のみ許可
    const CATEGORY_NORMALIZE: Record<string, string> = {
      // 日本語 → 英語
      "判断": "decision", "意思決定": "decision", "決断": "decision",
      "感情": "emotion", "感情変動": "emotion", "内面変化": "emotion",
      "対人": "social", "対人行動": "social", "社会的": "social", "人間関係": "social",
      "エネルギー": "energy", "エネルギー配分": "energy", "活力": "energy",
      "回避": "avoidance", "回避行動": "avoidance",
      "衝動": "impulse", "衝動的行動": "impulse", "反射的行動": "impulse",
      // 英語はそのまま通す
      "decision": "decision", "emotion": "emotion", "social": "social",
      "energy": "energy", "avoidance": "avoidance", "impulse": "impulse",
    };
    const VALID_CATEGORIES = new Set(["decision", "emotion", "social", "energy", "avoidance", "impulse"]);
    const normalizedCategory = CATEGORY_NORMALIZE[predictionCategory!] ?? "decision";
    const safeCategory = VALID_CATEGORIES.has(normalizedCategory) ? normalizedCategory : "decision";

    // DB に保存 (UPSERT で同日重複を防止)
    const { data: upserted, error: upsertError } = await supabase
      .from("stargazer_daily_prophecies")
      .upsert(
        {
          user_id: userId,
          prophecy_date: today,
          prediction_category: safeCategory,
          prediction_text: predictionText!,
          prediction_confidence: predictionConfidence!,
          prediction_basis: predictionBasis!,
        },
        { onConflict: "user_id,prophecy_date" },
      )
      .select("id")
      .single();

    if (upsertError) {
      console.error("Failed to upsert daily prophecy:", upsertError);
    }

    return NextResponse.json({
      ok: true,
      prophecy: {
        id: upserted?.id ?? `prophecy_${today}`,
        prophecyDate: today,
        category: predictionCategory!,
        prediction: predictionText!,
        confidence: predictionConfidence!,
        reasoning: predictionBasis!,
        verificationPrompt: predictionVerificationPrompt!,
        verificationAnswer: null,
        actualBehavior: null,
        accuracyScore: null,
        verifiedAt: null,
        patternInsight,
        engineUsed,
      },
      accuracy: accuracyRow
        ? {
            totalPredictions: accuracyRow.total_predictions,
            verifiedCount: accuracyRow.verified_count,
            accuracyRate: Number(accuracyRow.accuracy_rate),
            currentStreak: accuracyRow.current_streak,
            bestStreak: accuracyRow.best_streak,
            categoryAccuracy: accuracyRow.category_accuracy,
          }
        : null,
      detailedStats,
    });
  } catch (error) {
    console.error("Failed to get daily prophecy:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── POST: 検証結果を送信 ──
export async function POST(request: NextRequest) {
  try {
    const tierCheck = await checkStargazerTier("prophecy");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId } = tierCheck;

    const supabase = await supabaseServer();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { prophecyId, verificationAnswer, actualBehavior } = body as {
      prophecyId: string;
      verificationAnswer: string;
      actualBehavior?: string;
    };

    if (!prophecyId || typeof prophecyId !== "string") {
      return NextResponse.json({ error: "prophecyId が必要です" }, { status: 400 });
    }
    if (!verificationAnswer || typeof verificationAnswer !== "string") {
      return NextResponse.json({ error: "verificationAnswer が必要です" }, { status: 400 });
    }

    // UUID 形式の簡易チェック
    if (!/^[0-9a-f-]{36}$/i.test(prophecyId)) {
      return NextResponse.json({ error: "不正な prophecyId です" }, { status: 400 });
    }

    // 入力を安全にトリミング
    const safeAnswer = truncateString(verificationAnswer, 500);
    const safeBehavior = actualBehavior ? truncateString(actualBehavior, 2000) : null;

    // 対象の予言を取得
    const { data: prophecyRow, error: fetchError } = await supabase
      .from("stargazer_daily_prophecies")
      .select("id, category, prediction_text")
      .eq("id", prophecyId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !prophecyRow) {
      return NextResponse.json({ error: "予言が見つかりません" }, { status: 404 });
    }

    // 5段階検証レベルに変換
    const verificationLevel = mapToVerificationLevel(safeAnswer);

    // 精度スコアをレベルに基づいて算出
    const levelScoreMap: Record<string, number> = {
      exact: 1.0,
      close: 0.7,
      partial: 0.4,
      off: 0.1,
      opposite: 0.0,
    };
    const accuracyScore = levelScoreMap[verificationLevel] ?? 0;

    // 予言を更新
    const { error: updateError } = await supabase
      .from("stargazer_daily_prophecies")
      .update({
        verification_answer: safeAnswer,
        actual_behavior: safeBehavior,
        accuracy_score: accuracyScore,
        verified_at: new Date().toISOString(),
      })
      .eq("id", prophecyId)
      .eq("user_id", userId);

    if (updateError) {
      console.error("Failed to update prophecy verification:", updateError);
      return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
    }

    // 全検証済み予言を取得して精度統計を再計算
    const { data: allVerified } = await supabase
      .from("stargazer_daily_prophecies")
      .select("id, prophecy_date, prediction_category, accuracy_score, verification_answer, verified_at")
      .eq("user_id", userId)
      .not("verified_at", "is", null)
      .order("prophecy_date", { ascending: true })
      .limit(200);

    let detailedStats: AccuracyStats | null = null;
    let newMilestones: AccuracyStats["milestones"] = [];

    if (allVerified && allVerified.length > 0) {
      // Build VerifiedProphecy array for the new engine
      const verifiedProphecies: VerifiedProphecy[] = allVerified.map(
        (row: Record<string, unknown>) => ({
          id: row.id as string,
          prophecyDate: row.prophecy_date as string,
          category: (row.category as ProphecyCategory) ?? "decision",
          verificationLevel: statusToLevel(
            row.verification_answer as string ?? "",
            Number(row.accuracy_score) || 0,
          ),
          accuracyScore: Number(row.accuracy_score) || 0,
          verifiedAt: row.verified_at as string,
        }),
      );

      detailedStats = calculateAccuracyStats(verifiedProphecies);

      // Check for new milestones
      const { data: existingAccuracy } = await supabase
        .from("stargazer_prediction_accuracy")
        .select("category_accuracy")
        .eq("user_id", userId)
        .single();

      const previousMilestoneIds: string[] =
        (existingAccuracy?.category_accuracy as Record<string, unknown>)?.milestones as string[] ?? [];
      newMilestones = checkNewMilestones(detailedStats, previousMilestoneIds);

      // Also maintain backward-compatible stats via old calculateAccuracy
      const verifications: ProphecyVerification[] = allVerified.map(
        (row: Record<string, unknown>) => ({
          prophecyId: row.id as string,
          status:
            (row.accuracy_score as number) >= 0.85
              ? ("correct" as const)
              : (row.accuracy_score as number) >= 0.35
                ? ("partially_correct" as const)
                : ("wrong" as const),
          accuracyScore: Number(row.accuracy_score) || 0,
        }),
      );

      const stats = calculateAccuracy(verifications);

      // カテゴリ別精度を計算
      const categoryStats: Record<string, { total: number; score: number }> = {};
      for (const row of allVerified) {
        const cat = row.prediction_category as string;
        if (!categoryStats[cat]) categoryStats[cat] = { total: 0, score: 0 };
        categoryStats[cat].total++;
        categoryStats[cat].score += Number(row.accuracy_score) || 0;
      }
      const categoryAccuracy: Record<string, number> = {};
      for (const [cat, data] of Object.entries(categoryStats)) {
        categoryAccuracy[cat] = data.total > 0 ? Math.round((data.score / data.total) * 100) / 100 : 0;
      }

      // Save milestones alongside category_accuracy
      const milestoneIds = detailedStats.milestones.map((m) => m.id);

      const { error: accuracyError } = await supabase
        .from("stargazer_prediction_accuracy")
        .upsert({
          user_id: userId,
          total_predictions: stats.totalPredictions,
          verified_count: allVerified.length,
          accuracy_rate: stats.accuracyPercentage / 100,
          current_streak: detailedStats.streak,
          best_streak: detailedStats.bestStreak,
          category_accuracy: { ...categoryAccuracy, milestones: milestoneIds },
          updated_at: new Date().toISOString(),
        });

      if (accuracyError) {
        console.error("Failed to upsert prediction accuracy:", accuracyError);
      }
    }

    return NextResponse.json({
      ok: true,
      accuracyScore,
      verificationLevel,
      verificationAnswer: safeAnswer,
      detailedStats,
      newMilestones,
    });
  } catch (error) {
    console.error("Failed to verify prophecy:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
