// lib/stargazer/traitCards.ts
// 特性カード — 45軸スコアから導出される、ユーザーが「今の自分」を一言で把握できるラベル群
// 明けの明星・推進力・実用主義・共感型 などの直感的タグ

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";

export interface TraitCard {
  id: string;
  label: string;
  description: string;
  /** どのような条件で発動するか */
  conditions: TraitCondition[];
  /** 観測深度（この特性を判定するのに必要な最低回答数） */
  minObservations: number;
  /** カテゴリ */
  category: "core" | "relational" | "emotional" | "motion" | "safety";
  /** 強度 (0-1, 条件マッチ度から算出) */
  strength?: number;
}

interface TraitCondition {
  axis: TraitAxisKey;
  /** 閾値（この値を超えたらマッチ） */
  threshold: number;
  /** 方向: 'above' = threshold以上, 'below' = threshold以下 */
  direction: "above" | "below";
  /** 条件の重み（複数条件の場合の重要度） */
  weight: number;
}

// ── 特性カード定義 ──

export const TRAIT_CARDS: TraitCard[] = [
  // ── Core ──
  {
    id: "pioneer",
    label: "開拓者",
    description: "変化を恐れず、新しい道を切り開く。未知への好奇心が原動力。",
    category: "core",
    minObservations: 3,
    conditions: [
      { axis: "change_embrace_vs_resist", threshold: -0.3, direction: "below", weight: 1 },
      { axis: "tradition_vs_novelty", threshold: 0.3, direction: "above", weight: 0.8 },
      { axis: "cautious_vs_bold", threshold: 0.2, direction: "above", weight: 0.6 },
    ],
  },
  {
    id: "anchor",
    label: "錨",
    description: "安定と継続を大切にする。周りが揺れても、自分のペースを崩さない。",
    category: "core",
    minObservations: 3,
    conditions: [
      { axis: "change_embrace_vs_resist", threshold: 0.3, direction: "above", weight: 1 },
      { axis: "emotional_regulation", threshold: 0.3, direction: "above", weight: 0.8 },
      { axis: "plan_vs_spontaneous", threshold: -0.2, direction: "below", weight: 0.6 },
    ],
  },
  {
    id: "strategist",
    label: "戦略家",
    description: "データと論理で道を選ぶ。直感に頼るより、確かな根拠を求める。",
    category: "core",
    minObservations: 3,
    conditions: [
      { axis: "analytical_vs_intuitive", threshold: -0.3, direction: "below", weight: 1 },
      { axis: "plan_vs_spontaneous", threshold: -0.2, direction: "below", weight: 0.7 },
      { axis: "perfectionist_vs_pragmatic", threshold: -0.2, direction: "below", weight: 0.5 },
    ],
  },
  {
    id: "spark",
    label: "閃き",
    description: "直感で動く。考えるより先に体が動く。ひらめきが最大の武器。",
    category: "core",
    minObservations: 3,
    conditions: [
      { axis: "analytical_vs_intuitive", threshold: 0.3, direction: "above", weight: 1 },
      { axis: "plan_vs_spontaneous", threshold: 0.2, direction: "above", weight: 0.7 },
      { axis: "cautious_vs_bold", threshold: 0.2, direction: "above", weight: 0.5 },
    ],
  },
  {
    id: "drive",
    label: "推進力",
    description: "大胆に行動し、周りを巻き込む。エネルギーの高さで場を動かす。",
    category: "core",
    minObservations: 3,
    conditions: [
      { axis: "cautious_vs_bold", threshold: 0.3, direction: "above", weight: 1 },
      { axis: "social_initiative", threshold: 0.3, direction: "above", weight: 0.8 },
      { axis: "introvert_vs_extrovert", threshold: 0.2, direction: "above", weight: 0.5 },
    ],
  },
  {
    id: "depth",
    label: "深潜",
    description: "量より質。広さより深さ。一つのことを徹底的に突き詰める。",
    category: "core",
    minObservations: 3,
    conditions: [
      { axis: "quality_vs_quantity", threshold: -0.3, direction: "below", weight: 1 },
      { axis: "introvert_vs_extrovert", threshold: -0.2, direction: "below", weight: 0.7 },
      { axis: "perfectionist_vs_pragmatic", threshold: -0.2, direction: "below", weight: 0.5 },
    ],
  },
  {
    id: "pragmatist",
    label: "実用主義",
    description: "完璧より前進。動きながら考える。実行力が強み。",
    category: "core",
    minObservations: 3,
    conditions: [
      { axis: "perfectionist_vs_pragmatic", threshold: 0.3, direction: "above", weight: 1 },
      { axis: "plan_vs_spontaneous", threshold: 0.1, direction: "above", weight: 0.5 },
    ],
  },

  // ── Relational ──
  {
    id: "empathizer",
    label: "共感型",
    description: "相手の気持ちに寄り添う。調和を大切にし、場の空気を読む。",
    category: "relational",
    minObservations: 3,
    conditions: [
      { axis: "independence_vs_harmony", threshold: 0.3, direction: "above", weight: 1 },
      { axis: "direct_vs_diplomatic", threshold: 0.2, direction: "above", weight: 0.8 },
      { axis: "individual_vs_social", threshold: 0.2, direction: "above", weight: 0.5 },
    ],
  },
  {
    id: "lone_wolf",
    label: "一匹狼",
    description: "自分の道を自分で決める。群れるより、独立した存在であることを選ぶ。",
    category: "relational",
    minObservations: 3,
    conditions: [
      { axis: "independence_vs_harmony", threshold: -0.3, direction: "below", weight: 1 },
      { axis: "individual_vs_social", threshold: -0.3, direction: "below", weight: 0.8 },
      { axis: "introvert_vs_extrovert", threshold: -0.2, direction: "below", weight: 0.5 },
    ],
  },
  {
    id: "bridge_builder",
    label: "橋渡し",
    description: "人と人を繋ぐ。距離感を自然に縮め、場を和ませる。",
    category: "relational",
    minObservations: 4,
    conditions: [
      { axis: "social_initiative", threshold: 0.3, direction: "above", weight: 1 },
      { axis: "introvert_vs_extrovert", threshold: 0.2, direction: "above", weight: 0.7 },
      { axis: "independence_vs_harmony", threshold: 0.2, direction: "above", weight: 0.6 },
    ],
  },
  {
    id: "guardian",
    label: "見守り型",
    description: "境界線を明確に意識し、相手の領域も尊重する。安全な距離感の番人。",
    category: "relational",
    minObservations: 4,
    conditions: [
      { axis: "boundary_awareness", threshold: 0.3, direction: "above", weight: 1 },
      { axis: "consent_maturity", threshold: 0.3, direction: "above", weight: 0.8 },
      { axis: "pressure_risk", threshold: -0.2, direction: "below", weight: 0.6 },
    ],
  },
  {
    id: "chameleon",
    label: "変幻自在",
    description: "関係性によって自分のモードが大きく変わる。相手に合わせた自分を自然に出せる。",
    category: "relational",
    minObservations: 4,
    conditions: [
      { axis: "relationship_mode_split", threshold: 0.3, direction: "above", weight: 1 },
      { axis: "public_private_gap", threshold: 0.3, direction: "above", weight: 0.7 },
    ],
  },

  // ── Emotional ──
  {
    id: "calm_water",
    label: "凪",
    description: "感情の波が穏やか。動じにくく、安定した内面を持つ。",
    category: "emotional",
    minObservations: 3,
    conditions: [
      { axis: "emotional_regulation", threshold: 0.3, direction: "above", weight: 1 },
      { axis: "emotional_variability", threshold: -0.2, direction: "below", weight: 0.8 },
      { axis: "reassurance_need", threshold: -0.2, direction: "below", weight: 0.5 },
    ],
  },
  {
    id: "deep_current",
    label: "深流",
    description: "表には出さないが、内側に豊かな感情が流れている。処理に時間がかかることも。",
    category: "emotional",
    minObservations: 3,
    conditions: [
      { axis: "public_private_gap", threshold: 0.3, direction: "above", weight: 1 },
      { axis: "introvert_vs_extrovert", threshold: -0.2, direction: "below", weight: 0.7 },
      { axis: "emotional_variability", threshold: 0.1, direction: "above", weight: 0.5 },
    ],
  },
  {
    id: "seeker",
    label: "確認者",
    description: "安心を確認したい。「大丈夫」の一言が心の安定に大きく影響する。",
    category: "emotional",
    minObservations: 3,
    conditions: [
      { axis: "reassurance_need", threshold: 0.3, direction: "above", weight: 1 },
      { axis: "emotional_variability", threshold: 0.2, direction: "above", weight: 0.6 },
    ],
  },
  {
    id: "resilient",
    label: "立ち直る力",
    description: "傷ついても立ち直りが早い。感情の切り替えが上手い。",
    category: "emotional",
    minObservations: 3,
    conditions: [
      { axis: "emotional_regulation", threshold: 0.3, direction: "above", weight: 1 },
      { axis: "rejection_response_maturity", threshold: 0.3, direction: "above", weight: 0.8 },
    ],
  },

  // ── Motion ──
  {
    id: "minimalist",
    label: "ミニマリスト",
    description: "必要なものだけ。機能と合理性を追求し、余計なものを削ぎ落とす。",
    category: "motion",
    minObservations: 3,
    conditions: [
      { axis: "minimal_vs_maximal", threshold: -0.3, direction: "below", weight: 1 },
      { axis: "function_vs_expression", threshold: -0.2, direction: "below", weight: 0.7 },
    ],
  },
  {
    id: "expressionist",
    label: "表現者",
    description: "自分を表現することに喜びを感じる。見せることで自分を確認する。",
    category: "motion",
    minObservations: 3,
    conditions: [
      { axis: "function_vs_expression", threshold: 0.3, direction: "above", weight: 1 },
      { axis: "introvert_vs_extrovert", threshold: 0.2, direction: "above", weight: 0.6 },
    ],
  },

  // ── Safety ──
  {
    id: "respectful_navigator",
    label: "相手への配慮",
    description: "相手の「ノー」を自然に受け止められる。関係性の中で安全を生み出す存在。",
    category: "safety",
    minObservations: 5,
    conditions: [
      { axis: "rejection_response_maturity", threshold: 0.3, direction: "above", weight: 1 },
      { axis: "pressure_risk", threshold: -0.2, direction: "below", weight: 0.8 },
      { axis: "consent_maturity", threshold: 0.3, direction: "above", weight: 0.7 },
      { axis: "control_tendency", threshold: -0.2, direction: "below", weight: 0.6 },
    ],
  },
];

