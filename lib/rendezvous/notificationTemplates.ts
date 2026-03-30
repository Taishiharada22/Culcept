/**
 * Rendezvous通知テンプレートエンジン
 * カテゴリ×理由コード×トリガー種別×時間帯で文面生成
 */

import type { RendezvousCategory, ReasonCode, EncounterTriggerType } from "./types";

type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

function getTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h < 6) return "night";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

const CATEGORY_LABELS: Record<RendezvousCategory, string> = {
  romantic: "恋愛",
  friendship: "友情",
  cocreation: "共創",
  community: "コミュニティ",
  partner: "パートナー",
};

// ── New Candidate Templates ──

const NEW_CANDIDATE_BY_TRIGGER: Partial<Record<EncounterTriggerType, string[]>> = {
  event_overlap: [
    "同じBattleに心が動いた二人。分身が交差の意味を見つけました",
    "同じ瞬間に反応した二人の分身が、軌道上で交差しました",
  ],
  community_overlap: [
    "同じTribeの中で、分身同士が静かに交差しました",
    "共有する空間の中で、二つの軌道が重なりました",
  ],
  schedule_overlap: [
    "性格の共鳴が検出されました。分身が新しい交差を見つけています",
    "深い部分で響き合う相手の分身が、軌道上に現れました",
  ],
  manual_seed: [
    "新しい交差が届きました",
  ],
  system_retest: [
    "以前すれ違った相手と、新しい交差が見つかりました",
  ],
};

const NEW_CANDIDATE_BY_CATEGORY: Record<RendezvousCategory, string[]> = {
  romantic: [
    "あなたの分身が、特別な交差を見つけたようです",
    "軌道の先に、心が動く出会いの予感があります",
  ],
  friendship: [
    "気の合いそうな分身が、軌道上に現れました",
    "自然体でいられる相手の分身が、近くにいます",
  ],
  cocreation: [
    "あなたの共創パートナーになれる人と、軌道が重なりました",
    "一緒に何かを生み出せる相手が、交差点に立っています",
  ],
  community: [
    "緩やかだけど確かな繋がりが、軌道上に見つかりました",
    "心地よいペースで繋がれる相手が現れました",
  ],
  partner: [
    "価値観が深く響き合う相手の分身が、軌道上に現れました",
    "人生を共に歩める可能性のある交差が見つかりました",
  ],
};

const TIME_PREFIXES: Record<TimeOfDay, string[]> = {
  morning: ["おはようございます。", "朝の静けさの中で、"],
  afternoon: ["", "午後の光の中、"],
  evening: ["", "夕暮れの中、"],
  night: ["夜の静寂の中で、", ""],
};

// ── Mutual Like Templates ──

const MUTUAL_TEMPLATES: Record<RendezvousCategory, string[]> = {
  romantic: [
    "二つの分身が、互いを選びました。接続が開きます",
    "軌道の交差が、対話の入口に変わりました",
  ],
  friendship: [
    "互いの分身が共鳴しました。会話が始まります",
    "心地よい交差が、対話の扉を開きました",
  ],
  cocreation: [
    "創造のパートナーとの接続が成立しました",
    "互いの分身が、共創の可能性を見つけました",
  ],
  community: [
    "分身同士の接触が、穏やかな接続に変わりました",
    "緩やかだけど確かな接続が成立しました",
  ],
  partner: [
    "互いの分身が、人生のパートナーとしての共鳴を見つけました",
    "深い価値観で結ばれた接続が成立しました",
  ],
};

// ── Reason Code Flavor ──

const REASON_FLAVORS: Partial<Record<ReasonCode, string>> = {
  conversation_pace_close: "会話のリズムが合いそう",
  distance_preference_aligned: "距離感の好みが似ている",
  depth_speed_aligned: "深まるペースが合いそう",
  emotional_temperature_close: "感情の温度感が近い",
  complementary_roles: "互いの役割が補い合える",
  stable_connection_potential: "安定した繋がりの可能性",
  light_connection_potential: "軽やかな接続の可能性",
  creative_role_fit: "クリエイティブな相性が良い",
};

// ── Public API ──

export function generateNewCandidateNotification(
  category: RendezvousCategory,
  triggerType?: EncounterTriggerType,
  reasonCodes?: ReasonCode[],
): { title: string; body: string } {
  const tod = getTimeOfDay();
  const prefix = pick(TIME_PREFIXES[tod]);

  // Try trigger-specific first
  let body: string;
  if (triggerType && NEW_CANDIDATE_BY_TRIGGER[triggerType]) {
    body = pick(NEW_CANDIDATE_BY_TRIGGER[triggerType]!);
  } else {
    body = pick(NEW_CANDIDATE_BY_CATEGORY[category]);
  }

  // Add reason flavor if available
  let suffix = "";
  if (reasonCodes && reasonCodes.length > 0) {
    const flavor = REASON_FLAVORS[reasonCodes[0]];
    if (flavor) suffix = ` — ${flavor}`;
  }

  return {
    title: `新しい${CATEGORY_LABELS[category]}の交差`,
    body: `${prefix}${body}${suffix}`,
  };
}

export function generateMutualLikeNotification(
  category: RendezvousCategory,
): { title: string; body: string } {
  return {
    title: "接続が開きました",
    body: pick(MUTUAL_TEMPLATES[category]),
  };
}

export function generateReminderNotification(
  category: RendezvousCategory,
  count: number,
): { title: string; body: string } {
  return {
    title: `${count}件の交差が待っています`,
    body: `分身が見つけた${CATEGORY_LABELS[category]}の交差があります。軌道を確認しませんか？`,
  };
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
