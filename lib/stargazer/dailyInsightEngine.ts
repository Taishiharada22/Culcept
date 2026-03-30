// lib/stargazer/dailyInsightEngine.ts
// Stargazer パーソナライズ洞察生成エンジン
// 軸スコア・カード・文脈差から「あなたを映す」物語を生成する

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import type { DerivedTraitCard, ContextDifference } from "./traitCards";
/** Minimal type info needed by insight generation (constellation-independent) */
export interface TypeDefLike {
  code: string;
  label: string;
  description: string;
  emoji: string;
  keywords: string[];
  traits?: Partial<Record<string, number>>;
  visual: {
    palette: string[];
    impression: string[];
    role: string;
    oneLine: string;
  };
}

// ── Output Types ──

export interface DailyGreeting {
  headline: string;
  subtext: string;
  sourceAxis: TraitAxisKey;
}

export interface DailyWhisper {
  text: string;
  type: "pattern" | "contradiction" | "context" | "growth";
}

export interface ContradictionInsight {
  cardA: { id: string; label: string };
  cardB: { id: string; label: string };
  narrative: string;
}

export interface ContextNarrative {
  axisId: TraitAxisKey;
  contextA: string;
  contextB: string;
  narrative: string;
  framing: "protective" | "adaptive" | "authentic";
}

export interface ObservationCompletionInsight {
  primary: string;
  revealed: string;
  mystery: string;
  returnPrompt: string;
}

// ── Hash utility ──

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── Axis greeting templates ──
// key: axisId, value: [negativeHeadline, positiveHeadline]

const AXIS_GREETINGS: Partial<
  Record<TraitAxisKey, [string, string, string, string]>
> = {
  introvert_vs_extrovert: [
    "静かな場所に、あなたの力が宿っている",
    "内側の世界が深い人。沈黙の中にも言葉がある",
    "人のエネルギーがあなたを動かす",
    "場の空気を変える力を持つ人",
  ],
  individual_vs_social: [
    "一人で深める時間が、あなたの核を作っている",
    "「自分の世界」を大切にできる人は強い",
    "人と交わることで、自分の輪郭が見えてくる",
    "集合知の中にいるとき、あなたは最も光る",
  ],
  cautious_vs_bold: [
    "慎重さは臆病じゃない。それは知性の現れ",
    "見えないリスクに気づける目を持っている",
    "決めたら迷わない。その直感には根拠がある",
    "恐れより好奇心が勝つ瞬間、あなたは最も自分らしい",
  ],
  analytical_vs_intuitive: [
    "根拠を求めるのは、本当に理解したいから",
    "分析は、あなたにとって世界を愛する方法",
    "理屈より先に身体が動く。その感覚は正しいことが多い",
    "言語化できない「何か」を信じられる強さ",
  ],
  change_embrace_vs_resist: [
    "変化の中にいるとき、あなたは最も生き生きする",
    "「新しい」という言葉にときめく感覚",
    "変わらないものの中に安心を見つけられる人",
    "安定は退屈じゃない。それはあなたが選んだ土台",
  ],
  stress_isolation_vs_social: [
    "一人で充電する時間が、あなたを支えている",
    "疲れたときに静けさを選べるのは、自分を知っている証拠",
    "人といることで回復する。それがあなたの自然な形",
    "誰かの声が、あなたにとっての安全地帯",
  ],
  direct_vs_diplomatic: [
    "率直さは、あなたの誠実さの表れ",
    "遠回りをしない言葉には、信頼が宿る",
    "相手の気持ちを慮れるのは、想像力が豊かだから",
    "配慮は弱さじゃない。それはあなたの優しさの形",
  ],
  independence_vs_harmony: [
    "自分の道を歩ける強さを持っている",
    "「合わせる」より「進む」を選ぶ人",
    "誰かと歩調を合わせることに、喜びを感じる",
    "調和の中にいるとき、あなたの力が最大になる",
  ],
  reassurance_need: [
    "確認を必要としない強さ。自分の中に答えがある",
    "不安を一人で処理できるのは、稀有な力",
    "安心を求めることは、関係を大切にしている証拠",
    "「大丈夫？」と聞けることも、聞きたいことも、正直さ",
  ],
  plan_vs_spontaneous: [
    "計画は、あなたにとっての安心の形",
    "先を見通す力が、周りの人も守っている",
    "「今」に反応できる柔軟さ。それは才能",
    "即興で動けるのは、自分を信じているから",
  ],
  quality_vs_quantity: [
    "深さを選ぶ人。一つのことに真剣になれる",
    "量より質を選ぶのは、妥協しない証拠",
    "広く知ることで、世界の全体像を掴む",
    "多くのことに興味を持てるのは、好奇心の豊かさ",
  ],
  intimacy_pace: [
    "ゆっくり距離を縮める。その慎重さは相手への敬意",
    "時間をかけた関係ほど、あなたにとって本物になる",
    "心を開くスピードが速い。それは人を信じる力",
    "すぐに打ち解けられるのは、あなたの才能",
  ],
  boundary_awareness: [
    "境界を柔軟に扱える。状況に応じた判断ができる",
    "線引きを固定しない柔らかさ",
    "境界を明確にする力。自分も相手も守れる",
    "「ここまで」が言えるのは、自分を知っている証拠",
  ],
  emotional_variability: [
    "感情が安定している。それは内なる強さの表れ",
    "揺れにくいのは、自分の軸がしっかりしているから",
    "感情が場面で変化する。それは感受性の豊かさ",
    "状況に応じて感情が動くのは、生きている証拠",
  ],
  function_vs_expression: [
    "合理を選ぶ。無駄を削ぎ落とす美学",
    "機能的であることに美しさを見出す人",
    "表現することが、あなたの存在証明",
    "感情を形にできる力。それは稀有な才能",
  ],
};

