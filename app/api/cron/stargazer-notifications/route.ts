/**
 * Stargazer Push Notification Scheduler
 * Vercel Cron / 外部cronから定期実行される通知スケジューラー
 *
 * 実行タイミング:
 * - 朝の予言配信（7-9時） — パーソナライズされたコピー付き
 * - 精度低下 / ストリーク危機警告（12時）
 * - 消えるインサイト配信（毎回チェック）
 */

import { NextResponse } from "next/server";
import { trackCronRun } from "@/lib/ceo/withSkillTelemetry";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  notifyMorningQuestion,
  notifyAccuracyDecay,
  notifyVanishingInsight,
  sendPushToUser,
} from "@/lib/push/sendPushNotification";
import {
  generateNotificationCopy,
  type NotificationUserContext,
} from "@/lib/stargazer/notificationCopyEngine";
import { FEATURE_GATES } from "@/lib/stargazer/featureUnlock";

export const dynamic = "force-dynamic";

// ── Helper: ユーザーコンテキストを構築して通知コピーを生成 ──
async function buildMorningProphecyContext(
  userId: string,
  todayStr: string,
): Promise<NotificationUserContext> {
  const ctx: NotificationUserContext = { userId };

  try {
    // 今日の予言を取得
    const { data: todayProphecy } = await supabaseAdmin
      .from("stargazer_predictions")
      .select("prediction_text, axis_name, based_on")
      .eq("user_id", userId)
      .eq("prediction_date", todayStr)
      .maybeSingle();

    if (todayProphecy) {
      ctx.todayProphecy = todayProphecy.prediction_text;
      ctx.prophecyAxisName = todayProphecy.axis_name;
    }

    // 昨日の予言と検証結果を取得
    const yesterday = new Date(todayStr);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const { data: yesterdayProphecy } = await supabaseAdmin
      .from("stargazer_predictions")
      .select("prediction_text, verified")
      .eq("user_id", userId)
      .eq("prediction_date", yesterdayStr)
      .maybeSingle();

    if (yesterdayProphecy) {
      ctx.yesterdayProphecy = yesterdayProphecy.prediction_text;
      ctx.yesterdayProphecyVerified = yesterdayProphecy.verified;
    }
  } catch (err) {
    console.warn("[stargazer-notifications] prophecy context error:", err);
  }

  return ctx;
}

