// lib/genome/conversationIntelligence.ts
// Aneurasync の核心: 相手の深層データから会話インサイトを動的に生成
// LINEにもiMessageにもWhatsAppにも絶対に真似できない機能

import type { GenomeCardData } from "./cardTypes";

/** 会話インサイト — チャット画面に表示される相手への理解 */
export interface ConversationInsight {
  /** 会話スタイルヒント: この人はどう話されたいか */
  communicationStyle: {
    label: string;
    hint: string;
  };
  /** 地雷警告: この話題は避けたほうがいい */
  landmines: string[];
  /** 褒め方のコツ: この人が一番嬉しい褒められ方 */
  bestCompliment: string | null;
  /** 今の気分予測: 時間帯×性格パターンから推測 */
  moodHint: string | null;
  /** 会話の深め方: 次のレベルへの話題提案 */
  deepeningTopics: string[];
  /** 関係の共鳴ポイント: 2人の共通点 */
  resonancePoints: string[];
}

type Radar = { analytical: number; cautious: number; social: number; expressive: number; independent: number };

/**
 * 相手のGenomeCardDataから会話インサイトを生成
 * @param theirCard 相手のカードデータ
 * @param myCard 自分のカードデータ（比較用）
 */
export function generateConversationInsights(
  theirCard: GenomeCardData,
  myCard?: GenomeCardData | null,
): ConversationInsight {
  const theirRadar = theirCard.cardBack?.radarAxes;
  const myRadar = myCard?.cardBack?.radarAxes;

  return {
    communicationStyle: deriveCommunicationStyle(theirRadar),
    landmines: deriveLandmines(theirCard),
    bestCompliment: deriveBestCompliment(theirRadar),
    moodHint: deriveMoodHint(theirRadar),
    deepeningTopics: deriveDeepening(theirCard, myCard),
    resonancePoints: deriveResonance(theirRadar, myRadar),
  };
}

// ── 会話スタイル ──
function deriveCommunicationStyle(radar: Radar | null | undefined): { label: string; hint: string } {
  if (!radar) return { label: "様子見中", hint: "まずは軽い話題から始めてみて" };

  const { analytical, cautious, social, expressive, independent } = radar;

  // 最も強い特性に基づいてスタイルを導出
  if (analytical > 70 && cautious > 60) {
    return { label: "論理型", hint: "結論から話すと伝わりやすい。「なぜ？」に答えられる根拠があると安心する" };
  }
  if (social > 70 && expressive > 60) {
    return { label: "共感型", hint: "まず気持ちに寄り添って。正しさより「わかるよ」が嬉しい" };
  }
  if (independent > 70 && analytical > 55) {
    return { label: "自律型", hint: "アドバイスより質問を。「あなたはどう思う？」が効く" };
  }
  if (expressive > 70) {
    return { label: "表現型", hint: "リアクション大きめで。感想や感情を言葉にすると喜ぶ" };
  }
  if (cautious > 70) {
    return { label: "慎重型", hint: "急かさないで。考える時間を与えると、深い答えが返ってくる" };
  }
  if (social > 65) {
    return { label: "対話型", hint: "一方通行にならないように。質問を交互にすると心地いい" };
  }
  return { label: "バランス型", hint: "特に構えなくて大丈夫。自然体で話して" };
}

// ── 地雷 ──
function deriveLandmines(card: GenomeCardData): string[] {
  const mines: string[] = [];
  const back = card.cardBack;
  const radar = back?.radarAxes;

  // 禁句（アーキタイプ定義から）
  // cardBackにはforbiddenPhraseがないが、stressResponseから推測
  if (back?.stressResponse) {
    mines.push(`ストレス時: ${back.stressResponse.slice(0, 30)}...のときは距離を置いて`);
  }

  // レーダーからの地雷推定
  if (radar) {
    if (radar.independent > 75) mines.push("「みんなそうしてるよ」は逆効果");
    if (radar.analytical > 75) mines.push("感情論だけで説得しようとしないで");
    if (radar.cautious > 75) mines.push("「考えすぎ」と言わないで。考えることが安心材料");
    if (radar.expressive > 75) mines.push("「普通にすれば？」は絶対NG");
    if (radar.social < 30) mines.push("大人数の場に無理に誘わないで");
  }

  return mines.slice(0, 3);
}

