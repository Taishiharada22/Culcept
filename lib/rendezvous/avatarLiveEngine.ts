// ============================================================
// Avatar Live Engine — 会話生成・リアクション学習
// ============================================================

import type { MatchingVector, RendezvousCategory } from "./types";
import type {
  AvatarSkill,
  AvatarSkillType,
  AvatarConversationStyle,
} from "./avatarPersonality";
import { computeConversationStyle, addExperience } from "./avatarPersonality";
import type { AvatarPersonalityState } from "./avatarPersonality";

// ---------- Types ----------

export type AvatarConversationStatus = "active" | "completed" | "archived";

export type ReactionType =
  | "fire"
  | "gem"
  | "laugh"
  | "bullseye"
  | "curious"
  | "wrong";

export type AvatarMessageSender = "my_avatar" | "their_avatar";

export type AvatarMessage = {
  sender: AvatarMessageSender;
  text: string;
  timestamp_offset_sec: number;
};

export type AvatarConversation = {
  id: string;
  candidate_id: string;
  messages: AvatarMessage[];
  highlight: AvatarMessage[] | null;
  summary: string | null;
  status: AvatarConversationStatus;
  category: RendezvousCategory;
  started_at: string;
  completed_at: string | null;
};

// ---------- Conversation Topic Templates ----------

const TOPIC_POOL_BY_CATEGORY: Record<RendezvousCategory, string[]> = {
  romantic: [
    "理想の休日の過ごし方",
    "幸せを感じる瞬間",
    "人間関係で大切にしていること",
    "好きな映画や音楽の話",
    "将来の夢や目標",
    "朝型か夜型か",
    "一人の時間の使い方",
    "旅行で行きたい場所",
  ],
  friendship: [
    "最近ハマっていること",
    "週末の過ごし方",
    "好きな食べ物やお店",
    "ストレス解消法",
    "面白かったコンテンツ",
    "子どもの頃の遊び",
    "得意料理",
    "行きたいイベント",
  ],
  cocreation: [
    "今取り組んでいるプロジェクト",
    "得意なスキルや専門分野",
    "チームワークのスタイル",
    "刺激を受けるクリエイター",
    "課題解決のアプローチ",
    "未来のビジョン",
    "学びたいこと",
    "コラボで実現したいこと",
  ],
  community: [
    "地域で好きな場所",
    "参加しているコミュニティ",
    "社会課題への関心",
    "ボランティア経験",
    "理想のコミュニティ像",
    "地元の魅力",
    "人が集まる場の価値",
    "季節の楽しみ方",
  ],
  partner: [
    "人生で大切にしている価値観",
    "将来の暮らしのイメージ",
    "パートナーに求めるもの",
    "お金や仕事に対する考え方",
    "家族との関係性",
    "譲れないライフスタイル",
    "困難な時の乗り越え方",
    "安心できる関係とは",
  ],
};

// ---------- Conversation Generation ----------

/**
 * 2つのベクトル間でアバター会話を生成
 * questionsToAsk は対話中に自然に織り込む質問
 */
export function generateAvatarConversation(
  myVector: MatchingVector,
  theirVector: MatchingVector,
  mySkills: AvatarSkill[],
  category: RendezvousCategory,
  questionsToAsk: string[] = [],
): AvatarMessage[] {
  const style = computeConversationStyle(
    vectorToPersonality(myVector),
    mySkills,
  );
  const theirStyle = inferTheirStyle(theirVector);

  const topics = selectTopics(category, myVector, theirVector);
  const messageCount = computeMessageCount(style, theirStyle);
  const messages: AvatarMessage[] = [];

  let offsetSec = 0;

  // Opening message (my_avatar starts based on initiative)
  const myGoesFirst = myVector.initiative > theirVector.initiative;
  const firstSender: AvatarMessageSender = myGoesFirst
    ? "my_avatar"
    : "their_avatar";
  const secondSender: AvatarMessageSender = myGoesFirst
    ? "their_avatar"
    : "my_avatar";

  // Generate opening
  messages.push({
    sender: firstSender,
    text: generateOpening(
      firstSender === "my_avatar" ? style : theirStyle,
      category,
    ),
    timestamp_offset_sec: offsetSec,
  });
  offsetSec += randomDelay(style, theirStyle);

  // Weave questions into conversation naturally
  const questionSlots = distributeQuestions(
    questionsToAsk,
    messageCount - 2,
  );

  let topicIndex = 0;
  let currentSender = secondSender;

  for (let i = 1; i < messageCount - 1; i++) {
    const isMyTurn = currentSender === "my_avatar";
    const currentStyle = isMyTurn ? style : theirStyle;

    // Check if this slot has a question to weave in
    const questionForSlot = questionSlots.get(i);
    let text: string;

    if (questionForSlot && isMyTurn) {
      text = weaveQuestion(questionForSlot, currentStyle);
    } else if (questionForSlot && !isMyTurn) {
      // Their avatar responds to the topic, we'll ask next turn
      text = generateResponse(
        currentStyle,
        topics[topicIndex % topics.length],
        category,
      );
    } else {
      text = generateMessage(
        currentStyle,
        topics[topicIndex % topics.length],
        category,
        i,
        messageCount,
      );
    }

    messages.push({
      sender: currentSender,
      text,
      timestamp_offset_sec: offsetSec,
    });

    offsetSec += randomDelay(style, theirStyle);
    currentSender =
      currentSender === "my_avatar" ? "their_avatar" : "my_avatar";

    if (i % 2 === 0) topicIndex++;
  }

  // Closing message
  messages.push({
    sender: currentSender,
    text: generateClosing(
      currentSender === "my_avatar" ? style : theirStyle,
      category,
    ),
    timestamp_offset_sec: offsetSec,
  });

  return messages;
}