// ── Daily Greeting ──

export function generateDailyGreeting(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  typeDef: TypeDefLike | null,
  totalObservations: number,
  dateStr: string,
  archetypeName?: string | null
): DailyGreeting {
  // Early observations: gentle greeting
  if (totalObservations < 5) {
    return {
      headline: "まだ、輪郭が見え始めたばかり",
      subtext:
        "何度かの会話を重ねるうちに、あなたの光の形が浮かび上がってくる。急がなくていい。",
      sourceAxis: "introvert_vs_extrovert",
    };
  }

  // Sort axes by absolute score strength
  const sorted = Object.entries(axisScores)
    .filter(([, v]) => v !== undefined && v !== 0)
    .sort(([, a], [, b]) => Math.abs(b!) - Math.abs(a!)) as [
    TraitAxisKey,
    number,
  ][];

  if (sorted.length === 0) {
    return {
      headline: "あなたの光を、もう少し観測させてほしい",
      subtext: "今日の場面を通じて、見えてくるものがある。",
      sourceAxis: "introvert_vs_extrovert",
    };
  }

  // Date-seeded rotation through top axes
  const topN = Math.min(sorted.length, 6);
  const idx = hashStr(dateStr) % topN;
  const [axisId, score] = sorted[idx];

  const templates = AXIS_GREETINGS[axisId];
  if (!templates) {
    // Fallback for axes without templates
    const axisDef = TRAIT_AXES.find((a) => a.id === axisId);
    const label = score < 0 ? axisDef?.labelLeft : axisDef?.labelRight;
    return {
      headline: `あなたの中の「${label || "未知の傾向"}」が、今日も静かに現れている`,
      subtext: archetypeName
        ? `${archetypeName}としてのあなたが、少しずつ見えてきている。`
        : typeDef
          ? `${typeDef.visual.oneLine}としてのあなたが、少しずつ見えてきている。`
          : "観測を重ねるほどに、あなたの輪郭は鮮明になる。",
      sourceAxis: axisId,
    };
  }

  // Pick from 4 templates: [negative-strong, negative-moderate, positive-moderate, positive-strong]
  const tplIdx = score < -0.3 ? 0 : score < 0 ? 1 : score < 0.3 ? 2 : 3;
  const headline = templates[tplIdx];

  let subtext: string;
  // Prefer archetype name over old constellation label
  const displayName = archetypeName ?? typeDef?.label;
  if (displayName && typeDef?.visual?.impression) {
    const impressions = typeDef.visual.impression.slice(0, 2).join("と");
    subtext = `${impressions}を内に秘めた${displayName}。その光は、あなただけのもの。`;
  } else if (displayName) {
    subtext = `${displayName}としてのあなたが、少しずつ見えてきている。`;
  } else {
    subtext = "観測を重ねるほどに、あなたの輪郭は鮮明になる。";
  }

  return { headline, subtext, sourceAxis: axisId };
}

// ── Temporal Greeting ──

/**
 * 継続性と時間経過を反映した挨拶を生成する。
 * 前回セッションからの間隔・マイルストーン・直近の変化を反映。
 */
