// lib/stargazer/uniqueStrengthDetector.ts
// ユニークな強みの検出 — 稀有な軸の組み合わせを「超能力」として発見する
// 心理学的根拠: CliftonStrengths（才能の交差点）、
// Csikszentmihalyi（フロー — 強みを使う時にフローが生まれる）

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";

// ── Types ──

export interface UniqueStrength {
  /** 組み合わせの名前（日本語） */
  name: string;
  /** 関わる軸 */
  axes: TraitAxisKey[];
  /** 組み合わせの稀有さ (0-1, 高いほど珍しい) */
  rarity: number;
  /** この組み合わせが生む能力 */
  superpower: string;
  /** フローが生まれる具体的な場面 */
  flowScenario: string;
  /** この強みを活かせる日常のヒント */
  dailyApplication: string;
  /** 注意点 — この強みが裏目に出る場面 */
  blindSpot: string;
}

export interface UniqueStrengthResult {
  /** 検出された固有の強み */
  strengths: UniqueStrength[];
  /** 全体サマリー */
  summary: string;
  /** レアリティスコア（全体的な特異性） */
  overallRarity: number;
  overallRarityLabel: string;
}

// ── Combination Definitions ──

interface StrengthPattern {
  name: string;
  axes: TraitAxisKey[];
  /** 各軸の必要スコア [軸, 閾値, 方向] */
  conditions: { axis: TraitAxisKey; threshold: number; above: boolean }[];
  superpower: string;
  flowScenario: string;
  dailyApplication: string;
  blindSpot: string;
  /** この組み合わせの基礎レアリティ */
  baseRarity: number;
}

const STRENGTH_PATTERNS: StrengthPattern[] = [
  {
    name: "理性的冒険者",
    axes: ["analytical_vs_intuitive", "cautious_vs_bold"],
    conditions: [
      { axis: "analytical_vs_intuitive", threshold: -0.3, above: false },
      { axis: "cautious_vs_bold", threshold: 0.3, above: true },
    ],
    superpower: "データに裏打ちされた大胆な意思決定ができる。根拠があるから迷わず動ける。周囲から見ると「勇敢かつ賢明」に映る。",
    flowScenario: "新しいプロジェクトのリスクを分析し、「これなら行ける」と確信を持って飛び込む瞬間",
    dailyApplication: "判断に迷った時は、まず3分で情報を整理し、その後は直感を信じて即決する",
    blindSpot: "分析と大胆さの両立に自信があるため、「自分の分析が間違っている可能性」を考えにくい",
    baseRarity: 0.75,
  },
  {
    name: "調和的挑戦者",
    axes: ["independence_vs_harmony", "cautious_vs_bold"],
    conditions: [
      { axis: "independence_vs_harmony", threshold: 0.3, above: true },
      { axis: "cautious_vs_bold", threshold: 0.3, above: true },
    ],
    superpower: "場の空気を読みながらも、大胆な提案ができる。「みんなのために一歩前に出る」タイプ。",
    flowScenario: "チームが行き詰まった時に、全員の気持ちを汲みつつも新しい方向を提案し、自然にリードする瞬間",
    dailyApplication: "人と一緒にいる場面で「空気を読みつつ、あえて言う」を意識する",
    blindSpot: "調和を保ちたいのに大胆に動くため、自分の中で葛藤が起きやすい。周囲はその内面の戦いに気づかない",
    baseRarity: 0.7,
  },
  {
    name: "深海の灯台",
    axes: ["introvert_vs_extrovert", "social_initiative"],
    conditions: [
      { axis: "introvert_vs_extrovert", threshold: -0.3, above: false },
      { axis: "social_initiative", threshold: 0.2, above: true },
    ],
    superpower: "内向的なのに人を惹きつける。静かな存在感で場を安定させる。「カリスマ内向型」。",
    flowScenario: "少人数の場で、落ち着いた語り口で深い話をし、全員が引き込まれる瞬間",
    dailyApplication: "大人数の場では無理せず、少人数の深い対話の場を自分から作る",
    blindSpot: "「内向的なのに社交的」という矛盾がエネルギーを消耗させる。一人の回復時間を意識的に確保する必要がある",
    baseRarity: 0.8,
  },
  {
    name: "情熱的建築家",
    axes: ["analytical_vs_intuitive", "emotional_variability"],
    conditions: [
      { axis: "analytical_vs_intuitive", threshold: 0.3, above: true },
      { axis: "emotional_variability", threshold: 0.3, above: true },
    ],
    superpower: "直感と感情の豊かさが合わさり、論理では到達できないクリエイティブな発想を生み出す。「感じて創る」タイプ。",
    flowScenario: "感情が動いた瞬間にひらめきが降り、それを形にしていく没頭の時間",
    dailyApplication: "感情が動いた時にすぐメモを取る習慣をつける。感情はアイデアの種",
    blindSpot: "感情の波とひらめきが連動するため、感情が落ちている時にクリエイティビティも落ちやすい",
    baseRarity: 0.7,
  },
  {
    name: "穏やかな破壊者",
    axes: ["emotional_regulation", "change_embrace_vs_resist"],
    conditions: [
      { axis: "emotional_regulation", threshold: 0.3, above: true },
      { axis: "change_embrace_vs_resist", threshold: -0.3, above: false },
    ],
    superpower: "感情的に安定したまま、既存の枠組みを壊せる。革命を起こしながら場を荒らさない。",
    flowScenario: "組織やプロジェクトの「当たり前」を冷静に疑い、穏やかに新しい提案をする瞬間",
    dailyApplication: "「なぜこうなっているのか」を一日一つだけ問いかけてみる",
    blindSpot: "冷静すぎて周囲が「本気で変えたいのか分からない」と感じることがある。情熱を意識的に見せる工夫が必要",
    baseRarity: 0.75,
  },
  {
    name: "直感的外交官",
    axes: ["analytical_vs_intuitive", "direct_vs_diplomatic"],
    conditions: [
      { axis: "analytical_vs_intuitive", threshold: 0.3, above: true },
      { axis: "direct_vs_diplomatic", threshold: 0.3, above: true },
    ],
    superpower: "直感で相手の本音を感じ取り、それを傷つけない形で言語化できる。人間関係のトラブルシューター。",
    flowScenario: "人間関係のもつれを、両者の本音を代弁することで解きほぐす瞬間",
    dailyApplication: "「この人は本当は何を言いたいのか」を感じ取る練習をする",
    blindSpot: "相手の気持ちを先回りしすぎて、相手が自分で気持ちを整理する機会を奪ってしまうことがある",
    baseRarity: 0.65,
  },
  {
    name: "計画的即興者",
    axes: ["plan_vs_spontaneous", "cautious_vs_bold"],
    conditions: [
      { axis: "plan_vs_spontaneous", threshold: -0.2, above: false },
      { axis: "cautious_vs_bold", threshold: 0.3, above: true },
    ],
    superpower: "計画を立てた上で、計画外の大胆な行動も取れる。「準備万端で冒険する」というハイブリッド型。",
    flowScenario: "綿密に準備したプレゼンの途中で、予想外の質問に対して即座にアドリブで切り返す瞬間",
    dailyApplication: "大きな予定は計画を立て、小さな予定は即興に任せる。「計画する領域」と「冒険する領域」を分ける",
    blindSpot: "計画と即興の切り替えにエネルギーを使うため、長時間続くと疲弊しやすい",
    baseRarity: 0.7,
  },
  {
    name: "境界線の魔術師",
    axes: ["boundary_awareness", "intimacy_pace"],
    conditions: [
      { axis: "boundary_awareness", threshold: 0.3, above: true },
      { axis: "intimacy_pace", threshold: 0.2, above: true },
    ],
    superpower: "境界線をしっかり引きながらも親密さを深められる。安全で深い関係性を構築する天才。",
    flowScenario: "新しい人との関係で、自然な距離感を保ちながらも信頼を深めていく過程",
    dailyApplication: "新しい関係では「ここまでは今日OK」という基準を自分の中で持つ",
    blindSpot: "境界線が明確すぎて、相手に「壁がある」と感じさせることがある。意図を言語化すると誤解が減る",
    baseRarity: 0.8,
  },
  {
    name: "質の錬金術師",
    axes: ["quality_vs_quantity", "perfectionist_vs_pragmatic"],
    conditions: [
      { axis: "quality_vs_quantity", threshold: -0.3, above: false },
      { axis: "perfectionist_vs_pragmatic", threshold: 0.2, above: true },
    ],
    superpower: "深い質を追求しながらも実用的に仕上げられる。完璧主義の罠に落ちずに高品質を出せる。",
    flowScenario: "作品やプロジェクトの質を高めつつも「ここで出す」という判断ができる瞬間",
    dailyApplication: "品質の「必須ライン」と「理想ライン」を事前に決めておく",
    blindSpot: "他の人の「十分な質」に対して無意識に物足りなさを感じる。基準の違いを受け入れる寛容さが必要",
    baseRarity: 0.75,
  },
];

