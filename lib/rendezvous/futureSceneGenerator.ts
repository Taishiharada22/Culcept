/**
 * Future Scene Generator
 * AI Router経由で「二人で…」シナリオを生成
 * フォールバック: テンプレートベース
 */

import type { RendezvousCategory } from "./types";

type FutureSceneInput = {
  scenario: string;
  context: string;
  category: RendezvousCategory;
  syncPercent: number;
  selfTraits?: string[];
  counterpartTraits?: string[];
};

export type FutureSceneOutput = {
  panels: [string, string, string]; // 3パネル
  mood: "warm" | "playful" | "reflective" | "adventurous";
};

/**
 * テンプレートベース生成（v1）
 * AI Router連携は将来版で追加
 */
export function generateFutureScene(input: FutureSceneInput): FutureSceneOutput {
  const { scenario, category, syncPercent } = input;

  const moods = getMoodForCategory(category, syncPercent);

  const templates = SCENE_TEMPLATES[scenario] ?? SCENE_TEMPLATES["default"];
  const selected = templates[moods.mood] ?? templates["warm"];

  return {
    panels: selected.map((t) => interpolate(t, input)) as [string, string, string],
    mood: moods.mood,
  };
}

type MoodResult = { mood: "warm" | "playful" | "reflective" | "adventurous" };

function getMoodForCategory(category: RendezvousCategory, syncPercent: number): MoodResult {
  if (syncPercent >= 75) {
    if (category === "romantic") return { mood: "warm" };
    if (category === "cocreation") return { mood: "adventurous" };
    return { mood: "playful" };
  }
  if (syncPercent >= 50) {
    if (category === "friendship") return { mood: "playful" };
    return { mood: "reflective" };
  }
  return { mood: "reflective" };
}

const SCENE_TEMPLATES: Record<string, Record<string, string[]>> = {
  "週末、二人で小旅行に出かけたら": {
    warm: [
      "朝の光の中、どちらからともなく「行こう」と声が出る。目的地は決めずに、気の向くままに。",
      "途中の小さな町で見つけた古い喫茶店。窓際の席で、二人とも同時に「ここ、いいね」とつぶやく。",
      "帰り道、夕焼けを見ながら「また行こう」ではなく「次はどこに迷い込もう」と話している。",
    ],
    playful: [
      "地図を広げて目をつぶって指を置く。「ここだ！」「…山だね」「最高じゃん」",
      "道に迷うたびに新しい発見がある。二人のナビゲーション方法が全く違うのが面白い。",
      "お土産選びで意見が割れる。結局、お互いへのサプライズを秘密で買っている。",
    ],
    reflective: [
      "車窓を流れる景色を、それぞれ静かに眺める時間がある。沈黙が心地よい。",
      "旅先の神社で、二人とも何を願ったかは言わない。でも似たような表情をしている。",
      "帰りの電車で、旅の話ではなく普段言えなかったことが自然と出てくる。",
    ],
    adventurous: [
      "「予定は未定」がルール。朝起きた瞬間の気分で全てが決まる。",
      "地元の人しか知らない場所に偶然たどり着く。二人の好奇心が共鳴した結果。",
      "帰ってきた時、二人とも少し変わっている。冒険が関係性を一段深くした。",
    ],
  },
  "雨の日に二人で過ごすとしたら": {
    warm: [
      "窓を打つ雨音をBGMに、二人でソファに沈む。本を読む人と、それを眺める人。",
      "「何か作ろうか」の一言から、即席の料理セッションが始まる。レシピは即興。",
      "夕方、雨が上がった瞬間に散歩に出る。濡れた路面に映る街灯が二人を照らす。",
    ],
    playful: [
      "雨を理由にダラダラしようとするけど、10分で飽きてゲーム大会が始まる。",
      "傘を一本しか持ってないのに、コンビニまでの距離を全力ダッシュ。",
      "結局、雨の中を歩くことにする。濡れることが楽しいと気づく午後。",
    ],
    reflective: [
      "雨の日特有の静けさの中、普段は話さないことを話し始める。",
      "それぞれの時間を過ごしながら、同じ空間にいる安心感を確認する。",
      "夜、雨音が子守唄になる。明日晴れることを期待しつつ、今の静けさも悪くない。",
    ],
    adventurous: [
      "「雨だからこそ」と、普段行かない美術館に突撃。お互いの感想が全然違って面白い。",
      "雨の中、新しい街を探検する。水たまりを避けるルートが自然なゲームになる。",
      "帰り道、二人とも靴がびしょ濡れ。でも「楽しかった」の一言で全部許せる。",
    ],
  },
  default: {
    warm: [
      "自然と始まる。言葉より先に、二人の間に心地よい空気が流れる。",
      "予想していなかった瞬間に、お互いの新しい一面を見つける。",
      "終わった後、何が特別だったのか説明できない。でも確かに何かが変わった。",
    ],
    playful: [
      "何でもないことが面白くなる。二人のテンポが合った瞬間、笑いが止まらない。",
      "小さなハプニングが、振り返ると一番の思い出になっている。",
      "「また何かやろう」が合言葉になる。具体的な計画は後から考えればいい。",
    ],
    reflective: [
      "急がない時間の中で、それぞれのペースを尊重する。",
      "言葉にならない感覚を、そのまま受け入れてくれる相手がいる安心感。",
      "この時間が、二人の間に小さな信頼の層を積み重ねている。",
    ],
    adventurous: [
      "「やったことないこと」に二人で飛び込む。不安と期待が半々。",
      "予想外の展開が続く。コントロールを手放した先にある発見。",
      "振り返ると、この体験が二人を「知り合い」から「仲間」に変えた瞬間だった。",
    ],
  },
};

function interpolate(template: string, _input: FutureSceneInput): string {
  // v1: templates are pre-written, no interpolation needed
  return template;
}
