import "server-only";

import { runAI } from "@/lib/ai";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserTendencies } from "./tendencyTracker";
import { detectTemperatureGap } from "../temperatureGapDetector";
import { detectSafetyTopics } from "./safetyLayer";
import { collectCounselorAssets, formatAssetContextForPrompt } from "./assetCollector";

// ============================================================
// Weekly Briefing Generator
//
// Counselor（専属カウンセラー）が毎週生成する「今週の見立て」。
//
// Alter とのトーン差別化:
//   Alter  = 「あなたはこう感じてる」内省的・詩的・寄り添い
//   Counselor = 「私はこう見ています」構造的・専門的・簡潔・的確
//
// 生成タイミング:
//   - 初回アクセス時
//   - 前回生成から7日以上経過している場合
//   - ユーザーが「更新」ボタンを押した場合
// ============================================================

export type WeeklyBriefing = {
  /** Counselorからの今週のメッセージ（専門的・簡潔） */
  counselorMessage: string;
  /** 今週のテーマ（一言） */
  weeklyTheme: string;
  /** 構造的観察（2-3点） */
  observations: string[];
  /** 今週の推奨アクション（1つ、具体的） */
  recommendedAction: string;
  /** アクティブな接続数 */
  activeConnectionCount: number;
  /** 成長スコア（0-100） */
  growthScore: number;
  /** 最も顕著なパターン（なければnull） */
  topPattern: string | null;
  /** 生成日時 */
  generatedAt: string;
};

// state カラムを session_type 代わりに使う（DBスキーマ変更不要）
const WEEKLY_BRIEFING_STATE = "weekly_briefing_v1";
const CACHE_TTL_DAYS = 7;

// ── 公開API ──

/**
 * ユーザーの Weekly Briefing を取得（キャッシュあり）
 *
 * 有効なキャッシュがあればそれを返す。
 * なければ新規生成してDBに保存する。
 */
export async function getOrGenerateWeeklyBriefing(
  userId: string,
  forceRegenerate = false,
): Promise<WeeklyBriefing> {
  const supabase = await supabaseServer();

  if (!forceRegenerate) {
    const cached = await loadCachedBriefing(supabase, userId);
    if (cached) return cached;
  }

  const briefing = await generateWeeklyBriefing(userId);
  await saveBriefing(supabase, userId, briefing);
  return briefing;
}

// ── 内部実装 ──

