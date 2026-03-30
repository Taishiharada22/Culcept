// ============================================================
// Memory Crystallization — 記憶の結晶化
// 会話内の特別な瞬間を自動検出し、結晶として可視化する
// ============================================================

export type CrystalType =
  | "late_night_talk"
  | "emotional_peak"
  | "first_topic"
  | "after_silence"
  | "laughter_chain";

export type MemoryCrystal = {
  id: string;
  type: CrystalType;
  name: string;
  detectedAt: string;
  messageRange: { start: number; end: number };
  sparkColor: string;
};

export type ChatMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

// ────────────────────────────────────────────
// Crystal name pools (seeded random by id)
// ────────────────────────────────────────────

const CRYSTAL_NAMES: Record<CrystalType, string[]> = {
  late_night_talk: ["灯火の記憶", "深夜の対話", "夜明け前の交差"],
  emotional_peak: ["心が動いた瞬間", "感情の波紋", "共鳴の瞬間"],
  first_topic: ["初めて話したこと", "扉が開いた瞬間", "新しい地図"],
  after_silence: ["沈黙を越えて", "再会の光", "静寂のなかの対話"],
  laughter_chain: ["笑いが止まらなかった時", "幸福の連鎖", "軽さの結晶"],
};

const CRYSTAL_COLORS: Record<CrystalType, string> = {
  late_night_talk: "#6366f1",
  emotional_peak: "#ec4899",
  first_topic: "#f59e0b",
  after_silence: "#10b981",
  laughter_chain: "#f97316",
};

// Simple hash for seeded name selection
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickName(type: CrystalType, seed: string): string {
  const names = CRYSTAL_NAMES[type];
  return names[simpleHash(seed) % names.length];
}

// ────────────────────────────────────────────
// Detection helpers
// ────────────────────────────────────────────

const EMOTION_WORDS = [
  "嬉しい", "楽しい", "好き", "素敵", "ありがとう",
  "感動", "泣", "笑",
];

const PERSONAL_TOPICS = [
  "家族", "子供", "夢", "将来", "過去",
  "故郷", "学生", "思い出",
];

const LAUGH_MARKERS = ["笑", "w", "ｗ", "www", "ｗｗｗ", "hhh"];

function isLateNight(dateStr: string): boolean {
  const h = new Date(dateStr).getHours();
  return h >= 23 || h < 4;
}

function hasEmotionWord(text: string): boolean {
  return EMOTION_WORDS.some((w) => text.includes(w));
}

function hasPersonalTopic(text: string): boolean {
  return PERSONAL_TOPICS.some((w) => text.includes(w));
}

function hasLaughMarker(text: string): boolean {
  const lower = text.toLowerCase();
  return LAUGH_MARKERS.some((m) => lower.includes(m));
}

// ────────────────────────────────────────────
// Main detection function
// ────────────────────────────────────────────

export function detectCrystals(messages: ChatMessage[]): MemoryCrystal[] {
  if (messages.length < 3) return [];

  const crystals: MemoryCrystal[] = [];
  const now = new Date().toISOString();

  // --- late_night_talk ---
  // 2+ messages from each participant between 23:00-04:00, messages > 50 chars
  const lateNightMsgs = messages
    .map((m, idx) => ({ ...m, idx }))
    .filter((m) => isLateNight(m.created_at) && m.content.length > 50);
  if (lateNightMsgs.length >= 4) {
    const senders = new Set(lateNightMsgs.map((m) => m.sender_id));
    const senderCounts = new Map<string, number>();
    for (const m of lateNightMsgs) {
      senderCounts.set(m.sender_id, (senderCounts.get(m.sender_id) || 0) + 1);
    }
    const bothHave2 = [...senderCounts.values()].filter((c) => c >= 2).length >= 2
      || (senders.size === 1 && lateNightMsgs.length >= 4);
    if (bothHave2) {
      const startIdx = lateNightMsgs[0].idx;
      const endIdx = lateNightMsgs[lateNightMsgs.length - 1].idx;
      const id = `crystal-lnt-${startIdx}-${endIdx}`;
      crystals.push({
        id,
        type: "late_night_talk",
        name: pickName("late_night_talk", id),
        detectedAt: now,
        messageRange: { start: startIdx, end: endIdx },
        sparkColor: CRYSTAL_COLORS.late_night_talk,
      });
    }
  }

  // --- emotional_peak ---
  // density > 30% in a 5-message window
  if (messages.length >= 5) {
    for (let i = 0; i <= messages.length - 5; i++) {
      const window = messages.slice(i, i + 5);
      const emotionCount = window.filter((m) => hasEmotionWord(m.content)).length;
      if (emotionCount / 5 > 0.3) {
        const id = `crystal-ep-${i}-${i + 4}`;
        crystals.push({
          id,
          type: "emotional_peak",
          name: pickName("emotional_peak", id),
          detectedAt: now,
          messageRange: { start: i, end: i + 4 },
          sparkColor: CRYSTAL_COLORS.emotional_peak,
        });
        break; // Only detect first one
      }
    }
  }

  // --- first_topic ---
  // First occurrence of personal topics
  for (let i = 0; i < messages.length; i++) {
    if (hasPersonalTopic(messages[i].content)) {
      const id = `crystal-ft-${i}`;
      crystals.push({
        id,
        type: "first_topic",
        name: pickName("first_topic", id),
        detectedAt: now,
        messageRange: { start: i, end: Math.min(i + 2, messages.length - 1) },
        sparkColor: CRYSTAL_COLORS.first_topic,
      });
      break;
    }
  }

  // --- after_silence ---
  // Gap of > 6 hours between messages, then 3+ exchanges resume
  for (let i = 1; i < messages.length - 2; i++) {
    const prev = new Date(messages[i - 1].created_at).getTime();
    const curr = new Date(messages[i].created_at).getTime();
    const gapHours = (curr - prev) / (1000 * 60 * 60);
    if (gapHours > 6) {
      // Check for 3+ exchanges after the gap
      const afterGap = messages.slice(i, i + 4);
      if (afterGap.length >= 3) {
        const senders = new Set(afterGap.map((m) => m.sender_id));
        if (senders.size >= 2) {
          const endIdx = Math.min(i + 3, messages.length - 1);
          const id = `crystal-as-${i}-${endIdx}`;
          crystals.push({
            id,
            type: "after_silence",
            name: pickName("after_silence", id),
            detectedAt: now,
            messageRange: { start: i, end: endIdx },
            sparkColor: CRYSTAL_COLORS.after_silence,
          });
          break;
        }
      }
    }
  }

  // --- laughter_chain ---
  // 3+ consecutive messages containing laugh markers
  let laughStreak = 0;
  let laughStart = 0;
  for (let i = 0; i < messages.length; i++) {
    if (hasLaughMarker(messages[i].content)) {
      if (laughStreak === 0) laughStart = i;
      laughStreak++;
      if (laughStreak >= 3) {
        const id = `crystal-lc-${laughStart}-${i}`;
        crystals.push({
          id,
          type: "laughter_chain",
          name: pickName("laughter_chain", id),
          detectedAt: now,
          messageRange: { start: laughStart, end: i },
          sparkColor: CRYSTAL_COLORS.laughter_chain,
        });
        break;
      }
    } else {
      laughStreak = 0;
    }
  }

  return crystals;
}
