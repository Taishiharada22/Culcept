/**
 * Self-Discovery Engine
 * 発見の深さ - ユーザーの無意識的な行動パターンを
 * 比較・分析し、自己発見カードとして提示する。
 *
 * 「あなた自身が気づいていない、もう一人のあなた。」
 */

// =============================================================================
// Types
// =============================================================================

export type DiscoveryCardType =
  | "behavior_contrast"
  | "depth_insight"
  | "pattern_alert"
  | "time_pattern"
  | "unconscious_reveal";

export interface DiscoveryCard {
  id: string;
  type: DiscoveryCardType;
  title: string;
  body: string;
  subtext?: string;
  dataPoints: Record<string, unknown>;
  significance: number;
  candidateId?: string;
}

export interface CandidateMessageStats {
  candidateId: string;
  displayName: string;
  avgReplyMs: number;
  avgMessageLength: number;
  emojiRate: number;
  peakHour: number;
  messageCount: number;
}

export interface ContrastData {
  label: string;
  candidateA: { name: string; value: number };
  candidateB: { name: string; value: number };
  unit: string;
}

// =============================================================================
// detectBehaviorContrasts
// =============================================================================

export function detectBehaviorContrasts(
  stats: CandidateMessageStats[],
): DiscoveryCard[] {
  if (stats.length < 2) return [];
  const cards: DiscoveryCard[] = [];

  // Sort by reply speed
  const sorted = [...stats].sort((a, b) => a.avgReplyMs - b.avgReplyMs);
  const fastest = sorted[0];
  const slowest = sorted[sorted.length - 1];

  if (fastest.avgReplyMs > 0 && slowest.avgReplyMs / fastest.avgReplyMs > 2) {
    cards.push({
      id: `contrast-reply-${Date.now()}`,
      type: "behavior_contrast",
      title: "返信速度の違い",
      body: `${fastest.displayName}さんへの返信は平均${Math.round(fastest.avgReplyMs / 60000)}分。${slowest.displayName}さんへは${Math.round(slowest.avgReplyMs / 60000)}分かかっています。`,
      subtext: "返信の速さは、心が自然に動く方向を教えてくれます",
      dataPoints: {
        fastest: fastest.displayName,
        slowest: slowest.displayName,
      },
      significance: 0.7,
    });
  }

  // Message length contrast
  const byLength = [...stats].sort(
    (a, b) => b.avgMessageLength - a.avgMessageLength,
  );
  const longest = byLength[0];
  const shortest = byLength[byLength.length - 1];

  if (longest.avgMessageLength > shortest.avgMessageLength * 1.5) {
    cards.push({
      id: `contrast-length-${Date.now()}`,
      type: "behavior_contrast",
      title: "言葉の量が変わる",
      body: `${longest.displayName}さんとの会話では、言葉が${Math.round(longest.avgMessageLength)}文字に。${shortest.displayName}さんとは${Math.round(shortest.avgMessageLength)}文字です。`,
      subtext: "言葉の量は、あなたがどれだけ心を開いているかの証です",
      dataPoints: {
        longest: longest.displayName,
        shortest: shortest.displayName,
      },
      significance: 0.6,
    });
  }

  return cards;
}

// =============================================================================
// detectTimePatterns
// =============================================================================

export function detectTimePatterns(
  stats: CandidateMessageStats[],
): DiscoveryCard[] {
  const cards: DiscoveryCard[] = [];

  for (const s of stats) {
    if (s.peakHour >= 23 || s.peakHour < 4) {
      cards.push({
        id: `time-night-${s.candidateId}`,
        type: "time_pattern",
        title: "深夜に心が開く",
        body: `${s.displayName}さんとの会話は、深夜に最も活発になります。`,
        subtext:
          "夜は心のガードが下がる時間。そこで現れるあなたが、最も本当のあなたかもしれません",
        dataPoints: { peakHour: s.peakHour, candidateId: s.candidateId },
        significance: 0.65,
        candidateId: s.candidateId,
      });
    }
  }

  return cards;
}

