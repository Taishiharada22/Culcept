/**
 * Relationship Observer (関係の変態 — chat-embedded whisper)
 *
 * Detects relationship trajectory changes by comparing
 * first-half vs second-half of a conversation.
 * Needs at least 30 messages spanning 3+ days.
 */

export type WhisperType =
  | "warming"
  | "cooling"
  | "deepening"
  | "shifting"
  | "new_color";

export type RelationshipWhisper = {
  type: WhisperType;
  message: string;
  detectedAt: string;
  confidence: number; // 0-1
};

// ── Personal topic words for depth analysis ──

const PERSONAL_TOPIC_WORDS = [
  "家族", "過去", "夢", "将来", "子供", "親", "母", "父",
  "兄", "弟", "姉", "妹", "故郷", "思い出", "昔", "幼い",
  "目標", "希望", "秘密", "本音", "心", "涙", "愛",
];

function countTopicWords(text: string): number {
  let count = 0;
  for (const w of PERSONAL_TOPIC_WORDS) {
    let idx = 0;
    while (true) {
      idx = text.indexOf(w, idx);
      if (idx === -1) break;
      count++;
      idx += w.length;
    }
  }
  return count;
}

function daySpan(messages: Array<{ created_at: string }>): number {
  if (messages.length < 2) return 0;
  const times = messages.map((m) => new Date(m.created_at).getTime());
  return (Math.max(...times) - Math.min(...times)) / (1000 * 60 * 60 * 24);
}

/**
 * Observe relationship changes within a single conversation.
 * Returns the highest-confidence whisper, or null.
 */
export function observeRelationshipChanges(
  messages: Array<{ sender_id: string; content: string; created_at: string }>,
  userId: string,
): RelationshipWhisper | null {
  if (messages.length < 30) return null;
  if (daySpan(messages) < 3) return null;

  const half = Math.floor(messages.length / 2);
  const firstHalf = messages.slice(0, half);
  const secondHalf = messages.slice(half);

  const candidates: RelationshipWhisper[] = [];
  const now = new Date().toISOString();

  // ── 1. Response speed change ──
  {
    const calcAvgResponse = (
      msgs: Array<{ sender_id: string; created_at: string }>,
    ): number => {
      const times: number[] = [];
      for (let i = 1; i < msgs.length; i++) {
        if (msgs[i - 1].sender_id !== userId && msgs[i].sender_id === userId) {
          const diff =
            new Date(msgs[i].created_at).getTime() -
            new Date(msgs[i - 1].created_at).getTime();
          if (diff > 0 && diff < 86400000) times.push(diff);
        }
      }
      return times.length > 0
        ? times.reduce((a, b) => a + b, 0) / times.length
        : 0;
    };

    const avgFirst = calcAvgResponse(firstHalf);
    const avgSecond = calcAvgResponse(secondHalf);

    if (avgFirst > 0 && avgSecond > 0) {
      const change = (avgSecond - avgFirst) / avgFirst;
      if (change < -0.3) {
        // Getting faster
        candidates.push({
          type: "warming",
          message:
            "この方との会話のリズムが、少しずつ変わってきています",
          detectedAt: now,
          confidence: Math.min(1, Math.abs(change)),
        });
      } else if (change > 0.3) {
        // Getting slower
        candidates.push({
          type: "cooling",
          message:
            "最近、この方との間に少し距離が生まれているかもしれません。あなた自身の変化かもしれません",
          detectedAt: now,
          confidence: Math.min(1, change * 0.8),
        });
      }
    }
  }

  // ── 2. Message length change ──
  {
    const myFirst = firstHalf.filter((m) => m.sender_id === userId);
    const mySecond = secondHalf.filter((m) => m.sender_id === userId);

    const avgLenFirst =
      myFirst.length > 0
        ? myFirst.reduce((s, m) => s + m.content.length, 0) / myFirst.length
        : 0;
    const avgLenSecond =
      mySecond.length > 0
        ? mySecond.reduce((s, m) => s + m.content.length, 0) / mySecond.length
        : 0;

    if (avgLenFirst > 0) {
      const change = (avgLenSecond - avgLenFirst) / avgLenFirst;
      if (change > 0.4) {
        candidates.push({
          type: "deepening",
          message:
            "言葉が深くなっています。伝えたいことが、増えているのかもしれません",
          detectedAt: now,
          confidence: Math.min(1, change * 0.7),
        });
      } else if (change < -0.4) {
        candidates.push({
          type: "cooling",
          message:
            "会話のリズムが変わりました。心の中で何かが動いているのかもしれません",
          detectedAt: now,
          confidence: Math.min(1, Math.abs(change) * 0.6),
        });
      }
    }
  }

  // ── 3. Time shift ──
  {
    const avgHour = (
      msgs: Array<{ sender_id: string; created_at: string }>,
    ): number => {
      const myMsgs = msgs.filter((m) => m.sender_id === userId);
      if (myMsgs.length === 0) return 12;
      const hours = myMsgs.map((m) => new Date(m.created_at).getHours());
      return hours.reduce((a, b) => a + b, 0) / hours.length;
    };

    const hourFirst = avgHour(firstHalf);
    const hourSecond = avgHour(secondHalf);
    const shift = hourSecond - hourFirst;

    if (shift > 2) {
      candidates.push({
        type: "shifting",
        message:
          "会話の時間帯が夜に移っています。この方との時間が、より個人的なものになりつつあります",
        detectedAt: now,
        confidence: Math.min(1, shift / 5),
      });
    }
  }

  // ── 4. Topic depth ──
  {
    const myFirstText = firstHalf
      .filter((m) => m.sender_id === userId)
      .map((m) => m.content)
      .join("");
    const mySecondText = secondHalf
      .filter((m) => m.sender_id === userId)
      .map((m) => m.content)
      .join("");

    const densityFirst =
      myFirstText.length > 0
        ? countTopicWords(myFirstText) / (myFirstText.length / 100)
        : 0;
    const densitySecond =
      mySecondText.length > 0
        ? countTopicWords(mySecondText) / (mySecondText.length / 100)
        : 0;

    if (densityFirst > 0 && densitySecond / densityFirst > 1.5) {
      const increase = (densitySecond / densityFirst - 1) * 100;
      candidates.push({
        type: "new_color",
        message: "この関係に、新しい色が混ざり始めています",
        detectedAt: now,
        confidence: Math.min(1, increase / 100),
      });
    }
  }

  // Return highest confidence whisper, or null if none above 0.5
  const valid = candidates.filter((c) => c.confidence > 0.5);
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.confidence - a.confidence);
  return valid[0];
}
