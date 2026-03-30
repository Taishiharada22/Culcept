// lib/stargazer/transformSimulation.ts
// 変容シミュレーション — 「もし自分が変わったら」を体験させる
// 心理学的根拠: メンタルシミュレーション（prospection研究）、
// 可能的自己理論 (Markus & Nurius, 1986)

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import { safeLSSet } from "@/lib/safeLocalStorage";

export interface SimulationScenario {
  id: string;
  /** シナリオのタイトル */
  title: string;
  /** 状況の描写 */
  situation: string;
  /** 現在の自分の反応（予測） */
  currentResponse: string;
  /** 変容後の自分の反応（シミュレーション） */
  transformedResponse: string;
  /** 変化した軸 */
  changedAxis: TraitAxisKey;
  /** 変化の方向 */
  direction: "left" | "right";
  /** この変容がもたらす感情 */
  emotionalImpact: string;
  /** この変容のコスト（何を失うか） */
  cost: string;
}

interface ScenarioTemplate {
  axis: TraitAxisKey;
  title: string;
  situation: string;
  /** left = 左寄りに変容, right = 右寄りに変容 */
  direction: "left" | "right";
  currentTemplate: (label: string) => string;
  transformedTemplate: (label: string) => string;
  emotionalImpact: string;
  cost: string;
}

const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    axis: "cautious_vs_bold",
    title: "決断の瞬間",
    situation:
      "人生を変えるかもしれない選択肢が目の前にある。リスクはあるが、リターンも大きい。",
    direction: "right",
    currentTemplate: (l) =>
      `あなたは${l}な傾向があるため、リスクを詳細に分析し、安全を確認してから動く。結果、多くの機会を見送る。`,
    transformedTemplate: (l) =>
      `もしあなたが${l}になったら、不完全な情報でも「面白そうだ」と飛び込める。失敗するかもしれないが、それ自体が学びになる。`,
    emotionalImpact:
      "興奮と恐怖が同時に来る。心臓が速く打つが、それは生きている証拠。",
    cost: "安全網を手放す恐怖。失敗した時の痛みを受け入れる覚悟が必要。",
  },
  {
    axis: "introvert_vs_extrovert",
    title: "人との距離",
    situation:
      "久しぶりに大勢が集まるパーティに誘われた。知り合いは数人だけ。",
    direction: "right",
    currentTemplate: (l) =>
      `あなたは${l}な傾向があるため、断るか、行っても隅で静かに過ごす。深い関係は築けるが、新しい出会いの機会を逃しやすい。`,
    transformedTemplate: (l) =>
      `もしあなたが${l}になったら、知らない人にも話しかけ、表面的でもいいから繋がりを広げる。疲れるが、予想外の出会いが待っている。`,
    emotionalImpact:
      "消耗するが、同時に人間の多様さに驚く。世界が少し広がる感覚。",
    cost: "静かな時間の喪失。自分のペースを乱される不安。深さを犠牲にする覚悟。",
  },
  {
    axis: "perfectionist_vs_pragmatic",
    title: "不完全な提出",
    situation: "締め切りが迫っている。完成度は70%。出すか、延期するか。",
    direction: "right",
    currentTemplate: (l) =>
      `あなたは${l}な傾向があるため、完璧になるまで手を入れ続ける。品質は高いが、「完成」が遠い。`,
    transformedTemplate: (l) =>
      `もしあなたが${l}になったら、70%で出して反応を見る。不完全さが怖くなくなる代わりに、「最高の自分」の基準が変わる。`,
    emotionalImpact:
      "解放感と罪悪感が混ざる。でも、世界は70%の自分も受け入れることを知る。",
    cost:
      "「最高品質」というアイデンティティの一部を手放すこと。",
  },
  {
    axis: "independence_vs_harmony",
    title: "意見の衝突",
    situation:
      "チームの方向性について、あなたの意見は多数派と異なる。発言するか、黙るか。",
    direction: "left",
    currentTemplate: (l) =>
      `あなたは${l}な傾向があるため、場の雰囲気を壊さないよう、自分の意見を飲み込みやすい。`,
    transformedTemplate: (l) =>
      `もしあなたが${l}になったら、「違う意見を持つ自分」を堂々と表明する。対立は怖いが、偽りの調和よりも本物の議論を選ぶ。`,
    emotionalImpact:
      "最初は震えるが、自分の声を聞いた瞬間、「これが自分だ」と感じる。",
    cost:
      "「いい人」でいられなくなるかもしれない恐怖。関係性の変化。",
  },
  {
    axis: "stress_isolation_vs_social",
    title: "傷ついた夜",
    situation:
      "深く傷つくことがあった。一人になりたいのか、誰かに話したいのか。",
    direction: "right",
    currentTemplate: (l) =>
      `あなたは${l}な傾向があるため、一人で傷を処理しようとする。強さの証明でもあるが、孤独が長引く。`,
    transformedTemplate: (l) =>
      `もしあなたが${l}になったら、信頼できる人に「助けて」と言える。弱さを見せることが、実は最も勇気ある行動だと知る。`,
    emotionalImpact:
      "脆弱性を見せる恐怖。でもその後に来る温かさは、一人では得られないもの。",
    cost:
      "「自分で解決できる人」というセルフイメージの揺らぎ。",
  },
  {
    axis: "attachment_style",
    title: "返事が来ない夜",
    situation:
      "大切な人にメッセージを送って3時間。既読はついたが返事が来ない。",
    direction: "left",
    currentTemplate: (l) =>
      `あなたは${l}な傾向があるため、「嫌われたかもしれない」と不安が膨らむか、「別にいい」と感情を閉じるかのどちらかに振れやすい。`,
    transformedTemplate: (l) =>
      `もし安定型（${l}）に近づいたら、「相手にも事情がある」と自然に思え、自分の時間を楽しく過ごせる。不安が来ても、それを認めて手放せる。`,
    emotionalImpact:
      "穏やかな信頼感。相手の不在が自分の価値を脅かさない安心。",
    cost:
      "「過敏であること」は一種の情報収集でもある。鈍感になるのではなく、感度を保ちつつ安定する難しさ。",
  },
  {
    axis: "rumination_tendency",
    title: "終わらない反省",
    situation:
      "会議で言葉を選び間違えた。その後ずっと、あの発言が頭の中をループしている。",
    direction: "left",
    currentTemplate: (l) =>
      `あなたは${l}な傾向があるため、同じシーンを何度も再生し、「もっと上手く言えたはずだ」と自分を責め続ける。`,
    transformedTemplate: (l) =>
      `もしあなたが${l}に近づいたら、失敗を確認したらそれを手放せる。反省は1度で十分。残りのエネルギーを次の行動に使える。`,
    emotionalImpact:
      "脳内が静かになる体験。「もう考えなくていい」という解放感。",
    cost:
      "深く考えることが強みでもあった。切り替えの速さと引き換えに、細やかな自己修正が減るかもしれない。",
  },
  {
    axis: "growth_mindset",
    title: "才能の壁",
    situation:
      "何度挑戦しても上手くいかない。「向いていないのかも」という考えが浮かぶ。",
    direction: "left",
    currentTemplate: (l) =>
      `あなたは${l}な傾向があるため、「才能がないなら仕方ない」と諦めを正当化しやすい。努力の価値が見えにくくなる。`,
    transformedTemplate: (l) =>
      `もしあなたが${l}になったら、失敗を「まだ成長の途中」と読み替えられる。結果が出なくても、プロセスに意味を見つけられる。`,
    emotionalImpact:
      "諦めを「現実的判断」ではなく「まだその段階ではない」と捉え直す。可能性が広がる感覚。",
    cost:
      "固定思考には「無駄な努力をしない」という現実的な機能もある。諦めないことのコストを引き受ける覚悟。",
  },
];

