/**
 * Absence Journal Engine
 * 不在の美学 - ユーザーがいない間のアバターの旅を記録し、
 * 帰還時に詩的な日誌として提示する。
 *
 * 「あなたがいない間も、分身は生きていた。」
 */

import type { JourneyEvent, AvatarEmotion } from "./avatarVitality";

// =============================================================================
// Types
// =============================================================================

export interface JournalEntry {
  period: { start: string; end: string; durationHours: number };
  encounters: number;
  lingeredCount: number;
  narrativeJa: string;
  emotionArc: AvatarEmotion[];
  highlights: { candidateId: string; snippet: string }[];
}

export interface WelcomeBackRitual {
  greeting: string;
  journalSummary: string;
  animationType: "wave" | "bow" | "sparkle";
}

// =============================================================================
// shouldShowJournal
// =============================================================================

export function shouldShowJournal(lastVisit: string | null): boolean {
  if (!lastVisit) return false;
  const diff = Date.now() - new Date(lastVisit).getTime();
  return diff > 24 * 60 * 60 * 1000; // 24h+
}

// =============================================================================
// buildAbsenceJournal
// =============================================================================

export function buildAbsenceJournal(
  events: JourneyEvent[],
  absenceStart: string,
  absenceEnd: string,
): JournalEntry {
  const start = new Date(absenceStart);
  const end = new Date(absenceEnd);
  const durationHours = Math.round(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60),
  );

  const encounters = events.filter(
    (e) => e.eventType === "conversation_started",
  ).length;
  const lingered = events.filter((e) => e.eventType === "lingered").length;
  const emotionArc = events.map((e) => e.emotion);

  const highlights = events
    .filter((e) => e.eventType === "lingered" || e.eventType === "deep_moment")
    .slice(0, 3)
    .map((e) => ({ candidateId: e.candidateId || "", snippet: e.narrative }));

  // Build poetic narrative
  const days = Math.ceil(durationHours / 24);
  let narrative = "";
  if (days <= 1) {
    narrative = `あなたが離れていた一日の間に、分身は静かに世界を見つめていました。${encounters}人の気配を感じましたが、あなたの不在を、少し寂しく思っていたようです。`;
  } else if (days <= 3) {
    narrative = `不在の${days}日間、分身はあなたの代わりに世界を歩きました。${encounters}人と交差し、${lingered}人の前で足を止めました。あなたに伝えたい物語があります。`;
  } else {
    narrative = `長い旅でした。${days}日の間に、分身は${encounters}の光と出会い、${lingered}の特別な瞬間に立ち会いました。あなたがいない世界は、少し色が薄かったけれど、それでも美しい出会いがありました。`;
  }
  if (lingered >= 3) {
    narrative += "分身の心は深く動かされたようです。伝えきれないほどの物語を抱えて、あなたを待っていました。";
  } else if (lingered >= 1) {
    narrative += "特別な何かに出会ったようです。少し興奮した様子で、あなたに話したがっています。";
  }

  return {
    period: { start: absenceStart, end: absenceEnd, durationHours },
    encounters,
    lingeredCount: lingered,
    narrativeJa: narrative,
    emotionArc,
    highlights,
  };
}

// =============================================================================
// generateWelcomeBack
// =============================================================================

export function generateWelcomeBack(
  journal: JournalEntry,
  durationHours: number,
): WelcomeBackRitual {
  let greeting: string;
  let animationType: "wave" | "bow" | "sparkle";

  if (durationHours > 72) {
    greeting = "おかえりなさい。長い間、分身はあなたの帰りを信じて待っていました。";
    animationType = "bow";
  } else if (durationHours > 48) {
    greeting = "おかえりなさい。少し長い旅でしたね。分身が伝えたいことがあります。";
    animationType = "sparkle";
  } else {
    greeting = "おかえりなさい。分身は変わらずあなたを待っていました。";
    animationType = "wave";
  }

  const journalSummary = journal.narrativeJa;
  return { greeting, journalSummary, animationType };
}