// =============================================================================
// detectUnconsciousReveals
// =============================================================================

export function detectUnconsciousReveals(
  recentPassCount: number,
  recentPassTypes: string[],
): DiscoveryCard[] {
  const cards: DiscoveryCard[] = [];

  // Detect consecutive passes of similar type
  if (recentPassCount >= 3) {
    const typeFreq: Record<string, number> = {};
    for (const t of recentPassTypes) {
      typeFreq[t] = (typeFreq[t] || 0) + 1;
    }
    const dominant = Object.entries(typeFreq).find(([, c]) => c >= 3);
    if (dominant) {
      cards.push({
        id: `unconscious-pass-${Date.now()}`,
        type: "unconscious_reveal",
        title: "繰り返されるパターン",
        body: `最近、似たタイプの方を${recentPassCount}人連続でpassしています。気づいていましたか？`,
        subtext:
          "繰り返すパターンの中に、あなたが本当に求めているものが隠れています",
        dataPoints: {
          passCount: recentPassCount,
          dominantType: dominant[0],
        },
        significance: 0.8,
      });
    }
  }

  return cards;
}

// =============================================================================
// generateDiscoveryCards (aggregator)
// =============================================================================

export function generateDiscoveryCards(
  stats: CandidateMessageStats[],
  recentPassCount: number,
  recentPassTypes: string[],
): DiscoveryCard[] {
  const all = [
    ...detectBehaviorContrasts(stats),
    ...detectTimePatterns(stats),
    ...detectUnconsciousReveals(recentPassCount, recentPassTypes),
  ];
  // Sort by significance descending, take top 5
  return all.sort((a, b) => b.significance - a.significance).slice(0, 5);
}

// =============================================================================
// Per-conversation Self Insight (発見の深さ v2 — chat-embedded)
// =============================================================================

export type SelfInsightType =
  | "time_pattern"
  | "topic_tendency"
  | "response_rhythm"
  | "emotional_openness"
  | "depth_acceleration";

export type SelfInsight = {
  id: string;
  type: SelfInsightType;
  title: string;
  body: string;
  subtext: string;
  significance: number; // 0-1
};

// ── Word lists ──

const PERSONAL_TOPIC_WORDS = [
  "家族", "過去", "夢", "将来", "子供", "親", "母", "父",
  "兄", "弟", "姉", "妹", "故郷", "思い出", "昔", "幼い", "目標", "希望",
];

const EMOTION_WORDS = [
  "嬉しい", "悲しい", "楽しい", "辛い", "怖い", "寂しい", "幸せ", "不安",
  "好き", "嫌い", "ありがとう", "ごめん", "感謝", "泣", "笑", "怒", "驚",
  "愛", "恋", "心配", "安心", "ドキドキ", "ワクワク", "ほっと", "切ない", "懐かしい",
];

function _selfGetHour(iso: string): number {
  return new Date(iso).getHours();
}

function _selfHourLabel(h: number): string {
  if (h >= 5 && h < 12) return "朝";
  if (h >= 12 && h < 17) return "昼";
  if (h >= 17 && h < 21) return "夕方から夜";
  return "深夜";
}

function _selfPeakHourRange(hours: number[]): { label: string; ratio: number } {
  if (hours.length === 0) return { label: "不明", ratio: 0 };
  const buckets: Record<string, number> = { "朝": 0, "昼": 0, "夕方から夜": 0, "深夜": 0 };
  for (const h of hours) buckets[_selfHourLabel(h)]++;
  const total = hours.length;
  let peak = "朝";
  let max = 0;
  for (const [label, count] of Object.entries(buckets)) {
    if (count > max) { max = count; peak = label; }
  }
  return { label: peak, ratio: max / total };
}