export function generateTemporalGreeting(
  totalSessions: number,
  lastSessionDate: string | null,
  axisScores: Partial<Record<TraitAxisKey, number>>,
  recentChange?: {
    axis: TraitAxisKey;
    direction: "up" | "down";
    magnitude: number;
  },
): DailyGreeting {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // --- マイルストーン判定 ---
  const milestones = [50, 20, 10, 5] as const;
  for (const m of milestones) {
    if (totalSessions === m) {
      // 最も強い軸を見つけてインサイトを添える
      const sortedEntries = Object.entries(axisScores)
        .filter(([, v]) => v !== undefined)
        .sort(([, a], [, b]) => Math.abs(b!) - Math.abs(a!));
      const topEntry = (sortedEntries.length > 0 ? sortedEntries[0] : undefined) as
        | [TraitAxisKey, number]
        | undefined;

      let subtext: string;
      if (topEntry) {
        const axisDef = TRAIT_AXES.find((a) => a.id === topEntry[0]);
        const label =
          topEntry[1] < 0 ? axisDef?.labelLeft : axisDef?.labelRight;
        subtext = `最も鮮明なのは「${label || "未知の光"}」。この傾向はかなり確かなものになってきた。`;
      } else {
        subtext = "まだ全体像は見えないけれど、確実にデータは積み上がっている。";
      }

      return {
        headline: `${m}回目の観測。だいぶ見えてきた。`,
        subtext,
        sourceAxis: topEntry?.[0] ?? "introvert_vs_extrovert",
      };
    }
  }

  // --- 直近の変化を反映 ---
  if (recentChange) {
    const axisDef = TRAIT_AXES.find((a) => a.id === recentChange.axis);
    const axisLabel = axisDef
      ? `${axisDef.labelLeft}↔${axisDef.labelRight}`
      : "ある軸";
    const dirWord = recentChange.direction === "up" ? "上がって" : "下がって";
    return {
      headline: `前回、${axisLabel}が動いてた。今日はどうかな。`,
      subtext: `前回は${dirWord}た。同じ方向に進むのか、戻るのか、それも観測のうち。`,
      sourceAxis: recentChange.axis,
    };
  }

  // --- 前回セッションからの間隔 ---
  if (lastSessionDate) {
    const last = new Date(lastSessionDate);
    last.setHours(0, 0, 0, 0);
    const diffDays = Math.round(
      (today.getTime() - last.getTime()) / 86400000,
    );

    if (diffDays === 1) {
      return {
        headline: "昨日の続きから。",
        subtext: "連続して観測すると、日ごとの揺れが見えてくる。",
        sourceAxis: "introvert_vs_extrovert",
      };
    }
    if (diffDays >= 2 && diffDays <= 3) {
      return {
        headline: "少し間が空いたね。その間に何か変わった？",
        subtext: "間隔が空くと、変化がより鮮明になることがある。",
        sourceAxis: "introvert_vs_extrovert",
      };
    }
    if (diffDays >= 4) {
      return {
        headline: "久しぶり。あなたのことが気になってた。",
        subtext: `${diffDays}日ぶりの観測。あなたの中で何が変わったか、見せてほしい。`,
        sourceAxis: "introvert_vs_extrovert",
      };
    }
  }

  // --- フォールバック: 初回 or 同日 ---
  return {
    headline: "今日も、あなたを見せてほしい。",
    subtext: "一つひとつの観測が、あなたの輪郭を描いていく。",
    sourceAxis: "introvert_vs_extrovert",
  };
}

// ── Daily Whisper ──

export function generateDailyWhisper(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  traitCards: DerivedTraitCard[],
  contextDiffs: ContextDifference[],
  dateStr: string
): DailyWhisper {
  const types = ["pattern", "contradiction", "context", "growth"] as const;
  const typeIdx = hashStr(dateStr + "whisper") % types.length;
  const whisperType = types[typeIdx];

  const sorted = Object.entries(axisScores)
    .filter(([, v]) => v !== undefined && Math.abs(v!) > 0.15)
    .sort(([, a], [, b]) => Math.abs(b!) - Math.abs(a!)) as [
    TraitAxisKey,
    number,
  ][];

  switch (whisperType) {
    case "pattern": {
      if (sorted.length < 2) break;
      const [axis1Id, s1] = sorted[0];
      const ax1 = TRAIT_AXES.find((a) => a.id === axis1Id);
      const label1 = s1 < 0 ? ax1?.labelLeft : ax1?.labelRight;
      return {
        text: `あなたの中で最も強い傾向は「${label1}」。それは選んだものではなく、自然にそうなるもの。`,
        type: "pattern",
      };
    }

    case "contradiction": {
      // Find two strong axes that seem contradictory
      if (sorted.length >= 3) {
        const [a1, s1] = sorted[0];
        const [a2, s2] = sorted[2];
        const ax1 = TRAIT_AXES.find((a) => a.id === a1);
        const ax2 = TRAIT_AXES.find((a) => a.id === a2);
        const l1 = s1 < 0 ? ax1?.labelLeft : ax1?.labelRight;
        const l2 = s2 < 0 ? ax2?.labelLeft : ax2?.labelRight;
        return {
          text: `「${l1}」と「${l2}」が同居している。矛盾に見えるかもしれないが、それがあなたの深さ。`,
          type: "contradiction",
        };
      }
      break;
    }

    case "context": {
      if (contextDiffs.length > 0) {
        const diff =
          contextDiffs[hashStr(dateStr + "ctx") % contextDiffs.length];
        return {
          text: diff.insight,
          type: "context",
        };
      }
      break;
    }

    case "growth": {
      if (sorted.length > 0) {
        const weakest = sorted[sorted.length - 1];
        const ax = TRAIT_AXES.find((a) => a.id === weakest[0]);
        return {
          text: `「${ax?.labelLeft}」と「${ax?.labelRight}」の間で、あなたはまだ揺れている。それは答えを探している最中だということ。`,
          type: "growth",
        };
      }
      break;
    }
  }

  // Fallback
  return {
    text: "観測のたびに、あなたの光の形が少しずつ変わる。それは生きている証拠。",
    type: "pattern",
  };
}

