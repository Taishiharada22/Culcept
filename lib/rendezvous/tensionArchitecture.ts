// ============================================================
// Tension Architecture - 不快の先にある自己理解
// 生産的摩擦を意図的に導入し、関係性の深層を照らす
// ============================================================

import type { RendezvousCategory } from "./types";

// ---------- Types ----------

export type TensionLevel = "gentle" | "moderate" | "confronting" | "deep";

export type TensionPrompt = {
  id: string;
  level: TensionLevel;
  /** 挑発的な問い (Japanese) */
  prompt: string;
  /** この問いが重要な理由 (Japanese) */
  context: string;
  /** この問いが触れる軸 */
  targetAxes: string[];
  /** 最低限必要な関係の深さ (message count) */
  minDepth: number;
  /** どのカテゴリで有効か */
  categories: RendezvousCategory[];
};

export type TensionResponse = {
  promptId: string;
  response: "faced" | "deferred" | "reflected";
  reflection?: string;
  respondedAt: string;
};

export type TensionInsight = {
  /** 回答が明らかにするパターン */
  pattern: string;
  /** 軸への影響 */
  axisImpact: { axis: string; delta: number }[];
  /** 深い洞察 (Japanese) */
  narrativeInsight: string;
};

// ---------- 24 Tension Prompts ----------

const ALL_CATEGORIES: RendezvousCategory[] = [
  "romantic",
  "friendship",
  "cocreation",
  "community",
];