// ── 褒め方 ──
function deriveBestCompliment(radar: Radar | null | undefined): string | null {
  if (!radar) return null;

  if (radar.analytical > 70) return "「その視点、考えたことなかった」— 思考の独自性を認める";
  if (radar.expressive > 70) return "「あなたのセンス好き」— 表現そのものを褒める";
  if (radar.independent > 70) return "「自分を持ってるよね」— 信念の強さを認める";
  if (radar.social > 70) return "「あなたといると安心する」— 存在自体を肯定する";
  if (radar.cautious > 70) return "「丁寧だよね」— 慎重さを弱さではなく美徳として認める";
  return "「あなたらしいね」— その人の個性を肯定する";
}

// ── 気分予測 ──
function deriveMoodHint(radar: Radar | null | undefined): string | null {
  if (!radar) return null;
  const hour = new Date().getHours();

  // 時間帯 × 性格パターン
  if (hour >= 23 || hour < 5) {
    if (radar.analytical > 60) return "深夜の分析モードかも。深い話ができるタイミング";
    if (radar.social < 40) return "ひとりの時間を楽しんでいるかも。軽めの話題が◎";
    return "夜更かし中。テンション高いか、逆に沈んでるか、どちらか";
  }
  if (hour >= 7 && hour < 10) {
    if (radar.cautious > 60) return "朝は計画モード。軽い挨拶から入るのが吉";
    return "朝のテンション。短めのメッセージが嬉しいかも";
  }
  if (hour >= 12 && hour < 14) {
    return "昼休みかも。リラックスした雰囲気で話せるタイミング";
  }
  if (hour >= 17 && hour < 20) {
    if (radar.social > 60) return "仕事終わりで話したいモードかも";
    if (radar.independent > 65) return "ひとりの充電時間かも。返信が遅くても気にしないで";
  }
  return null;
}

// ── 深め方 ──
function deriveDeepening(theirCard: GenomeCardData, myCard?: GenomeCardData | null): string[] {
  const topics: string[] = [];
  const back = theirCard.cardBack;

  // 相手の強みについて聞く
  if (back?.strengths && back.strengths.length > 0) {
    topics.push(`「${back.strengths[0]}」について、もっと聞いてみて`);
  }

  // 相手の矛盾について共感する
  if (theirCard.personalInsights && theirCard.personalInsights.length > 0) {
    topics.push("「実は自分も似たようなことで悩んでる」と打ち明けてみて");
  }

  // 共通のテンションがある場合
  if (myCard?.cardBack?.radarAxes && back?.radarAxes) {
    const axes: (keyof Radar)[] = ["analytical", "cautious", "social", "expressive", "independent"];
    const labels: Record<string, string> = {
      analytical: "物事の考え方", cautious: "リスクへの向き合い方",
      social: "人付き合い", expressive: "自己表現", independent: "自分の道"
    };
    for (const axis of axes) {
      if (Math.abs(myCard.cardBack.radarAxes[axis] - back.radarAxes[axis]) < 10) {
        topics.push(`「${labels[axis]}」で共鳴してるかも。この話題で盛り上がれるはず`);
        break;
      }
    }
  }

  topics.push("「最近、自分について新しく気づいたことある？」と聞いてみて");
  return topics.slice(0, 3);
}

// ── 共鳴ポイント ──
function deriveResonance(mine: Radar | null | undefined, theirs: Radar | null | undefined): string[] {
  if (!mine || !theirs) return [];
  const points: string[] = [];

  const axes: { key: keyof Radar; label: string }[] = [
    { key: "analytical", label: "思考の深さ" },
    { key: "cautious", label: "リスクへの向き合い方" },
    { key: "social", label: "人との距離感" },
    { key: "expressive", label: "自己表現のスタイル" },
    { key: "independent", label: "自分の道の歩き方" },
  ];

  for (const { key, label } of axes) {
    const diff = Math.abs(mine[key] - theirs[key]);
    if (diff < 12) points.push(`${label}が似ている`);
    else if (diff > 35) points.push(`${label}で補い合える`);
  }

  return points.slice(0, 3);
}