// ── 影の定義 ──

const TRAIT_SHADOWS: Record<string, TraitCardShadow> = {
  pioneer: {
    overexpression: "変化を求めすぎて安定を壊す。新しさへの渇望が、すでにある価値を見えなくさせる。",
    suppression: "本当は冒険したいのに「今のままでいい」と自分に言い聞かせている。挑戦しない自分への苛立ちが溜まる。",
    balanceHint: "変化と安定は敵同士ではない。「帰る場所」があるからこそ、遠くまで行ける。",
  },
  anchor: {
    overexpression: "安定を守ることが目的化し、必要な変化にも抵抗する。「変わらないこと」が正義になっている。",
    suppression: "本当は安定を求めているのに、それを弱さだと感じて無理に変化に飛び込む。",
    balanceHint: "安定は停滞ではない。根が深いからこそ、大きく枝を伸ばせる。",
  },
  strategist: {
    overexpression: "分析に時間をかけすぎて、行動のタイミングを逃す。完璧な判断を求めるあまり、判断しないことが最大のリスクになっている。",
    suppression: "論理的に考えたいのに「考えすぎ」と言われることで、直感に頼ろうとして不安が増す。",
    balanceHint: "データは意思決定の道具であって、意思決定そのものではない。80%の確信で動く練習をする。",
  },
  spark: {
    overexpression: "直感に頼りすぎて、根拠を求められた時に説明できない。ひらめきの正しさを証明できず、信頼を得にくい。",
    suppression: "直感を信じたいのに「ちゃんと考えろ」と言われ続け、自分の判断に自信が持てなくなっている。",
    balanceHint: "直感と論理は対立しない。直感で方向を決め、論理で確認する。両方使えるのが本当の強さ。",
  },
  drive: {
    overexpression: "推進力が強すぎて、周囲がついてこれない。「巻き込む」が「巻き込まれる」に変わるポイントを見逃しがち。",
    suppression: "本当は引っ張りたいのに、出しゃばりだと思われるのが怖くて力をセーブしている。",
    balanceHint: "力を出すことと、力の出し方を調整することは別のスキル。全力で走りつつ、振り返る余裕を持つ。",
  },
  depth: {
    overexpression: "深く掘りすぎて表面に戻れなくなる。一つのことへの執着が、視野を極端に狭めている。",
    suppression: "深く考えたいのに「早く結論を」と急かされ、表面的な答えしか出せない自分に苛立つ。",
    balanceHint: "深さは強み。でも時には「十分深い」と判断して浮上する勇気も深さの一部。",
  },
  pragmatist: {
    overexpression: "完成度を犠牲にして量を追いすぎる。「やった」という事実だけが積み上がり、質が伴わない。",
    suppression: "動きたいのに完璧を求める自分が足を引っ張る。スタートラインに立てないまま疲弊する。",
    balanceHint: "60%で出して改善するか、100%を目指して出さないか。正解はない。場面で使い分ける知恵を持つ。",
  },
  empathizer: {
    overexpression: "相手に合わせすぎて自分を見失う。「あなたはどう思う？」と聞かれると困る。",
    suppression: "共感したいのに、それが弱さだと感じて壁を作っている。本当は寄り添いたいのに距離を取る。",
    balanceHint: "共感は強さ。ただし、自分の感情と相手の感情を区別する技術を磨くと、もっと楽になる。",
  },
  lone_wolf: {
    overexpression: "独立を追求するあまり、本当に必要な助けも拒む。一人でいることが「強さ」の証明になっている。",
    suppression: "本当は一人がいいのに、孤立を恐れて無理に社交的に振る舞い、疲弊する。",
    balanceHint: "孤独と孤立は違う。一人の時間を愛しつつ、必要な時に手を伸ばせることが本当の自立。",
  },
  bridge_builder: {
    overexpression: "人と人を繋ぐことに忙しく、自分自身の居場所がない。常に「間」にいて、どこにも属さない。",
    suppression: "繋げる力があるのに、それを発揮すると目立ちすぎると感じて控えている。",
    balanceHint: "橋は両岸に支えられて立つ。あなた自身がしっかり「どこか」に立っているからこそ、橋を架けられる。",
  },
  guardian: {
    overexpression: "境界線を引きすぎて壁になっている。安全だが、誰も入ってこれない。",
    suppression: "境界を引きたいのに「冷たい」と思われるのが怖くて、無理に受け入れてしまう。",
    balanceHint: "境界線は関係性を守るための道具。壁ではなくドア——開け閉めできるもの。",
  },
  chameleon: {
    overexpression: "あまりに変わりすぎて、「本当の自分」が分からなくなる。全てが演技に感じられる。",
    suppression: "本当は相手に合わせたいのに「自分を持て」と言われ、不自然な一貫性を演じている。",
    balanceHint: "変わることは嘘ではない。水は容器に合わせて形を変えるが、水であることは変わらない。",
  },
  calm_water: {
    overexpression: "感情を抑えすぎて鈍麻する。何を感じているか自分でも分からなくなる。",
    suppression: "本当は穏やかでいたいのに、「もっと感情を出せ」と求められてストレスを感じる。",
    balanceHint: "凪は強さ。でも海の下に流れがあるように、穏やかさの下に豊かな感情があることを忘れない。",
  },
  deep_current: {
    overexpression: "内に溜め込みすぎて、ある日突然あふれ出す。制御できない感情の爆発に自分が一番驚く。",
    suppression: "深い感情を持つ自分を「面倒くさい」と否定し、表面的な反応で済ませようとする。",
    balanceHint: "深い感情は宝物。ただし、定期的に少しずつ表に出す練習をすると、爆発を防げる。",
  },
  seeker: {
    overexpression: "確認を求めすぎて相手を疲弊させる。安心が一時的にしか持たず、すぐ次の確認が必要になる。",
    suppression: "確認したいのに「重い」と思われるのが怖くて我慢し、不安だけが膨らんでいく。",
    balanceHint: "確認は悪いことではない。ただし、外に求める安心と、内側から湧く安心の両方を育てていく。",
  },
  resilient: {
    overexpression: "立ち直りが早すぎて、傷を十分に癒さないまま次に進む。痛みを「処理済み」にする速度が速すぎる。",
    suppression: "本当は強いのに、「強がっている」と自分を疑い、もっと苦しむべきだと感じてしまう。",
    balanceHint: "回復力は才能。でも時には、痛みの中にしばらくいることが、より深い回復につながる。",
  },
  minimalist: {
    overexpression: "削ぎ落としすぎて、必要なものまで手放す。「持たない」ことへのこだわりが、新たな執着になっている。",
    suppression: "シンプルに生きたいのに、周囲の期待に合わせてモノや情報を溜め込んでしまう。",
    balanceHint: "最小限は手段であって目的ではない。「何を残すか」を選ぶ行為こそ、自分を知る行為。",
  },
  expressionist: {
    overexpression: "自己表現が目的化し、反応がないと不安になる。表現＝存在証明になっている。",
    suppression: "表現したいのに「目立ちたがり」と思われるのが怖くて、自分を抑え込んでいる。",
    balanceHint: "表現は呼吸と同じ。反応のためではなく、自分のために表現する時、最も力強い作品が生まれる。",
  },
  respectful_navigator: {
    overexpression: "相手を尊重しすぎて、自分の欲求を表明できない。「ノー」を受け止める力は高いが、「イエス」を伝える力が弱い。",
    suppression: "本当は境界を守りたいのに、「拒否すると嫌われる」という恐怖で押し切られてしまう。",
    balanceHint: "尊重は双方向。相手を尊重するのと同じだけ、自分自身も尊重する。",
  },
};

