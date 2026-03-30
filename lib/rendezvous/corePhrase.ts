// ============================================================
// Core Phrase Generator
// Stargazer/MatchingVector から人物の本質を詩的に表現する一文を生成
// ============================================================

import type { MatchingVector, RendezvousCategory } from "./types";

// ---------- Phrase Templates by Axis Combination ----------

type AxisCondition = {
  axis: keyof MatchingVector;
  range: "high" | "low" | "mid";
};

type PhraseTemplate = {
  conditions: AxisCondition[];
  phrases: string[];
  /** カテゴリ別のバリエーション */
  categoryVariants?: Partial<Record<RendezvousCategory, string[]>>;
};

function matchesRange(value: number, range: "high" | "low" | "mid"): boolean {
  if (range === "high") return value >= 0.65;
  if (range === "low") return value <= 0.35;
  return value > 0.35 && value < 0.65;
}

// 100+ phrase templates organized by dominant axis combinations
const PHRASE_TEMPLATES: PhraseTemplate[] = [
  // --- emotional_openness + social_energy ---
  {
    conditions: [
      { axis: "emotional_openness", range: "high" },
      { axis: "social_energy", range: "low" },
    ],
    phrases: [
      "深い水面のような人。静かだけど、底が見えない",
      "沈黙の中に感情が溢れている人",
      "言葉にしない感情が、一番深い人",
    ],
    categoryVariants: {
      romantic: ["静寂の中で感情が息づく人。触れると、温かい"],
      friendship: ["少人数の場で真価を発揮する、静かな情熱家"],
      cocreation: ["内省から生まれる洞察が、チームを動かす人"],
    },
  },
  {
    conditions: [
      { axis: "emotional_openness", range: "high" },
      { axis: "social_energy", range: "high" },
    ],
    phrases: [
      "太陽のような人。近づくと、自然と心が開く",
      "感情をまっすぐ届ける人。嘘がない",
      "場の空気を変える力を持つ人",
    ],
    categoryVariants: {
      romantic: ["あなたの隣にいるだけで、世界が明るくなる人"],
      friendship: ["一緒にいると、自分も素直になれる人"],
    },
  },
  {
    conditions: [
      { axis: "emotional_openness", range: "low" },
      { axis: "social_energy", range: "high" },
    ],
    phrases: [
      "表面は軽やかだけど、核心は見せない人",
      "人の中にいるのに、どこか一人でいる人",
      "軽快な仮面の奥に、静かな炎がある人",
    ],
  },
  {
    conditions: [
      { axis: "emotional_openness", range: "low" },
      { axis: "social_energy", range: "low" },
    ],
    phrases: [
      "壁の向こうにある庭のような人。入れた人だけが知る景色",
      "信頼の鍵を渡すまでに時間がかかる。でも、渡したら永遠",
      "自分の世界を大切にしている人。その世界は、深い",
    ],
  },

  // --- stimulation_need + initiative ---
  {
    conditions: [
      { axis: "stimulation_need", range: "high" },
      { axis: "initiative", range: "high" },
    ],
    phrases: [
      "嵐の目の中にいる人。周りが動くのではなく、自分が動く",
      "退屈を最も恐れる人。だから、常に次を探している",
      "先頭を走る人。追いつくのは大変だけど、景色は最高",
    ],
    categoryVariants: {
      cocreation: ["企画の発火点になれる人。アイデアが止まらない"],
      romantic: ["一緒にいると、毎日が冒険になる人"],
    },
  },
  {
    conditions: [
      { axis: "stimulation_need", range: "low" },
      { axis: "initiative", range: "low" },
    ],
    phrases: [
      "穏やかな湖のような人。波がなくても、深い",
      "変わらないことに価値を見出す人",
      "静かに寄り添える人。それが何より贅沢",
    ],
  },
  {
    conditions: [
      { axis: "stimulation_need", range: "high" },
      { axis: "initiative", range: "low" },
    ],
    phrases: [
      "冒険は好きだけど、誰かと一緒がいい人",
      "刺激を受けて輝く、受信型の冒険者",
      "面白いものに引き寄せられる、好奇心のアンテナ",
    ],
  },
  {
    conditions: [
      { axis: "stimulation_need", range: "low" },
      { axis: "initiative", range: "high" },
    ],
    phrases: [
      "静かに、でも確実にリードする人",
      "安定した土台の上から、周りを導く人",
      "穏やかさの中に、決断力が光る人",
    ],
  },

  // --- stability_need + depth_speed ---
  {
    conditions: [
      { axis: "stability_need", range: "high" },
      { axis: "depth_speed", range: "high" },
    ],
    phrases: [
      "根を張りながら、空を見ている人",
      "じっくり深めることに快感を覚える人",
      "急がない。でも、止まらない",
    ],
    categoryVariants: {
      romantic: ["ゆっくりと、しかし確実に心を開いてくれる人"],
      friendship: ["時間をかけて築く友情を大切にする人"],
    },
  },
  {
    conditions: [
      { axis: "stability_need", range: "low" },
      { axis: "depth_speed", range: "low" },
    ],
    phrases: [
      "風のように現れて、何かを残して去る人",
      "瞬間の閃きで生きている人。計画は後から",
      "自由な魂。捕まえようとすると、逃げる",
    ],
  },
  {
    conditions: [
      { axis: "stability_need", range: "high" },
      { axis: "depth_speed", range: "low" },
    ],
    phrases: [
      "安心できる場所から、直感で動く人",
      "基盤がしっかりしているから、大胆になれる人",
      "家があるから旅に出られる、そんな人",
    ],
  },
  {
    conditions: [
      { axis: "stability_need", range: "low" },
      { axis: "depth_speed", range: "high" },
    ],
    phrases: [
      "変化を恐れずに、物事の本質に向かう人",
      "不安定さの中でも、深く潜れる勇気がある人",
      "根なし草に見えて、実は一番深い根を持つ人",
    ],
  },

  // --- conversation_temperature + emotional_openness ---
  {
    conditions: [
      { axis: "conversation_temperature", range: "high" },
      { axis: "emotional_openness", range: "high" },
    ],
    phrases: [
      "言葉に温度がある人。話すだけで何かが溶ける",
      "会話が薬になる人。聞いてるだけで癒される",
      "感情が言葉に乗る人。嘘がつけない",
    ],
    categoryVariants: {
      romantic: ["この人と話していると、心の鎧が自然と外れる"],
      friendship: ["何時間でも話していたい、温かい語り手"],
    },
  },
  {
    conditions: [
      { axis: "conversation_temperature", range: "low" },
      { axis: "emotional_openness", range: "low" },
    ],
    phrases: [
      "沈黙が心地いい人。言葉がなくても、通じる",
      "必要な言葉だけを選ぶ人。だから、重い",
      "氷山の一角しか見せない人。でも、下には大陸がある",
    ],
  },
  {
    conditions: [
      { axis: "conversation_temperature", range: "high" },
      { axis: "emotional_openness", range: "low" },
    ],
    phrases: [
      "饒舌なのに、核心は見せない人",
      "言葉は多いけど、本音は別の場所にある人",
      "会話のプロ。でも、心のドアは別の鍵がいる",
    ],
  },
  {
    conditions: [
      { axis: "conversation_temperature", range: "low" },
      { axis: "emotional_openness", range: "high" },
    ],
    phrases: [
      "言葉は少ないけど、感情は全部顔に出る人",
      "無口な情熱家。態度で全部わかる",
      "話さなくても、一緒にいると安心する人",
    ],
  },

  // --- conflict_directness + distance_need ---
  {
    conditions: [
      { axis: "conflict_directness", range: "high" },
      { axis: "distance_need", range: "low" },
    ],
    phrases: [
      "ぶつかることを恐れない、近い距離の人",
      "本音でぶつかれるのは、信頼の証",
      "言いたいことを言える関係を、一番大切にする人",
    ],
  },
  {
    conditions: [
      { axis: "conflict_directness", range: "low" },
      { axis: "distance_need", range: "high" },
    ],
    phrases: [
      "適度な距離を保ちながら、平和を守る人",
      "波風を立てない。でも、ちゃんと見ている",
      "調和の見守り型。でも、犠牲にしているものがある",
    ],
  },
  {
    conditions: [
      { axis: "conflict_directness", range: "high" },
      { axis: "distance_need", range: "high" },
    ],
    phrases: [
      "必要な時だけ本音を出す、賢いストラテジスト",
      "距離を保ちながらも、真実は伝える人",
      "独立心が強いのに、正直。珍しい組み合わせ",
    ],
  },
  {
    conditions: [
      { axis: "conflict_directness", range: "low" },
      { axis: "distance_need", range: "low" },
    ],
    phrases: [
      "誰とでも近くにいられる、天性の調和者",
      "ぶつからずに近づける、稀有な存在",
      "柔らかく包み込むような人。一緒にいると力が抜ける",
    ],
  },

  // --- structure_preference dominant ---
  {
    conditions: [
      { axis: "structure_preference", range: "high" },
      { axis: "stability_need", range: "high" },
    ],
    phrases: [
      "人生に設計図がある人。でも、美しい設計図",
      "秩序の中に美を見出す人",
      "計画的に見えて、その計画が繊細",
    ],
  },
  {
    conditions: [
      { axis: "structure_preference", range: "low" },
      { axis: "stimulation_need", range: "high" },
    ],
    phrases: [
      "人生をジャズのように即興で奏でる人",
      "ルールより感覚で生きる。だから、予測不能で面白い",
      "型にはまらない。はまれない。はまりたくない",
    ],
    categoryVariants: {
      cocreation: ["既成概念を壊すのが得意な、破壊的創造者"],
    },
  },

  // --- Single axis dominant fallbacks ---
  {
    conditions: [{ axis: "conversation_temperature", range: "high" }],
    phrases: [
      "熱量のある対話を求める人",
      "会話に命を吹き込む人",
      "一言一言に魂がこもっている人",
    ],
  },
  {
    conditions: [{ axis: "conversation_temperature", range: "low" }],
    phrases: [
      "静かな時間を共有できる人",
      "言葉より、存在そのものが語る人",
      "沈黙を恐れない強さがある人",
    ],
  },
  {
    conditions: [{ axis: "emotional_openness", range: "high" }],
    phrases: [
      "心の窓が大きい人。光が入りやすい",
      "感情に正直な人。だから、信頼できる",
    ],
  },
  {
    conditions: [{ axis: "emotional_openness", range: "low" }],
    phrases: [
      "感情を大切にしまっている人。開ける価値がある",
      "表面の静けさの下に、深い感情の海がある人",
    ],
  },
  {
    conditions: [{ axis: "initiative", range: "high" }],
    phrases: [
      "道を切り開く人。後ろを見ない強さ",
      "決断の速さに、人がついてくる",
    ],
  },
  {
    conditions: [{ axis: "initiative", range: "low" }],
    phrases: [
      "誰かの隣で輝く人。でも、その輝きは本物",
      "支えることで強くなれる人",
    ],
  },
  {
    conditions: [{ axis: "social_energy", range: "high" }],
    phrases: [
      "人の中で充電される人。孤独が苦手",
      "人が集まると、自然とその中心にいる人",
    ],
  },
  {
    conditions: [{ axis: "social_energy", range: "low" }],
    phrases: [
      "一人の時間が栄養になる人",
      "少数精鋭の関係を大切にする人",
    ],
  },
  {
    conditions: [{ axis: "depth_speed", range: "high" }],
    phrases: [
      "物事を深く考える人。結論を急がない",
      "表面で満足しない、真実の探求者",
    ],
  },
  {
    conditions: [{ axis: "depth_speed", range: "low" }],
    phrases: [
      "直感で動ける人。考えすぎない強さ",
      "フットワークの軽さが武器の人",
    ],
  },
  {
    conditions: [{ axis: "stability_need", range: "high" }],
    phrases: [
      "安定の中に幸せを見つけられる人",
      "変わらない何かを大切にしている人",
    ],
  },
  {
    conditions: [{ axis: "stimulation_need", range: "high" }],
    phrases: [
      "退屈を最も恐れる人。だから、面白い",
      "新しい経験が酸素のような人",
    ],
  },
  {
    conditions: [{ axis: "distance_need", range: "high" }],
    phrases: [
      "近すぎない距離感が心地いい人",
      "個の空間を大切にする人。侵さない優しさ",
    ],
  },
  {
    conditions: [{ axis: "distance_need", range: "low" }],
    phrases: [
      "距離を縮めるのが上手い人。自然に近づける",
      "心の距離ゼロを目指す人",
    ],
  },
  {
    conditions: [{ axis: "conflict_directness", range: "high" }],
    phrases: [
      "嘘がつけない人。それが強さ",
      "正直さが時に鋭利な人。でも、信頼できる",
    ],
  },
  {
    conditions: [{ axis: "conflict_directness", range: "low" }],
    phrases: [
      "場の空気を読む天才。でも、自分を消しすぎることも",
      "調和を愛する人。平和の使者",
    ],
  },
  {
    conditions: [{ axis: "structure_preference", range: "high" }],
    phrases: [
      "秩序を愛する人。混沌の中でも道を見つける",
      "計画があるから安心できる人",
    ],
  },
  {
    conditions: [{ axis: "structure_preference", range: "low" }],
    phrases: [
      "自由な流れに身を任せられる人",
      "計画なしでも楽しめる、柔軟な精神の持ち主",
    ],
  },
];