/**
 * 会話のハイライト（最も面白い2-3メッセージの交換）を抽出
 */
export function generateConversationHighlight(
  conversation: AvatarMessage[],
): AvatarMessage[] {
  if (conversation.length <= 3) return conversation;

  // Heuristic: pick the middle section as it's usually the deepest
  const midStart = Math.floor(conversation.length / 3);
  const midEnd = Math.min(midStart + 3, conversation.length);
  return conversation.slice(midStart, midEnd);
}

/**
 * 会話の一行サマリーを生成
 */
export function generateConversationSummary(
  conversation: AvatarMessage[],
): string {
  if (conversation.length === 0) return "会話なし";

  // Find the main topic keywords from messages
  const allText = conversation.map((m) => m.text).join(" ");

  // Simple topic extraction
  const topicHints = [
    { keyword: "休日", summary: "休日の過ごし方について盛り上がりました" },
    { keyword: "仕事", summary: "お互いの仕事について語り合いました" },
    { keyword: "趣味", summary: "共通の趣味で意気投合しました" },
    { keyword: "旅行", summary: "旅行の話で盛り上がりました" },
    { keyword: "音楽", summary: "音楽の趣味について話しました" },
    { keyword: "映画", summary: "映画の好みが近いことがわかりました" },
    { keyword: "料理", summary: "料理の話で共通点が見つかりました" },
    { keyword: "プロジェクト", summary: "プロジェクトへの想いを共有しました" },
    { keyword: "大切", summary: "大切にしている価値観を共有しました" },
    { keyword: "夢", summary: "お互いの夢について深い話ができました" },
  ];

  for (const hint of topicHints) {
    if (allText.includes(hint.keyword)) return hint.summary;
  }

  const msgCount = conversation.length;
  if (msgCount >= 12) return "長く深い対話が交わされました";
  if (msgCount >= 8) return "充実した会話が展開されました";
  return "短いけれど印象的なやりとりでした";
}

/**
 * ユーザーのリアクションに基づいてスキルを調整
 *
 * 🔥 fire = 今のスタイルを強化
 * 💎 gem = 深さを報酬
 * 😂 laugh = ユーモアを報酬
 * 🎯 bullseye = 話題の関連性を報酬
 * 🤔 curious = より深い探求を促進
 * 😤 wrong = ペナルティ＆方向修正
 */
