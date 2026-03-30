/**
 * Absence Design Engine
 * 「話さない」時間を意図的にデザインし、関係を深める仕組み
 *
 * 非接触の時間は関係の敵ではなく、関係の呼吸である。
 * 沈黙の中でこそ、次の言葉が意味を持つ。
 */

// =============================================================================
// Types
// =============================================================================

export type AbsenceType =
  | "breathing_space" // Regular rhythm rest (every 3-5 days)
  | "anticipation_pause" // Before a big experience (sync, voice)
  | "reflection_gap" // After a deep conversation, time to process
  | "renewal_absence" // Longer break to prevent habituation
  | "natural_rhythm"; // Detected organic rhythm, don't interrupt

export type AbsenceSuggestion = {
  type: AbsenceType;
  suggestedHours: number;
  reason: string;
  poeticMessage: string;
  reunionHint: string;
  priority: number;
};

export type AbsenceState = {
  isInAbsence: boolean;
  currentAbsence: AbsenceSuggestion | null;
  startedAt: string | null;
  endsAt: string | null;
  reunionReady: boolean;
  naturalRhythm: {
    avgGapHours: number;
    preferredContactTime: string;
    conversationBurstLength: number;
  };
};

export type ReunionExperience = {
  greeting: string;
  sparkQuestion: string;
  absenceDuration: string;
};

// =============================================================================
// Absence Messages (Japanese)
// =============================================================================

const ABSENCE_MESSAGES: Record<
  AbsenceType,
  {
    poeticMessage: string;
    reason: string;
    reunionHint: string;
  }
> = {
  breathing_space: {
    poeticMessage:
      "少し息をつきませんか？ 次の言葉がもっと新鮮になるように。",
    reason: "会話のリズムに余白を作ることで、次の対話がより豊かになります。",
    reunionHint: "再開するとき、日常の小さな発見を一つ持ち寄ってみよう。",
  },
  anticipation_pause: {
    poeticMessage:
      "明日の体験の前に、少し静けさの時間を。期待が膨らむ余白を作ろう。",
    reason:
      "特別な体験の前に沈黙を置くことで、期待感と集中力が高まります。",
    reunionHint: "体験を終えたら、最初に感じたことを言葉にしてみよう。",
  },
  reflection_gap: {
    poeticMessage:
      "深い話をした後は、言葉を沈ませる時間が必要。急がなくていい。",
    reason:
      "深い対話の後は内省の時間が大切。言葉が心に浸透するのを待ちましょう。",
    reunionHint: "あの会話の中で、後から響いてきた言葉はあった？",
  },
  renewal_absence: {
    poeticMessage:
      "少し距離を置くことで、また会いたいという気持ちが生まれる。",
    reason:
      "連続した接触は慣れを生みやすい。意図的な距離が新鮮さを取り戻します。",
    reunionHint: "離れている間に、相手について新しく気づいたことを伝えてみよう。",
  },
  natural_rhythm: {
    poeticMessage: "二人のリズムは自然に呼吸している。このまま委ねよう。",
    reason:
      "二人の間には自然な間合いが生まれています。無理に変える必要はありません。",
    reunionHint: "自然に言葉が浮かんだとき、それが再会のサイン。",
  },
};

// =============================================================================
// Reunion Messages (Japanese)
// =============================================================================

const REUNION_GREETINGS: Record<AbsenceType, string[]> = {
  breathing_space: [
    "お帰り。少しの静けさが、言葉を澄ませてくれたね。",
    "息をつく時間が、また話したい気持ちを育ててくれた。",
  ],
  anticipation_pause: [
    "待つ時間が、この瞬間をより特別にしてくれた。",
    "静けさの後の最初の言葉には、不思議な力がある。",
  ],
  reflection_gap: [
    "言葉を沈ませる時間が、新しい深さを連れてきた。",
    "急がなかったから、今の言葉にはちゃんと重さがある。",
  ],
  renewal_absence: [
    "久しぶり。距離が「また会いたい」を教えてくれた。",
    "離れていた分だけ、再会の温度が上がっている。",
  ],
  natural_rhythm: [
    "自然なリズムが、二人をここに連れてきた。",
    "委ねていたら、ちょうどいいタイミングで戻ってきた。",
  ],
};

