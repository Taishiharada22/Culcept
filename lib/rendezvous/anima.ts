/**
 * Anima Engine - Rendezvous の「魂」
 *
 * すべての関係性サブシステム（Mirror, Seasons, Observatory, Patterns, Living Score）
 * からデータを統合し、ユーザーに自然な日本語でインサイトを届ける。
 * データダンプではなく、友人からの手紙のような温かい観察。
 */

// =============================================================================
// Types
// =============================================================================

export type AnimaInsightType =
  | "pattern_observation"
  | "growth_reflection"
  | "relationship_weather"
  | "unconscious_nudge"
  | "celebration"
  | "gentle_warning"
  | "curiosity_spark"
  | "weekly_letter"
  | "metamorphosis_whisper"
  | "self_discovery"
  | "welcome_back";

export type AnimaEmotionalTone =
  | "warm"
  | "reflective"
  | "playful"
  | "serious"
  | "celebratory";

export type AnimaInsight = {
  id: string;
  type: AnimaInsightType;
  message: string;
  subtext?: string;
  source: string[];
  priority: number;
  emotionalTone: AnimaEmotionalTone;
  createdAt: string;
  relatedCandidateId?: string;
};

export type AnimaCandidateSnapshot = {
  id: string;
  category: string;
  state: string;
  messageCount: number;
  lastMessageAt?: string;
};

export type AnimaContext = {
  userId: string;
  candidates: AnimaCandidateSnapshot[];
  recentPatterns?: {
    avoidanceCount?: number;
    topicChangeCount?: number;
    repeatingTypes?: string[];
  };
  seasonData?: {
    candidateId: string;
    currentSeason: string;
    progress: number;
  }[];
  mirrorArchetype?: string;
  trajectoryDirections?: {
    candidateId: string;
    direction: "rising" | "stable" | "cooling";
    livingScore: number;
  }[];
  observatoryInsights?: {
    axis: string;
    delta: number;
    description?: string;
  }[];
  streakDays?: number;
};

// =============================================================================
// Helpers
// =============================================================================