export function learnFromReaction(
  currentSkills: AvatarSkill[],
  reactionType: ReactionType,
  _messageContext?: { sender: AvatarMessageSender; text: string },
): AvatarSkill[] {
  let updated = [...currentSkills.map((s) => ({ ...s }))];

  switch (reactionType) {
    case "fire": {
      // Reinforce overall conversation style
      updated = addExperience(updated, "topic_expansion", 8);
      updated = addExperience(updated, "empathy", 5);
      break;
    }
    case "gem": {
      // Reward depth and deep questions
      updated = addExperience(updated, "deep_questions", 12);
      updated = addExperience(updated, "incisiveness", 8);
      break;
    }
    case "laugh": {
      // Reward humor
      updated = addExperience(updated, "humor", 15);
      updated = addExperience(updated, "silence_handling", 3);
      break;
    }
    case "bullseye": {
      // Reward topic relevance
      updated = addExperience(updated, "topic_expansion", 12);
      updated = addExperience(updated, "incisiveness", 6);
      break;
    }
    case "curious": {
      // Encourage deeper probing
      updated = addExperience(updated, "deep_questions", 10);
      updated = addExperience(updated, "empathy", 6);
      updated = addExperience(updated, "silence_handling", 4);
      break;
    }
    case "wrong": {
      // Penalize: reduce dominant skill slightly, boost alternatives
      const dominant = updated.reduce((a, b) =>
        a.level > b.level ? a : b,
      );
      // Don't decrease level, but boost the weaker skills to rebalance
      const weak = updated.reduce((a, b) =>
        a.level < b.level ? a : b,
      );
      updated = addExperience(updated, weak.skill_type, 10);
      updated = addExperience(updated, "empathy", 5);
      break;
    }
  }

  return updated;
}

/**
 * バトン交代を提案すべきか判定
 * 3回以上の会話ラウンドで良好なエンゲージメントシグナルがある場合true
 */
export function shouldSuggestBatonChange(
  conversationHistory: AvatarConversation[],
): boolean {
  const completed = conversationHistory.filter(
    (c) => c.status === "completed",
  );

  if (completed.length < 3) return false;

  // Check if recent conversations have good engagement
  // (have highlights, reasonable message count)
  const recent = completed.slice(-3);
  const avgMessages =
    recent.reduce((sum, c) => sum + c.messages.length, 0) / recent.length;
  const hasHighlights = recent.every((c) => c.highlight && c.highlight.length > 0);

  return avgMessages >= 8 && hasHighlights;
}

// ---------- 3日制限 + あと1日ルール ----------

export type EscalationState = {
  /** アバター会話開始からの経過日数 */
  daysSinceFirstConversation: number;
  /** ユーザーが「あと1日」を使ったか */
  hasUsedPostpone: boolean;
  /** 強制判断が必要か（出るか消えるか） */
  mustDecideNow: boolean;
  /** 自動アーカイブされたか */
  autoArchived: boolean;
  /** アバターからの提案メッセージ */
  avatarSuggestion: string | null;
};

/**
 * 3日間の温め期間 + 1回限りの「あと1日だけ」ルールに基づくエスカレーション判定
 *
 * Day 1-2: アバターが自由に会話を続ける
 * Day 3: アバターが「そろそろ本人に会わせたい」と提案
 * Day 3でユーザーが「あと1日だけ」を選択 → Day 4が最終日
 * Day 4（または Day 3で「あと1日」未使用）: 出るか消えるかの二択
 * 選択しなかった場合: 自動アーカイブ
 */
export function computeEscalationState(
  firstConversationAt: string | null,
  postponeUsedAt: string | null,
  batonChangedAt: string | null,
): EscalationState {
  if (!firstConversationAt || batonChangedAt) {
    return {
      daysSinceFirstConversation: 0,
      hasUsedPostpone: false,
      mustDecideNow: false,
      autoArchived: false,
      avatarSuggestion: null,
    };
  }

  const now = Date.now();
  const firstDate = new Date(firstConversationAt).getTime();
  const daysSince = Math.floor((now - firstDate) / (1000 * 60 * 60 * 24));
  const hasUsedPostpone = !!postponeUsedAt;

  // Day 4+ with postpone already used → 自動アーカイブ
  if (daysSince >= 4 && hasUsedPostpone) {
    return {
      daysSinceFirstConversation: daysSince,
      hasUsedPostpone: true,
      mustDecideNow: false,
      autoArchived: true,
      avatarSuggestion: "この出会いは静かに流れていきました。また新しい出会いが待っています。",
    };
  }

  // Day 3+ without postpone → 強制判断（出るか消えるか）
  if (daysSince >= 3 && !hasUsedPostpone) {
    return {
      daysSinceFirstConversation: daysSince,
      hasUsedPostpone: false,
      mustDecideNow: true,
      autoArchived: false,
      avatarSuggestion:
        "かなり盛り上がったよ。そろそろ本人に会わせたい。会話の流れも温まってる。あとは、あなたが来るだけ。",
    };
  }

  // Day 4 after postpone → 最終決断
  if (daysSince >= 4 && hasUsedPostpone) {
    return {
      daysSinceFirstConversation: daysSince,
      hasUsedPostpone: true,
      mustDecideNow: true,
      autoArchived: false,
      avatarSuggestion:
        "昨日の延長戦、ここまで温めたよ。今日が最後。会いに行く？",
    };
  }

  // Day 3 with postpone used → 最終日
  if (daysSince >= 3 && hasUsedPostpone) {
    return {
      daysSinceFirstConversation: daysSince,
      hasUsedPostpone: true,
      mustDecideNow: true,
      autoArchived: false,
      avatarSuggestion:
        "延長した1日が過ぎようとしてる。この人と話してみる？ それとも、ここで終わりにする？",
    };
  }

  // Day 2: まだ早い、でもヒントは出す
  if (daysSince >= 2) {
    return {
      daysSinceFirstConversation: daysSince,
      hasUsedPostpone: false,
      mustDecideNow: false,
      autoArchived: false,
      avatarSuggestion: "いい感じに話が進んでるよ。明日には準備が整いそう。",
    };
  }

  // Day 0-1: まだ温め中
  return {
    daysSinceFirstConversation: daysSince,
    hasUsedPostpone: false,
    mustDecideNow: false,
    autoArchived: false,
    avatarSuggestion: null,
  };
}