async function loadCachedBriefing(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
): Promise<WeeklyBriefing | null> {
  const cutoff = new Date(
    Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // state カラムを session_type 代わりに使う（DBスキーマ変更不要）
  const { data } = await supabase
    .from("rendezvous_counselor_sessions")
    .select("session_data, created_at")
    .eq("user_id", userId)
    .eq("state", WEEKLY_BRIEFING_STATE)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const raw = data.session_data as Record<string, unknown>;
  return raw as unknown as WeeklyBriefing;
}

async function saveBriefing(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
  briefing: WeeklyBriefing,
): Promise<void> {
  await supabase.from("rendezvous_counselor_sessions").insert({
    user_id: userId,
    state: WEEKLY_BRIEFING_STATE,
    session_data: briefing as unknown as Record<string, unknown>,
    disconnect_analysis_id: null,
  });
}

async function generateWeeklyBriefing(userId: string): Promise<WeeklyBriefing> {
  const supabase = await supabaseServer();
  const now = new Date().toISOString();

  // 1. アクティブ接続数を取得（Partner枠）
  const { count: activeCount } = await supabase
    .from("rendezvous_candidates")
    .select("id", { count: "exact", head: true })
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .eq("category", "partner")
    .in("state", ["chat_opened", "mutual_liked", "active"]);

  const activeConnectionCount = activeCount ?? 0;

  // 2. 傾向パターンを取得
  const tendencies = await getUserTendencies(userId);
  const topPatternRow = tendencies[0] ?? null;
  const topPattern = topPatternRow
    ? ((topPatternRow.pattern_data as Record<string, unknown>)?.tendency as string) ??
      topPatternRow.pattern_key
    : null;

  // 2.5. Stargazer プロフィール統合 — 性格軸スコアをCounselor文脈に注入
  let stargazerContext: string | null = null;
  try {
    const { data: sgProfile } = await supabase
      .from("stargazer_profiles")
      .select("resolved_type, axis_scores")
      .eq("user_id", userId)
      .maybeSingle();
    if (sgProfile?.resolved_type) {
      const axes = sgProfile.axis_scores as Record<string, number> | null;
      const topAxes = axes
        ? Object.entries(axes)
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
            .slice(0, 3)
            .map(([key, val]) => `${key}: ${val > 0 ? "高い" : "低い"}`)
            .join("、")
        : null;
      stargazerContext = `タイプ: ${sgProfile.resolved_type}` +
        (topAxes ? `（特徴的な軸: ${topAxes}）` : "");
    }
  } catch {
    // fail-open
  }

  // 3. ポストレビューから感情傾向を把握
  const { data: recentReviews } = await supabase
    .from("rendezvous_post_reviews")
    .select("feeling, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  const positiveReviewCount = (recentReviews ?? []).filter(
    (r) => r.feeling === "great" || r.feeling === "good",
  ).length;
  const totalReviews = (recentReviews ?? []).length;

  // 3.5. 双方温度差検出 + Safety Layer（アクティブな接続がある場合）
  let temperatureGapNote: string | null = null;
  let safetyAlert: string | null = null;
  try {
    const { data: activeCandidates } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .in("state", ["chat_opened", "mutual_liked"]);

    for (const cand of (activeCandidates ?? [])) {
      // 温度差検出
      const gapResult = await detectTemperatureGap({
        candidateId: cand.id,
        userAId: cand.user_a,
        userBId: cand.user_b,
      });
      if (gapResult.gapDetected && gapResult.severity !== "mild") {
        const advice = cand.user_a === userId
          ? (gapResult.delta > 0 ? gapResult.adviceForWarmerSide : gapResult.adviceForCoolerSide)
          : (gapResult.delta > 0 ? gapResult.adviceForCoolerSide : gapResult.adviceForWarmerSide);
        temperatureGapNote = gapResult.counselorNote + (advice ? `\n${advice}` : "");
        break; // 最初に見つかった温度差のみ（briefingが長くなりすぎない）
      }

      // Safety Layer: 直近メッセージに高リスク話題がないか
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentMsgs } = await supabaseAdmin
        .from("rendezvous_messages")
        .select("body")
        .eq("candidate_id", cand.id)
        .gte("created_at", sevenDaysAgo)
        .limit(30);
      const bodies = (recentMsgs ?? []).map((m) => m.body ?? "").filter(Boolean);
      if (bodies.length > 0) {
        const safety = detectSafetyTopics(bodies.join(" "));
        if (safety.detected && safety.safetyNote) {
          safetyAlert = safety.safetyNote;
        }
      }
    }
  } catch {
    // fail-open: 温度差検出/Safety検出失敗時はスキップ
  }

  // 3.6. 感情共鳴 + テンション応答パターン（既存資産統合）
  let assetContext: string | null = null;
  try {
    const { data: activeCandidatesForAssets } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .in("state", ["chat_opened", "mutual_liked"])
      .limit(3); // 最もアクティブな3ペアまで

    for (const cand of (activeCandidatesForAssets ?? [])) {
      const assets = await collectCounselorAssets({
        candidateId: cand.id,
        userId,
      });
      const formatted = formatAssetContextForPrompt(assets);
      if (formatted) {
        assetContext = (assetContext ? assetContext + "\n\n" : "") + formatted;
        break; // briefingが長くなりすぎないため、最初の有意な結果のみ
      }
    }
  } catch {
    // fail-open
  }

  // 4. 成長スコアを簡易計算
  const growthScore = calculateLightGrowthScore(
    tendencies.length,
    tendencies.filter((t) => t.improving).length,
    totalReviews,
    positiveReviewCount,
  );

  // 5. AI で Counselor メッセージを生成
  const aiResult = await generateCounselorMessage({
    userId,
    activeConnectionCount,
    topPattern,
    tendencyCount: tendencies.length,
    improvingCount: tendencies.filter((t) => t.improving).length,
    positiveRatio: totalReviews > 0 ? positiveReviewCount / totalReviews : null,
    growthScore,
    temperatureGapNote,
    safetyAlert,
    stargazerContext,
    assetContext,
  });

  return {
    counselorMessage: aiResult.counselorMessage,
    weeklyTheme: aiResult.weeklyTheme,
    observations: aiResult.observations,
    recommendedAction: aiResult.recommendedAction,
    activeConnectionCount,
    growthScore,
    topPattern,
    generatedAt: now,
  };
}