export const TENSION_PROMPTS: TensionPrompt[] = [
  // ── gentle (6) ──────────────────────────────────────────────
  {
    id: "g-01",
    level: "gentle",
    prompt: "この関係で、あなたが無意識に避けている話題は？",
    context:
      "避けている話題は、あなたが最も守りたいもの、あるいは最も恐れているものを映し出します。",
    targetAxes: ["emotional_openness", "conflict_directness"],
    minDepth: 10,
    categories: ALL_CATEGORIES,
  },
  {
    id: "g-02",
    level: "gentle",
    prompt: "相手の中に、自分と似た弱さを感じることはある？",
    context:
      "他者の中に自分の弱さを認識できるかどうかは、自己理解の深さを測る指標です。",
    targetAxes: ["emotional_openness", "depth_speed"],
    minDepth: 15,
    categories: ALL_CATEGORIES,
  },
  {
    id: "g-03",
    level: "gentle",
    prompt: "この人に会う前と後で、自分のどこが変わった？",
    context:
      "関係が自分をどう変容させているかに気づくことは、関係の本質を理解する第一歩です。",
    targetAxes: ["depth_speed", "stability_need"],
    minDepth: 20,
    categories: ALL_CATEGORIES,
  },
  {
    id: "g-04",
    level: "gentle",
    prompt: "相手に対して「羨ましい」と感じる部分は？",
    context:
      "羨望は抑圧された欲求の鏡です。あなたが本当に求めているものを指し示します。",
    targetAxes: ["stimulation_need", "emotional_openness"],
    minDepth: 10,
    categories: ALL_CATEGORIES,
  },
  {
    id: "g-05",
    level: "gentle",
    prompt: "この関係で、あなたが演じている役割は何？",
    context:
      "無意識に引き受ける役割は、過去の関係パターンの反復かもしれません。",
    targetAxes: ["initiative", "social_energy"],
    minDepth: 15,
    categories: ALL_CATEGORIES,
  },
  {
    id: "g-06",
    level: "gentle",
    prompt: "相手といるとき、「本当の自分」に近い？遠い？",
    context:
      "安全な関係は「自分でいられる」関係。この問いが難しいなら、それ自体が重要な手がかりです。",
    targetAxes: ["emotional_openness", "distance_need"],
    minDepth: 10,
    categories: ALL_CATEGORIES,
  },

  // ── moderate (6) ────────────────────────────────────────────
  {
    id: "m-01",
    level: "moderate",
    prompt: "この人との関係を続ける本当の理由を、嘘なく言えますか？",
    context:
      "表面的な理由の奥にある本音は、あなたの関係性パターンの核心に触れます。",
    targetAxes: ["depth_speed", "conflict_directness"],
    minDepth: 20,
    categories: ALL_CATEGORIES,
  },
  {
    id: "m-02",
    level: "moderate",
    prompt: "相手に一つだけ「変わってほしい」と言えるなら、何？",
    context:
      "変えたい部分は、あなた自身の未解決の課題を反映していることがあります。",
    targetAxes: ["conflict_directness", "emotional_openness"],
    minDepth: 25,
    categories: ALL_CATEGORIES,
  },
  {
    id: "m-03",
    level: "moderate",
    prompt: "この関係で、あなたが失っているものは何？",
    context:
      "得るものばかりに目を向けがちですが、失っているものを認識することが関係の健全さを保ちます。",
    targetAxes: ["stability_need", "distance_need"],
    minDepth: 20,
    categories: ALL_CATEGORIES,
  },
  {
    id: "m-04",
    level: "moderate",
    prompt: "相手に言えていない「ありがとう」か「ごめんなさい」は？",
    context:
      "言えていない言葉は、関係の中で固まった感情の結晶です。溶かすことで流れが変わります。",
    targetAxes: ["emotional_openness", "conflict_directness"],
    minDepth: 15,
    categories: ALL_CATEGORIES,
  },
  {
    id: "m-05",
    level: "moderate",
    prompt: "あなたがこの関係で恐れていることの正体は？",
    context:
      "恐れの正体を言語化できた瞬間、それはあなたを支配する力を失い始めます。",
    targetAxes: ["stability_need", "emotional_openness"],
    minDepth: 25,
    categories: ALL_CATEGORIES,
  },
  {
    id: "m-06",
    level: "moderate",
    prompt: "もしこの人が突然いなくなったら、最も困ることは？",
    context:
      "依存と愛着の境界線を見つめることは、関係の質を高めるための不可欠な作業です。",
    targetAxes: ["distance_need", "stability_need"],
    minDepth: 20,
    categories: ["romantic", "friendship"],
  },

  // ── confronting (6) ─────────────────────────────────────────
  {
    id: "c-01",
    level: "confronting",
    prompt: "この関係は、あなたの成長を助けている？それとも妨げている？",
    context:
      "居心地の良さが停滞を意味することもあります。この問いへの即答こそが答えです。",
    targetAxes: ["stimulation_need", "depth_speed"],
    minDepth: 30,
    categories: ALL_CATEGORIES,
  },
  {
    id: "c-02",
    level: "confronting",
    prompt:
      "あなたは本当にこの人を見ていますか？それとも自分の理想を投影している？",
    context:
      "投影は関係の最大の敵です。相手を「そのまま」見る勇気が、本当の関係を始めます。",
    targetAxes: ["emotional_openness", "depth_speed"],
    minDepth: 35,
    categories: ["romantic", "friendship"],
  },
  {
    id: "c-03",
    level: "confronting",
    prompt: "この関係で、あなたが支配しようとしていることは？",
    context:
      "支配欲はしばしば不安の仮面を被っています。何を制御したいのか、なぜ制御したいのかを問います。",
    targetAxes: ["initiative", "conflict_directness"],
    minDepth: 30,
    categories: ALL_CATEGORIES,
  },
  {
    id: "c-04",
    level: "confronting",
    prompt: "相手の「嫌いな部分」は、実は自分の中にもありませんか？",
    context:
      "ユングの影の投影。最も嫌う他者の特性は、自分が抑圧している特性である可能性があります。",
    targetAxes: ["emotional_openness", "conflict_directness"],
    minDepth: 25,
    categories: ALL_CATEGORIES,
  },
  {
    id: "c-05",
    level: "confronting",
    prompt:
      "この関係から逃げたいと思ったことは？その時、何が起きていた？",
    context:
      "逃げたい衝動の背景にあるものを見つめることで、あなたの回避パターンが見えてきます。",
    targetAxes: ["stability_need", "conflict_directness"],
    minDepth: 30,
    categories: ALL_CATEGORIES,
  },
  {
    id: "c-06",
    level: "confronting",
    prompt: "あなたはこの人の前で、本当に正直ですか？",
    context:
      "正直さの欠如は関係を蝕みます。何を隠しているか、なぜ隠しているかが重要です。",
    targetAxes: ["emotional_openness", "conflict_directness"],
    minDepth: 35,
    categories: ALL_CATEGORIES,
  },

  // ── deep (6) ────────────────────────────────────────────────
  {
    id: "d-01",
    level: "deep",
    prompt: "この関係が終わった時、あなたは何を学んだと言えますか？",
    context:
      "関係の終わりを想像することで、今この瞬間の意味が浮かび上がります。",
    targetAxes: ["depth_speed", "stability_need"],
    minDepth: 40,
    categories: ALL_CATEGORIES,
  },
  {
    id: "d-02",
    level: "deep",
    prompt: "あなたがこの人に与えている「傷」に気づいていますか？",
    context:
      "自分が加害者になりうる可能性を直視することは、最も勇気を要する自己認識です。",
    targetAxes: ["emotional_openness", "conflict_directness"],
    minDepth: 40,
    categories: ["romantic", "friendship"],
  },
  {
    id: "d-03",
    level: "deep",
    prompt: "この関係の中で、あなたが最も成長を拒んでいる部分は？",
    context:
      "成長の拒否は、現在の自己像を守るための無意識の戦略です。何を守ろうとしているのか。",
    targetAxes: ["stimulation_need", "depth_speed"],
    minDepth: 45,
    categories: ALL_CATEGORIES,
  },
  {
    id: "d-04",
    level: "deep",
    prompt: "もし全ての防衛を下ろしたら、この人に何を言いますか？",
    context:
      "防衛の奥にある言葉こそが、あなたの本当の声です。それを知ることは自己理解の核心です。",
    targetAxes: ["emotional_openness", "distance_need"],
    minDepth: 40,
    categories: ALL_CATEGORIES,
  },
  {
    id: "d-05",
    level: "deep",
    prompt:
      "あなたが関係を「安全」にしようとすることで、何が犠牲になっている？",
    context:
      "安全への過度な執着は、親密さと成長の最大の障壁になりえます。",
    targetAxes: ["stability_need", "stimulation_need"],
    minDepth: 45,
    categories: ALL_CATEGORIES,
  },
  {
    id: "d-06",
    level: "deep",
    prompt: "この関係の「真実」を一文で書くなら？",
    context:
      "一文に凝縮する行為は、曖昧さを許さない。あなた自身への最も直接的な問いです。",
    targetAxes: ["depth_speed", "emotional_openness"],
    minDepth: 50,
    categories: ALL_CATEGORIES,
  },
];

