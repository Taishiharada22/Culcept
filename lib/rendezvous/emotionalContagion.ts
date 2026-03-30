/**
 * Emotional Contagion Engine
 * 会話パートナー間の感情伝播パターンを検出・分析する
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmotionSignal =
  | "warm"
  | "excited"
  | "calm"
  | "anxious"
  | "playful"
  | "serious"
  | "tender"
  | "neutral";

export type MessageEmotion = {
  messageIndex: number;
  sender: "self" | "other";
  emotion: EmotionSignal;
  intensity: number; // 0-1
  timestamp: string;
};

export type ContagionEvent = {
  fromEmotion: EmotionSignal;
  toEmotion: EmotionSignal;
  fromSender: "self" | "other";
  latency: number; // minutes between messages
  intensity: number; // how strongly the emotion transferred
};

export type ContagionProfile = {
  resonanceScore: number; // 0-1, overall emotional sync
  dominantFlow:
    | "self_to_other"
    | "other_to_self"
    | "mutual"
    | "independent";
  contagionEvents: ContagionEvent[];
  emotionalWave: MessageEmotion[]; // chronological emotion timeline
  peakMoments: Array<{ index: number; description: string }>; // Japanese descriptions
  currentTemperature: number; // 0-1, current emotional warmth
};

// ---------------------------------------------------------------------------
// Keyword dictionaries
// ---------------------------------------------------------------------------

const EMOTION_KEYWORDS: Record<EmotionSignal, string[]> = {
  warm: ["ありがとう", "嬉しい", "楽しかった", "良かった", "素敵", "心地いい"],
  excited: ["!", "すごい", "めっちゃ", "やばい", "最高", "早く", "待ちきれない"],
  calm: ["そうだね", "なるほど", "ゆっくり", "落ち着", "静か"],
  anxious: ["大丈夫", "心配", "不安", "どうしよう", "ごめん"],
  playful: ["笑", "www", "😂", "🤣", "冗談", "ふふ"],
  serious: ["実は", "本当は", "正直", "真面目な話", "大切"],
  tender: ["好き", "大事", "守り", "寂しい", "会いたい", "そばに"],
  neutral: [],
};

/** Emotion pairs considered "related" for contagion detection */
const RELATED_EMOTIONS: Array<[EmotionSignal, EmotionSignal]> = [
  ["warm", "tender"],
  ["tender", "warm"],
  ["excited", "playful"],
  ["playful", "excited"],
  ["calm", "warm"],
  ["warm", "calm"],
  ["anxious", "calm"], // soothing response
  ["serious", "tender"],
  ["tender", "serious"],
];

const RELATED_SET = new Set(
  RELATED_EMOTIONS.map(([a, b]) => `${a}::${b}`),
);

function areRelated(a: EmotionSignal, b: EmotionSignal): boolean {
  return a === b || RELATED_SET.has(`${a}::${b}`);
}

/** Japanese descriptions for emotion pairs */
const PEAK_LABELS: Record<string, string> = {
  "warm::warm": "温かさが共鳴した瞬間",
  "warm::tender": "温もりが愛情に変わった瞬間",
  "tender::warm": "愛情が温かさを生んだ瞬間",
  "excited::excited": "興奮が伝染した瞬間",
  "excited::playful": "ワクワクが遊び心に変わった瞬間",
  "playful::excited": "遊び心が興奮を引き出した瞬間",
  "playful::playful": "笑いが連鎖した瞬間",
  "calm::calm": "穏やかさが共有された瞬間",
  "calm::warm": "安らぎが温かさに変わった瞬間",
  "warm::calm": "温もりが安らぎを生んだ瞬間",
  "anxious::calm": "不安を受け止めて落ち着かせた瞬間",
  "serious::tender": "真剣さが優しさを引き出した瞬間",
  "tender::serious": "優しさが真剣な想いに変わった瞬間",
  "tender::tender": "互いの想いが重なった瞬間",
  "serious::serious": "深い話に引き込まれた瞬間",
};

// ---------------------------------------------------------------------------
// Warm emotion set for temperature calculation
// ---------------------------------------------------------------------------

