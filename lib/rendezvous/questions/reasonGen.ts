// ============================================================
// Reason Generation
// 文脈ごとに「なぜこのスコアか」を生成
// テンプレではなく、どの設問群が強く効いたかを使って出す
// ============================================================

import type {
  ContextType,
  ContextScoreResult,
  ContextReason,
  QuestionCategory,
} from "./types";
import {
  ALL_CONTEXTS,
  CONTEXT_LABELS,
  CATEGORY_LABELS,
} from "./types";
import {
  MAX_POSITIVE_FACTORS,
  MAX_CAUTION_FACTORS,
  POSITIVE_FACTOR_THRESHOLD,
  CAUTION_FACTOR_THRESHOLD,
  JUDGMENT_GO_THRESHOLD,
  JUDGMENT_HOLD_THRESHOLD,
} from "./constants";
import type { AvatarJudgment } from "./constants";

// ---------- カテゴリ別の理由文テンプレート ----------

const POSITIVE_TEMPLATES: Record<QuestionCategory, Record<ContextType, string>> = {
  tempo: {
    friend: "会話のテンポと空気感が自然に噛み合いやすい",
    romance: "二人の会話リズムに心地よさがある",
    orbiter: "日常の会話ペースに安定感がある",
    cocreation: "共創パートナーとして自然なリズムが合いそうです",
  },
  distance: {
    friend: "距離感の取り方が似ていて気楽",
    romance: "距離の縮め方が近く、自然に惹かれやすい",
    orbiter: "お互いの空間の必要量が近く、長期的に安定しやすい",
    cocreation: "作業中の距離感が近く、集中と対話のバランスが取りやすい",
  },
  values: {
    friend: "価値観の方向性が近く、共感しやすい",
    romance: "大切にしたいことの重なりがある",
    orbiter: "将来像や価値基盤が近く、安心感がある",
    cocreation: "一緒にものを作る上で価値観が近い",
  },
  lifestyle: {
    friend: "過ごし方の感覚が近く、一緒にいて自然",
    romance: "生活の温度感が似ていて心地よい",
    orbiter: "生活リズムや金銭感覚が近く、共に暮らしやすい",
    cocreation: "作業リズムや集中パターンが似ていて協業しやすい",
  },
  conflict: {
    friend: "すれ違い時の向き合い方が近い",
    romance: "衝突後の修復姿勢に共通点がある",
    orbiter: "衝突の乗り越え方が近く、関係の持続力がある",
    cocreation: "意見が割れたときの立て直し方が近く、プロジェクトが止まりにくい",
  },
};

const CAUTION_TEMPLATES: Record<QuestionCategory, Record<ContextType, string>> = {
  tempo: {
    friend: "会話テンポに少し差がある",
    romance: "会話の深さや速度に温度差が出やすい",
    orbiter: "日常会話のペースに少しズレがある",
    cocreation: "作業ペースに違いがあるかもしれません",
  },
  distance: {
    friend: "距離の詰め方に差があるかもしれない",
    romance: "距離の縮め方にペースの違いがある",
    orbiter: "一人時間の必要量や連絡頻度に差が出やすい",
    cocreation: "協業中の関わり方や報告頻度に差が出やすい",
  },
  values: {
    friend: "価値観の一部に違いがある",
    romance: "大切にしたいことの優先順位に少しズレがある",
    orbiter: "将来設計や価値基盤に差が見える",
    cocreation: "プロジェクトの方向性で揺れが出る可能性",
  },
  lifestyle: {
    friend: "過ごし方の好みに違いが出やすい",
    romance: "生活リズムの違いが気になるかもしれない",
    orbiter: "生活感覚や習慣に差がある",
    cocreation: "作業スタイルや集中時間帯に違いがある",
  },
  conflict: {
    friend: "意見の衝突時、対処法に違いがある",
    romance: "すれ違い時の向き合い方に差がある",
    orbiter: "衝突後の修復スタイルに違いがあり、慎重な立ち上がりが必要",
    cocreation: "制作上の意見対立時、合意形成のスタイルに差がある",
  },
};

// ---------- Summary Templates ----------

const SUMMARY_TEMPLATES: Record<ContextType, (score: number) => string> = {
  friend: (score) => {
    if (score >= 85) return "会話テンポ・気楽さが強く一致している";
    if (score >= 70) return "自然に続きやすい友達関係";
    if (score >= 55) return "合う部分はあるが、少し距離感の調整が必要";
    return "友達としての噛み合わせに注意が必要";
  },
  romance: (score) => {
    if (score >= 85) return "惹かれやすさと安心感が共存している";
    if (score >= 70) return "惹かれやすさはあるが、ペースの調整が大切";
    if (score >= 55) return "可能性はあるが、距離の詰め方に慎重さが必要";
    return "恋愛としては温度差が出やすい";
  },
  orbiter: (score) => {
    if (score >= 85) return "価値観と衝突修復の姿勢が近く、安定した関係性";
    if (score >= 70) return "長期的な安定性はあるが、生活テンポに差がある";
    if (score >= 55) return "基盤は見えるが、生活感覚の擦り合わせが必要";
    return "Orbiterとしてはまだ確認が必要な部分が多い";
  },
  cocreation: (score) => {
    if (score >= 85) return "共創パートナーとして高い親和性がある";
    if (score >= 70) return "一緒に作る関係で自然なリズムが生まれやすい";
    if (score >= 55) return "協業の可能性はあるが、作業スタイルの擦り合わせが必要";
    return "共創としてはペースや方向性の確認が必要";
  },
};