function _selfCountWords(text: string, words: string[]): number {
  let count = 0;
  for (const w of words) {
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

/**
 * Analyze user's messaging patterns within a single conversation.
 * Requires at least 20 messages total in the conversation.
 */
export function analyzeSelfPatterns(
  messages: Array<{ sender_id: string; content: string; created_at: string }>,
  userId: string,
): SelfInsight[] {
  if (messages.length < 20) return [];

  const myMessages = messages.filter((m) => m.sender_id === userId);
  if (myMessages.length < 5) return [];

  const insights: SelfInsight[] = [];

  // 1. Time pattern
  {
    const hours = myMessages.map((m) => _selfGetHour(m.created_at));
    const { label, ratio } = _selfPeakHourRange(hours);
    if (ratio >= 0.45) {
      insights.push({
        id: "self-time",
        type: "time_pattern",
        title: label === "深夜" || label === "夕方から夜" ? "夜に心が開く" : `${label}の対話`,
        body: `この方との会話は、${label}の時間帯に集中しています`,
        subtext: "返信の速さは、心が自然に動く方向を教えてくれます",
        significance: Math.min(1, ratio * 1.2),
      });
    }
  }

  // 2. Topic tendency
  {
    const allText = myMessages.map((m) => m.content).join("");
    const personalCount = _selfCountWords(allText, PERSONAL_TOPIC_WORDS);
    const charCount = allText.length || 1;
    const density = personalCount / (charCount / 100);
    if (density > 0.5) {
      insights.push({
        id: "self-topic",
        type: "topic_tendency",
        title: "過去への扉",
        body: "この方との会話で、あなたは普段より多く過去の話をしています",
        subtext: "安心できる相手にだけ、人は過去を語ります",
        significance: Math.min(1, density / 2),
      });
    }
  }

  // 3. Response rhythm
  {
    const responseTimes: number[] = [];
    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1];
      const curr = messages[i];
      if (prev.sender_id !== userId && curr.sender_id === userId) {
        const diff =
          (new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime()) / 60000;
        if (diff > 0 && diff < 1440) responseTimes.push(diff);
      }
    }
    if (responseTimes.length >= 3) {
      const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      if (avg < 5) {
        const speedLabel = avg < 2 ? Math.round(avg * 60) + "秒" : Math.round(avg) + "分";
        insights.push({
          id: "self-rhythm",
          type: "response_rhythm",
          title: "無意識の優先",
          body: `この方への平均返信速度は${speedLabel}です`,
          subtext: "意識していなくても、心はすでに決めているのかもしれません",
          significance: Math.min(1, (5 - avg) / 5),
        });
      }
    }
  }

  // 4. Emotional openness
  {
    const allText = myMessages.map((m) => m.content).join("");
    const emotionCount = _selfCountWords(allText, EMOTION_WORDS);
    const wordCount = allText.length || 1;
    const emotionDensity = (emotionCount / (wordCount / 100)) * 100;
    if (emotionDensity > 3) {
      const pct = Math.round(emotionDensity);
      insights.push({
        id: "self-emotion",
        type: "emotional_openness",
        title: "感情の解放",
        body: `この方との会話では、感情を表す言葉が${pct}%多く使われています`,
        subtext: "心の鎧を、少しずつ外しているのかもしれません",
        significance: Math.min(1, emotionDensity / 10),
      });
    }
  }

  // 5. Depth acceleration
  {
    const half = Math.floor(myMessages.length / 2);
    const firstHalf = myMessages.slice(0, half);
    const secondHalf = myMessages.slice(half);
    const avgFirst = firstHalf.reduce((s, m) => s + m.content.length, 0) / (firstHalf.length || 1);
    const avgSecond = secondHalf.reduce((s, m) => s + m.content.length, 0) / (secondHalf.length || 1);

    if (avgFirst > 0 && avgSecond > avgFirst * 1.3) {
      const increase = Math.round(((avgSecond - avgFirst) / avgFirst) * 100);
      insights.push({
        id: "self-depth",
        type: "depth_acceleration",
        title: "深まる対話",
        body: `会話が進むにつれ、あなたのメッセージは${increase}%長くなっています`,
        subtext: "言葉が増えるのは、伝えたいことが増えた証拠です",
        significance: Math.min(1, increase / 100),
      });
    }
  }

  return insights;
}