// ── Contradiction Detection ──

interface ContradictionPair {
  a: string;
  b: string;
  narrative: string;
}

const CONTRADICTION_PAIRS: ContradictionPair[] = [
  {
    a: "pioneer",
    b: "anchor",
    narrative:
      "変化を求める心と、安定を守る心が同居している。あなたは「安全な冒険」を好むのかもしれない。新しい場所に飛び込むけれど、帰る場所は確保しておく。",
  },
  {
    a: "empathizer",
    b: "lone_wolf",
    narrative:
      "一人でいたいのに、人の気持ちが分かりすぎる。それは繊細さの二面性。社交的に振る舞えるけれど、終わった後にどっと疲れる。",
  },
  {
    a: "strategist",
    b: "spark",
    narrative:
      "分析と直感を、場面で使い分けている。どちらが「本当のあなた」ではなく、両方があなた。頭で考えるモードと、身体が先に動くモードが共存している。",
  },
  {
    a: "calm_water",
    b: "seeker",
    narrative:
      "普段は穏やかなのに、特定の場面で確認を求める。特に大切な人との関係で。表面の落ち着きの下に、安心を求める心がある。",
  },
  {
    a: "minimalist",
    b: "expressionist",
    narrative:
      "削ぎ落とすことで表現している。ミニマリズムは実はあなたの表現手段。言葉を減らすことで、一言の重みを増す人。",
  },
  {
    a: "depth",
    b: "pragmatist",
    narrative:
      "深く掘りたいのに、前に進みたくもなる。テーマによって使い分けている。大事なことには時間をかけ、そうでないことは即断する。",
  },
  {
    a: "drive",
    b: "depth",
    narrative:
      "行動力がありながら、同時に深く考える人。走りながら考える。立ち止まりながら進む。そのリズムが、あなた独自のもの。",
  },
  {
    a: "guardian",
    b: "bridge_builder",
    narrative:
      "境界を守りたいのに、人と繋がりたい。その葛藤が、あなたの人間関係に深みを与えている。安全な距離感で、深い繋がりを作れる人。",
  },
  {
    a: "pioneer",
    b: "depth",
    narrative:
      "新しいことに飛び込むのに、入ったら深く掘る。浅く広くではなく、新しいことを深くやる。退屈しないけれど、中途半端も嫌う。",
  },
  {
    a: "anchor",
    b: "chameleon",
    narrative:
      "内面は安定しているのに、外面は場面で変わる。芯がぶれないからこそ、表面の適応が可能になっている。",
  },
];

export function detectContradictions(
  traitCards: DerivedTraitCard[]
): ContradictionInsight[] {
  const cardIds = new Set(traitCards.map((c) => c.id));
  const results: ContradictionInsight[] = [];

  for (const pair of CONTRADICTION_PAIRS) {
    if (cardIds.has(pair.a) && cardIds.has(pair.b)) {
      const cardA = traitCards.find((c) => c.id === pair.a)!;
      const cardB = traitCards.find((c) => c.id === pair.b)!;
      results.push({
        cardA: { id: pair.a, label: cardA.label },
        cardB: { id: pair.b, label: cardB.label },
        narrative: pair.narrative,
      });
    }
  }

  return results;
}

// ── Context Narratives ──

const CONTEXT_LABELS: Record<string, string> = {
  friends: "友達",
  friendship: "友人といる時",
  romance: "恋愛",
  romantic: "恋愛の場面",
  romantic_partner: "恋人といる時",
  partner: "パートナーといる時",
  work: "仕事",
  family: "家族",
  one_on_one: "二人きりの時",
  online: "オンラインの場面",
  spouse: "配偶者といる時",
  cocreation: "共創の場面",
  community: "コミュニティの中",
};

interface ContextFraming {
  axes: TraitAxisKey[];
  framing: "protective" | "adaptive" | "authentic";
  template: (
    ctxA: string,
    ctxB: string,
    labelA: string,
    labelB: string
  ) => string;
}