const SPARK_QUESTIONS: Record<AbsenceType, string[]> = {
  breathing_space: [
    "離れている間に、ふと浮かんだことはある？",
    "この静けさの中で、何を感じていた？",
  ],
  anticipation_pause: [
    "期待していた体験、どうだった？",
    "静けさの後の最初の言葉、何を選ぶ？",
  ],
  reflection_gap: [
    "あの会話の中で、時間が経って響いてきた言葉はあった？",
    "考える時間があって、何か変わった？",
  ],
  renewal_absence: [
    "離れている間に、相手について何か新しく気づいた？",
    "距離が教えてくれたことはある？",
  ],
  natural_rhythm: [
    "最近、何か小さな発見はあった？",
    "今、一番伝えたいことは？",
  ],
};

// =============================================================================
// detectNaturalRhythm
// =============================================================================

type MessageTimestamp = { created_at: string; sender_id: string };

export function detectNaturalRhythm(
  messages: MessageTimestamp[],
  myUserId: string,
): AbsenceState["naturalRhythm"] {
  const defaults: AbsenceState["naturalRhythm"] = {
    avgGapHours: 12,
    preferredContactTime: "evening",
    conversationBurstLength: 5,
  };

  if (messages.length < 5) return defaults;

  // Sort chronologically
  const sorted = [...messages].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  // Identify bursts: messages within 30 minutes of each other form a burst
  const BURST_GAP_MS = 30 * 60 * 1000;
  const bursts: { start: Date; end: Date; count: number }[] = [];
  let burstStart = new Date(sorted[0].created_at);
  let burstEnd = burstStart;
  let burstCount = 1;

  for (let i = 1; i < sorted.length; i++) {
    const ts = new Date(sorted[i].created_at);
    const gap = ts.getTime() - burstEnd.getTime();

    if (gap <= BURST_GAP_MS) {
      burstEnd = ts;
      burstCount++;
    } else {
      bursts.push({ start: burstStart, end: burstEnd, count: burstCount });
      burstStart = ts;
      burstEnd = ts;
      burstCount = 1;
    }
  }
  bursts.push({ start: burstStart, end: burstEnd, count: burstCount });

  // Average gap between bursts (in hours)
  let totalGapMs = 0;
  let gapCount = 0;
  for (let i = 1; i < bursts.length; i++) {
    totalGapMs += bursts[i].start.getTime() - bursts[i - 1].end.getTime();
    gapCount++;
  }
  const avgGapHours =
    gapCount > 0 ? totalGapMs / gapCount / (1000 * 60 * 60) : 12;

  // Preferred contact time based on burst start hours
  const timeSlots = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const burst of bursts) {
    const hour = burst.start.getHours();
    if (hour >= 6 && hour < 11) timeSlots.morning++;
    else if (hour >= 11 && hour < 17) timeSlots.afternoon++;
    else if (hour >= 17 && hour < 22) timeSlots.evening++;
    else timeSlots.night++;
  }
  const preferredContactTime = (
    Object.entries(timeSlots) as [string, number][]
  ).sort((a, b) => b[1] - a[1])[0][0];

  // Average burst length
  const avgBurstLength =
    bursts.reduce((sum, b) => sum + b.count, 0) / bursts.length;

  return {
    avgGapHours: Math.round(avgGapHours * 10) / 10,
    preferredContactTime,
    conversationBurstLength: Math.round(avgBurstLength * 10) / 10,
  };
}

// =============================================================================
// shouldSuggestAbsence
// =============================================================================

