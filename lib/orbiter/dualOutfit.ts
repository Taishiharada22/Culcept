// ============================================================
// Orbiter Feature 6: Dual Outfit
// ふたりのスタイル — aesthetic軸から個人の表現 + ペアの調和を提案
//
// 対象6軸: tradition_vs_novelty, quality_vs_quantity, classic_vs_trendy,
//          function_vs_expression, minimal_vs_maximal, perfectionist_vs_pragmatic
// ============================================================

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { SceneType, DualOutfitAdvice } from "./types";

// ── Style Keyword Map ──

interface StyleKeywordRule {
  axis: TraitAxisKey;
  threshold: number; // 正ならaxisScore>threshold, 負ならaxisScore<threshold
  keywords: string[];
  colorTone: string;
}

const STYLE_KEYWORD_RULES: StyleKeywordRule[] = [
  // ミニマル寄り
  {
    axis: "minimal_vs_maximal" as TraitAxisKey,
    threshold: -0.3,
    keywords: ["ミニマル", "クリーン", "シンプル"],
    colorTone: "モノトーン・ニュートラル",
  },
  // マキシマル寄り
  {
    axis: "minimal_vs_maximal" as TraitAxisKey,
    threshold: 0.3,
    keywords: ["マキシマル", "レイヤード", "華やか"],
    colorTone: "ビビッド・マルチカラー",
  },
  // クラシック寄り
  {
    axis: "classic_vs_trendy" as TraitAxisKey,
    threshold: -0.3,
    keywords: ["クラシック", "定番", "タイムレス"],
    colorTone: "ネイビー・ベージュ・ホワイト",
  },
  // トレンド寄り
  {
    axis: "classic_vs_trendy" as TraitAxisKey,
    threshold: 0.3,
    keywords: ["トレンド", "旬のアイテム", "実験的"],
    colorTone: "シーズンカラー・アクセント",
  },
  // 機能・合理寄り
  {
    axis: "function_vs_expression" as TraitAxisKey,
    threshold: -0.3,
    keywords: ["機能的", "実用的", "無駄のない"],
    colorTone: "アースカラー・落ち着いた色",
  },
  // 表現・情緒寄り
  {
    axis: "function_vs_expression" as TraitAxisKey,
    threshold: 0.3,
    keywords: ["表現的", "個性的", "アーティスティック"],
    colorTone: "大胆な色使い・コントラスト",
  },
  // 伝統寄り
  {
    axis: "tradition_vs_novelty" as TraitAxisKey,
    threshold: -0.3,
    keywords: ["伝統的", "王道", "安定感"],
    colorTone: "ベーシックカラー",
  },
  // 新規性寄り
  {
    axis: "tradition_vs_novelty" as TraitAxisKey,
    threshold: 0.3,
    keywords: ["新しいもの好き", "先進的", "ユニーク"],
    colorTone: "ニューカラー・テクニカル",
  },
  // 質重視
  {
    axis: "quality_vs_quantity" as TraitAxisKey,
    threshold: -0.3,
    keywords: ["上質", "こだわり", "一点物"],
    colorTone: "深みのある色",
  },
  // 量・広がり
  {
    axis: "quality_vs_quantity" as TraitAxisKey,
    threshold: 0.3,
    keywords: ["カジュアル", "気軽に", "バリエーション"],
    colorTone: "カジュアルカラー",
  },
  // 完成度重視
  {
    axis: "perfectionist_vs_pragmatic" as TraitAxisKey,
    threshold: -0.3,
    keywords: ["完璧主義", "ディテール", "丁寧"],
    colorTone: "調和の取れた配色",
  },
  // 実用・前進重視
  {
    axis: "perfectionist_vs_pragmatic" as TraitAxisKey,
    threshold: 0.3,
    keywords: ["ラフ", "抜け感", "こなれた"],
    colorTone: "ウォッシュドカラー",
  },
];

// ── Self Expression ──

function buildSelfExpression(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): DualOutfitAdvice["selfExpression"] {
  const matchedKeywords: string[] = [];
  let dominantColorTone = "ナチュラルカラー";
  let maxAbsScore = 0;

  for (const rule of STYLE_KEYWORD_RULES) {
    const score = axisScores[rule.axis];
    if (score === undefined) continue;

    const matches =
      rule.threshold > 0
        ? score > rule.threshold
        : score < rule.threshold;

    if (matches) {
      matchedKeywords.push(...rule.keywords);
      const absScore = Math.abs(score);
      if (absScore > maxAbsScore) {
        maxAbsScore = absScore;
        dominantColorTone = rule.colorTone;
      }
    }
  }

  // 上位3キーワードに絞る
  const uniqueKeywords = [...new Set(matchedKeywords)].slice(0, 3);

  if (uniqueKeywords.length === 0) {
    return {
      keywords: ["バランス型", "ナチュラル"],
      narrative: "特定のスタイルに偏りすぎず、バランスの取れた感性を持っている",
      colorTone: "ナチュラルカラー・ニュートラル",
    };
  }

  const narrative = `${uniqueKeywords.join("・")}な感性が特徴的。自分らしさを大切にしたスタイルが似合う`;

  return {
    keywords: uniqueKeywords,
    narrative,
    colorTone: dominantColorTone,
  };
}

// ── Pair Harmony ──

