import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { checkStargazerTier } from "@/lib/stargazer/tierGuard";
import {
  generateBlindSpotDrop,
  type BlindSpotDropInput,
} from "@/lib/stargazer/blindSpotDrop";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import {
  buildAxisScores,
  todayJST,
  calcObservationDepth,
} from "@/lib/stargazer/sharedRouteUtils";
import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "@/lib/stargazer/studentTrack";
import {
  fetchPatternsForUser,
  selectAhaInsights,
} from "@/lib/stargazer/ahaEngine";
import {
  buildInsightPreference,
  preferenceToPromptContext,
} from "@/lib/stargazer/insightPersonalizer";

export const runtime = "nodejs";

// ── GET: 今日の Blind Spot Drop を取得 ──
export async function GET() {
  try {
    const tierCheck = await checkStargazerTier("blind_spot");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId, isBetaTester } = tierCheck;

    const supabase = await supabaseServer();
    const today = todayJST();

    // 既存の今日の Drop + 軸スコア用データを並列取得
    const [
      { data: existingDrop },
      { data: profile },
      { data: resolvedTypeRow },
      { data: recentDrops },
    ] = await Promise.all([
      supabase
        .from("stargazer_blind_spot_drops")
        .select("*")
        .eq("user_id", userId)
        .eq("drop_date", today)
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
        .from("stargazer_blind_spot_drops")
        .select("category")
        .eq("user_id", userId)
        .order("drop_date", { ascending: false })
        .limit(7),
    ]);

    // 今日のデータがあればそのまま返す
    if (existingDrop && existingDrop.length > 0) {
      const row = existingDrop[0];
      return NextResponse.json({
        ok: true,
        drop: {
          id: row.id,
          date: row.drop_date,
          category: row.category,
          tone: row.tone,
          intensity: Number(row.intensity),
          title: row.title,
          content: row.content,
          evidenceHint: row.evidence_hint,
          deliveryHour: row.delivery_hour,
          reaction: row.reaction,
          reactedAt: row.reacted_at,
        },
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

    // 観測深度を統一計算
    const totalSessions = profile?.total_sessions ?? 0;
    const observationDepth = calcObservationDepth(totalSessions);

    // 直近のカテゴリ
    const recentDropCategories = (recentDrops ?? []).map(
      (d: Record<string, string>) => d.category,
    );

    // Drop を生成
    const dropInput: BlindSpotDropInput = {
      userId: userId,
      axisScores,
      observationDepth,
      totalSessions,
      archetypeCode,
      recentDropCategories: recentDropCategories as BlindSpotDropInput["recentDropCategories"],
    };
    const drop = generateBlindSpotDrop(dropInput);

    // ユーザー嗜好プロファイルを構築（失敗しても続行）
    let preferenceContext = "";
    try {
      const pref = await buildInsightPreference(userId, supabase);
      preferenceContext = preferenceToPromptContext(pref);
    } catch (prefError) {
      console.warn("[blind-spot] Preference loading failed, continuing:", prefError);
    }

    // AI でテンプレート本文を強化（失敗時はテンプレートをそのまま使用）
    try {
      const aiResult = await runAI({
        taskType: "stargazer_blind_spot_enhance",
        metadata: makeStargazerRunMetadata({ feature: "blind_spot" }),
        prompt: JSON.stringify({
          category: drop.category,
          tone: drop.tone,
          templateBody: drop.body,
          archetypeCode,
          intensity: drop.intensity,
          sourceAxes: drop.sourceAxes,
        }),
        systemPrompt: `あなたはStargazerの「見えない自分」を書くライターです。
テンプレートの内容を元に、よりパーソナルで心に刺さる文章に書き直してください。

ルール:
- トーン(${drop.tone})を厳守: warm=やさしく, harsh=鋭く, neutral=淡々と, poetic=詩的に, clinical=分析的に
- 最大150文字
- 「あなた」ではなく「きみ」を使う
- 具体的な行動パターンに言及する
- テンプレートの核心的メッセージは保持する${preferenceContext}`,
        requireJson: false,
        temperature: 0.75,
        maxOutputTokens: 200,
        userId: userId,
      });

      if (aiResult.success && aiResult.text) {
        drop.body = aiResult.text.slice(0, 200);
      }
    } catch (aiError) {
      // AI 強化失敗はログのみ。テンプレート本文で続行
      console.warn("BlindSpot AI enhancement failed, using template:", aiError);
    }

    // パターン検出による行動証拠の付与（失敗しても続行）
    let behavioralEvidence: string | null = null;
    try {
      const patterns = await fetchPatternsForUser(supabase, userId);
      if (patterns.length > 0) {
        const insights = await selectAhaInsights(patterns, "blind_spot", 1);
        if (insights.length > 0 && insights[0].confidence > 0.5) {
          behavioralEvidence = insights[0].formattedForTarget;
        }
      }
    } catch (patternError) {
      console.warn("[blind-spot] Pattern detection failed, continuing:", patternError);
    }

    // DB に保存 (UPSERT で同日重複を防止)
    const { data: upserted, error: upsertError } = await supabase
      .from("stargazer_blind_spot_drops")
      .upsert(
        {
          user_id: userId,
          drop_date: today,
          category: drop.category,
          tone: drop.tone,
          intensity: drop.intensity,
          content_title: drop.title,
          content_body: drop.body,
          content_hint: drop.unlockHint,
          delivery_hour: drop.deliveryHour,
        },
        { onConflict: "user_id,drop_date" },
      )
      .select("id")
      .single();

    if (upsertError) {
      console.error("Failed to upsert blind spot drop:", upsertError);
      // 生成結果は返す（保存失敗しても体験は提供する）
    }

    return NextResponse.json({
      ok: true,
      drop: {
        id: upserted?.id ?? drop.id,
        date: drop.date,
        category: drop.category,
        tone: drop.tone,
        intensity: drop.intensity,
        title: drop.title,
        content: drop.body,
        evidenceHint: drop.unlockHint,
        deliveryHour: drop.deliveryHour,
        reaction: null,
        reactedAt: null,
        behavioralEvidence,
      },
    });
  } catch (error) {
    console.error("Failed to get blind spot drop:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── POST: リアクションを記録 ──
export async function POST(request: NextRequest) {
  try {
    const tierCheck = await checkStargazerTier("blind_spot");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId, isBetaTester } = tierCheck;

    const supabase = await supabaseServer();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { dropId, reaction } = body as {
      dropId: string;
      reaction: string;
    };

    if (!dropId || typeof dropId !== "string") {
      return NextResponse.json({ error: "dropId が必要です" }, { status: 400 });
    }
    if (!reaction || typeof reaction !== "string") {
      return NextResponse.json({ error: "reaction が必要です" }, { status: 400 });
    }

    const validReactions = ["resonated", "surprised", "denied", "reflected"];
    if (!validReactions.includes(reaction)) {
      return NextResponse.json({ error: "不正な reaction 値です" }, { status: 400 });
    }

    // UUID 形式の簡易チェック
    if (!/^[0-9a-f-]{36}$/i.test(dropId)) {
      return NextResponse.json({ error: "不正な dropId です" }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("stargazer_blind_spot_drops")
      .update({
        reaction,
        reacted_at: new Date().toISOString(),
      })
      .eq("id", dropId)
      .eq("user_id", userId);

    if (updateError) {
      console.error("Failed to update blind spot drop reaction:", updateError);
      return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, reaction });
  } catch (error) {
    console.error("Failed to record blind spot reaction:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