// ── 導出ロジック ──

export interface TraitCardShadow {
  /** この特性が過剰に働いた時に起きること */
  overexpression: string;
  /** この特性が抑圧された時に起きること */
  suppression: string;
  /** バランスのヒント */
  balanceHint: string;
}

export interface DerivedTraitCard extends TraitCard {
  strength: number;
  observationDepth: "deep" | "medium" | "shallow" | "unobserved";
  /** 影 — この特性の過剰/抑圧パターン */
  shadow?: TraitCardShadow;
}

/**
 * 45軸スコアと観測回数から特性カードを導出する
 */
export function deriveTraitCards(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  axisObservationCounts: Partial<Record<TraitAxisKey, number>> = {},
  totalObservations: number = 0
): DerivedTraitCard[] {
  const results: DerivedTraitCard[] = [];

  for (const card of TRAIT_CARDS) {
    // 観測回数チェック
    if (totalObservations < card.minObservations) continue;

    // 各条件のマッチ度を計算
    let totalWeight = 0;
    let matchedWeight = 0;
    let allConditionsMet = true;

    for (const cond of card.conditions) {
      const score = axisScores[cond.axis];
      if (score === undefined) {
        allConditionsMet = false;
        continue;
      }

      totalWeight += cond.weight;

      const meets =
        cond.direction === "above"
          ? score >= cond.threshold
          : score <= cond.threshold;

      if (meets) {
        // マッチ度は閾値からの距離に比例
        const distance =
          cond.direction === "above"
            ? score - cond.threshold
            : cond.threshold - score;
        const matchStrength = Math.min(1, distance / 0.5); // 0.5の差でmaxとする
        matchedWeight += cond.weight * (0.5 + 0.5 * matchStrength);
      } else {
        allConditionsMet = false;
      }
    }

    // 十分な条件がマッチしていればカード生成
    const matchRatio = totalWeight > 0 ? matchedWeight / totalWeight : 0;
    if (matchRatio < 0.5) continue; // 50%以上マッチで表示

    // 観測深度
    const relevantAxes = card.conditions.map((c) => c.axis);
    const avgObsCount =
      relevantAxes.reduce(
        (sum, axis) => sum + (axisObservationCounts[axis] || 0),
        0
      ) / relevantAxes.length;

    const depth: DerivedTraitCard["observationDepth"] =
      avgObsCount >= 5
        ? "deep"
        : avgObsCount >= 3
        ? "medium"
        : avgObsCount >= 1
        ? "shallow"
        : "unobserved";

    results.push({
      ...card,
      strength: matchRatio,
      observationDepth: depth,
      shadow: TRAIT_SHADOWS[card.id],
    });
  }

  // 強度順にソート
  return results.sort((a, b) => b.strength - a.strength);
}