// ---------- Recommended Tone ----------

function buildRecommendedTone(
  context: ContextType,
  score: number,
): string {
  if (context === "friend") {
    return score >= 75
      ? "自然体で話しかけて大丈夫です"
      : "少しゆっくり始めるのが良さそうです";
  }
  if (context === "romance") {
    return score >= 75
      ? "リラックスした雰囲気から入ると自然です"
      : "まずは軽い話題から、距離感を大切に";
  }
  if (context === "cocreation") {
    return score >= 75
      ? "具体的なアイデアの話から入ると自然に深まりそうです"
      : "まずはお互いの得意分野を共有するところから";
  }
  // orbiter
  return score >= 75
    ? "穏やかなペースで深い話にも移れそうです"
    : "最初は安心感を優先して、ゆっくりと";
}

// ---------- Main Generation ----------

/**
 * 文脈別の理由文を生成
 */
export function generateContextReasons(
  contextScores: ContextScoreResult,
): ContextReason[] {
  return ALL_CONTEXTS.map((ctx) => {
    const score = contextScores[ctx];
    const breakdown = contextScores.questionBreakdown;

    // カテゴリ別にスコアを集計
    const categoryScores = new Map<QuestionCategory, { total: number; count: number }>();
    for (const entry of breakdown) {
      const existing = categoryScores.get(entry.category) ?? { total: 0, count: 0 };
      existing.total += entry.scores[ctx] * entry.effectiveWeights[ctx];
      existing.count += 1;
      categoryScores.set(entry.category, existing);
    }

    // ポジティブ要因: スコアが高いカテゴリ
    const sortedCategories = Array.from(categoryScores.entries())
      .map(([cat, { total, count }]) => ({
        category: cat,
        avgScore: count > 0 ? total / count : 0,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const positiveFactors = sortedCategories
      .filter((c) => c.avgScore >= POSITIVE_FACTOR_THRESHOLD)
      .slice(0, MAX_POSITIVE_FACTORS)
      .map((c) => ({
        questionTitle: CATEGORY_LABELS[c.category],
        category: c.category,
        description: POSITIVE_TEMPLATES[c.category][ctx],
        impact: "positive" as const,
      }));

    // 注意要因: スコアが低いカテゴリ
    const cautionFactors = sortedCategories
      .reverse()
      .filter((c) => c.avgScore < CAUTION_FACTOR_THRESHOLD && c.avgScore > 0)
      .slice(0, MAX_CAUTION_FACTORS)
      .map((c) => ({
        questionTitle: CATEGORY_LABELS[c.category],
        category: c.category,
        description: CAUTION_TEMPLATES[c.category][ctx],
        impact: "caution" as const,
      }));

    return {
      context: ctx,
      score,
      topFactors: [...positiveFactors, ...cautionFactors],
      summary: SUMMARY_TEMPLATES[ctx](score),
      recommendedTone: buildRecommendedTone(ctx, score),
    };
  });
}

/**
 * アバター側の判断を算出
 */
export function computeAvatarJudgment(
  contextScores: ContextScoreResult,
  context: ContextType,
): AvatarJudgment {
  const score = contextScores[context];
  if (score >= JUDGMENT_GO_THRESHOLD) return "go";
  if (score >= JUDGMENT_HOLD_THRESHOLD) return "hold";
  return "low_recommend";
}

/**
 * アバター判断の理由文を生成
 * 「分身からの報告」感が必要
 */
export function buildAvatarJudgmentText(
  judgment: AvatarJudgment,
  context: ContextType,
  score: number,
  reasons: ContextReason,
): string {
  const contextLabel = CONTEXT_LABELS[context];

  if (judgment === "go") {
    const topPositive = reasons.topFactors
      .filter((f) => f.impact === "positive")
      .slice(0, 2);
    const factorText = topPositive.length > 0
      ? topPositive.map((f) => f.description).join("。")
      : "全体的なバランスが良い";
    return `あなたの分身は、${contextLabel}文脈で静かなGOを出しています。${factorText}`;
  }

  if (judgment === "hold") {
    const caution = reasons.topFactors
      .filter((f) => f.impact === "caution")
      .slice(0, 1);
    const cautionText = caution.length > 0
      ? caution[0].description
      : "いくつかの観測点で確認が必要";
    return `${contextLabel}文脈では保留判断です。${cautionText}`;
  }

  // low_recommend
  return `${contextLabel}文脈では現時点では低推奨です。今後の観測で変わる可能性があります`;
}
