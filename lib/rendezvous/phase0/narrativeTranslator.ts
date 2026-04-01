import "server-only";

/**
 * Phase 0: LLM翻訳層（enriched版）
 *
 * 構造化インサイト + enrichedコンテキスト → 自然文ナラティブ
 *
 * 設計原則:
 *   - LLMは決定ロジックに関与しない
 *   - enrichedデータ（愛着/SDT/パーソナリティ/Origin/アーキタイプ）をコンテキストとして渡す
 *   - 出力は1文ナラティブ + 共鳴ポイントの自然文化
 *   - 失敗時は構造化版ナラティブにフォールバック
 */

import { runAI } from "@/lib/ai";
import type { Phase0PairInsight } from "./generatePairInsight";
import type { AttachmentStyle } from "../attachmentProfile";
import type { SDTProfile } from "../sdtAxes";

export type NarrativeTranslation = {
  narrative: string;
  resonanceDescriptions: string[];
  unobservedDescription: string | null;
  usedLLM: boolean;
};

export type EnrichedLLMContext = {
  selfAttachmentStyle: AttachmentStyle;
  partnerAttachmentStyle: AttachmentStyle;
  selfSDT: SDTProfile;
  partnerSDT: SDTProfile;
  selfPersonality: Record<string, number> | null;
  partnerPersonality: Record<string, number> | null;
  selfOrigin: import("./enrichedDataLoader").OriginSummary | null;
  partnerOrigin: import("./enrichedDataLoader").OriginSummary | null;
  selfArchetype: string | null;
  partnerArchetype: string | null;
  // Alter データ
  selfAlterPatterns: import("./enrichedDataLoader").AlterJudgmentPattern | null;
  partnerAlterPatterns: import("./enrichedDataLoader").AlterJudgmentPattern | null;
  // 矛盾（二面性）
  selfContradictions: import("./enrichedDataLoader").ContradictionSummary | null;
  partnerContradictions: import("./enrichedDataLoader").ContradictionSummary | null;
};

const TRANSLATION_SCHEMA = {
  type: "object",
  properties: {
    narrative: { type: "string" },
    resonanceDescriptions: {
      type: "array",
      items: { type: "string" },
    },
    unobservedDescription: { type: "string", nullable: true },
  },
  required: ["narrative", "resonanceDescriptions", "unobservedDescription"],
} as const;

/**
 * 構造化インサイトをLLMで自然文に翻訳する
 */
export async function translateToNarrative(
  insight: Phase0PairInsight,
  userId: string,
  enrichedContext?: EnrichedLLMContext,
): Promise<NarrativeTranslation> {
  const prompt = buildTranslationPrompt(insight, enrichedContext);

  try {
    const result = await runAI({
      taskType: "rendezvous_phase0_narrative",
      prompt,
      systemPrompt: `あなたは Aneurasync の関係性観測AIです。
2人の人間の間に何が起きるかを、静かに、誠実に照らす役割です。

ルール:
- 断定しない。「〜しやすい」「〜の可能性がある」のように余白を残す
- ポジティブすぎない。誠実で中立なトーン
- 専門用語を使わない。心理学用語は日常的な言葉に置き換える
- narrative は1文（40〜80文字）で、2人の間に起きやすいことの核心を表現する
- 具体的な場面が想像できるように書く。抽象的な「相性が良い」ではなく、どんな瞬間に何が起きるかを描く
- resonanceDescriptions は各2〜3文で、共鳴の具体的なシーンを描写する
- unobservedDescription は「まだわからない」ことへの誠実さを持つ
- 愛着スタイル、価値観、パーソナリティの情報があれば、それを自然に織り込む`,
      jsonSchema: TRANSLATION_SCHEMA as unknown as Record<string, unknown>,
      requireJson: true,
      temperature: 0.7,
      userId,
    });

    const parsed = (
      result.structured ? result.structured : JSON.parse(result.text)
    ) as {
      narrative: string;
      resonanceDescriptions: string[];
      unobservedDescription: string | null;
    };

    return {
      narrative: parsed.narrative,
      resonanceDescriptions: parsed.resonanceDescriptions,
      unobservedDescription: parsed.unobservedDescription,
      usedLLM: true,
    };
  } catch {
    return {
      narrative: insight.narrative,
      resonanceDescriptions: insight.resonancePoints.map((p) => p.description),
      unobservedDescription: insight.unobservedPoint?.description ?? null,
      usedLLM: false,
    };
  }
}