// Default fallback phrases
const FALLBACK_PHRASES = [
  "まだ見えていない深さがある人",
  "出会ってみないとわからない、未知の可能性",
  "言葉にしきれない何かを持っている人",
  "観測を続けることで、もっと見えてくる人",
];

// ---------- Main Generator ----------

/**
 * MatchingVector からコアフレーズ（人物の本質を詩的に表す一文）を生成する
 */
export function generateCorePhrase(
  vector: Partial<MatchingVector>,
  category?: RendezvousCategory,
): string {
  // Score each template
  let bestTemplate: PhraseTemplate | null = null;
  let bestScore = 0;

  for (const template of PHRASE_TEMPLATES) {
    let matches = 0;
    let total = template.conditions.length;

    for (const cond of template.conditions) {
      const val = vector[cond.axis];
      if (val !== undefined && matchesRange(val, cond.range)) {
        matches++;
      }
    }

    if (matches === 0) continue;

    // Prefer templates where all conditions match
    // Bonus for having more conditions (more specific)
    const score = (matches / total) * 100 + matches * 10;

    if (score > bestScore) {
      bestScore = score;
      bestTemplate = template;
    }
  }

  if (!bestTemplate) {
    return pickRandom(FALLBACK_PHRASES, vector);
  }

  // Check for category variant first
  if (category && bestTemplate.categoryVariants?.[category]?.length) {
    return pickRandom(bestTemplate.categoryVariants[category]!, vector);
  }

  return pickRandom(bestTemplate.phrases, vector);
}

// Deterministic-ish random selection using vector values as seed
function pickRandom(arr: string[], vector: Partial<MatchingVector>): string {
  const values = Object.values(vector).filter((v): v is number => v !== undefined);
  const seed = values.reduce((acc, v) => acc + v * 1000, 0);
  const index = Math.floor(seed) % arr.length;
  return arr[index] ?? arr[0];
}
