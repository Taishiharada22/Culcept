import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { trackCronRun } from "@/lib/ceo/withSkillTelemetry";
import { generateDailyProphecy } from "@/lib/stargazer/dailyProphecy";
import { notifyDailyProphecy } from "@/lib/push/sendPushNotification";
import { generateAIPrediction, type AIPredictionParams } from "@/lib/stargazer/aiPredictionEngine";
import { generatePatternPredictions, shouldPreferPatternPrediction } from "@/lib/stargazer/patternPredictions";
import { fetchPatternsForUser } from "@/lib/stargazer/ahaEngine";
import {
  sendProphecyNotification,
  sendStreakMilestoneNotification,
} from "@/lib/stargazer/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH_LIMIT = 100;

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type EngineUsed = "pattern" | "ai" | "template";

/**
 * Morning Prophecy Generation (AI-enhanced)
 * Runs daily at 6:00 AM JST (21:00 UTC previous day)
 *
 * 優先順位:
 * 1. patternPredictions (データ駆動) — 検出済みパターンがあれば最優先
 * 2. aiPredictionEngine (AI生成) — パターンがなければ AI で予測
 * 3. dailyProphecy (テンプレート) — フォールバック
 */
export async function GET(request: Request) {
  const t = await trackCronRun("stargazer-prophecy");

  // Auth: verify CRON_SECRET
  if (
    request.headers.get("authorization") !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    await t.finish({ ok: false, summary: "unauthorized" });
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const details: string[] = [];
  let processed = 0;
  let errors = 0;
  const engineStats: Record<EngineUsed, number> = { pattern: 0, ai: 0, template: 0 };

  try {
    const today = toISODate(new Date());
    const sevenDaysAgo = toISODate(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    );

    // 1. Get active Stargazer users (had observation in last 7 days)
    const { data: activeUsers, error: usersError } = await supabase
      .from("stargazer_profiles")
      .select("user_id")
      .gte("last_observation_at", sevenDaysAgo)
      .limit(BATCH_LIMIT);

    if (usersError) {
      // Fallback: query observations table directly
      console.warn(
        "[stargazer-prophecy] stargazer_profiles query failed, falling back to observations:",
        usersError.message,
      );
      const { data: obsUsers, error: obsError } = await supabase
        .from("stargazer_observations")
        .select("user_id")
        .gte("created_at", sevenDaysAgo)
        .limit(BATCH_LIMIT * 5);

      if (obsError) {
        details.push(`Failed to fetch active users: ${obsError.message}`);
        return NextResponse.json({ processed: 0, errors: 1, details });
      }

      var userIds = Array.from(
        new Set((obsUsers ?? []).map((r) => r.user_id as string)),
      ).slice(0, BATCH_LIMIT);
    } else {
      var userIds = Array.from(
        new Set((activeUsers ?? []).map((r) => r.user_id as string)),
      );
    }

    details.push(`Found ${userIds.length} active users`);

    for (const userId of userIds) {
      try {
        // 2a. Check if prophecy already exists for today
        const { data: existing } = await supabase
          .from("stargazer_daily_prophecies")
          .select("id")
          .eq("user_id", userId)
          .eq("prophecy_date", today)
          .limit(1)
          .maybeSingle();

        if (existing) {
          details.push(`User ${userId.slice(0, 8)}... skipped (already exists)`);
          continue;
        }

        // 2b. Fetch user's core star profile
        const { data: coreStar } = await supabase
          .from("stargazer_core_star")
          .select("archetype_code, axis_scores, observation_depth")
          .eq("user_id", userId)
          .maybeSingle();

        if (!coreStar?.archetype_code || !coreStar?.axis_scores) {
          details.push(`User ${userId.slice(0, 8)}... skipped (no core star)`);
          continue;
        }

        const axisScores = coreStar.axis_scores as Record<string, number>;
        const dayOfWeek = new Date().getDay();
        const observationDepth = coreStar.observation_depth ?? 0.3;
        const observationCount = Math.max(1, Math.round(observationDepth * 50));

        let predictionText: string;
        let category: string;
        let confidence: number;
        let basis: string;
        let verificationPrompt: string;
        let alternativeOutcome: string | null = null;
        let scenarioId: string | null = null;
        let engineUsed: EngineUsed = "template";
        let aiGenerated = false;

        // ── 優先度1: パターン駆動予測 ──
        try {
          const detectedPatterns = await fetchPatternsForUser(supabase, userId);
          if (detectedPatterns.length > 0) {
            const patternPredictions = generatePatternPredictions(detectedPatterns, 1);
            if (patternPredictions.length > 0) {
              const pp = patternPredictions[0];
              // パターン予測が十分に信頼できるか確認
              if (shouldPreferPatternPrediction(pp.confidence, 0.3, detectedPatterns.length)) {
                predictionText = pp.prediction;
                category = pp.category;
                confidence = pp.confidence;
                basis = pp.evidence.join("; ");
                verificationPrompt = pp.testableAction;
                alternativeOutcome = pp.alternativeOutcome;
                engineUsed = "pattern";
                aiGenerated = false; // パターン駆動はデータ由来
                console.info(
                  `[stargazer-prophecy] User ${userId.slice(0, 8)}... パターン予測を使用 (category=${category}, confidence=${confidence})`,
                );
              }
            }
          }
        } catch (patternErr) {
          console.warn(
            `[stargazer-prophecy] User ${userId.slice(0, 8)}... パターン予測失敗、次のエンジンへ:`,
            patternErr instanceof Error ? patternErr.message : patternErr,
          );
        }

        // ── 優先度2: AI 予測エンジン ──
        if (engineUsed === "template") {
          try {
            const aiParams: AIPredictionParams = {
              userId,
              axisScores,
              observationCount,
              dayOfWeek,
              currentHour: new Date().getHours(),
              contradictions: [], // cron ではリアルタイム矛盾検出を省略
              detectedPatterns: [],
              axisTrends: [],
              accuracyByCategory: {},
            };

            // 予測精度データの取得 — 学習ループの反映
            try {
              const { data: accuracyRow } = await supabase
                .from("stargazer_prediction_accuracy")
                .select("category_accuracy")
                .eq("user_id", userId)
                .maybeSingle();
              if (accuracyRow?.category_accuracy && typeof accuracyRow.category_accuracy === "object") {
                const catAcc = accuracyRow.category_accuracy as Record<string, { correct?: number; wrong?: number; total?: number; accuracy?: number }>;
                const accMap: Record<string, { correct: number; wrong: number; total: number }> = {};
                for (const [cat, val] of Object.entries(catAcc)) {
                  if (typeof val === "number") {
                    accMap[cat] = { correct: 0, wrong: 0, total: 0 };
                  } else {
                    accMap[cat] = {
                      correct: val?.correct ?? 0,
                      wrong: val?.wrong ?? 0,
                      total: val?.total ?? 0,
                    };
                  }
                }
                aiParams.accuracyByCategory = accMap;
              }
            } catch {
              // silent — fallback to empty
            }

            // 矛盾データの取得を試みる (失敗しても続行)
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

            const aiResult = await generateAIPrediction(aiParams);
            if ("aiGenerated" in aiResult && aiResult.aiGenerated) {
              predictionText = aiResult.prediction;
              category = aiResult.category;
              confidence = aiResult.confidence;
              basis = aiResult.basedOn;
              verificationPrompt = aiResult.triggerScenario;
              alternativeOutcome = aiResult.alternativeOutcome;
              engineUsed = "ai";
              aiGenerated = true;
              console.info(
                `[stargazer-prophecy] User ${userId.slice(0, 8)}... AI予測を使用 (category=${category}, confidence=${confidence})`,
              );
            }
          } catch (aiErr) {
            console.warn(
              `[stargazer-prophecy] User ${userId.slice(0, 8)}... AI予測失敗、テンプレートへフォールバック:`,
              aiErr instanceof Error ? aiErr.message : aiErr,
            );
          }
        }

        // ── 優先度3: テンプレートフォールバック ──
        if (engineUsed === "template") {
          const prophecy = generateDailyProphecy({
            userId,
            archetypeCode: coreStar.archetype_code,
            axisScores,
            dayOfWeek,
            observationDepth,
            targetDate: today,
          });
          predictionText = prophecy.prediction;
          category = prophecy.category;
          confidence = prophecy.confidence;
          basis = typeof prophecy.basis === "string" ? prophecy.basis : JSON.stringify(prophecy.basis);
          verificationPrompt = prophecy.verificationPrompt;
          alternativeOutcome = prophecy.alternativeOutcome ?? null;
          scenarioId = prophecy.scenarioId ?? null;
          console.info(
            `[stargazer-prophecy] User ${userId.slice(0, 8)}... テンプレート予測を使用 (category=${category})`,
          );
        }

        // 2d. Save to stargazer_daily_prophecies
        const { error: insertError } = await supabase
          .from("stargazer_daily_prophecies")
          .insert({
            user_id: userId,
            prophecy_date: today,
            prediction: predictionText!,
            category: category!,
            confidence: confidence!,
            basis: basis!,
            verification_prompt: verificationPrompt!,
            alternative_outcome: alternativeOutcome,
            scenario_id: scenarioId,
            verification_status: "pending",
            created_at: new Date().toISOString(),
            // AI 生成トラッキング用のメタデータ
            ...(aiGenerated || engineUsed === "pattern"
              ? { metadata: JSON.stringify({ engine: engineUsed, aiGenerated }) }
              : {}),
          });

        if (insertError) {
          console.error(
            `[stargazer-prophecy] Insert failed for user ${userId}:`,
            insertError,
          );
          details.push(
            `User ${userId.slice(0, 8)}... insert failed: ${insertError.message}`,
          );
          errors++;
        } else {
          processed++;
          engineStats[engineUsed]++;
          details.push(`User ${userId.slice(0, 8)}... prophecy generated (engine=${engineUsed})`);
          // Send push notification (fire and forget) — dual channel for preference-aware delivery
          notifyDailyProphecy(userId, predictionText!).catch(() => {});
          sendProphecyNotification(userId, predictionText!).catch(() => {});
          // Streak milestone check (fire and forget)
          const observationDepthNum = coreStar.observation_depth ?? 0;
          const streakEstimate = Math.round(observationDepthNum * 100);
          if ([7, 14, 30, 60, 100].includes(streakEstimate)) {
            sendStreakMilestoneNotification(userId, streakEstimate).catch(() => {});
          }
        }
      } catch (err) {
        console.error(`[stargazer-prophecy] Error for user ${userId}:`, err);
        details.push(
          `User ${userId.slice(0, 8)}... error: ${err instanceof Error ? err.message : "unknown"}`,
        );
        errors++;
      }
    }

    console.log(
      `[stargazer-prophecy] Done: processed=${processed}, errors=${errors}, engines=${JSON.stringify(engineStats)}`,
    );

    await t.finish({ ok: errors === 0, summary: `processed=${processed}, errors=${errors}` });
    return NextResponse.json({ processed, errors, engineStats, details });
  } catch (error) {
    console.error("[stargazer-prophecy] Cron error:", error);
    details.push(
      `Fatal error: ${error instanceof Error ? error.message : "unknown"}`,
    );
    await t.finish({ ok: false, summary: error instanceof Error ? error.message : "fatal" });
    return NextResponse.json(
      { processed, errors: errors + 1, details },
      { status: 500 },
    );
  }
}