const WARM_EMOTIONS = new Set<EmotionSignal>([
  "warm",
  "excited",
  "playful",
  "tender",
]);

// ---------------------------------------------------------------------------
// analyzeMessageEmotion
// ---------------------------------------------------------------------------

export function analyzeMessageEmotion(
  text: string,
  _isReply: boolean,
  _replyLatencyMin: number,
): { emotion: EmotionSignal; intensity: number } {
  if (!text || text.trim().length === 0) {
    return { emotion: "neutral", intensity: 0.1 };
  }

  // Count keyword hits per emotion
  const scores: Record<EmotionSignal, number> = {
    warm: 0,
    excited: 0,
    calm: 0,
    anxious: 0,
    playful: 0,
    serious: 0,
    tender: 0,
    neutral: 0,
  };

  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS) as Array<
    [EmotionSignal, string[]]
  >) {
    for (const kw of keywords) {
      // Special case for "!" — count all occurrences
      if (kw === "!") {
        const excCount = (text.match(/[!！]/g) ?? []).length;
        if (excCount > 0) scores[emotion] += excCount * 0.5;
      } else {
        const regex = new RegExp(kw, "gi");
        const matches = text.match(regex);
        if (matches) scores[emotion] += matches.length;
      }
    }
  }

  // Determine best emotion
  let bestEmotion: EmotionSignal = "neutral";
  let bestScore = 0;
  for (const [emotion, score] of Object.entries(scores) as Array<
    [EmotionSignal, number]
  >) {
    if (emotion === "neutral") continue;
    if (score > bestScore) {
      bestScore = score;
      bestEmotion = emotion;
    }
  }

  if (bestScore === 0) {
    return { emotion: "neutral", intensity: 0.2 };
  }

  // Calculate intensity (0-1)
  let intensity = Math.min(1, bestScore / 3); // 3 keyword hits = max base

  // Boost: exclamation marks
  const excCount = (text.match(/[!！]/g) ?? []).length;
  intensity = Math.min(1, intensity + excCount * 0.05);

  // Boost: emoji density
  const emojiRegex =
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const emojiCount = (text.match(emojiRegex) ?? []).length;
  intensity = Math.min(1, intensity + emojiCount * 0.08);

  // Boost: longer messages (relative to 50-char average)
  const lengthFactor = Math.min(1, text.length / 100);
  intensity = Math.min(1, intensity + lengthFactor * 0.1);

  // Floor at 0.15
  intensity = Math.max(0.15, intensity);

  return { emotion: bestEmotion, intensity: Math.round(intensity * 100) / 100 };
}

// ---------------------------------------------------------------------------
// detectContagionEvents
// ---------------------------------------------------------------------------

export function detectContagionEvents(
  timeline: MessageEmotion[],
): ContagionEvent[] {
  const events: ContagionEvent[] = [];

  for (let i = 1; i < timeline.length; i++) {
    const prev = timeline[i - 1];
    const curr = timeline[i];

    // Must be from different senders
    if (prev.sender === curr.sender) continue;

    // Check if emotion transferred (exact match or related pair)
    if (!areRelated(prev.emotion, curr.emotion)) continue;

    // Compute latency in minutes
    const latency =
      (new Date(curr.timestamp).getTime() -
        new Date(prev.timestamp).getTime()) /
      60_000;

    // Skip if latency is too long (>180 min = emotion likely not caused by the message)
    if (latency > 180) continue;

    // Intensity: average of both, boosted for fast replies
    const latencyBoost = Math.max(0, 1 - latency / 60); // within 1hr = bonus
    const baseIntensity = (prev.intensity + curr.intensity) / 2;
    const intensity = Math.min(
      1,
      Math.round((baseIntensity * 0.7 + latencyBoost * 0.3) * 100) / 100,
    );

    events.push({
      fromEmotion: prev.emotion,
      toEmotion: curr.emotion,
      fromSender: prev.sender,
      latency: Math.round(latency * 10) / 10,
      intensity,
    });
  }

  return events;
}