// ---------- Prompt index by id ----------

const PROMPT_MAP = new Map<string, TensionPrompt>(
  TENSION_PROMPTS.map((p) => [p.id, p]),
);

export function getTensionPromptById(id: string): TensionPrompt | undefined {
  return PROMPT_MAP.get(id);
}

// ---------- Level ordering ----------

const LEVEL_ORDER: Record<TensionLevel, number> = {
  gentle: 0,
  moderate: 1,
  confronting: 2,
  deep: 3,
};

// ---------- Season mapping (optional thematic filter) ----------

const SEASON_AFFINITY: Record<string, TensionLevel[]> = {
  spring: ["gentle", "moderate"],
  summer: ["moderate", "confronting"],
  autumn: ["confronting", "deep"],
  winter: ["gentle", "deep"],
};

// ---------- Select appropriate tension prompt ----------

/**
 * 関係の状態に基づいて適切なテンションプロンプトを選択する。
 * 既に出したプロンプトを避け、メッセージ数に応じた深さの問いを返す。
 * まだ準備が整っていない場合は null を返す。
 */
export function selectTensionPrompt(
  category: RendezvousCategory,
  messageCount: number,
  previousPromptIds: string[],
  currentSeason?: string,
): TensionPrompt | null {
  // 最低10メッセージ必要
  if (messageCount < 10) return null;

  const usedSet = new Set(previousPromptIds);

  // カテゴリと深さでフィルタリング
  let candidates = TENSION_PROMPTS.filter(
    (p) =>
      p.categories.includes(category) &&
      p.minDepth <= messageCount &&
      !usedSet.has(p.id),
  );

  if (candidates.length === 0) return null;

  // 季節フィルター（候補が十分にある場合のみ適用）
  if (currentSeason && SEASON_AFFINITY[currentSeason]) {
    const seasonalLevels = SEASON_AFFINITY[currentSeason];
    const seasonFiltered = candidates.filter((p) =>
      seasonalLevels.includes(p.level),
    );
    if (seasonFiltered.length >= 2) {
      candidates = seasonFiltered;
    }
  }

  // レベル順にソートし、最も適切な深さの問いを選ぶ
  // 理想: まだ使っていない最も浅いレベルから始めて段階的に深くする
  candidates.sort((a, b) => {
    const levelDiff = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
    if (levelDiff !== 0) return levelDiff;
    // 同レベル内ではminDepthが近い方を優先
    return Math.abs(a.minDepth - messageCount) - Math.abs(b.minDepth - messageCount);
  });

  // 各レベルでまだ出していないプロンプトがあれば最も浅いレベルから
  // ただし、過去に使ったレベルは基本的にスキップ（全て使い切っていなければ）
  const usedLevels = new Set(
    previousPromptIds
      .map((id) => PROMPT_MAP.get(id)?.level)
      .filter(Boolean),
  );

  // 優先度: まだ使っていないレベルの問い > 使ったレベルの残り
  const freshLevelCandidates = candidates.filter(
    (p) => !usedLevels.has(p.level),
  );

  const pool = freshLevelCandidates.length > 0 ? freshLevelCandidates : candidates;

  // 決定論的だが予測困難な選択（日付ベースシード）
  const dayIndex = Math.floor(Date.now() / 86400000);
  const idx = dayIndex % pool.length;

  return pool[idx];
}