export function shouldSuggestAbsence(
  messages: MessageTimestamp[],
  myUserId: string,
  lastAbsenceAt: string | null,
  season?: string,
): AbsenceSuggestion | null {
  // Cooldown: no suggestion within 48h of last absence
  if (lastAbsenceAt) {
    const hoursSinceAbsence =
      (Date.now() - new Date(lastAbsenceAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceAbsence < 48) return null;
  }

  // Season awareness
  if (season === "spring") return null; // Building momentum, don't interrupt

  if (messages.length < 3) return null;

  const sorted = [...messages].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const now = Date.now();
  const sixHoursAgo = now - 6 * 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  // Check messages in last 6 hours
  const recentMessages = sorted.filter(
    (m) => new Date(m.created_at).getTime() > sixHoursAgo,
  );

  // Check natural rhythm
  const rhythm = detectNaturalRhythm(messages, myUserId);
  const lastMessageTime = new Date(
    sorted[sorted.length - 1].created_at,
  ).getTime();
  const hoursSinceLastMessage = (now - lastMessageTime) / (1000 * 60 * 60);

  // If approaching natural pause point, acknowledge it
  if (
    hoursSinceLastMessage > rhythm.avgGapHours * 0.7 &&
    hoursSinceLastMessage < rhythm.avgGapHours * 1.3
  ) {
    const msg = ABSENCE_MESSAGES.natural_rhythm;
    return {
      type: "natural_rhythm",
      suggestedHours: Math.round(rhythm.avgGapHours),
      reason: msg.reason,
      poeticMessage: msg.poeticMessage,
      reunionHint: msg.reunionHint,
      priority: 0.2,
    };
  }

  // Intense conversation: >20 messages in 6 hours
  if (recentMessages.length > 20) {
    const hours = season === "summer" ? 18 : 12 + Math.random() * 12;
    const msg = ABSENCE_MESSAGES.breathing_space;
    return {
      type: "breathing_space",
      suggestedHours: Math.round(hours),
      reason: msg.reason,
      poeticMessage: msg.poeticMessage,
      reunionHint: msg.reunionHint,
      priority: 0.7,
    };
  }

  // Check for emotional depth (heuristic: longer messages, questions)
  const recentLongMessages = recentMessages.filter(
    (m) => "body" in m && typeof (m as any).body === "string" && (m as any).body.length > 200,
  );
  if (recentLongMessages.length >= 3) {
    const hours = 6 + Math.random() * 6;
    const msg = ABSENCE_MESSAGES.reflection_gap;
    return {
      type: "reflection_gap",
      suggestedHours: Math.round(hours),
      reason: msg.reason,
      poeticMessage: msg.poeticMessage,
      reunionHint: msg.reunionHint,
      priority: 0.8,
    };
  }

  // Daily contact for 5+ days straight
  const daySet = new Set<string>();
  for (const m of sorted) {
    const d = new Date(m.created_at);
    if (d.getTime() > now - 7 * 24 * 60 * 60 * 1000) {
      daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
  }
  if (daySet.size >= 5) {
    const hours = season === "summer" ? 36 : 24 + Math.random() * 24;
    const msg = ABSENCE_MESSAGES.renewal_absence;
    return {
      type: "renewal_absence",
      suggestedHours: Math.round(hours),
      reason: msg.reason,
      poeticMessage: msg.poeticMessage,
      reunionHint: msg.reunionHint,
      priority: 0.6,
    };
  }

  return null;
}

// =============================================================================
// generateReunionExperience
// =============================================================================

export function generateReunionExperience(
  absenceType: AbsenceType,
  durationHours: number,
  _candidateCategory: string,
): ReunionExperience {
  const greetings = REUNION_GREETINGS[absenceType];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  const sparks = SPARK_QUESTIONS[absenceType];
  const sparkQuestion = sparks[Math.floor(Math.random() * sparks.length)];

  // Human-readable duration
  let absenceDuration: string;
  if (durationHours < 1) {
    absenceDuration = `${Math.round(durationHours * 60)}分`;
  } else if (durationHours < 24) {
    absenceDuration = `${Math.round(durationHours)}時間`;
  } else {
    const days = Math.floor(durationHours / 24);
    const remainingHours = Math.round(durationHours % 24);
    absenceDuration =
      remainingHours > 0
        ? `${days}日${remainingHours}時間`
        : `${days}日`;
  }

  return { greeting, sparkQuestion, absenceDuration };
}