// ---------------------------------------------------------------------------
// buildContagionProfile
// ---------------------------------------------------------------------------

export function buildContagionProfile(
  messages: Array<{ text: string; sender_id: string; created_at: string }>,
  myUserId: string,
): ContagionProfile {
  if (messages.length === 0) {
    return {
      resonanceScore: 0,
      dominantFlow: "independent",
      contagionEvents: [],
      emotionalWave: [],
      peakMoments: [],
      currentTemperature: 0,
    };
  }

  // --- Build timeline ---
  const avgLength =
    messages.reduce((s, m) => s + m.text.length, 0) / messages.length;

  const emotionalWave: MessageEmotion[] = messages.map((msg, idx) => {
    const sender: "self" | "other" =
      msg.sender_id === myUserId ? "self" : "other";

    // Calculate reply latency
    let replyLatencyMin = 0;
    if (idx > 0) {
      replyLatencyMin =
        (new Date(msg.created_at).getTime() -
          new Date(messages[idx - 1].created_at).getTime()) /
        60_000;
    }
    const isReply = idx > 0 && messages[idx - 1].sender_id !== msg.sender_id;

    const { emotion, intensity } = analyzeMessageEmotion(
      msg.text,
      isReply,
      replyLatencyMin,
    );

    return {
      messageIndex: idx,
      sender,
      emotion,
      intensity,
      timestamp: msg.created_at,
    };
  });

  // --- Detect contagion events ---
  const contagionEvents = detectContagionEvents(emotionalWave);

  // --- Resonance score ---
  // Count valid consecutive pairs (different senders)
  let pairCount = 0;
  for (let i = 1; i < emotionalWave.length; i++) {
    if (emotionalWave[i].sender !== emotionalWave[i - 1].sender) {
      pairCount++;
    }
  }
  const resonanceScore =
    pairCount > 0
      ? Math.min(1, Math.round((contagionEvents.length / pairCount) * 100) / 100)
      : 0;

  // --- Dominant flow ---
  let selfToOther = 0;
  let otherToSelf = 0;
  for (const ev of contagionEvents) {
    if (ev.fromSender === "self") selfToOther++;
    else otherToSelf++;
  }

  let dominantFlow: ContagionProfile["dominantFlow"];
  if (contagionEvents.length === 0) {
    dominantFlow = "independent";
  } else if (Math.abs(selfToOther - otherToSelf) <= 1) {
    dominantFlow = "mutual";
  } else if (selfToOther > otherToSelf) {
    dominantFlow = "self_to_other";
  } else {
    dominantFlow = "other_to_self";
  }

  // --- Peak moments (top 3 strongest events) ---
  const sortedEvents = [...contagionEvents].sort(
    (a, b) => b.intensity - a.intensity,
  );
  const peakMoments = sortedEvents.slice(0, 3).map((ev) => {
    const key = `${ev.fromEmotion}::${ev.toEmotion}`;
    const description =
      PEAK_LABELS[key] ?? `感情が共鳴した瞬間`;
    // Find the message index for this event
    const matchIndex = emotionalWave.findIndex(
      (me) =>
        me.sender !== ev.fromSender &&
        areRelated(me.emotion, ev.toEmotion) &&
        me.intensity > 0,
    );
    return {
      index: matchIndex >= 0 ? matchIndex : 0,
      description,
    };
  });

  // --- Current temperature ---
  // Based on last N messages' warmth
  const recentWindow = emotionalWave.slice(-10);
  const warmCount = recentWindow.filter((m) =>
    WARM_EMOTIONS.has(m.emotion),
  ).length;
  const avgIntensity =
    recentWindow.reduce((s, m) => s + m.intensity, 0) /
    Math.max(1, recentWindow.length);
  const currentTemperature =
    Math.round(
      Math.min(1, (warmCount / Math.max(1, recentWindow.length)) * 0.6 + avgIntensity * 0.4) *
        100,
    ) / 100;

  return {
    resonanceScore,
    dominantFlow,
    contagionEvents,
    emotionalWave,
    peakMoments,
    currentTemperature,
  };
}
