import "server-only";

import { runAI } from "@/lib/ai";
import { supabaseServer } from "@/lib/supabase/server";
import { getUserTendencies, checkPatternImprovement } from "./tendencyTracker";
import type {
  GrowthInsight,
  GrowthPattern,
  GrowthImprovement,
  DisconnectAnalysisRow,
  TendencyPatternRow,
  PostReviewRow,
} from "./types";

// ============================================================
// 成長インサイトエンジン
// 長期的な接続パターンの変化を追跡し、成長を可視化する
// ============================================================

type AIGrowthOutput = {
  narrative: string;
  improvements: Array<{
    area: string;
    before: string;
    after: string;
  }>;
  nextAdvice: string;
};

const GROWTH_SCHEMA = {
  type: "object",
  properties: {
    narrative: { type: "string" },
    improvements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          area: { type: "string" },
          before: { type: "string" },
          after: { type: "string" },
        },
        required: ["area", "before", "after"],
      },
    },
    nextAdvice: { type: "string" },
  },
  required: ["narrative", "improvements", "nextAdvice"],
} as const;

export async function generateGrowthInsights(
  userId: string,
): Promise<GrowthInsight> {
  const supabase = await supabaseServer();
  const now = new Date().toISOString();

  // 1. 全切断分析を取得
  const { data: analysesData } = await supabase
    .from("rendezvous_disconnect_analyses")
    .select("*")
    .eq("disconnected_user_id", userId)
    .order("created_at", { ascending: true });

  const analyses = (analysesData ?? []) as DisconnectAnalysisRow[];

  // 2. 傾向パターンを取得
  const tendencies = await getUserTendencies(userId);

  // 3. ポストレビューを取得
  const { data: reviewsData } = await supabase
    .from("rendezvous_post_reviews")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  const reviews = (reviewsData ?? []) as PostReviewRow[];

  // 4. 総接続数を取得
  const { count: totalConnections } = await supabase
    .from("rendezvous_candidates")
    .select("id", { count: "exact", head: true })
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .in("state", ["mutual_liked", "chat_opened"]);

  const totalDisconnects = analyses.length;

  // 5. 各パターンの改善状況をチェック
  const patterns: GrowthPattern[] = [];
  for (const tendency of tendencies.slice(0, 10)) {
    const improvement = await checkPatternImprovement(
      userId,
      tendency.pattern_key,
    );

    const patternData = tendency.pattern_data as Record<string, unknown>;
    patterns.push({
      name: (patternData?.tendency as string) ?? tendency.pattern_key,
      description:
        (patternData?.explanation as string) ?? `${tendency.pattern_key} パターン`,
      frequency: tendency.occurrence_count,
      improving: improvement.improving,
      firstDetectedAt: tendency.first_detected_at,
    });
  }

  // 6. 成長スコアを計算
  const growthScore = calculateGrowthScore(
    analyses,
    tendencies,
    reviews,
    patterns,
  );

  // 7. 3回以上の切断がある場合は AI で成長ナラティブを生成
  let improvements: GrowthImprovement[] = [];
  let nextAdvice: string | null = null;

  if (totalDisconnects >= 3) {
    const aiInsight = await generateGrowthNarrative(
      userId,
      analyses,
      tendencies,
      reviews,
      patterns,
    );

    if (aiInsight) {
      improvements = aiInsight.improvements.map((imp) => ({
        ...imp,
        detectedAt: now,
      }));
      nextAdvice = aiInsight.nextAdvice;
    }
  }

  // パターンから自然に改善が見える場合のフォールバック
  if (improvements.length === 0) {
    const improvingPatterns = patterns.filter((p) => p.improving);
    improvements = improvingPatterns.map((p) => ({
      area: p.name,
      before: `${p.name} が繰り返し見られていました`,
      after: "最近はこのパターンが減少しています",
      detectedAt: now,
    }));
  }

  if (!nextAdvice && totalDisconnects > 0) {
    nextAdvice =
      "次の接続では、自分のリズムを大切にしながらも、相手のペースにも少し意識を向けてみてください。";
  }

  return {
    userId,
    totalDisconnects,
    totalConnections: totalConnections ?? 0,
    patterns,
    improvements,
    nextAdvice,
    growthScore,
    generatedAt: now,
  };
}