// ---------- Analyze tension response ----------

/**
 * テンションプロンプトへの応答を分析し、洞察を生成する。
 * 回答タイプ（向き合う / 保留 / 内省）に応じて異なる分析を行う。
 */
export function analyzeTensionResponse(
  prompt: TensionPrompt,
  response: TensionResponse,
): TensionInsight {
  const axes = prompt.targetAxes;

  // 回答タイプに基づく分析
  switch (response.response) {
    case "faced": {
      // 「向き合う」を選んだ場合 — 勇気を持って直面した
      return {
        pattern: `${prompt.level}レベルの問いに直面する意志を示した`,
        axisImpact: axes.map((axis) => ({
          axis,
          delta: prompt.level === "deep" ? 0.08 : prompt.level === "confronting" ? 0.06 : 0.04,
        })),
        narrativeInsight: generateFacedInsight(prompt),
      };
    }

    case "deferred": {
      // 「今はまだ」を選んだ場合 — 回避にも意味がある
      return {
        pattern: `この問いの回避自体が重要なシグナル: ${prompt.targetAxes.join("/")}軸に防衛が存在`,
        axisImpact: axes.map((axis) => ({
          axis,
          delta: -0.02, // わずかなマイナス — 回避は観測データ
        })),
        narrativeInsight: generateDeferredInsight(prompt),
      };
    }

    case "reflected": {
      // 「書き留める」を選んだ場合 — 内省の深さに応じた評価
      const reflectionDepth = response.reflection
        ? Math.min(response.reflection.length / 200, 1)
        : 0;

      return {
        pattern: `内省的アプローチ: ${prompt.targetAxes.join("/")}軸について言語化を試みた`,
        axisImpact: axes.map((axis) => ({
          axis,
          delta: 0.03 + reflectionDepth * 0.07, // 内省の深さに比例
        })),
        narrativeInsight: generateReflectedInsight(prompt, reflectionDepth),
      };
    }
  }
}

// ---------- Insight generation helpers ----------

function generateFacedInsight(prompt: TensionPrompt): string {
  const insights: Record<TensionLevel, string[]> = {
    gentle: [
      "この問いに向き合えたこと自体が、関係への信頼の表れです。避けていたものを見つめる準備ができている。",
      "表面的な快適さの奥に、あなたは何かを感じ取っていたはず。その直感を信頼してください。",
    ],
    moderate: [
      "不快な問いに直面する力は、関係を次の段階に進めるための鍵です。あなたは成長を選んだ。",
      "この問いが刺さったということは、あなたの中に「答え」が既にあるということです。",
    ],
    confronting: [
      "自分の影に光を当てる勇気。この瞬間、あなたは関係の中で最も正直な自分に近づいています。",
      "対峙することを選んだあなたは、逃げることでは得られない理解に到達しようとしています。",
    ],
    deep: [
      "最も深い問いに向き合えることは、あなたが関係の中で本当の変容を求めている証拠です。この勇気は稀有なものです。",
      "防衛を下ろし、真実と向き合う。この瞬間があなたの関係性の転換点になりえます。",
    ],
  };

  const pool = insights[prompt.level];
  const idx = prompt.id.charCodeAt(prompt.id.length - 1) % pool.length;
  return pool[idx];
}

function generateDeferredInsight(prompt: TensionPrompt): string {
  const insights: Record<TensionLevel, string> = {
    gentle:
      "穏やかな問いでも避けたくなる — それは自分を守るための自然な反応です。何を守っているのかを、いつか見つめてみてください。",
    moderate:
      "「今はまだ」という選択にも誠実さがあります。ただ、この問いが心に残るなら、それは答える準備が近いサインかもしれません。",
    confronting:
      "この問いから距離を置く判断は、自分を守る知恵です。しかし、繰り返し避ける問いは、最も重要な問いである可能性があります。",
    deep:
      "最も深い問いを保留にした。それは弱さではなく、まだ安全な場所が必要だという自己認識です。時が来たら、戻ってきてください。",
  };

  return insights[prompt.level];
}

function generateReflectedInsight(
  prompt: TensionPrompt,
  depth: number,
): string {
  if (depth > 0.7) {
    return "深い内省を行った。言語化することで、無意識の領域にあったものが意識に上がってきています。この気づきを大切にしてください。";
  }
  if (depth > 0.3) {
    return "言葉にし始めた。まだ完全には掴めていないかもしれませんが、内省のプロセス自体が価値を持っています。続けることで、より鮮明になります。";
  }
  return "書き留めることを選んだこと自体が重要な一歩です。言葉にならない感覚も、いつか形を見つけます。";
}