// ── Detection ──

/**
 * 軸スコアから固有の強みを検出する
 */
export function detectUniqueStrengths(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): UniqueStrengthResult | null {
  const entries = Object.entries(axisScores) as [TraitAxisKey, number][];
  if (entries.length < 5) return null;

  const detected: UniqueStrength[] = [];

  for (const pattern of STRENGTH_PATTERNS) {
    const allMet = pattern.conditions.every((cond) => {
      const score = axisScores[cond.axis];
      if (score === undefined) return false;
      return cond.above ? score >= cond.threshold : score <= cond.threshold;
    });

    if (!allMet) continue;

    // Calculate actual rarity based on how extreme the scores are
    let strengthBonus = 0;
    for (const cond of pattern.conditions) {
      const score = axisScores[cond.axis] ?? 0;
      const excess = cond.above
        ? score - cond.threshold
        : cond.threshold - score;
      strengthBonus += Math.min(0.15, excess * 0.3);
    }

    const rarity = Math.min(0.99, pattern.baseRarity + strengthBonus);

    detected.push({
      name: pattern.name,
      axes: pattern.axes,
      rarity,
      superpower: pattern.superpower,
      flowScenario: pattern.flowScenario,
      dailyApplication: pattern.dailyApplication,
      blindSpot: pattern.blindSpot,
    });
  }

  if (detected.length === 0) return null;

  // Sort by rarity (most rare first)
  detected.sort((a, b) => b.rarity - a.rarity);

  const overallRarity =
    detected.reduce((s, d) => s + d.rarity, 0) / detected.length;
  const overallRarityLabel =
    overallRarity > 0.8
      ? "非常に稀有"
      : overallRarity > 0.6
        ? "珍しい"
        : "ユニーク";

  const strengthNames = detected.map((s) => `「${s.name}」`).join("と");
  const summary = `あなたの特性の組み合わせから、${strengthNames}という固有の強みが検出されました。これらは単独の軸では見えない、軸の交差点に生まれる「あなただけの超能力」です。`;

  return {
    strengths: detected,
    summary,
    overallRarity,
    overallRarityLabel,
  };
}