/**
 * 未観測の領域を特定する
 */
export function getUnobservedAreas(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  axisObservationCounts: Partial<Record<TraitAxisKey, number>> = {}
): {
  axis: TraitAxisKey;
  label: string;
  category: string;
  suggestion: string;
}[] {
  const unobserved: {
    axis: TraitAxisKey;
    label: string;
    category: string;
    suggestion: string;
  }[] = [];

  for (const axisDef of TRAIT_AXES) {
    const count = axisObservationCounts[axisDef.id as TraitAxisKey] || 0;
    const score = axisScores[axisDef.id as TraitAxisKey];

    if (count < 2 || score === undefined) {
      const suggestions: Record<string, string> = {
        core: "もう少し会話を重ねると、判断の軸が見えてきます",
        relational: "対人関係の場面での反応を観測すると見えてきます",
        emotional: "感情が動く場面の観測が必要です",
        motion: "行動パターンの観測を重ねると明らかになります",
        aesthetic: "好みや美意識に関する場面が必要です",
        safety: "親密な関係での深い観測が必要です",
        relational_deep: "長期的な関係性の観測で見えてきます",
      };

      unobserved.push({
        axis: axisDef.id,
        label: `${axisDef.labelLeft} ↔ ${axisDef.labelRight}`,
        category: axisDef.category,
        suggestion: suggestions[axisDef.category] || "さらなる観測が必要です",
      });
    }
  }

  return unobserved;
}

