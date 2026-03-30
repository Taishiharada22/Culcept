// lib/stargazer/crossAxisPatterns.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cross-Axis Pattern Engine（軸間パターンエンジン）
//
// 2-3軸の組み合わせから生まれる「交差点のインサイト」を生成。
// 単一軸では見えない、軸の相互作用パターンを捉える。
//
// 例: 「大胆(+0.7) × 分析的(-0.5)」→
//   行動は速いが直感的。根拠の言語化が苦手な可能性。
//
// 設計原則:
// - 各パターンに心理学的根拠を持たせる
// - スコアの方向（+/-）と強度の両方を考慮
// - 閾値を超えた軸ペアのみインサイトを生成（ノイズ排除）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";

// ── 型定義 ──

export interface CrossAxisInsight {
  /** パターンID */
  id: string;
  /** 関与する軸 */
  axes: TraitAxisKey[];
  /** パターンの強度 (0-1) */
  strength: number;
  /** インサイトテキスト（日本語） */
  insight: string;
  /** 日常での現れ方 */
  manifestation: string;
  /** この組み合わせの強みとして読む場合 */
  asStrength: string;
  /** この組み合わせの注意点として読む場合 */
  asCaution: string;
  /** 深度 */
  depth: "surface" | "intermediate" | "deep";
  /** 心理学的根拠 */
  citation: string;
}

/** パターン定義 */
interface PatternRule {
  id: string;
  axis1: TraitAxisKey;
  axis1Direction: "positive" | "negative"; // positive = right label側, negative = left label側
  axis2: TraitAxisKey;
  axis2Direction: "positive" | "negative";
  /** 両軸の最低スコア強度（この閾値以下は発火しない） */
  minStrength: number;
  insight: string;
  manifestation: string;
  asStrength: string;
  asCaution: string;
  citation: string;
}

// ── パターン定義（心理学的根拠付き）──