function calculateLightGrowthScore(
  totalPatterns: number,
  improvingPatterns: number,
  totalReviews: number,
  positiveReviews: number,
): number {
  let score = 50;
  if (totalPatterns > 0) {
    score += Math.round((improvingPatterns / totalPatterns) * 20);
  }
  if (totalReviews > 0) {
    score += Math.round((positiveReviews / totalReviews) * 20);
  }
  if (totalReviews >= 3) score += 5;
  return Math.max(10, Math.min(100, score));
}

// ── AI 生成 ──

const WEEKLY_BRIEFING_SCHEMA = {
  type: "object",
  properties: {
    counselorMessage: { type: "string" },
    weeklyTheme: { type: "string" },
    observations: { type: "array", items: { type: "string" } },
    recommendedAction: { type: "string" },
  },
  required: ["counselorMessage", "weeklyTheme", "observations", "recommendedAction"],
} as const;

const COUNSELOR_SYSTEM_PROMPT = `あなたは Aneurasync の専属 Rendezvous Counselor です。

【重要: Alter との違いを厳守してください】
- Alter は「あなたはこう感じてる」という内省的・詩的なトーン
- あなたは「私はこう見ています」という構造的・専門的・簡潔・的確なトーン

語り方の例:
- ✅「私の見立てでは、今週は○○のタイミングです」
- ✅「観測データから、○○という傾向が見えています」
- ❌「あなたの心の中に...」
- ❌「感じてみてください」

特徴:
- 結論を先に述べる（1文目に要点）
- 感情的な表現は最小限
- 具体的で実行可能なアドバイス
- 専門職（結婚相談所の仲人以上）としての矜持
- 全て日本語`;

type GenerateCounselorMessageParams = {
  userId: string;
  activeConnectionCount: number;
  topPattern: string | null;
  tendencyCount: number;
  improvingCount: number;
  positiveRatio: number | null;
  growthScore: number;
  temperatureGapNote: string | null;
  safetyAlert: string | null;
  stargazerContext: string | null;
  assetContext: string | null;
};

type CounselorMessageOutput = {
  counselorMessage: string;
  weeklyTheme: string;
  observations: string[];
  recommendedAction: string;
};

