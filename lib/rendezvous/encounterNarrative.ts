/**
 * Encounter Narrative Generator
 * StyleVoice + trigger_type + category → 詩的一行テンプレート
 * EncounterTheatreの啓示フェーズで表示
 */

import type { RendezvousCategory, EncounterTriggerType } from "./types";

type NarrativeContext = {
  category: RendezvousCategory;
  triggerType: EncounterTriggerType;
  syncPercent: number;
  poeticLine?: string | null;
};

// Trigger type based narrative starters
const TRIGGER_NARRATIVES: Record<EncounterTriggerType, string[]> = {
  physical_proximity: [
    "同じ空気を吸っていた二人の軌道が、ようやく交わる",
    "すれ違いの記憶が、繋がりに変わる瞬間",
  ],
  event_overlap: [
    "同じ瞬間に心を動かした二人が、出会う",
    "共鳴した感性が、互いを見つけ出した",
  ],
  community_overlap: [
    "同じ場所に惹かれた二つの星が、軌道を近づける",
    "共通の世界観が、静かに引き合わせた",
  ],
  place_overlap: [
    "同じ風景を見ていた二人の視線が、ここで交差する",
    "場所の記憶が、二つの存在を結ぶ",
  ],
  schedule_overlap: [
    "時間のリズムが重なる二人の軌道が、収束する",
    "同じ時を刻む二つの星座が、互いを認識する",
  ],
  manual_seed: [
    "特別な接続の可能性が、観測された",
    "稀な共鳴パターンが、二つの軌道に見つかった",
  ],
  system_retest: [
    "再観測が、新しい共鳴を発見した",
    "時間が育てた変化が、新しい接続を生んだ",
  ],
};

// Category-specific closing phrases
const CATEGORY_CLOSINGS: Record<RendezvousCategory, string[]> = {
  romantic: [
    "心の深いところで、何かが共鳴している",
    "まだ言葉にならない何かが、二人の間に流れ始めている",
  ],
  friendship: [
    "自然体でいられる接続が、ここにある",
    "無理のない距離で、確かに繋がっている",
  ],
  cocreation: [
    "二つの異なる視点が、新しい何かを生み出せる",
    "互いの力が、掛け合わさる可能性がある",
  ],
  community: [
    "同じ方向を向く二人の存在が、ここで認識される",
    "緩やかだが確かな繋がりの芽が、見つかった",
  ],
  partner: [
    "人生の航路が、静かに重なり始めている",
    "深い価値観の共鳴が、二人の間に芽生えている",
  ],
};

/**
 * マッチ初表示時の詩的ナラティブを生成
 */
export function generateEncounterNarrative(ctx: NarrativeContext): string {
  // If we have a StyleVoice poetic line, use it directly
  if (ctx.poeticLine) return ctx.poeticLine;

  const triggerLines = TRIGGER_NARRATIVES[ctx.triggerType] ?? TRIGGER_NARRATIVES.system_retest;
  const categoryLines = CATEGORY_CLOSINGS[ctx.category];

  // Deterministic selection based on syncPercent
  const triggerIdx = ctx.syncPercent % triggerLines.length;
  const categoryIdx = Math.floor(ctx.syncPercent / 10) % categoryLines.length;

  // High sync → trigger narrative, lower → category closing
  if (ctx.syncPercent >= 75) {
    return triggerLines[triggerIdx];
  }
  return categoryLines[categoryIdx];
}

/**
 * 啓示フェーズのサブテキスト
 */
export function generateRevealSubtext(
  category: RendezvousCategory,
  syncPercent: number,
): string {
  if (syncPercent >= 85) return "非常に稀な共鳴パターンです";
  if (syncPercent >= 72) return "自然な接続の可能性があります";
  return "新しい発見があるかもしれません";
}