const CROSS_AXIS_PATTERNS: PatternRule[] = [
  // ── 認知 × 行動 ──
  {
    id: "bold_intuitive",
    axis1: "cautious_vs_bold", axis1Direction: "positive",
    axis2: "analytical_vs_intuitive", axis2Direction: "positive",
    minStrength: 0.3,
    insight: "直感と大胆さが組み合わさっている。ひらめきで即行動に移せるが、根拠の言語化が追いつかないことがある。",
    manifestation: "会議で「なんとなくこっちが正しい」と確信を持つが、理由を聞かれると困る場面。",
    asStrength: "スピード感のある意思決定。他の人が迷っている間に先に動ける。",
    asCaution: "根拠なき確信が周囲の信頼を削ることがある。「なぜ？」に答える準備を。",
    citation: "Dual-process theory (Kahneman, 2011) — System 1 dominance pattern",
  },
  {
    id: "cautious_analytical",
    axis1: "cautious_vs_bold", axis1Direction: "negative",
    axis2: "analytical_vs_intuitive", axis2Direction: "negative",
    minStrength: 0.3,
    insight: "慎重さと分析力の組み合わせ。判断の精度は高いが、完璧を求めて動き出しが遅れやすい。",
    manifestation: "「もう少しデータが欲しい」と言い続けて、締め切りが迫る場面。",
    asStrength: "リスクを見逃さない。重要な意思決定では最も信頼される存在。",
    asCaution: "分析麻痺（Analysis Paralysis）に陥りやすい。80%の確信で動く練習を。",
    citation: "Perfectionism and decision delay (Frost et al., 1990)",
  },

  // ── 社交 × 感情 ──
  {
    id: "extrovert_variable",
    axis1: "introvert_vs_extrovert", axis1Direction: "positive",
    axis2: "emotional_variability", axis2Direction: "positive",
    minStrength: 0.3,
    insight: "社交的だが感情の波が大きい。周囲を巻き込むエネルギーがある反面、感情的な消耗も激しい。",
    manifestation: "盛り上がった後に急に疲れて一人になりたくなる。テンションの落差に自分でも驚く。",
    asStrength: "場の空気を変える力がある。感情の豊かさが人を惹きつける。",
    asCaution: "エネルギーの波に周囲が振り回される可能性。自分のリズムを知ることが大切。",
    citation: "Extraversion × Neuroticism interaction (Costa & McCrae, 1992)",
  },
  {
    id: "introvert_stable",
    axis1: "introvert_vs_extrovert", axis1Direction: "negative",
    axis2: "emotional_variability", axis2Direction: "negative",
    minStrength: 0.3,
    insight: "内向的で感情が安定している。静かな強さを持ち、ブレない軸がある。ただし感情を外に出さないため、周囲から理解されにくいことがある。",
    manifestation: "本当は気にしているのに「大丈夫」と言ってしまう。助けを求めるタイミングを逃しやすい。",
    asStrength: "危機的状況でも冷静。チームの安定剤になれる。",
    asCaution: "感情を抑え込みすぎると、ある日突然限界を迎えることがある。",
    citation: "Introversion × Emotional Stability (Eysenck, 1967)",
  },

  // ── 関係性 × 自立 ──
  {
    id: "harmony_reassurance",
    axis1: "independence_vs_harmony", axis1Direction: "positive",
    axis2: "reassurance_need", axis2Direction: "positive",
    minStrength: 0.3,
    insight: "調和を求めながら安心の確認も必要とする。相手に合わせすぎて自分の本音を見失うリスクがある。",
    manifestation: "「本当にこれでいい？」と何度も確認してしまう。相手の表情の変化に敏感。",
    asStrength: "相手の気持ちに寄り添える共感力。関係を大切にする姿勢。",
    asCaution: "自分の意見を持つことへの恐れがないか。相手に依存しすぎていないか確認を。",
    citation: "Anxious attachment × agreeableness interaction (Bartholomew, 1991)",
  },
  {
    id: "independent_direct",
    axis1: "independence_vs_harmony", axis1Direction: "negative",
    axis2: "direct_vs_diplomatic", axis2Direction: "negative",
    minStrength: 0.3,
    insight: "独立心が強く率直。自分の考えを明確に持ち、はっきり伝える。ただし関係のメンテナンスが手薄になりやすい。",
    manifestation: "正論を言って場が凍る。自分は正しいのに、なぜか距離を置かれる。",
    asStrength: "嘘のない関係を築ける。信頼できると思われやすい。",
    asCaution: "「正しいこと」と「伝わること」は違う。相手の受け取り方への想像力を。",
    citation: "Dominance × low agreeableness (Interpersonal Circumplex, Wiggins 1995)",
  },

  // ── 計画 × 変化 ──
  {
    id: "plan_resist_change",
    axis1: "plan_vs_spontaneous", axis1Direction: "negative",
    axis2: "change_embrace_vs_resist", axis2Direction: "positive",
    minStrength: 0.3,
    insight: "計画的で変化に慎重。安定した環境で力を発揮するが、想定外の変化に対するストレスが大きい。",
    manifestation: "予定が急に変わると強い不快感。「言ってくれればよかったのに」が口癖。",
    asStrength: "確実に成果を出す力。プロジェクト管理の才能。",
    asCaution: "変化は避けられない。小さな変化から慣れる練習を意識的に。",
    citation: "Conscientiousness × Openness interaction (DeYoung et al., 2007)",
  },
  {
    id: "spontaneous_embrace",
    axis1: "plan_vs_spontaneous", axis1Direction: "positive",
    axis2: "change_embrace_vs_resist", axis2Direction: "negative",
    minStrength: 0.3,
    insight: "即興的で変化を歓迎する。新しい状況への適応が速いが、長期的なコミットメントが苦手な傾向。",
    manifestation: "新しいことを始めるのは得意だが、続けるのが苦手。引っ越しや転職の回数が多い。",
    asStrength: "変化の時代に最も適応力がある。スタートアップ向き。",
    asCaution: "「飽き」と「成長の限界」を混同していないか。深める選択も時には必要。",
    citation: "Sensation Seeking × Low Conscientiousness (Zuckerman, 1994)",
  },

  // ── 表現 × 質 ──
  {
    id: "expression_quality",
    axis1: "function_vs_expression", axis1Direction: "positive",
    axis2: "quality_vs_quantity", axis2Direction: "negative",
    minStrength: 0.3,
    insight: "表現へのこだわりと質への追求が組み合わさっている。作品やアウトプットに妥協しないが、完成までに時間がかかる。",
    manifestation: "メールの文面を30分推敲する。プレゼン資料のフォント選びで1時間。",
    asStrength: "クオリティの高いアウトプットを出せる。美意識がプロフェッショナリズムにつながる。",
    asCaution: "完璧主義が生産性を下げることがある。「good enough」を受け入れる練習を。",
    citation: "Aesthetic sensitivity × conscientiousness (Openness subfacet interaction)",
  },

  // ── ストレス × 対人 ──
  {
    id: "stress_isolate_regulation_low",
    axis1: "stress_isolation_vs_social", axis1Direction: "negative",
    axis2: "emotional_regulation", axis2Direction: "negative",
    minStrength: 0.3,
    insight: "ストレス時に一人で抱え込みやすく、感情調整も難しい。孤立と感情の悪循環に陥りやすいパターン。",
    manifestation: "辛い時ほど人に言えない。一人で考え続けて、気づいたら深夜。",
    asStrength: "自分と向き合う力がある。内省の深さは他にない武器。",
    asCaution: "「助けを求める」は弱さではない。信頼できる1人に話すだけで変わることがある。",
    citation: "Withdrawal coping × emotion dysregulation (Gross, 1998; Nolen-Hoeksema, 1991)",
  },

  // ── 境界 × コントロール ──
  {
    id: "boundary_weak_control_high",
    axis1: "boundary_awareness", axis1Direction: "negative",
    axis2: "control_tendency", axis2Direction: "positive",
    minStrength: 0.25,
    insight: "自分の境界が曖昧なのに、相手をコントロールしようとする傾向。関係性で摩擦が生まれやすいパターン。",
    manifestation: "「あなたのためを思って」と言いながら、実は自分の不安を解消しようとしている。",
    asStrength: "関係に深くコミットする意欲がある。ケアの気持ち自体は本物。",
    asCaution: "自分の不安と相手のニーズを分離する練習が重要。境界線の明確化が関係を守る。",
    citation: "Anxious attachment × control behavior (Bowlby, 1988)",
  },
];