const CONTEXT_FRAMINGS: ContextFraming[] = [
  {
    axes: ["reassurance_need", "emotional_variability", "boundary_awareness"],
    framing: "protective",
    template: (ctxA, ctxB, lA, lB) =>
      `${ctxA}の前では${lA}のに、${ctxB}になると${lB}に変わる。大切な関係だからこそ、自分を守る鎧を纏うのかもしれない。`,
  },
  {
    axes: [
      "introvert_vs_extrovert",
      "social_initiative",
      "direct_vs_diplomatic",
    ],
    framing: "adaptive",
    template: (ctxA, ctxB, lA, lB) =>
      `${ctxA}では${lA}面が出るのに、${ctxB}では${lB}に切り替わる。場面に応じて自分を調整できる柔軟さを持っている。`,
  },
  {
    axes: ["public_private_gap", "relationship_mode_split"],
    framing: "authentic",
    template: (ctxA, ctxB, lA, lB) =>
      `${ctxA}の自分と${ctxB}の自分。どちらが本物かではなく、どちらもあなたの一面。ただ、${ctxB}のほうが素に近いのかもしれない。`,
  },
  {
    axes: ["individual_vs_social", "independence_vs_harmony", "intimacy_pace"],
    framing: "adaptive",
    template: (ctxA, ctxB, lA, lB) =>
      `${ctxA}の場面では${lA}が出るのに、${ctxB}では${lB}に変わる。人数という条件が、あなたの別の面を引き出している。`,
  },
  {
    axes: ["direct_vs_diplomatic", "public_private_gap", "emotional_regulation"],
    framing: "protective",
    template: (ctxA, ctxB, lA, lB) =>
      `${ctxA}では${lA}だが、${ctxB}では${lB}になる。画面越しの安全感がガードを下げるのか、逆に上げるのか——その差にあなたの本音が見える。`,
  },
];

export function generateContextNarratives(
  contextDiffs: ContextDifference[]
): ContextNarrative[] {
  return contextDiffs.slice(0, 5).map((diff) => {
    // Find matching framing
    let framing: ContextNarrative["framing"] = "adaptive";
    let narrative = diff.insight;

    for (const cf of CONTEXT_FRAMINGS) {
      if (cf.axes.includes(diff.axis)) {
        framing = cf.framing;
        const axisDef = TRAIT_AXES.find((a) => a.id === diff.axis);
        if (axisDef && diff.contexts.length >= 2) {
          const ctxA = diff.contexts[0].contextLabel;
          const ctxB = diff.contexts[1].contextLabel;
          const scoreA = diff.contexts[0].score;
          const scoreB = diff.contexts[1].score;
          const labelA =
            scoreA < 0 ? axisDef.labelLeft : axisDef.labelRight;
          const labelB =
            scoreB < 0 ? axisDef.labelLeft : axisDef.labelRight;
          narrative = cf.template(ctxA, ctxB, labelA, labelB);
        }
        break;
      }
    }

    return {
      axisId: diff.axis,
      contextA: diff.contexts[0]?.context || "general",
      contextB: diff.contexts[1]?.context || "general",
      narrative,
      framing,
    };
  });
}

// ── Observation Completion Insights ──

const COMPLETION_TEMPLATES = {
  fast: [
    "迷わなかった。この領域では、あなたの中にすでに答えがある。",
    "即断できるということは、そこに確信があるということ。",
    "反射的に選べた。意識よりも深い場所から出た答え。",
  ],
  slow: [
    "迷いが生まれた。それは、あなたの中で何かがせめぎ合っている証拠。",
    "時間がかかったのは、どちらも本当のあなただから。",
    "簡単に選べなかった場面。そこにこそ、本音が隠れている。",
  ],
  mixed: [
    "即断と熟慮が混在した。場面によって、あなたの判断回路が切り替わる。",
    "ある場面では迷わず、ある場面では立ち止まった。その差分に意味がある。",
  ],
};