/**
 * 文脈差を検出する — 同じ人が友達/恋愛/仕事でどう変わるか
 */
export interface ContextDifference {
  axis: TraitAxisKey;
  axisLabel: string;
  contexts: {
    context: string;
    contextLabel: string;
    score: number;
  }[];
  /** 文脈間のスコア差（最大 - 最小） */
  gap: number;
  /** この差分が意味すること */
  insight: string;
}

export function detectContextDifferences(
  contextScores: Record<string, Partial<Record<TraitAxisKey, number>>>
): ContextDifference[] {
  const contextLabels: Record<string, string> = {
    friends: "友達",
    friendship: "友人といる時",
    romance: "恋愛",
    romantic: "恋愛の場面",
    romantic_partner: "恋人といる時",
    partner: "パートナーといる時",
    work: "仕事",
    family: "家族",
    general: "一般",
    one_on_one: "二人きりの時",
    online: "オンラインの場面",
    spouse: "配偶者といる時",
    cocreation: "共創の場面",
    community: "コミュニティの中",
  };

  const differences: ContextDifference[] = [];
  const contexts = Object.keys(contextScores);
  if (contexts.length < 2) return [];

  for (const axisDef of TRAIT_AXES) {
    const axisId = axisDef.id as TraitAxisKey;
    const contextValues: { context: string; score: number }[] = [];

    for (const ctx of contexts) {
      const score = contextScores[ctx]?.[axisId];
      if (score !== undefined) {
        contextValues.push({ context: ctx, score });
      }
    }

    if (contextValues.length < 2) continue;

    const scores = contextValues.map((v) => v.score);
    const gap = Math.max(...scores) - Math.min(...scores);

    // 0.3以上の差がある場合のみ意味のある差として表示
    if (gap >= 0.3) {
      const insight = generateContextInsight(axisId, contextValues);

      differences.push({
        axis: axisId,
        axisLabel: `${axisDef.labelLeft} ↔ ${axisDef.labelRight}`,
        contexts: contextValues.map((v) => ({
          context: v.context,
          contextLabel: contextLabels[v.context] || (v.context === "undefined" || !v.context ? "ふだんの自分" : v.context.replace(/_/g, " ")),
          score: v.score,
        })),
        gap,
        insight,
      });
    }
  }

  // ギャップが大きい順
  return differences.sort((a, b) => b.gap - a.gap);
}