function buildTranslationPrompt(
  insight: Phase0PairInsight,
  ctx?: EnrichedLLMContext,
): string {
  const resonanceList = insight.resonancePoints
    .map((p, i) => `${i + 1}. ${p.label}: ${p.description}`)
    .join("\n");

  const unobserved = insight.unobservedPoint
    ? `- ラベル: ${insight.unobservedPoint.label}\n- 説明: ${insight.unobservedPoint.description}`
    : "なし";

  const enrichedList = insight.enrichedInsights.length > 0
    ? insight.enrichedInsights.map((e, i) => `${i + 1}. ${e}`).join("\n")
    : "なし";

  // enriched コンテキスト
  let enrichedSection = "";
  if (ctx) {
    const parts: string[] = [];

    // 愛着スタイル
    const attachmentJa: Record<string, string> = {
      secure: "安定型（信頼を築きやすい）",
      anxious: "不安型（確認を求めやすい）",
      avoidant: "回避型（距離を取りやすい）",
      disorganized: "混乱型（近づきたいが怖い）",
    };
    parts.push(`愛着スタイル: 自分=${attachmentJa[ctx.selfAttachmentStyle] ?? ctx.selfAttachmentStyle}, 相手=${attachmentJa[ctx.partnerAttachmentStyle] ?? ctx.partnerAttachmentStyle}`);

    // SDT
    parts.push(`自律性欲求: 自分=${(ctx.selfSDT.autonomySatisfaction * 100).toFixed(0)}%, 相手=${(ctx.partnerSDT.autonomySatisfaction * 100).toFixed(0)}%`);
    parts.push(`繋がり欲求: 自分=${(ctx.selfSDT.relatednessSatisfaction * 100).toFixed(0)}%, 相手=${(ctx.partnerSDT.relatednessSatisfaction * 100).toFixed(0)}%`);

    // パーソナリティ
    if (ctx.selfPersonality && ctx.partnerPersonality) {
      const pLabels: Record<string, string> = {
        s_order: "秩序性", s_exploration: "探索性", o_stability: "安定志向", o_novelty: "新奇追求",
        c_warmth: "温かさ", c_independence: "独立性", e_expression: "感情表出", e_containment: "感情抑制",
        d_intuition: "直感判断", d_analysis: "分析判断", r_harmony: "調和志向", r_authenticity: "本音志向",
      };
      const diffs: string[] = [];
      for (const [key, label] of Object.entries(pLabels)) {
        const sv = ctx.selfPersonality[key];
        const pv = ctx.partnerPersonality[key];
        if (sv !== undefined && pv !== undefined) {
          const diff = Math.abs(sv - pv);
          if (diff > 0.3) diffs.push(`${label}に大きな差（自分${(sv * 100).toFixed(0)}% vs 相手${(pv * 100).toFixed(0)}%）`);
          else if (diff < 0.1) diffs.push(`${label}が非常に近い`);
        }
      }
      if (diffs.length > 0) parts.push(`パーソナリティ特徴: ${diffs.slice(0, 4).join("、")}`);
    }

    // Origin（日常の感情・関心）
    if (ctx.selfOrigin && ctx.selfOrigin.emotionTags.length > 0) {
      parts.push(`自分の日常的な感情: ${ctx.selfOrigin.emotionTags.slice(0, 5).join("、")}`);
    }
    if (ctx.partnerOrigin && ctx.partnerOrigin.emotionTags.length > 0) {
      parts.push(`相手の日常的な感情: ${ctx.partnerOrigin.emotionTags.slice(0, 5).join("、")}`);
    }

    // アーキタイプ
    if (ctx.selfArchetype || ctx.partnerArchetype) {
      parts.push(`アーキタイプ: 自分=${ctx.selfArchetype ?? "未判定"}, 相手=${ctx.partnerArchetype ?? "未判定"}`);
    }

    // Alter 判断パターン
    if (ctx.selfAlterPatterns && ctx.selfAlterPatterns.totalJudgments > 5) {
      const topShape = getTopFromDist(ctx.selfAlterPatterns.actionShapeDistribution);
      if (topShape) {
        const shapeJa: Record<string, string> = {
          full_go: "迷わず行く", bounded_go: "範囲を決めて行く",
          prepare_then_go: "準備してから行く", trial_then_decide: "小さく試す",
          observe_first: "まず様子を見る", defer_with_trigger: "条件が揃ったら行く",
        };
        parts.push(`自分の判断傾向: ${shapeJa[topShape] ?? topShape}（${ctx.selfAlterPatterns.totalJudgments}回の判断から）`);
      }
      const fb = ctx.selfAlterPatterns.avgForceBalance;
      if (fb) {
        if (fb.expandPressure > 0.6) parts.push("自分は「進みたい力」が強い傾向");
        if (fb.protectPressure > 0.6) parts.push("自分は「守りたい力」が強い傾向");
        if (fb.regretIfSkip > fb.regretIfDo + 0.15) parts.push("自分は「やらなかった後悔」を感じやすい");
        if (fb.regretIfDo > fb.regretIfSkip + 0.15) parts.push("自分は「やった後悔」を感じやすい");
      }
    }
    if (ctx.partnerAlterPatterns && ctx.partnerAlterPatterns.totalJudgments > 5) {
      const topShape = getTopFromDist(ctx.partnerAlterPatterns.actionShapeDistribution);
      if (topShape) {
        const shapeJa: Record<string, string> = {
          full_go: "迷わず行く", bounded_go: "範囲を決めて行く",
          prepare_then_go: "準備してから行く", trial_then_decide: "小さく試す",
          observe_first: "まず様子を見る", defer_with_trigger: "条件が揃ったら行く",
        };
        parts.push(`相手の判断傾向: ${shapeJa[topShape] ?? topShape}（${ctx.partnerAlterPatterns.totalJudgments}回の判断から）`);
      }
    }

    // 矛盾（二面性）
    if (ctx.selfContradictions && ctx.selfContradictions.dualAxes.length > 0) {
      const axes = ctx.selfContradictions.dualAxes.slice(0, 2).map((d) => d.axisId).join("、");
      parts.push(`自分の二面性: ${axes}に揺れがある（矛盾ではなく、状況に応じた柔軟性）`);
    }
    if (ctx.partnerContradictions && ctx.partnerContradictions.dualAxes.length > 0) {
      const axes = ctx.partnerContradictions.dualAxes.slice(0, 2).map((d) => d.axisId).join("、");
      parts.push(`相手の二面性: ${axes}に揺れがある`);
    }

    enrichedSection = `\n## Aneurasyncが観測した2人の深層データ\n${parts.join("\n")}`;
  }

  return `
## タスク
以下の構造化分析結果を、人間が読んで「なるほど、そうかもしれない」と感じる自然な日本語に翻訳してください。

## 構造化ナラティブ（参考、そのまま使わないでください）
${insight.narrative}

## 共鳴する点
${resonanceList}

## enriched インサイト（深層データから得られた追加の気づき）
${enrichedList}

## まだ見えていない点
${unobserved}
${enrichedSection}

## データ充足度
${insight.confidence}%

## スコア
${insight.overallScore !== null ? `${Math.round(insight.overallScore * 100)}%` : "算出不可"}

## 出力ルール
- narrative: 「2人の間で起きやすいこと」を1文（40〜80文字）で。具体的な場面が想像できるように。断定せず余白を残す
- resonanceDescriptions: 共鳴する点を各2〜3文で。深層データの情報を自然に織り込む。「心理学的に〜」ではなく、日常の場面で描く
- unobservedDescription: まだ見えていない点を1〜2文で。「わからない」への誠実さ
- enrichedデータがあれば必ず活用する。ただし専門用語は使わない
- 判断傾向のデータがあれば「この人はこういう判断をしがち」という形で自然に織り込む
- 二面性のデータがあれば「揺れ」として前向きに描写する（矛盾ではなく柔軟性）
`.trim();
}

function getTopFromDist(dist: Record<string, number>): string | null {
  let top: string | null = null;
  let max = 0;
  for (const [k, v] of Object.entries(dist)) {
    if (v > max) { max = v; top = k; }
  }
  return top;
}