export function generateCompletionInsight(
  answers: { questionId: string; optionId: string; responseTimeMs: number }[],
  axisScores: Partial<Record<TraitAxisKey, number>>,
  totalObservations: number,
  typeDef: TypeDefLike | null
): ObservationCompletionInsight {
  if (answers.length === 0) {
    return {
      primary: "観測データを処理中...",
      revealed: "",
      mystery: "次の観測で、もう少し見えてくる。",
      returnPrompt: "明日、また話しましょう。",
    };
  }

  // Analyze response time patterns
  const avgTime =
    answers.reduce((s, a) => s + a.responseTimeMs, 0) / answers.length;
  const fastCount = answers.filter((a) => a.responseTimeMs < 3000).length;
  const slowCount = answers.filter((a) => a.responseTimeMs > 6000).length;

  let primary: string;
  const h = hashStr(answers.map((a) => a.optionId).join(""));

  if (fastCount >= answers.length * 0.7) {
    primary =
      COMPLETION_TEMPLATES.fast[h % COMPLETION_TEMPLATES.fast.length];
  } else if (slowCount >= answers.length * 0.5) {
    primary =
      COMPLETION_TEMPLATES.slow[h % COMPLETION_TEMPLATES.slow.length];
  } else {
    primary =
      COMPLETION_TEMPLATES.mixed[h % COMPLETION_TEMPLATES.mixed.length];
  }

  // Revealed: what was strongest
  const topAxes = Object.entries(axisScores)
    .filter(([, v]) => Math.abs(v!) > 0.3)
    .sort(([, a], [, b]) => Math.abs(b!) - Math.abs(a!))
    .slice(0, 2) as [TraitAxisKey, number][];

  let revealed: string;
  if (topAxes.length >= 2) {
    const a1 = TRAIT_AXES.find((a) => a.id === topAxes[0][0]);
    const a2 = TRAIT_AXES.find((a) => a.id === topAxes[1][0]);
    const l1 =
      topAxes[0][1] < 0 ? a1?.labelLeft : a1?.labelRight;
    const l2 =
      topAxes[1][1] < 0 ? a2?.labelLeft : a2?.labelRight;
    revealed = `「${l1}」と「${l2}」が、あなたの核に近い傾向として浮かび上がっている。`;
  } else if (topAxes.length === 1) {
    const a1 = TRAIT_AXES.find((a) => a.id === topAxes[0][0]);
    const l1 =
      topAxes[0][1] < 0 ? a1?.labelLeft : a1?.labelRight;
    revealed = `「${l1}」の傾向が、今日の観測でより鮮明になった。`;
  } else {
    revealed = "まだ明確な傾向は見えていない。でも、それは観測が足りないだけ。";
  }

  // Mystery: weak areas
  const weakAxes = Object.entries(axisScores)
    .filter(([, v]) => Math.abs(v!) < 0.1)
    .slice(0, 1) as [TraitAxisKey, number][];

  let mystery: string;
  if (weakAxes.length > 0) {
    const ax = TRAIT_AXES.find((a) => a.id === weakAxes[0][0]);
    mystery = `「${ax?.labelLeft}」と「${ax?.labelRight}」の間で、あなたがどちら寄りなのか、まだ見えていない。`;
  } else {
    mystery = "まだ暗い星域がある。そこに何が隠れているか、次の観測で探ってみたい。";
  }

  // Return prompt
  const returnPrompts = [
    "明日は、少し違う角度からあなたを見てみたい。",
    "今日の答えは記録された。明日、また違う場面で会いましょう。",
    "観測は続く。あなたの光は、日によって微妙に色が変わる。",
    "あなたの物語は、まだ始まったばかり。次の観測が、新しい章を開く。",
  ];

  return {
    primary,
    revealed,
    mystery,
    returnPrompt: returnPrompts[h % returnPrompts.length],
  };
}

// ── Trait Card Narrative Map ──

interface CardNarrativeData {
  story: string;
  shadow: string;
  manifestations: string[];
}

