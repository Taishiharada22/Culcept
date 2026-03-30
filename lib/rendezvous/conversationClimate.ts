/**
 * Conversation Climate Engine
 * メッセージ長の分散・応答間隔・質問比率から「温度」を算出
 * warm / cool / vibrant の3視覚状態
 */

export type ClimateState = "warm" | "cool" | "vibrant";

export type ConversationClimate = {
  state: ClimateState;
  label: string;
  /** 0..1 温度スケール */
  temperature: number;
  /** グラデーション色 */
  colors: [string, string];
};

type MessageSummary = {
  selfCount: number;
  otherCount: number;
  avgSelfLength: number;
  avgOtherLength: number;
  questionRatio: number; // 0..1
  avgResponseMinutes: number;
  lastMessageMinutesAgo: number;
};

const CLIMATE_META: Record<ClimateState, { label: string; colors: [string, string] }> = {
  warm: { label: "温かい", colors: ["#F59E0B", "#EC4899"] },
  cool: { label: "穏やか", colors: ["#6366F1", "#06B6D4"] },
  vibrant: { label: "活発", colors: ["#22C55E", "#6366F1"] },
};

/**
 * メッセージ統計から会話の気候を算出
 */
export function computeClimate(summary: MessageSummary): ConversationClimate {
  const { selfCount, otherCount, avgSelfLength, avgOtherLength, questionRatio, avgResponseMinutes, lastMessageMinutesAgo } = summary;

  const totalMessages = selfCount + otherCount;
  if (totalMessages < 2) {
    return { state: "cool", label: "穏やか", temperature: 0.3, colors: CLIMATE_META.cool.colors };
  }

  // Balance: how evenly distributed are messages?
  const balance = totalMessages > 0
    ? 1 - Math.abs(selfCount - otherCount) / totalMessages
    : 0.5;

  // Length similarity: are message lengths similar?
  const avgLen = (avgSelfLength + avgOtherLength) / 2;
  const lengthBalance = avgLen > 0
    ? 1 - Math.abs(avgSelfLength - avgOtherLength) / (avgLen * 2)
    : 0.5;

  // Responsiveness: faster responses = warmer
  const responsiveness = Math.max(0, 1 - avgResponseMinutes / 120); // 2h = cold

  // Recency: recent activity = warmer
  const recency = Math.max(0, 1 - lastMessageMinutesAgo / (60 * 24)); // 24h = cold

  // Temperature calculation
  const temperature = (
    balance * 0.2 +
    lengthBalance * 0.15 +
    responsiveness * 0.25 +
    recency * 0.2 +
    questionRatio * 0.2
  );

  // State determination
  let state: ClimateState;
  if (temperature >= 0.6 && questionRatio >= 0.2) {
    state = "vibrant";
  } else if (temperature >= 0.4) {
    state = "warm";
  } else {
    state = "cool";
  }

  const meta = CLIMATE_META[state];
  return {
    state,
    label: meta.label,
    temperature: Math.max(0, Math.min(1, temperature)),
    colors: meta.colors,
  };
}

/**
 * メッセージ配列から統計を計算
 */
export function summarizeMessages(
  messages: { sender_id: string; content: string; created_at: string }[],
  myUserId: string,
): MessageSummary {
  if (messages.length === 0) {
    return {
      selfCount: 0,
      otherCount: 0,
      avgSelfLength: 0,
      avgOtherLength: 0,
      questionRatio: 0,
      avgResponseMinutes: 60,
      lastMessageMinutesAgo: 1440,
    };
  }

  const selfMsgs = messages.filter((m) => m.sender_id === myUserId);
  const otherMsgs = messages.filter((m) => m.sender_id !== myUserId);

  const avgSelfLength = selfMsgs.length > 0
    ? selfMsgs.reduce((s, m) => s + m.content.length, 0) / selfMsgs.length
    : 0;
  const avgOtherLength = otherMsgs.length > 0
    ? otherMsgs.reduce((s, m) => s + m.content.length, 0) / otherMsgs.length
    : 0;

  // Question ratio
  const allContent = messages.map((m) => m.content).join("");
  const questionMarks = (allContent.match(/[?？]/g) || []).length;
  const questionRatio = messages.length > 0 ? Math.min(1, questionMarks / messages.length) : 0;

  // Average response time
  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  let totalResponseMs = 0;
  let responseCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].sender_id !== sorted[i - 1].sender_id) {
      totalResponseMs += new Date(sorted[i].created_at).getTime() - new Date(sorted[i - 1].created_at).getTime();
      responseCount++;
    }
  }
  const avgResponseMinutes = responseCount > 0
    ? totalResponseMs / responseCount / (1000 * 60)
    : 60;

  const lastMsg = sorted[sorted.length - 1];
  const lastMessageMinutesAgo = (Date.now() - new Date(lastMsg.created_at).getTime()) / (1000 * 60);

  return {
    selfCount: selfMsgs.length,
    otherCount: otherMsgs.length,
    avgSelfLength,
    avgOtherLength,
    questionRatio,
    avgResponseMinutes,
    lastMessageMinutesAgo,
  };
}
