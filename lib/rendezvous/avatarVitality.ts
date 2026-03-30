"use strict";

export type AvatarEmotion = 'curious' | 'excited' | 'hesitant' | 'contemplative' | 'delighted' | 'resting';
export type JourneyEventType = 'conversation_started' | 'lingered' | 'excited' | 'hesitated' | 'explored' | 'deep_moment' | 'returned';

export interface JourneyEvent {
  id: string;
  eventType: JourneyEventType;
  emotion: AvatarEmotion;
  narrative: string;
  candidateId?: string;
  timeSlot: string;
  createdAt: string;
}

export interface AvatarVitalityState {
  currentEmotion: AvatarEmotion;
  activityPulse: number;  // 0..1
  recentEvents: JourneyEvent[];
  encountersSoFar: number;
  lingerCount: number;
}

// Compute emotion from recent events
export function computeAvatarEmotion(events: JourneyEvent[]): AvatarEmotion {
  if (events.length === 0) return 'resting';
  const recent = events.slice(0, 5);
  const typeCount: Record<string, number> = {};
  for (const e of recent) {
    typeCount[e.eventType] = (typeCount[e.eventType] || 0) + 1;
  }
  if (typeCount['deep_moment'] && typeCount['deep_moment'] >= 2) return 'contemplative';
  if (typeCount['excited'] && typeCount['excited'] >= 2) return 'excited';
  if (typeCount['lingered'] && typeCount['lingered'] >= 2) return 'delighted';
  if (typeCount['hesitated'] && typeCount['hesitated'] >= 2) return 'hesitant';
  if (typeCount['explored'] && typeCount['explored'] >= 2) return 'curious';
  // Default from most recent event
  const latest = recent[0];
  const emotionMap: Record<JourneyEventType, AvatarEmotion> = {
    conversation_started: 'curious',
    lingered: 'delighted',
    excited: 'excited',
    hesitated: 'hesitant',
    explored: 'curious',
    deep_moment: 'contemplative',
    returned: 'delighted',
  };
  return emotionMap[latest.eventType] || 'curious';
}

// Generate Japanese narrative for a journey event
export function generateJourneyNarrative(
  eventType: JourneyEventType,
  metadata: Record<string, unknown> = {}
): string {
  const count = (metadata.encounterCount as number) || 0;
  const name = (metadata.displayName as string) || '';

  const narratives: Record<JourneyEventType, string[]> = {
    conversation_started: [
      '新しい光の粒が、分身の視界に入りました',
      'ある人の気配に、分身が顔を上げました',
      `${count}人目の出会いの予感がしています`,
      '見知らぬ星の引力を感じています',
      '世界がほんの少し、明るくなりました',
    ],
    lingered: [
      `${name ? name + 'の前で' : ''}時間が止まったように、立ち止まっています`,
      '何か懐かしいものを感じているようです',
      '立ち去れずにいます。この引力は、特別なものかもしれません',
      'この方の言葉に、分身の心が揺れています',
      '離れがたい何かを、ここに見つけたようです',
    ],
    excited: [
      '分身の鼓動が、少し速くなりました',
      '何かを見つけたようです。目が輝いています',
      '思わず身を乗り出しています',
      'この出会いに、特別な予感を感じています',
      '心の奥で、小さな花火が上がりました',
    ],
    hesitated: [
      '少し迷っているようです。慎重に見定めています',
      '立ち止まり、自分の心に問いかけています',
      '一歩を踏み出すべきか、静かに考えています',
      '何かが引っかかっているようです',
      '直感と理性の間で、揺れています',
    ],
    explored: [
      '広い世界を、好奇心を携えて歩いています',
      '新しい方向へ、一歩を踏み出しました',
      `これまでに${count}人の星々と交差しました`,
      '未知の道を、恐れることなく進んでいます',
      '風の向くまま、次の出会いへ向かっています',
    ],
    deep_moment: [
      '言葉の奥にある何かに、分身が触れました',
      'この瞬間を、分身は忘れないでしょう',
      '心の深い場所で、共鳴が起きています',
      '静かだけれど、とても大切な時間が流れています',
      '魂の一部が、そっと開かれました',
    ],
    returned: [
      'あなたのもとに、旅の記憶を携えて戻りました',
      '旅を終え、静かに微笑んでいます',
      '探索の果てに、大切なものを見つけたようです',
      '帰り道は、来た道より少し明るく見えました',
      'おかえりなさいの言葉を、分身も待っていました',
    ],
  };

  const options = narratives[eventType] || ['何かを感じています'];
  // Use a deterministic pick based on count to avoid randomness issues
  return options[count % options.length] || options[0];
}

// Compute activity pulse (0..1) — higher when avatar is more active
export function computeActivityPulse(events: JourneyEvent[]): number {
  if (events.length === 0) return 0.1;
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const recentCount = events.filter(
    e => now - new Date(e.createdAt).getTime() < oneHour
  ).length;
  return Math.min(1, 0.1 + recentCount * 0.15);
}

// Build full vitality state from events
export function buildVitalityState(events: JourneyEvent[]): AvatarVitalityState {
  return {
    currentEmotion: computeAvatarEmotion(events),
    activityPulse: computeActivityPulse(events),
    recentEvents: events.slice(0, 10),
    encountersSoFar: events.filter(e => e.eventType === 'conversation_started').length,
    lingerCount: events.filter(e => e.eventType === 'lingered').length,
  };
}