// ---------- Internal Helpers ----------

function vectorToPersonality(v: MatchingVector): AvatarPersonalityState {
  return {
    base_temperature: v.conversation_temperature,
    depth_tendency: v.depth_speed,
    social_energy: v.social_energy,
    initiative_level: v.initiative,
    emotional_openness: v.emotional_openness,
    created_from_vector: v,
  };
}

function inferTheirStyle(v: MatchingVector): AvatarConversationStyle {
  return {
    aggressiveness: v.initiative * 0.5 + v.conflict_directness * 0.3 + v.conversation_temperature * 0.2,
    depth_tendency: v.depth_speed * 0.6 + v.emotional_openness * 0.4,
    humor_level: v.social_energy * 0.4 + v.conversation_temperature * 0.4 + v.stimulation_need * 0.2,
    empathy_level: v.emotional_openness * 0.5 + v.distance_need * 0.3 + v.stability_need * 0.2,
  };
}

function selectTopics(
  category: RendezvousCategory,
  myV: MatchingVector,
  theirV: MatchingVector,
): string[] {
  const pool = TOPIC_POOL_BY_CATEGORY[category];
  // Pick 3-5 topics based on similarity in vectors
  const similarity =
    1 -
    Math.abs(myV.depth_speed - theirV.depth_speed) * 0.5 -
    Math.abs(myV.stimulation_need - theirV.stimulation_need) * 0.5;

  const count = Math.max(3, Math.min(5, Math.round(similarity * 5 + 2)));

  // Deterministic shuffle using vector values as seed
  const seed = Math.round(
    (myV.conversation_temperature + theirV.social_energy) * 1000,
  );
  const shuffled = [...pool].sort(
    (a, b) => hashStr(a + seed) - hashStr(b + seed),
  );

  return shuffled.slice(0, count);
}

function computeMessageCount(
  myStyle: AvatarConversationStyle,
  theirStyle: AvatarConversationStyle,
): number {
  const avgDepth = (myStyle.depth_tendency + theirStyle.depth_tendency) / 2;
  const avgHumor = (myStyle.humor_level + theirStyle.humor_level) / 2;
  // 8-15 messages
  return Math.max(
    8,
    Math.min(15, Math.round(avgDepth * 6 + avgHumor * 3 + 6)),
  );
}

function randomDelay(
  _s1: AvatarConversationStyle,
  _s2: AvatarConversationStyle,
): number {
  // 15-120 seconds between messages
  return Math.round(15 + Math.random() * 105);
}

function distributeQuestions(
  questions: string[],
  slots: number,
): Map<number, string> {
  const map = new Map<number, string>();
  if (questions.length === 0 || slots <= 0) return map;

  const step = Math.max(1, Math.floor(slots / (questions.length + 1)));
  for (let i = 0; i < questions.length; i++) {
    const slot = Math.min(step * (i + 1), slots - 1);
    map.set(slot, questions[i]);
  }
  return map;
}

// ---------- Message Generation ----------