const CARD_NARRATIVES: Record<string, CardNarrativeData> = {
  pioneer: {
    story: "未知の領域に足を踏み入れるとき、あなたの中に静かな高揚感がある。多くの人が躊躇する瞬間に、すでに一歩を踏み出している。変化そのものがエネルギー源。",
    shadow:
      "新しさを求めすぎて、すでに手にしているものの価値を見失うことがある。「変わらないこと」を退屈と混同しやすい。",
    manifestations: [
      "転職や引っ越しへの抵抗が少ない",
      "「前と同じでいい」という選択肢に退屈を感じる",
      "変化を提案する側に回ることが多い",
    ],
  },
  anchor: {
    story: "周りが揺れるとき、あなたは静かにそこにいる。その安定感は意識して作っているものではなく、自然な在り方。人はそれに気づかずに頼っている。",
    shadow:
      "安定を守ることに執着すると、必要な変化まで拒んでしまうことがある。「変わらないこと」が目的化する瞬間に注意。",
    manifestations: [
      "慣れた場所やルーティンに心地よさを感じる",
      "急な予定変更にストレスを感じやすい",
      "人から「安心する」と言われることがある",
    ],
  },
  strategist: {
    story: "判断を求められたとき、あなたの中で自動的に分析が始まる。感情に流されず、構造を見抜く目を持っている。冷たいのではなく、正確でありたいだけ。",
    shadow:
      "全てを分析しようとして、感情や直感を無視してしまうことがある。「正しさ」が「温かさ」を押し退ける瞬間。",
    manifestations: [
      "決断前にメリット・デメリットを整理する癖がある",
      "感情的な議論より、論理的な対話を好む",
      "「なぜ？」を繰り返し問う人",
    ],
  },
  spark: {
    story: "理屈より先に身体が動く。あなたの直感は、意識が追いつく前に答えを出している。それは経験の蓄積が無意識に働いた結果。",
    shadow:
      "直感を過信して、詰めが甘くなることがある。「何となく」が通用しない場面での苦しさ。",
    manifestations: [
      "考えるより先に手が動いている",
      "「なんとなく」で正解を引くことが多い",
      "計画通りに進めるより、その場の判断を信じる",
    ],
  },
  drive: {
    story: "社交の場で、あなたは自然と前に出る。人との距離を縮めることに抵抗がなく、新しい関係を築くことにエネルギーを感じる。",
    shadow:
      "積極性が押し付けになることがある。相手のペースを無視して、自分のリズムで関係を進めてしまう瞬間。",
    manifestations: [
      "初対面の人にも自分から話しかけられる",
      "グループの中で場を回す役割になりやすい",
      "「待つ」より「動く」を選ぶ傾向がある",
    ],
  },
  depth: {
    story: "表面をなぞるだけでは満足できない。あなたは一つのことを深く掘り下げることに喜びを感じる。質を追求する姿勢が、周りに静かな影響を与えている。",
    shadow:
      "深さを求めるあまり、広がりを犠牲にすることがある。「もう十分」のラインが見えにくい。",
    manifestations: [
      "一つの話題について長時間語れる",
      "浅い付き合いより、少数との深い関係を好む",
      "「もっと知りたい」が自然に口から出る",
    ],
  },
  pragmatist: {
    story: "完璧を待つより、今できることを進める。あなたにとって「動く」ことは「考える」ことの延長線上にある。実用的であることに美しさを見出す人。",
    shadow:
      "効率を追いすぎて、プロセスの中の美しさや学びを見落とすことがある。「結果」だけが正義になる瞬間。",
    manifestations: [
      "80%の完成度で一度出して、後から修正する",
      "「で、どうすればいい？」が口癖",
      "理論より実践を重視する",
    ],
  },
  empathizer: {
    story: "人の感情を、言葉にならないうちから感じ取っている。あなたの共感力は、場の空気を読む力ではなく、相手の内面に触れる力。",
    shadow:
      "他人の感情を吸収しすぎて、自分の感情と区別がつかなくなることがある。境界線が曖昧になる痛み。",
    manifestations: [
      "相手が言い淀む前に、気持ちを察することがある",
      "映画や物語で、登場人物に感情移入しすぎる",
      "争いの場にいると、自分が当事者でなくても疲れる",
    ],
  },
  lone_wolf: {
    story: "一人の時間が、あなたのエネルギー源。群れることに意味を見出せないのではなく、一人でいるほうが自分らしくいられる。その孤高は、弱さではなく選択。",
    shadow:
      "助けを求めることが苦手。一人で抱え込みすぎて、限界に気づかないことがある。",
    manifestations: [
      "休日は一人で過ごすことが多い",
      "グループより個人で作業するほうが集中できる",
      "人付き合いの後に充電時間が必要",
    ],
  },
  bridge_builder: {
    story: "異なる人々の間に立ち、繋ぐ役割を自然と担う。あなたがいることで、場の空気が柔らかくなる。橋を架けることが、あなたの存在価値の一つ。",
    shadow:
      "仲介に疲れることがある。自分の意見を抑えて、調整役に徹しすぎる瞬間。",
    manifestations: [
      "対立する意見の間で折衷案を出せる",
      "知人同士を紹介するのが好き",
      "「あの人とあの人は合いそう」と自然に考える",
    ],
  },
  guardian: {
    story: "境界線を意識できる人。あなたは自分と他者の領域を尊重し、踏み込みすぎない知性を持っている。それは冷たさではなく、深い敬意。",
    shadow:
      "境界を守ることに固執しすぎると、親密さへの扉が閉ざされることがある。安全と孤立の境目。",
    manifestations: [
      "「ここまで」を自然に設定できる",
      "相手の「嫌」を敏感にキャッチする",
      "親しき中にも礼儀を重んじる",
    ],
  },
  chameleon: {
    story: "場面によって、あなたの色が変わる。それは嘘ではなく、適応の知性。友達の前と恋人の前で違う自分が出るのは、それぞれに対する誠実さの形。",
    shadow:
      "適応しすぎて、「本当の自分」が分からなくなることがある。どれが素の自分なのか迷う瞬間。",
    manifestations: [
      "場の雰囲気に自然と合わせられる",
      "相手によって話し方やテンションが変わる",
      "「あなたって掴みどころがない」と言われたことがある",
    ],
  },
  calm_water: {
    story: "感情の波が穏やか。周りが動揺する場面でも、あなたの内面は静かな水面のよう。その安定感が、周りの人に安心を与えている。",
    shadow:
      "感情を抑えすぎて、自分の本当の気持ちに鈍感になることがある。「怒っていいのに」と言われる瞬間。",
    manifestations: [
      "感情的になることが少ない",
      "トラブル時に冷静でいられる",
      "「落ち着いてるね」と言われることが多い",
    ],
  },
  deep_current: {
    story: "表面は穏やかなのに、内面には深い流れがある。感情を表に出さないだけで、実は豊かに感じている。その奥行きに気づく人は少ない。",
    shadow:
      "内面の豊かさが外に伝わらないことへのもどかしさ。「何を考えているか分からない」と言われる痛み。",
    manifestations: [
      "感動しても表情に出にくい",
      "日記や内省の時間に本音が溢れる",
      "親しい人にだけ、深い話をする",
    ],
  },
  seeker: {
    story: "安心を確認したいのは、大切にしたい関係があるから。あなたの「大丈夫？」は依存ではなく、関係への真剣さの表れ。",
    shadow:
      "確認が過剰になると、相手を疲れさせることがある。自分の不安を相手で埋めようとする瞬間。",
    manifestations: [
      "返信が遅いと少し不安になる",
      "「怒ってない？」と確認することがある",
      "言葉での愛情確認を求める傾向",
    ],
  },
  resilient: {
    story: "倒れても、時間をかけて立ち上がれる。あなたの回復力は、折れない強さではなく、折れた後に再生できる力。",
    shadow:
      "回復できることに甘えて、自分を追い込みすぎることがある。「大丈夫」が口癖になる危険。",
    manifestations: [
      "辛い出来事の後も、時間が経つと前を向ける",
      "失敗を引きずらないタイプ",
      "「まあ何とかなる」という感覚がある",
    ],
  },
  minimalist: {
    story: "余計なものを削ぎ落とすことで、本質を浮かび上がらせる。あなたのミニマリズムは、無関心ではなく、研ぎ澄まされた選択の結果。",
    shadow:
      "削ぎ落としすぎて、遊びや余白まで失うことがある。「無駄」の中にある豊かさを見逃す。",
    manifestations: [
      "持ち物が少ない、または厳選されている",
      "シンプルな解決策を好む",
      "情報過多の環境にストレスを感じる",
    ],
  },
  expressionist: {
    story: "内面にあるものを、外に出さずにはいられない。表現することがあなたの呼吸であり、黙っていると息が詰まる。その衝動こそが才能。",
    shadow:
      "表現欲が強すぎて、場の空気を読まずに自分を出してしまうことがある。自己主張と自己表現の境目。",
    manifestations: [
      "服装やSNSで自分らしさを表現する",
      "感情を言葉や行動で示す傾向",
      "「黙っていられない」瞬間が多い",
    ],
  },
  respectful_navigator: {
    story: "関係の中で、相手の意思を尊重できる人。あなたは同意の上に関係を築くことの大切さを、直感的に理解している。",
    shadow:
      "慎重すぎて、関係の進展が遅くなることがある。「踏み込んでいいのか」を考えすぎる瞬間。",
    manifestations: [
      "相手の反応を見て距離感を調整する",
      "「嫌なら言ってね」を自然に言える",
      "無理強いを嫌い、自分もされたくない",
    ],
  },
};