function generateId(): string {
  return `anima_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function now(): string {
  return new Date().toISOString();
}

// =============================================================================
// Voice Tone Selection
// =============================================================================

/**
 * ユーザーの現在の状態からAnimaの語り口を決める
 */
export function selectAnimaVoiceTone(ctx: AnimaContext): AnimaEmotionalTone {
  // お祝い系: ストリーク達成 or 多くの活発な会話
  const activeCandidates = ctx.candidates.filter(
    (c) => c.state === "mutual_liked" || c.state === "chat_opened",
  );
  if (ctx.streakDays && ctx.streakDays >= 7) return "celebratory";
  if (activeCandidates.length >= 3) return "playful";

  // 警告系: 冷却傾向が多い
  const coolingCount =
    ctx.trajectoryDirections?.filter((t) => t.direction === "cooling").length ??
    0;
  if (coolingCount >= 2) return "serious";

  // 観察系: パターン検出あり
  if (
    ctx.recentPatterns?.avoidanceCount &&
    ctx.recentPatterns.avoidanceCount > 0
  ) {
    return "reflective";
  }

  // デフォルト
  return "warm";
}

// =============================================================================
// Insight Generators (internal)
// =============================================================================

function generateCelebrations(ctx: AnimaContext): AnimaInsight[] {
  const insights: AnimaInsight[] = [];

  // ストリーク達成
  if (ctx.streakDays && ctx.streakDays >= 7 && ctx.streakDays % 7 === 0) {
    insights.push({
      id: generateId(),
      type: "celebration",
      message: `${ctx.streakDays}日間、毎日誰かと言葉を交わしている。続けることの中に、あなたの強さがある。`,
      source: ["streak"],
      priority: 0.9,
      emotionalTone: "celebratory",
      createdAt: now(),
    });
  }

  // 初めてのchat_opened
  const chatOpened = ctx.candidates.filter((c) => c.state === "chat_opened");
  if (chatOpened.length === 1) {
    insights.push({
      id: generateId(),
      type: "celebration",
      message:
        "初めての会話が始まった。最初の一歩を踏み出したこと、それ自体が大きな意味を持つ。",
      source: ["candidates"],
      priority: 0.95,
      emotionalTone: "celebratory",
      createdAt: now(),
      relatedCandidateId: chatOpened[0].id,
    });
  }

  // メッセージ数の節目
  for (const c of ctx.candidates) {
    if (c.messageCount === 10 || c.messageCount === 50) {
      insights.push({
        id: generateId(),
        type: "celebration",
        message:
          c.messageCount === 10
            ? "10通目のメッセージ。ぎこちなさの中にも、少しずつリズムが生まれてきた。"
            : "50通の言葉を交わした。もう「初対面」ではない。",
        source: ["messages"],
        priority: 0.8,
        emotionalTone: "warm",
        createdAt: now(),
        relatedCandidateId: c.id,
      });
    }
  }

  return insights;
}

function generatePatternObservations(ctx: AnimaContext): AnimaInsight[] {
  const insights: AnimaInsight[] = [];

  // ミラーアーキタイプからの観察
  if (ctx.mirrorArchetype) {
    const archetypeMessages: Record<string, string> = {
      nurturer:
        "あなたはいつも相手を気遣う側にいる。でも、誰があなたを気遣っているだろう？",
      explorer:
        "新しい人との出会いにワクワクしている。その好奇心が、あなたの魅力になっている。",
      guardian:
        "信頼できる人を慎重に選んでいる。その慎重さは、関係を深くする力になる。",
      catalyst:
        "あなたの存在が、周りの人の変化を促している。それに気づいているだろうか。",
    };
    const msg = archetypeMessages[ctx.mirrorArchetype];
    if (msg) {
      insights.push({
        id: generateId(),
        type: "pattern_observation",
        message: msg,
        source: ["mirror"],
        priority: 0.7,
        emotionalTone: "reflective",
        createdAt: now(),
      });
    }
  }

  // Observatory からの気づき
  if (ctx.observatoryInsights && ctx.observatoryInsights.length > 0) {
    const strongest = ctx.observatoryInsights.reduce((a, b) =>
      Math.abs(b.delta) > Math.abs(a.delta) ? b : a,
    );
    if (Math.abs(strongest.delta) > 0.05) {
      const direction = strongest.delta > 0 ? "高まっている" : "落ち着いている";
      const axisLabels: Record<string, string> = {
        emotional_openness: "感情の開放度",
        conversation_temperature: "会話の温度",
        initiative: "主体性",
        depth_speed: "深さへの速度",
        social_energy: "社交エネルギー",
        stability_need: "安定への欲求",
        stimulation_need: "刺激への欲求",
        distance_need: "距離感の必要性",
        conflict_directness: "対立への直接性",
        structure_preference: "構造への好み",
      };
      const label = axisLabels[strongest.axis] ?? strongest.axis;
      insights.push({
        id: generateId(),
        type: "curiosity_spark",
        message: `最近のあなたの行動を見ていると、「${label}」が${direction}。自覚はある？`,
        source: ["observatory"],
        priority: 0.65,
        emotionalTone: "playful",
        createdAt: now(),
      });
    }
  }

  return insights;
}

function generateGrowthReflections(ctx: AnimaContext): AnimaInsight[] {
  const insights: AnimaInsight[] = [];

  // Rising trajectory がある場合
  const rising = ctx.trajectoryDirections?.filter(
    (t) => t.direction === "rising",
  );
  if (rising && rising.length > 0) {
    const candidate = ctx.candidates.find((c) => c.id === rising[0].candidateId);
    if (candidate && candidate.messageCount > 5) {
      insights.push({
        id: generateId(),
        type: "growth_reflection",
        message:
          "ある関係の温度が、静かに上がっている。1週間前のあなたなら、ここまで話していなかったかもしれない。",
        subtext: "成長は、振り返って初めて見える。",
        source: ["trajectory", "messages"],
        priority: 0.75,
        emotionalTone: "warm",
        createdAt: now(),
        relatedCandidateId: rising[0].candidateId,
      });
    }
  }

  return insights;
}

function generateRelationshipWeather(ctx: AnimaContext): AnimaInsight[] {
  const insights: AnimaInsight[] = [];

  if (ctx.candidates.length === 0) return insights;

  // Season data から全体の天気を判定
  const seasons = ctx.seasonData ?? [];
  const springCount = seasons.filter((s) => s.currentSeason === "spring").length;
  const summerCount = seasons.filter((s) => s.currentSeason === "summer").length;
  const winterCount = seasons.filter((s) => s.currentSeason === "winter").length;

  let weatherMessage: string;
  let tone: AnimaEmotionalTone;

  if (summerCount > springCount && summerCount > winterCount) {
    weatherMessage =
      "今週の関係性の天気：晴れ。いくつかの関係が満開に近づいている。この暖かさを楽しんで。";
    tone = "warm";
  } else if (springCount >= summerCount && springCount >= winterCount) {
    weatherMessage =
      "今週の関係性の天気：春の風。新しい芽が出ている。まだ繊細だけど、可能性に満ちている。";
    tone = "playful";
  } else if (winterCount > 0 && winterCount >= summerCount) {
    weatherMessage =
      "今週の関係性の天気：曇り時々雪。静かな時間が続いている。でも、冬は終わりではない。";
    tone = "reflective";
  } else {
    weatherMessage =
      "今週の関係性の天気：穏やか。大きな変化はないけれど、それは悪いことではない。";
    tone = "warm";
  }

  insights.push({
    id: generateId(),
    type: "relationship_weather",
    message: weatherMessage,
    source: ["seasons"],
    priority: 0.5,
    emotionalTone: tone,
    createdAt: now(),
  });

  return insights;
}

function generateGentleWarnings(ctx: AnimaContext): AnimaInsight[] {
  const insights: AnimaInsight[] = [];

  // 回避パターン検出
  if (
    ctx.recentPatterns?.avoidanceCount &&
    ctx.recentPatterns.avoidanceCount >= 2
  ) {
    insights.push({
      id: generateId(),
      type: "unconscious_nudge",
      message:
        "また同じパターンが出ている。深い話になると、あなたは話題を変える傾向がある。でも、それはあなたの安全装置かもしれない。",
      subtext: "無理に変える必要はない。ただ、気づいていることが大切。",
      source: ["patterns"],
      priority: 0.6,
      emotionalTone: "reflective",
      createdAt: now(),
    });
  }

  // Cooling trajectory 警告
  const cooling = ctx.trajectoryDirections?.filter(
    (t) => t.direction === "cooling",
  );
  if (cooling && cooling.length >= 2) {
    insights.push({
      id: generateId(),
      type: "gentle_warning",
      message:
        "いくつかの関係が、静かに距離を置き始めている。このペースだと、秋が近づいている。",
      subtext: "放置は選択肢のひとつ。でも、意識的な選択であってほしい。",
      source: ["trajectory", "seasons"],
      priority: 0.55,
      emotionalTone: "serious",
      createdAt: now(),
    });
  }

  return insights;
}

// =============================================================================
// Main Generator
// =============================================================================

/**
 * AnimaContext を分析し、1-3件のインサイトを優先度順に返す
 */
export function generateAnimaInsights(ctx: AnimaContext): AnimaInsight[] {
  const allInsights: AnimaInsight[] = [
    ...generateCelebrations(ctx),
    ...generatePatternObservations(ctx),
    ...generateGrowthReflections(ctx),
    ...generateRelationshipWeather(ctx),
    ...generateGentleWarnings(ctx),
  ];

  // 優先度でソート（高い順）
  allInsights.sort((a, b) => b.priority - a.priority);

  // 圧倒しないよう最大3件
  return allInsights.slice(0, 3);
}

// =============================================================================
// Weekly Letter
// =============================================================================

/**
 * 1週間の関係性ランドスケープを3-4文の日本語でまとめる
 * 友人からの手紙のような、温かく個人的なトーン
 */
export function generateWeeklyLetter(ctx: AnimaContext): AnimaInsight {
  const tone = selectAnimaVoiceTone(ctx);
  const activeCount = ctx.candidates.filter(
    (c) => c.state === "mutual_liked" || c.state === "chat_opened",
  ).length;
  const totalMessages = ctx.candidates.reduce(
    (sum, c) => sum + c.messageCount,
    0,
  );
  const risingCount =
    ctx.trajectoryDirections?.filter((t) => t.direction === "rising").length ??
    0;
  const coolingCount =
    ctx.trajectoryDirections?.filter((t) => t.direction === "cooling").length ??
    0;

  const parts: string[] = [];

  // 冒頭
  if (activeCount === 0) {
    parts.push("今週は静かな週だった。でも、沈黙にも意味がある。");
  } else if (activeCount === 1) {
    parts.push("今週、ひとつの関係が穏やかに続いている。");
  } else {
    parts.push(
      `今週は${activeCount}つの関係が動いている。それぞれに違うリズムがある。`,
    );
  }

  // 中間（変化の観察）
  if (risingCount > 0 && coolingCount === 0) {
    parts.push(
      "温度が上がっている関係がある。あなたの言葉が、少しずつ相手に届いている証拠。",
    );
  } else if (coolingCount > 0 && risingCount === 0) {
    parts.push(
      "少し距離が生まれた関係もある。それが自然な流れなのか、避けているのか。自分に聞いてみて。",
    );
  } else if (risingCount > 0 && coolingCount > 0) {
    parts.push(
      "近づく関係もあれば、距離が生まれる関係もある。全部を同時に深める必要はない。",
    );
  }

  // 結び
  if (totalMessages > 20) {
    parts.push("たくさんの言葉を交わした週。次の言葉を急がなくていい。");
  } else {
    parts.push("次の一歩は、あなたのタイミングで。");
  }

  return {
    id: generateId(),
    type: "weekly_letter",
    message: parts.join(""),
    source: ["weekly_synthesis"],
    priority: 1.0,
    emotionalTone: tone,
    createdAt: now(),
  };
}