// ── メイン関数 ──

/**
 * 軸スコアから Cross-Axis インサイトを生成
 *
 * @param axisScores - 現在の軸スコア
 * @param maxInsights - 返す最大インサイト数 (default: 3)
 */
export function generateCrossAxisInsights(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  maxInsights = 3,
): CrossAxisInsight[] {
  const results: CrossAxisInsight[] = [];

  for (const pattern of CROSS_AXIS_PATTERNS) {
    const score1 = axisScores[pattern.axis1];
    const score2 = axisScores[pattern.axis2];
    if (score1 === undefined || score2 === undefined) continue;

    // 方向チェック: positive = score > 0, negative = score < 0
    const dir1Match = pattern.axis1Direction === "positive" ? score1 > 0 : score1 < 0;
    const dir2Match = pattern.axis2Direction === "positive" ? score2 > 0 : score2 < 0;
    if (!dir1Match || !dir2Match) continue;

    // 強度チェック
    const strength1 = Math.abs(score1);
    const strength2 = Math.abs(score2);
    if (strength1 < pattern.minStrength || strength2 < pattern.minStrength) continue;

    // パターン強度: 両軸の強度の幾何平均
    const strength = Math.sqrt(strength1 * strength2);

    // 深度判定
    let depth: CrossAxisInsight["depth"];
    if (strength >= 0.6) depth = "deep";
    else if (strength >= 0.4) depth = "intermediate";
    else depth = "surface";

    results.push({
      id: pattern.id,
      axes: [pattern.axis1, pattern.axis2],
      strength,
      insight: pattern.insight,
      manifestation: pattern.manifestation,
      asStrength: pattern.asStrength,
      asCaution: pattern.asCaution,
      depth,
      citation: pattern.citation,
    });
  }

  // 強度の降順で返す
  return results
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxInsights);
}