async function generateCounselorMessage(
  params: GenerateCounselorMessageParams,
): Promise<CounselorMessageOutput> {
  const {
    userId,
    activeConnectionCount,
    topPattern,
    tendencyCount,
    improvingCount,
    positiveRatio,
    growthScore,
    temperatureGapNote,
    safetyAlert,
    stargazerContext,
    assetContext,
  } = params;

  const contextSummary = buildContextSummary({
    activeConnectionCount,
    topPattern,
    tendencyCount,
    improvingCount,
    positiveRatio,
    growthScore,
    temperatureGapNote,
    safetyAlert,
    stargazerContext,
  });

  const prompt = `
## 今週の Weekly Briefing を生成してください

## 現状データ
${contextSummary}

## 出力要件
- counselorMessage: 今週のカウンセラーからのメッセージ（2-3文、専門的・簡潔。「私はこう見ています」トーン）
- weeklyTheme: 今週のテーマを表す一言（例: 「観察の週」「深化のタイミング」「立ち止まりと再起動」）
- observations: 構造的な観察2-3点（短文で。具体的なデータに基づく）
- recommendedAction: 今週の推奨アクション1つ（具体的で実行可能な1文）
- 全て日本語
`.trim();

  const aiResult = await runAI({
    taskType: "rendezvous_weekly_briefing",
    prompt,
    systemPrompt: COUNSELOR_SYSTEM_PROMPT,
    jsonSchema: WEEKLY_BRIEFING_SCHEMA as unknown as Record<string, unknown>,
    requireJson: true,
    temperature: 0.65,
    userId,
  });

  try {
    const output = (
      aiResult.structured ?? JSON.parse(aiResult.text)
    ) as CounselorMessageOutput;
    return output;
  } catch {
    return buildFallbackMessage(params);
  }
}

function buildContextSummary(params: {
  activeConnectionCount: number;
  topPattern: string | null;
  tendencyCount: number;
  improvingCount: number;
  positiveRatio: number | null;
  growthScore: number;
  temperatureGapNote?: string | null;
  safetyAlert?: string | null;
  stargazerContext?: string | null;
  assetContext?: string | null;
}): string {
  const lines: string[] = [
    `- アクティブな接続数: ${params.activeConnectionCount}件`,
    `- 成長スコア: ${params.growthScore}/100`,
    `- 観測済みパターン数: ${params.tendencyCount}件（うち改善中: ${params.improvingCount}件）`,
  ];

  if (params.stargazerContext) {
    lines.push(`- Stargazer性格プロファイル: ${params.stargazerContext}`);
  }

  if (params.topPattern) {
    lines.push(`- 最も顕著なパターン: ${params.topPattern}`);
  }

  if (params.positiveRatio !== null) {
    const pct = Math.round(params.positiveRatio * 100);
    lines.push(`- 直近のポジティブ評価率: ${pct}%`);
  } else {
    lines.push("- まだレビューデータがありません（接続初期段階）");
  }

  if (params.temperatureGapNote) {
    lines.push(`\n【温度差検出】\n${params.temperatureGapNote}`);
  }

  if (params.safetyAlert) {
    lines.push(`\n【安全注記】\n${params.safetyAlert}\nこの話題に関するアドバイスは慎重に行ってください。`);
  }

  if (params.assetContext) {
    lines.push(`\n${params.assetContext}`);
  }

  return lines.join("\n");
}

function buildFallbackMessage(
  params: GenerateCounselorMessageParams,
): CounselorMessageOutput {
  if (params.activeConnectionCount === 0) {
    return {
      counselorMessage:
        "私の見立てでは、今は関係性の土台を整える段階です。自己理解を深めるほど、相性の見極め精度が上がります。焦らず、あなたのペースで進めましょう。",
      weeklyTheme: "準備と深化",
      observations: [
        "現在アクティブな接続はありません",
        "Stargazerのデータが蓄積するほど、私の候補提案の精度が上がります",
      ],
      recommendedAction: "Stargazerの観測をさらに深め、あなたの判断原理を明確にしましょう",
    };
  }

  return {
    counselorMessage: `現在${params.activeConnectionCount}件の接続が進行中です。私はそれぞれの関係を観測しています。`,
    weeklyTheme: "観察と深化",
    observations: [
      `${params.activeConnectionCount}件のアクティブな接続があります`,
      params.topPattern
        ? `最も顕著なパターン: 「${params.topPattern}」`
        : "まだパターンデータが蓄積中です",
    ],
    recommendedAction: "各接続の返信ペースや話題の変化を意識して、自分の感覚を振り返ってみてください",
  };
}