// ---------- 内部ヘルパー ----------

function calculateGrowthScore(
  analyses: DisconnectAnalysisRow[],
  tendencies: TendencyPatternRow[],
  reviews: PostReviewRow[],
  patterns: GrowthPattern[],
): number {
  if (analyses.length === 0) return 50; // 初期値

  let score = 50;

  // 改善中のパターンがあればスコアアップ
  const improvingCount = patterns.filter((p) => p.improving).length;
  score += improvingCount * 8;

  // ポジティブなレビューが多ければスコアアップ
  const positiveReviews = reviews.filter(
    (r) => r.feeling === "great" || r.feeling === "good",
  );
  const positiveRatio =
    reviews.length > 0 ? positiveReviews.length / reviews.length : 0.5;
  score += Math.round(positiveRatio * 15);

  // パターンの多様性が減少していればスコアアップ（同じミスを繰り返していない）
  const recentAnalyses = analyses.slice(-5);
  const recentReasons = new Set(
    recentAnalyses.map((a) => a.reason_code),
  );
  if (analyses.length >= 5 && recentReasons.size < 3) {
    // 同じ理由が繰り返されている
    score -= 5;
  }

  // 接続を続けている（切断だけでなく成功もある）
  if (reviews.length > analyses.length) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

async function generateGrowthNarrative(
  userId: string,
  analyses: DisconnectAnalysisRow[],
  tendencies: TendencyPatternRow[],
  reviews: PostReviewRow[],
  patterns: GrowthPattern[],
): Promise<AIGrowthOutput | null> {
  const patternSummary = patterns
    .slice(0, 5)
    .map(
      (p) =>
        `- ${p.name}（${p.frequency}回、${p.improving ? "改善中" : "継続中"}）`,
    )
    .join("\n");

  const reviewSummary = reviews
    .slice(-5)
    .map((r) => `- ${r.feeling}${r.free_text ? `：${r.free_text}` : ""}`)
    .join("\n");

  const disconnectTimeline = analyses
    .slice(-5)
    .map(
      (a) => {
        const insight = a.tendency_insight as Record<string, unknown>;
        return `- ${a.reason_code}: ${(insight?.tendency as string) ?? ""}`;
      },
    )
    .join("\n");

  const prompt = `
## タスク
ユーザーの接続パターンの成長ナラティブを生成してください。

## 切断履歴（直近5件）
${disconnectTimeline || "（なし）"}

## 傾向パターン
${patternSummary || "（なし）"}

## レビュー（直近5件）
${reviewSummary || "（なし）"}

## 統計
- 総切断数: ${analyses.length}
- 総レビュー数: ${reviews.length}

## 出力ルール
- narrative: 成長の物語（2-3文、温かいトーン）
- improvements: 改善が見られるエリア（あれば1-3個、before/afterで表現）
- nextAdvice: 次のアドバイス（1-2文）
- 全て日本語
- 否定的表現は使わない
- 「成長している」ことを軸にする
`.trim();

  const aiResult = await runAI({
    taskType: "rendezvous_growth_insights",
    prompt,
    systemPrompt:
      "あなたは Aneurasync の AI カウンセラーです。ユーザーの接続パターンの変化を温かく見守り、成長を言語化します。小さな変化も見逃さず、励ましのメッセージを送ります。全て日本語で出力してください。",
    jsonSchema: GROWTH_SCHEMA as unknown as Record<string, unknown>,
    requireJson: true,
    temperature: 0.7,
    userId,
  });

  try {
    return (
      aiResult.structured
        ? aiResult.structured
        : JSON.parse(aiResult.text)
    ) as AIGrowthOutput;
  } catch {
    return null;
  }
}