async function buildStreakUrgencyForUser(
  userId: string,
  todayStr: string,
): Promise<{ isAtRisk: boolean; streakDays: number; message: string } | null> {
  try {
    // サーバーサイドでストリーク状態をDB から推定
    // 直近の連続観測日数を計算
    const { data: recentStates } = await supabaseAdmin
      .from("stargazer_daily_states")
      .select("observation_date")
      .eq("user_id", userId)
      .order("observation_date", { ascending: false })
      .limit(60);

    if (!recentStates || recentStates.length === 0) return null;

    // 今日観測済みなら危機なし
    if (recentStates.some((s) => s.observation_date === todayStr)) {
      return null;
    }

    // 連続日数を計算（昨日からの逆算）
    let streakDays = 0;
    const dates = recentStates.map((s) => s.observation_date).sort().reverse();
    const yesterday = new Date(todayStr);
    yesterday.setDate(yesterday.getDate() - 1);

    let checkDate = yesterday;
    for (let i = 0; i < dates.length; i++) {
      const checkStr = checkDate.toISOString().split("T")[0];
      if (dates.includes(checkStr)) {
        streakDays++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    if (streakDays < 2) return null; // 短いストリークは通知不要

    // 現在時刻から残り時間を計算
    const now = new Date();
    const endOfDay = new Date(todayStr + "T23:59:59.999Z");
    const hoursRemaining = Math.max(
      0,
      (endOfDay.getTime() - now.getTime()) / (60 * 60 * 1000),
    );

    return {
      isAtRisk: hoursRemaining < 6,
      streakDays,
      message:
        hoursRemaining < 3
          ? `${streakDays}日連続の観測があと${Math.round(hoursRemaining)}時間で途切れます`
          : `今日の観測がまだです（${streakDays}日連続中）`,
    };
  } catch (err) {
    console.warn("[stargazer-notifications] streak urgency error:", err);
    return null;
  }
}

export async function GET(req: Request) {
  const t = await trackCronRun("stargazer-notifications");

  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    await t.finish({ ok: false, summary: "unauthorized" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const todayStr = now.toISOString().slice(0, 10);
  const results = { morning: 0, decay: 0, vanishing: 0, streak: 0, circadian: 0, eveningReminder: 0, featureUnlock: 0, errors: 0 };

  // ── Circadian Engagement: 概日リズム最適化された通知タイプを判定 ──
  // 朝=anticipation(予言), 昼=micro_pulse(マイクロ観測),
  // 夕方=reflection(内省), 夜=loss_aversion(消える洞察+ストリーク危機)
  // import は遅延ロード（エッジケースでのcron失敗を防ぐ）
  let circadianPhase: string = "idle";
  try {
    const { classifyTimeOfDay, getCircadianPhase } = await import("@/lib/stargazer/circadianEngagement");
    const timeOfDay = classifyTimeOfDay(hour);
    circadianPhase = getCircadianPhase(timeOfDay);
  } catch { /* fallback: use existing hour-based branching */ }

  // ── 1. 朝の予言リマインダー (Circadian: anticipation phase) ──
  // circadianPhase が "anticipation" の場合、または従来の時間帯フォールバック
  if (circadianPhase === "anticipation" || (circadianPhase === "idle" && hour >= 7 && hour <= 9)) {
    try {
      // Stargazer プロフィールを持ち、今日まだ観測していないユーザーを取得
      const { data: eligibleUsers } = await supabaseAdmin
        .from("stargazer_profiles")
        .select("user_id")
        .not("user_id", "is", null);

      if (eligibleUsers && eligibleUsers.length > 0) {
        // 今日すでに観測済みのユーザーを除外
        const { data: answeredToday } = await supabaseAdmin
          .from("stargazer_observations")
          .select("user_id")
          .gte("created_at", `${todayStr}T00:00:00Z`);

        const answeredIds = new Set(
          (answeredToday ?? []).map((r: { user_id: string }) => r.user_id),
        );

        // 通知プリファレンスで朝の通知を許可しているユーザーのみ
        const { data: prefs } = await supabaseAdmin
          .from("stargazer_notification_prefs")
          .select("user_id, morning_question")
          .eq("morning_question", true);

        const allowedIds = new Set(
          (prefs ?? []).map((p: { user_id: string }) => p.user_id),
        );

        // フォールバック用: 汎用の朝の質問
        const morningQuestions = [
          "今日、一番最初に頭に浮かんだことは何ですか？",
          "昨日のあなたと今日のあなた、何が違うと思いますか？",
          "今日、直感で選びたいことは何ですか？",
          "最近、自分でも意外だった選択はありますか？",
          "今、心の中にある小さな引っかかりは何ですか？",
          "今日一日で一つだけ達成するなら何を選びますか？",
          "最近、誰かの一言で印象に残ったものはありますか？",
        ];
        const questionIndex = Math.floor(
          (new Date(todayStr).getTime() / 86400000) % morningQuestions.length,
        );
        const fallbackQuestion = morningQuestions[questionIndex];

        for (const user of eligibleUsers) {
          if (answeredIds.has(user.user_id)) continue;
          if (prefs && prefs.length > 0 && !allowedIds.has(user.user_id)) continue;

          try {
            // パーソナライズされた通知コピーを生成
            const userContext = await buildMorningProphecyContext(
              user.user_id,
              todayStr,
            );

            if (userContext.todayProphecy || userContext.prophecyAxisName) {
              // 予言データがある場合: パーソナライズコピーを使用
              const copy = await generateNotificationCopy(
                "morning_prophecy",
                userContext,
              );
              await sendPushToUser(user.user_id, {
                title: copy.title,
                body: copy.body,
                url: copy.url,
                tag: copy.tag,
              });
            } else {
              // 予言データなし: 汎用の朝の質問にフォールバック
              await notifyMorningQuestion(user.user_id, fallbackQuestion);
            }
            results.morning++;
          } catch {
            results.errors++;
          }
        }
      }
    } catch (err) {
      console.error("[stargazer-notifications] morning question error:", err);
      results.errors++;
    }
  }

  // ── 2. 精度低下警告 + ストリーク危機通知 (12時) ──
  // ── 2. 精度低下警告 + ストリーク危機 (Circadian: micro_pulse / reflection / loss_aversion) ──
  if (circadianPhase === "micro_pulse" || circadianPhase === "reflection" || circadianPhase === "loss_aversion" || (circadianPhase === "idle" && hour === 12)) {
    try {
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
        .toISOString();

      // 3日以上観測がないユーザーを検出
      const { data: activeUsers } = await supabaseAdmin
        .from("stargazer_profiles")
        .select("user_id, understanding_level")
        .not("user_id", "is", null);

      if (activeUsers && activeUsers.length > 0) {
        // 直近3日に観測があるユーザーを取得
        const { data: recentObservers } = await supabaseAdmin
          .from("stargazer_observations")
          .select("user_id")
          .gte("created_at", threeDaysAgo);

        const recentIds = new Set(
          (recentObservers ?? []).map((r: { user_id: string }) => r.user_id),
        );

        // プリファレンスチェック
        const { data: prefs } = await supabaseAdmin
          .from("stargazer_notification_prefs")
          .select("user_id, accuracy_decay")
          .eq("accuracy_decay", true);

        const allowedIds = new Set(
          (prefs ?? []).map((p: { user_id: string }) => p.user_id),
        );

        for (const user of activeUsers) {
          if (prefs && prefs.length > 0 && !allowedIds.has(user.user_id)) continue;

          if (!recentIds.has(user.user_id)) {
            // 3日以上未観測 → 精度低下警告
            const currentLevel = user.understanding_level ?? 50;
            const percentageLost = 5;

            try {
              await notifyAccuracyDecay(
                user.user_id,
                percentageLost,
                Math.max(0, currentLevel - percentageLost),
              );
              results.decay++;
            } catch {
              results.errors++;
            }
          } else {
            // 最近の観測あり → ストリーク危機チェック
            try {
              const urgency = await buildStreakUrgencyForUser(
                user.user_id,
                todayStr,
              );
              if (urgency && urgency.isAtRisk) {
                await sendPushToUser(user.user_id, {
                  title: "観測ストリークが途切れそうです",
                  body: urgency.message,
                  url: "/stargazer",
                  tag: "stargazer-streak-urgency",
                });
                results.streak++;
              }
            } catch {
              results.errors++;
            }
          }
        }
      }
    } catch (err) {
      console.error("[stargazer-notifications] accuracy decay error:", err);
      results.errors++;
    }
  }

  // ── 3. 消えるインサイト配信（毎回チェック） ──
  try {
    const { data: pendingInsights } = await supabaseAdmin
      .from("stargazer_insights")
      .select("id, user_id, preview, expires_at, depth")
      .eq("notified", false)
      .gt("expires_at", now.toISOString())
      .limit(50);

    if (pendingInsights && pendingInsights.length > 0) {
      for (const insight of pendingInsights) {
        const expiresAt = new Date(insight.expires_at);
        const hoursLeft = Math.max(
          1,
          Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)),
        );

        try {
          // パーソナライズコピーを生成
          const userContext: NotificationUserContext = {
            userId: insight.user_id,
            insightPreview: insight.preview,
            insightDepth: insight.depth ?? null,
            insightRemainingHours: hoursLeft,
          };
          const copy = await generateNotificationCopy(
            "vanishing_insight",
            userContext,
          );

          await sendPushToUser(insight.user_id, {
            title: copy.title,
            body: copy.body,
            url: copy.url,
            tag: copy.tag,
          });

          // 通知済みフラグを更新
          await supabaseAdmin
            .from("stargazer_insights")
            .update({ notified: true })
            .eq("id", insight.id);

          results.vanishing++;
        } catch {
          // フォールバック: 既存の汎用通知
          try {
            await notifyVanishingInsight(
              insight.user_id,
              insight.preview,
              hoursLeft,
            );
            await supabaseAdmin
              .from("stargazer_insights")
              .update({ notified: true })
              .eq("id", insight.id);
            results.vanishing++;
          } catch {
            results.errors++;
          }
        }
      }
    }
  } catch (err) {
    console.error("[stargazer-notifications] vanishing insight error:", err);
    results.errors++;
  }

  // ── 4. 夕方のストリーク危機通知 (18-19時) ──
  if (hour >= 18 && hour <= 19) {
    try {
      const { data: activeUsers } = await supabaseAdmin
        .from("stargazer_profiles")
        .select("user_id")
        .not("user_id", "is", null);

      if (activeUsers) {
        for (const user of activeUsers) {
          try {
            const urgency = await buildStreakUrgencyForUser(
              user.user_id,
              todayStr,
            );
            if (urgency && urgency.isAtRisk) {
              await sendPushToUser(user.user_id, {
                title: "ストリークがあと数時間で途切れます",
                body: urgency.message,
                url: "/stargazer",
                tag: "stargazer-streak-urgency-evening",
              });
              results.streak++;
            }
          } catch {
            results.errors++;
          }
        }
      }
    } catch (err) {
      console.error("[stargazer-notifications] evening streak error:", err);
      results.errors++;
    }
  }

  // ── 5. 予言的中通知 (Circadian: reflection phase, 17-21時) ──
  // 朝の予言が当たったかもしれないタイミングで検証を促す
  if (circadianPhase === "reflection" || (hour >= 17 && hour <= 20)) {
    try {
      // 今日の予言があり、まだ検証されていないユーザーを取得
      const { data: unverifiedProphecies } = await supabaseAdmin
        .from("stargazer_predictions")
        .select("user_id, prediction_text")
        .eq("prediction_date", todayStr)
        .is("verified", null)
        .limit(50);

      if (unverifiedProphecies && unverifiedProphecies.length > 0) {
        for (const prophecy of unverifiedProphecies) {
          try {
            await sendPushToUser(prophecy.user_id, {
              title: "今朝の予言、当たりましたか？",
              body: "検証することで、予測精度が上がります",
              url: "/stargazer/prophecy?verify=today",
              tag: "stargazer-prophecy-verify",
            });
            results.circadian++;
          } catch {
            results.errors++;
          }
        }
      }
    } catch (err) {
      console.error("[stargazer-notifications] prophecy verify error:", err);
      results.errors++;
    }
  }

  // ── 6. 夕方の未観測リマインダー (18時) ──
  // ストリーク危機とは別に、今日まだ観測していないユーザーにリマインド
  if (hour === 18) {
    try {
      const { data: allUsers } = await supabaseAdmin
        .from("stargazer_profiles")
        .select("user_id")
        .not("user_id", "is", null);

      if (allUsers && allUsers.length > 0) {
        const { data: answeredToday } = await supabaseAdmin
          .from("stargazer_observations")
          .select("user_id")
          .gte("created_at", `${todayStr}T00:00:00Z`);

        const answeredIds = new Set(
          (answeredToday ?? []).map((r: { user_id: string }) => r.user_id),
        );

        for (const user of allUsers) {
          if (answeredIds.has(user.user_id)) continue;
          try {
            await sendPushToUser(user.user_id, {
              title: "今日の観測がまだです",
              body: "1分の観測が、あなたの理解を深めます",
              url: "/stargazer",
              tag: "stargazer-evening-reminder",
            });
            results.eveningReminder++;
          } catch {
            results.errors++;
          }
        }
      }
    } catch (err) {
      console.error("[stargazer-notifications] evening reminder error:", err);
      results.errors++;
    }
  }

  // ── 7. 新機能アンロック通知 ──
  // 直近の観測で新機能がアンロックされたユーザーに通知
  try {
    const { data: allUsers } = await supabaseAdmin
      .from("stargazer_profiles")
      .select("user_id")
      .not("user_id", "is", null);

    if (allUsers && allUsers.length > 0) {
      // 各ユーザーの総観測数を取得
      for (const user of allUsers) {
        try {
          const { count } = await supabaseAdmin
            .from("stargazer_observations")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.user_id);

          const total = count ?? 0;
          if (total <= 0) continue;

          // FEATURE_GATES のしきい値と照合
          // 今日の観測でちょうどしきい値を超えた機能があるかチェック
          const { count: todayCount } = await supabaseAdmin
            .from("stargazer_observations")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.user_id)
            .gte("created_at", `${todayStr}T00:00:00Z`);

          const todayN = todayCount ?? 0;
          if (todayN <= 0) continue;

          const previousTotal = total - todayN;

          // 今日のセッションで新たにアンロックされた機能を検出
          const newlyUnlocked = FEATURE_GATES.filter(
            (gate) =>
              gate.requiredObservations > 0 &&
              previousTotal < gate.requiredObservations &&
              total >= gate.requiredObservations,
          );

          for (const gate of newlyUnlocked) {
            await sendPushToUser(user.user_id, {
              title: "新機能が解放されました",
              body: `${gate.icon} ${gate.label}: ${gate.description}`,
              url: "/stargazer",
              tag: `stargazer-unlock-${gate.feature}`,
            });
            results.featureUnlock++;
          }
        } catch {
          results.errors++;
        }
      }
    }
  } catch (err) {
    console.error("[stargazer-notifications] feature unlock error:", err);
    results.errors++;
  }

  await t.finish({ ok: results.errors === 0, summary: `morning=${results.morning}, errors=${results.errors}` });
  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    circadianPhase,
    results,
  });
}