const OPENING_TEMPLATES: Record<RendezvousCategory, string[]> = {
  romantic: [
    "はじめまして！プロフィール見て、なんだか話してみたいなって思いました",
    "こんにちは！素敵な雰囲気ですね。少しお話しませんか？",
    "はじめまして。共通点が多そうで気になりました",
  ],
  friendship: [
    "やっほー！なんか気が合いそうな気がして話しかけてみました",
    "こんにちは！趣味が近そうですね！",
    "はじめまして！面白そうな人だなと思って",
  ],
  cocreation: [
    "はじめまして。面白いことやってますね！",
    "こんにちは。スキルセット見て、ぜひ話してみたいと思いました",
    "はじめまして！一緒に何か作れたら面白そうですね",
  ],
  community: [
    "こんにちは！同じエリアですね。よろしくお願いします",
    "はじめまして。コミュニティ活動に興味があって話しかけました",
    "やっほー！地元の仲間が増えたら嬉しいです",
  ],
  partner: [
    "はじめまして。価値観が近そうで、ぜひお話ししてみたいと思いました",
    "こんにちは。プロフィールを拝見して、誠実な方だなと感じました",
    "はじめまして。人生を一緒に歩める方と出会えたらと思っています",
  ],
};

const CLOSING_TEMPLATES: string[] = [
  "今日はいい話ができました。またお話ししましょう！",
  "楽しかったです！また続きを話しましょうね",
  "素敵な時間でした。次はもっと深い話もしたいです",
  "ありがとう！また近いうちに話しましょう",
];

function generateOpening(
  style: AvatarConversationStyle,
  category: RendezvousCategory,
): string {
  const templates = OPENING_TEMPLATES[category];
  const idx = Math.floor(style.aggressiveness * (templates.length - 0.01));
  return templates[idx];
}

function generateClosing(
  _style: AvatarConversationStyle,
  _category: RendezvousCategory,
): string {
  return CLOSING_TEMPLATES[Math.floor(Math.random() * CLOSING_TEMPLATES.length)];
}

function weaveQuestion(
  question: string,
  _style: AvatarConversationStyle,
): string {
  const prefixes = [
    "ちょっと聞いてみたいんだけど、",
    "気になったんだけど、",
    "ふと思ったんだけど、",
    "ところで、",
    "そういえば、",
  ];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  return `${prefix}${question}`;
}

function generateResponse(
  style: AvatarConversationStyle,
  topic: string,
  _category: RendezvousCategory,
): string {
  if (style.depth_tendency > 0.7) {
    return `${topic}について、実は結構こだわりがあって…深い話になりそうだね`;
  }
  if (style.humor_level > 0.7) {
    return `${topic}の話、面白いね！実はちょっとしたエピソードがあるんだけど…`;
  }
  if (style.empathy_level > 0.7) {
    return `うん、${topic}って大事だよね。その気持ち、すごくわかる`;
  }
  return `${topic}について考えたことあるよ。なかなか奥が深いよね`;
}

function generateMessage(
  style: AvatarConversationStyle,
  topic: string,
  _category: RendezvousCategory,
  index: number,
  total: number,
): string {
  const progress = index / total;

  // Early = lighter, middle = deeper, end = wrapping up
  if (progress < 0.3) {
    return generateEarlyMessage(style, topic);
  }
  if (progress < 0.7) {
    return generateMiddleMessage(style, topic);
  }
  return generateLateMessage(style, topic);
}

function generateEarlyMessage(
  style: AvatarConversationStyle,
  topic: string,
): string {
  const templates = [
    `${topic}って、実はずっと気になってたんだよね`,
    `そうそう、${topic}の話！最近考えることが多くて`,
    `${topic}かー。いい話題だね`,
    `あ、${topic}！ちょうど最近ね…`,
  ];
  const idx = Math.floor((style.aggressiveness + style.humor_level) / 2 * (templates.length - 0.01));
  return templates[idx];
}

function generateMiddleMessage(
  style: AvatarConversationStyle,
  topic: string,
): string {
  if (style.depth_tendency > 0.6) {
    return `${topic}の本質って、結局自分がどう感じるかだと思うんだ。あなたはどう思う？`;
  }
  if (style.humor_level > 0.6) {
    return `${topic}でいうと、実はこんな面白いことがあってさ…笑`;
  }
  if (style.empathy_level > 0.6) {
    return `なるほどね…${topic}に対するその考え方、すごく素敵だと思う`;
  }
  return `${topic}について、もう少し聞かせてほしいな`;
}

function generateLateMessage(
  style: AvatarConversationStyle,
  topic: string,
): string {
  if (style.depth_tendency > 0.5) {
    return `${topic}の話、ほんと深いね。こういう話ができる人、なかなかいないよ`;
  }
  return `${topic}の話、楽しかったなぁ。もっと聞きたいことたくさんある`;
}

// ---------- Utility ----------

function hashStr(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash;
}
