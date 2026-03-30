/**
 * Absence Tracker
 * 不在の美学 - ユーザー不在期間のナラティブを生成する
 *
 * 「あなたがいない間も、分身はあなたを探し続けていました。」
 */

// =============================================================================
// Types
// =============================================================================

export type AbsenceJournal = {
  title: string;
  duration: string;
  entries: string[];
  closingLine: string;
};

// =============================================================================
// Duration Formatting
// =============================================================================

function formatDuration(hours: number): string {
  if (hours < 6) return `${Math.round(hours)}時間`; // N時間 (short)
  if (hours < 24) return `約${Math.round(hours)}時間`; // 約N時間
  const days = Math.floor(hours / 24);
  const remaining = Math.round(hours % 24);
  if (remaining < 2) return `${days}日間`; // N日間
  return `${days}日と${remaining}時間`; // N日とM時間
}

// =============================================================================
// generateAbsenceNarrative
// =============================================================================

export function generateAbsenceNarrative(
  absentHours: number,
  events: {
    crossed: number;
    lingered: number;
    newConstellation: number;
  },
): AbsenceJournal {
  const title = "\u5206\u8EAB\u306E\u65C5\u65E5\u8A8C"; // 分身の旅日誌
  const duration = formatDuration(absentHours);

  const entries: string[] = [];

  // Always add the first line about crossed encounters
  entries.push(
    `\u3042\u306A\u305F\u306E\u4E0D\u5728\u306E${duration}\u306B\u3001\u5206\u8EAB\u306F${events.crossed}\u4EBA\u3068\u4EA4\u5DEE\u3057\u307E\u3057\u305F`,
  ); // あなたの不在の{duration}に、分身は{crossed}人と交差しました

  if (events.lingered > 0) {
    entries.push(
      `${events.lingered}\u4EBA\u306E\u524D\u3067\u7ACB\u3061\u6B62\u307E\u308A\u307E\u3057\u305F`,
    ); // {lingered}人の前で立ち止まりました
  }

  if (events.newConstellation > 0) {
    entries.push(
      `${events.newConstellation}\u3064\u306E\u65B0\u3057\u3044\u661F\u5EA7\u306E\u5146\u3057\u3092\u898B\u3064\u3051\u307E\u3057\u305F`,
    ); // {newConstellation}つの新しい星座の兆しを見つけました
  }

  // Closing line based on duration
  let closingLine: string;
  const days = absentHours / 24;

  if (days < 2) {
    closingLine =
      "\u77ED\u3044\u4E0D\u5728\u3067\u3082\u3001\u4E16\u754C\u306F\u52D5\u304D\u7D9A\u3051\u3066\u3044\u307E\u3057\u305F";
    // 短い不在でも、世界は動き続けていました
  } else if (days <= 5) {
    closingLine =
      "\u3042\u306A\u305F\u304C\u3044\u306A\u3044\u9593\u3082\u3001\u5206\u8EAB\u306F\u3042\u306A\u305F\u3092\u63A2\u3057\u7D9A\u3051\u3066\u3044\u307E\u3057\u305F";
    // あなたがいない間も、分身はあなたを探し続けていました
  } else {
    closingLine =
      "\u9577\u3044\u65C5\u3067\u3057\u305F\u3002\u3067\u3082\u3001\u5206\u8EAB\u306F\u305A\u3063\u3068\u3053\u3053\u306B\u3044\u307E\u3057\u305F";
    // 長い旅でした。でも、分身はずっとここにいました
  }

  return { title, duration, entries, closingLine };
}
