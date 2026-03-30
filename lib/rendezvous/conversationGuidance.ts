// lib/rendezvous/conversationGuidance.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Conversation Guidance — チャット中のAnimaリアルタイムヒント
//
// 設計思想:
// マッチ後の会話を「運に任せる」のではなく、
// 両ユーザーの心理データに基づいて最適な話題を提案する。
// Hinge研究: 最初の会話の質が関係の持続率を3倍にする。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { MatchingVector } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 会話ヒントの種類 */
export type GuidanceType =
  | "topic_suggestion"     // 話題提案
  | "timing_hint"          // タイミングヒント（相手のエネルギー状態）
  | "depth_nudge"          // 深堀り提案
  | "caution"              // 注意（この話題は避けた方がいいかも）
  | "growth_opportunity";  // 成長エッジに関する話題

/** 会話ガイダンス */
export interface ConversationHint {
  /** ヒントの種類 */
  type: GuidanceType;
  /** 表示テキスト（短い、Animaの口調） */
  text: string;
  /** 詳細（タップで展開） */
  detail: string | null;
  /** 表示優先度 */
  priority: number;
  /** 表示条件（文脈依存） */
  trigger: string;
}

/** 会話の文脈 */
export interface ConversationContext {
  /** 自分のベクトル */
  selfVector: MatchingVector;
  /** 相手のベクトル */
  otherVector: MatchingVector;
  /** 会話の数 */
  messageCount: number;
  /** 相手の最終メッセージ時刻 */
  otherLastMessageHour: number | null;
  /** 関係のアーキタイプ */
  archetype: string;
  /** 成長エッジの軸 */
  growthEdgeAxis: string | null;
  /** 相手のInner Weather（あれば） */
  otherWeather: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Hint Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 現在の会話文脈に基づいてヒントを生成
 */
export function generateConversationHints(
  ctx: ConversationContext,
): ConversationHint[] {
  const hints: ConversationHint[] = [];

  // ─── タイミングヒント ───
  if (ctx.otherLastMessageHour !== null) {
    if (ctx.otherLastMessageHour >= 23 || ctx.otherLastMessageHour < 5) {
      hints.push({
        type: "timing_hint",
        text: "相手は深夜にメッセージを送っている。エネルギーが低い可能性",
        detail: "軽い話題か、短い返事でも大丈夫な雰囲気を作ると良い",
        priority: 0.8,
        trigger: "late_night_message",
      });
    }
  }

  if (ctx.otherWeather === "stormy" || ctx.otherWeather === "rainy") {
    hints.push({
      type: "timing_hint",
      text: "相手の心の天気が荒れ模様。聞き手に回る日かもしれない",
      detail: null,
      priority: 0.85,
      trigger: "other_weather_bad",
    });
  }

  // ─── 初期会話の話題提案 ───
  if (ctx.messageCount < 10) {
    const gapAxis = findLargestGap(ctx.selfVector, ctx.otherVector);
    if (gapAxis) {
      hints.push({
        type: "topic_suggestion",
        text: `「${AXIS_TOPIC_MAP[gapAxis] ?? gapAxis}」について聞いてみると、新しい一面が見えるかも`,
        detail: "この領域であなたと相手は異なるスタイルを持っている。違いを知ることが深まりのきっかけになる",
        priority: 0.7,
        trigger: "early_conversation_topic",
      });
    }
  }

  // ─── 成長エッジの話題 ───
  if (ctx.growthEdgeAxis && ctx.messageCount >= 5) {
    hints.push({
      type: "growth_opportunity",
      text: `この人の強みはあなたの成長エッジ。さりげなく聞いてみて`,
      detail: `「${AXIS_TOPIC_MAP[ctx.growthEdgeAxis] ?? ctx.growthEdgeAxis}」について相手がどう考えているか。その答えに、あなたが学べるものがある`,
      priority: 0.75,
      trigger: "growth_edge_topic",
    });
  }

  // ─── 深堀りナッジ ───
  if (ctx.messageCount >= 15 && ctx.messageCount % 10 === 0) {
    hints.push({
      type: "depth_nudge",
      text: "会話が安定してきた。もう一段深い話題に踏み込んでみる？",
      detail: "「最近、自分でも驚いた選択は？」のような質問が、新しい層を開く",
      priority: 0.6,
      trigger: "depth_nudge_periodic",
    });
  }

  // ─── 注意 ───
  if (
    Math.abs(ctx.selfVector.conflict_directness - ctx.otherVector.conflict_directness) > 0.5 &&
    ctx.messageCount >= 10
  ) {
    hints.push({
      type: "caution",
      text: "意見が合わないとき、伝え方に注意。相手は衝突に敏感かも",
      detail: "あなたと相手は衝突スタイルが異なる。直接的な指摘より、質問形式で伝えると受け取りやすい",
      priority: 0.65,
      trigger: "conflict_style_gap",
    });
  }

  return hints.sort((a, b) => b.priority - a.priority).slice(0, 2);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 最も差異が大きい軸を特定（話題として最も興味深い） */
function findLargestGap(
  a: MatchingVector,
  b: MatchingVector,
): keyof MatchingVector | null {
  let maxGap = 0;
  let maxAxis: keyof MatchingVector | null = null;

  for (const axis of Object.keys(a) as (keyof MatchingVector)[]) {
    const gap = Math.abs(a[axis] - b[axis]);
    if (gap > maxGap && gap > 0.3) {
      maxGap = gap;
      maxAxis = axis;
    }
  }

  return maxAxis;
}

/** 軸IDを会話用の話題に変換 */
const AXIS_TOPIC_MAP: Record<string, string> = {
  conversation_temperature: "普段の会話のテンポ",
  distance_need: "一人の時間と一緒の時間のバランス",
  depth_speed: "新しい人と打ち解ける速さ",
  stability_need: "変化と安定、どちらを好むか",
  stimulation_need: "刺激を求める度合い",
  initiative: "リードする側か、される側か",
  emotional_openness: "感情の表現の仕方",
  conflict_directness: "意見が合わないときの対処法",
  social_energy: "大勢と少人数、どちらが心地いいか",
  structure_preference: "計画と即興、どちらが好きか",
};