/**
 * 軸スコアに基づいてパーソナライズされたシミュレーションシナリオを生成
 */
export function generateSimulations(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  _archetypeCode?: string,
): SimulationScenario[] {
  const scenarios: SimulationScenario[] = [];

  for (const template of SCENARIO_TEMPLATES) {
    const score = axisScores[template.axis];
    if (score === undefined) continue;

    const def = TRAIT_AXES.find((a) => a.id === template.axis);
    if (!def) continue;

    // Only generate simulation if user is clearly on the opposite side of the transformation direction.
    // right-direction simulations: user is currently on the left (score < 0.1)
    // left-direction simulations: user is currently on the right (score > -0.1)
    const isRelevant =
      template.direction === "right" ? score < 0.1 : score > -0.1;
    if (!isRelevant) continue;

    const currentSideLabel =
      score < 0 ? def.labelLeft : def.labelRight;
    const transformedSideLabel =
      template.direction === "right" ? def.labelRight : def.labelLeft;

    scenarios.push({
      id: `sim_${template.axis}_${template.direction}`,
      title: template.title,
      situation: template.situation,
      currentResponse: template.currentTemplate(currentSideLabel),
      transformedResponse: template.transformedTemplate(transformedSideLabel),
      changedAxis: template.axis,
      direction: template.direction,
      emotionalImpact: template.emotionalImpact,
      cost: template.cost,
    });
  }

  // Max 4 simulations — most relevant first
  return scenarios.slice(0, 4);
}

/** ローカルストレージキー: ユーザーが最も興味を持った変容シミュレーション */
export const SIMULATION_INTEREST_KEY = "stargazer_simulation_interest_v1";

export interface SimulationInterestRecord {
  simulationId: string;
  changedAxis: TraitAxisKey;
  direction: "left" | "right";
  recordedAt: string;
}

export function saveSimulationInterest(
  scenario: SimulationScenario,
): void {
  if (typeof window === "undefined") return;
  const record: SimulationInterestRecord = {
    simulationId: scenario.id,
    changedAxis: scenario.changedAxis,
    direction: scenario.direction,
    recordedAt: new Date().toISOString(),
  };
  safeLSSet(SIMULATION_INTEREST_KEY, JSON.stringify(record));
}

export function loadSimulationInterest(): SimulationInterestRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SIMULATION_INTEREST_KEY);
    return raw ? (JSON.parse(raw) as SimulationInterestRecord) : null;
  } catch {
    return null;
  }
}