function buildPairHarmony(
  selfAxisScores: Partial<Record<TraitAxisKey, number>>,
  counterpartAxisScores: Partial<Record<TraitAxisKey, number>>,
): DualOutfitAdvice["pairHarmony"] {
  const aestheticAxes: TraitAxisKey[] = [
    "minimal_vs_maximal" as TraitAxisKey,
    "classic_vs_trendy" as TraitAxisKey,
    "function_vs_expression" as TraitAxisKey,
    "tradition_vs_novelty" as TraitAxisKey,
    "quality_vs_quantity" as TraitAxisKey,
    "perfectionist_vs_pragmatic" as TraitAxisKey,
  ];

  let similarCount = 0;
  let contrastCount = 0;
  let measuredCount = 0;

  for (const axis of aestheticAxes) {
    const self = selfAxisScores[axis];
    const other = counterpartAxisScores[axis];
    if (self === undefined || other === undefined) continue;

    measuredCount++;
    const diff = Math.abs(self - other);

    if (diff < 0.4) similarCount++;
    else contrastCount++;
  }

  let harmonyLevel: "high" | "medium" | "divergent";
  let overlapStyle: string;
  let contrastStyle: string;

  if (measuredCount === 0) {
    harmonyLevel = "medium";
    overlapStyle = "データが不足していますが、自然体で合わせてみて";
    contrastStyle = "";
  } else if (similarCount > contrastCount * 2) {
    harmonyLevel = "high";
    overlapStyle = "美的感覚が近く、統一感のある組み合わせが自然にできる";
    contrastStyle =
      "似すぎを避けたい時は、小物やアクセサリーで個性を出してみて";
  } else if (contrastCount > similarCount * 2) {
    harmonyLevel = "divergent";
    overlapStyle =
      "スタイルの方向性が異なるので、共通点を1つ作ると統一感が出る";
    contrastStyle =
      "対比そのものが面白い。お互いのスタイルを楽しむ余裕を持とう";
  } else {
    harmonyLevel = "medium";
    overlapStyle = "共通する部分と異なる部分がバランスよくある";
    contrastStyle =
      "共通のテーマカラーを1つ決めると、まとまり感が出せる";
  }

  return {
    overlapStyle,
    contrastStyle,
    harmonyLevel,
  };
}

// ── Practical Tips ──

function buildPracticalTips(
  selfExpression: DualOutfitAdvice["selfExpression"],
  pairHarmony: DualOutfitAdvice["pairHarmony"],
  sceneType?: SceneType,
): string[] {
  const tips: string[] = [];

  // ハーモニーレベルに基づくヒント
  if (pairHarmony.harmonyLevel === "high") {
    tips.push(
      "お互いの定番アイテムを取り入れたリンクコーデも楽しめそう",
    );
  } else if (pairHarmony.harmonyLevel === "divergent") {
    tips.push(
      "色のトーンだけ合わせると、スタイルが違っても統一感が出る",
    );
  }

  // キーワードに基づくヒント
  if (selfExpression.keywords.includes("ミニマル")) {
    tips.push(
      "シンプルなアイテムほど素材とシルエットで差がつく",
    );
  }
  if (selfExpression.keywords.includes("トレンド")) {
    tips.push(
      "旬のアイテムは1点投入で、残りは定番で引き算するとバランス◎",
    );
  }

  // シーンに基づく調整
  if (sceneType) {
    const sceneTips: Partial<Record<SceneType, string>> = {
      cafe: "カフェには清潔感のあるシンプルなスタイルが映える",
      walk: "歩きやすさ重視で。スニーカーやフラットシューズがおすすめ",
      activity: "動きやすさ第一。汗をかいても気にならない素材を選んで",
      food: "食事の場はちょっとだけ丁寧めのスタイルが好印象",
      nature: "アウトドア感のあるリラックスしたスタイルが自然に馴染む",
      event: "イベントのテーマに合わせた遊び心のあるスタイルを",
      creative: "自分らしさ全開でOK。個性的なアイテムで会話のきっかけに",
      group: "気負わないカジュアルスタイルが場に馴染みやすい",
      online: "上半身に気を配れば大丈夫。明るい色が画面映えする",
    };
    const tip = sceneTips[sceneType];
    if (tip) tips.push(tip);
  }

  // フォールバック
  if (tips.length === 0) {
    tips.push("自分が心地よいと感じるスタイルが一番自然に見える");
  }

  return tips.slice(0, 3);
}

// ── Scene Adjustment ──

function buildSceneAdjustment(sceneType?: SceneType): string | null {
  if (!sceneType) return null;

  const adjustments: Partial<Record<SceneType, string>> = {
    cafe: "カジュアルだけど丁寧さのあるスタイルがおすすめ",
    walk: "歩くので動きやすさ重視。レイヤードで温度調節も",
    activity: "スポーティーかつ自分らしさも忘れずに",
    food: "少しドレスアップして特別感を演出してみて",
    nature: "ナチュラルな素材やアースカラーが景色に馴染む",
    event: "イベントの雰囲気に合わせつつ、自分のスタイルを崩さない",
    creative: "自由な場なので、一番好きなスタイルで行ってOK",
    group: "目立ちすぎず、でも自分らしさは出せるバランスを",
    online: "明るめのトップスで。背景とのコントラストも意識して",
  };

  return adjustments[sceneType] ?? null;
}

// ── Main Export ──

export function computeDualOutfit(params: {
  selfAxisScores: Partial<Record<TraitAxisKey, number>>;
  counterpartAxisScores: Partial<Record<TraitAxisKey, number>>;
  sceneType?: SceneType;
}): DualOutfitAdvice {
  const { selfAxisScores, counterpartAxisScores, sceneType } = params;

  const selfExpression = buildSelfExpression(selfAxisScores);
  const pairHarmony = buildPairHarmony(selfAxisScores, counterpartAxisScores);
  const practicalTips = buildPracticalTips(
    selfExpression,
    pairHarmony,
    sceneType,
  );
  const sceneAdjustment = buildSceneAdjustment(sceneType);

  return {
    selfExpression,
    pairHarmony,
    practicalTips,
    sceneAdjustment,
  };
}
