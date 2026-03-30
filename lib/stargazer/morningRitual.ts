// lib/stargazer/morningRitual.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 1: Morning Ritual — 朝の予感
//
// 毎朝30秒。予言1つ + 質問1つ + Alterの一言。
// ユーザーが毎朝開かずにいられない引力を作る。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";
import type { BeliefSet } from "./bayesianAxisUpdater";
import { rankQuestionsByEIG } from "./informationGain";
import {
  getVariantsByLayer,
  CONTINUOUS_OBSERVATION_AXES,
  type QuestionVariant,
} from "./questionVariants";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. 型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MorningRitualData {
  /** 今日の予言テキスト */
  prophecy: string;
  /** 予言の対象軸 */
  prophecyAxis: TraitAxisKey;
  /** EIG最大の1問 */
  question: QuestionVariant;
  /** Alterの挨拶（前日との差分を反映） */
  alterGreeting: string;
  /** 予言の確信度 */
  prophecyConfidence: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. 予言テンプレート（朝専用、簡潔版）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MorningProphecyTemplate {
  axis: TraitAxisKey;
  /** mu > 0 の時の予言 */
  positive: string;
  /** mu < 0 の時の予言 */
  negative: string;
}

const MORNING_PROPHECIES: MorningProphecyTemplate[] = [
  { axis: "introvert_vs_extrovert", negative: "今日は人との会話の後に、少し疲れを感じるかもしれない。それはあなたが深く聴いてる証拠。", positive: "今日は誰かと話すことで、予想外のエネルギーが湧いてくる。" },
  { axis: "emotional_variability", negative: "今日は感情が静かに流れる日。でも夕方、ふとした瞬間に何かが揺れる。", positive: "今日の感情は忙しい。朝と夜で全然違う自分がいる。どちらも本物。" },
  { axis: "cautious_vs_bold", negative: "今日、「やめておこう」と思う瞬間がある。でもその慎重さが、あなたを守ってくれる。", positive: "今日、直感的に「やってみよう」と思う瞬間がある。その衝動を信じていい。" },
  { axis: "plan_vs_spontaneous", negative: "今日は予定通りに進みたい気持ちが強い。崩れると少しイライラする。", positive: "今日は予定を崩してでもやりたいことが見つかる。流れに乗っていい。" },
  { axis: "boundary_awareness", negative: "今日、誰かとの距離感に少し敏感になる。無理に近づかなくていい。", positive: "今日は人との距離が自然に縮まる。その自然さを楽しんで。" },
  { axis: "stress_isolation_vs_social", negative: "今日ストレスを感じたら、少し一人になる時間を作って。あなたの処理方法は「静寂」だから。", positive: "今日何か辛いことがあったら、誰かに話して。あなたは話すことで整理されるタイプ。" },
  { axis: "analytical_vs_intuitive", negative: "今日の選択は、データを集めてから決めたくなる。その「もう少し調べたい」は正しい。", positive: "今日、理由は分からないけど「こっち」と感じる瞬間がある。その直感は信頼していい。" },
  { axis: "independence_vs_harmony", negative: "今日、誰かの意見に「それは違う」と思う瞬間がある。言うかどうかは別として、その感覚は大事。", positive: "今日、場の空気を読みすぎて疲れるかもしれない。たまには自分の気持ちを優先していい。" },
  { axis: "reassurance_need", negative: "今日は自分の判断に自信が持てる日。誰にも確認しなくていい。", positive: "今日、大切な人の一言が想像以上に響く。「大丈夫だよ」を求めていい。" },
  { axis: "intimacy_pace", negative: "今日は人との距離をゆっくり保ちたい日。急に近づかれると少し息苦しい。", positive: "今日は深い話がしたくなる日。表面的な会話では物足りない。" },
  { axis: "emotional_regulation", negative: "今日、感情を抑えてる自分に気づくかもしれない。たまには少し漏らしても大丈夫。", positive: "今日は感情がはっきり表に出る。それでいい。むしろ出した方が楽になる。" },
  { axis: "change_embrace_vs_resist", negative: "今日、何かを変えたい衝動が湧いても、一晩寝かせて。あなたの慎重さは正しい。", positive: "今日、現状維持に少し飽きを感じる。小さな変化を1つ試してみて。" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. 朝の儀式データ生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 朝の儀式データを生成
 *
 * @param beliefs         現在のベイズ信念
 * @param yesterdayScore  昨日の朝の質問への回答スコア（差分コメント用）
 * @param yesterdayAxis   昨日の質問の軸
 * @param dateSeed        日付シード（同じ日に同じ予言を返すため）
 */
export function generateMorningRitual(
  beliefs: BeliefSet,
  yesterdayScore?: number | null,
  yesterdayAxis?: TraitAxisKey | null,
  dateSeed?: string,
): MorningRitualData {
  const seed = dateSeed ?? new Date().toISOString().split("T")[0];

  // ── 予言選出: 最も確信度の高い軸から予言を選ぶ ──
  // 日付シードで決定論的に（同じ日に何度開いても同じ予言）
  const seedHash = hashString(seed);

  // 確信度上位5軸から日替わりで選択
  const axisStrengths = MORNING_PROPHECIES.map((t) => {
    const belief = beliefs[t.axis];
    return { template: t, strength: Math.abs(belief?.mu ?? 0) * Math.sqrt(belief?.precision ?? 0.5) };
  }).sort((a, b) => b.strength - a.strength);

  const topN = axisStrengths.slice(0, 5);
  const selected = topN[seedHash % topN.length];

  const direction = (beliefs[selected.template.axis]?.mu ?? 0) >= 0 ? "positive" : "negative";
  const prophecy = direction === "positive" ? selected.template.positive : selected.template.negative;
  const prophecyConfidence = beliefs[selected.template.axis]?.confidence ?? 0;

  // ── EIG最大の1問を選出 ──
  const stateVariants = getVariantsByLayer("state");
  const candidates = stateVariants
    .filter((v) => CONTINUOUS_OBSERVATION_AXES.includes(v.axisId))
    .map((v) => ({
      id: v.id,
      axisId: v.axisId,
      weight: 0.4,
    }));

  const ranked = rankQuestionsByEIG(candidates, beliefs);
  // 日替わりバリエーション: EIG上位3から日付で選択
  const topQuestions = ranked.slice(0, 3);
  const selectedQuestion = stateVariants.find(
    (v) => v.id === topQuestions[seedHash % topQuestions.length]?.questionId,
  ) ?? stateVariants[0];

  // ── Alterの挨拶 ──
  const alterGreeting = generateAlterGreeting(yesterdayScore, yesterdayAxis, beliefs);

  return {
    prophecy,
    prophecyAxis: selected.template.axis,
    question: selectedQuestion,
    alterGreeting,
    prophecyConfidence,
  };
}

function generateAlterGreeting(
  yesterdayScore?: number | null,
  yesterdayAxis?: TraitAxisKey | null,
  beliefs?: BeliefSet,
): string {
  if (yesterdayScore == null || !yesterdayAxis) {
    return "おはよう。今日も少し、あなたを知る時間。";
  }

  const todayBelief = beliefs?.[yesterdayAxis];
  if (!todayBelief) {
    return "おはよう。昨日の答え、覚えてるよ。";
  }

  // 昨日の回答と現在のmu（累積的な傾向）の一致度を見る
  const alignment = Math.sign(yesterdayScore) === Math.sign(todayBelief.mu);

  if (alignment) {
    return "おはよう。昨日の答えは、あなたらしかった。今日もそうかな？";
  }
  return "おはよう。昨日の答えは、いつものあなたとは少し違ってた。今日はどうだろう。";
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