export function getTraitCardNarrative(
  cardId: string
): CardNarrativeData | null {
  return CARD_NARRATIVES[cardId] ?? null;
}

// ── Confidence Narrative ──

export function getConfidenceNarrative(
  confidence: number,
  totalObservations: number
): string {
  if (totalObservations < 10) {
    return "まだ始まったばかり。光の形はこれから見えてくる。";
  }
  if (confidence > 0.7) {
    return "この光は確かなものになりつつある。";
  }
  if (confidence > 0.4) {
    return "輪郭が見え始めている。もう少しで、はっきりする。";
  }
  return "まだ揺らいでいる。でも、それも一つの真実。";
}

// ── Core Star Essence Generator ──

export function generateCoreStarEssence(typeDef: TypeDefLike): string {
  const { visual, description } = typeDef;
  const imp = visual.impression;

  // アーキタイプの印象と説明から汎用エッセンスを生成
  // （旧12星座タイプ別テンプレートは除去済み）
  if (imp.length >= 4) {
    return `${imp[0]}と${imp[1]}が自然に共存する存在。${imp[2]}で${imp[3]}——その組み合わせが、あなたの判断や行動を独自のものにしている。`;
  }
  if (imp.length >= 2) {
    return `${imp[0]}と${imp[1]}が、あなたの中で共存している。${description}`;
  }
  return `${description}${imp.join("、")}の傾向が、あなたの中に宿っている。`;
}

// ── Trajectory: Stable vs Moving Axes ──

export function classifyAxes(
  axisScores: Partial<Record<TraitAxisKey, number>>
): {
  stable: { axisId: TraitAxisKey; score: number; label: string }[];
  moving: { axisId: TraitAxisKey; score: number; label: string }[];
  unknown: { axisId: TraitAxisKey; label: string }[];
} {
  const stable: { axisId: TraitAxisKey; score: number; label: string }[] = [];
  const moving: { axisId: TraitAxisKey; score: number; label: string }[] = [];
  const unknown: { axisId: TraitAxisKey; label: string }[] = [];

  for (const axisDef of TRAIT_AXES) {
    const score = axisScores[axisDef.id];
    if (score === undefined || score === 0) {
      unknown.push({
        axisId: axisDef.id,
        label: `${axisDef.labelLeft} ↔ ${axisDef.labelRight}`,
      });
    } else if (Math.abs(score) > 0.3) {
      const label = score < 0 ? axisDef.labelLeft : axisDef.labelRight;
      stable.push({ axisId: axisDef.id, score, label });
    } else {
      moving.push({
        axisId: axisDef.id,
        score,
        label: `${axisDef.labelLeft} ↔ ${axisDef.labelRight}`,
      });
    }
  }

  stable.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  moving.sort((a, b) => Math.abs(a.score) - Math.abs(b.score));

  return { stable, moving, unknown };
}