function generateContextInsight(
  axis: TraitAxisKey,
  values: { context: string; score: number }[]
): string {
  const sorted = [...values].sort((a, b) => a.score - b.score);
  const contextLabels: Record<string, string> = {
    friends: "友達",
    friendship: "友人といる時",
    romance: "恋愛",
    romantic: "恋愛の場面",
    romantic_partner: "恋人といる時",
    partner: "パートナーといる時",
    work: "仕事",
    family: "家族",
    general: "一般",
    one_on_one: "二人きりの時",
    online: "オンラインの場面",
    spouse: "配偶者といる時",
    cocreation: "共創の場面",
    community: "コミュニティの中",
  };

  const insights: Partial<Record<TraitAxisKey, string>> = {
    introvert_vs_extrovert: `${contextLabels[sorted[0].context]}では内向的、${contextLabels[sorted[sorted.length - 1].context]}では外向的な面が出る`,
    cautious_vs_bold: `${contextLabels[sorted[0].context]}では慎重だが、${contextLabels[sorted[sorted.length - 1].context]}では大胆になる`,
    reassurance_need: `${contextLabels[sorted[sorted.length - 1].context]}の場面では安心確認を求める傾向が強まる`,
    direct_vs_diplomatic: `${contextLabels[sorted[0].context]}では率直、${contextLabels[sorted[sorted.length - 1].context]}では配慮的に変わる`,
    emotional_regulation: `${contextLabels[sorted[0].context]}では感情コントロールが難しくなりやすい`,
    social_initiative: `${contextLabels[sorted[sorted.length - 1].context]}の場面で積極性が上がる`,
  };

  return insights[axis] || `場面によって${contextLabels[sorted[0].context]}と${contextLabels[sorted[sorted.length - 1].context]}で差が出る`;
}
