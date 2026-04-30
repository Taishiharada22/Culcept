/**
 * Daily Mode の mock 文脈 (preview 用)
 *
 * 正本: Core UX v1.1 §2.1 (3 Presence Mode 定義) / §2.2 (役割の中心)
 *       UI spec §4.3 Daily 列 (各 S の Daily 差分)
 *
 * 規約 (layout plan §4.5):
 *   - 通常モードと UI 構造を共有 (DailyMode.tsx は外枠差分のみ)
 *   - v1.1 §2.3「Daily/Travel は昇格モード」原則: Daily 単独起動 preview ではなく、
 *     通常 → Daily 昇格を mock 切替で表現
 *   - v1.1 §11.5「何でも Daily/Travel にしない」: 起動条件を明示 signal に限定
 */

export interface DailyContextMock {
  /** 今日の予定（mock） */
  todaySchedule: ReadonlyArray<{ time: string; label: string }>;
  /** 今日の出来事の整理（mock） */
  todayEvents: ReadonlyArray<{ tag: string; summary: string }>;
  /** Daily 文脈ヒントラベル (S5 で本文カード先頭に表示、UI spec §5.8) */
  contextHintLabel: string;
  /** Daily スコープ告知 (S2 で本文カード冒頭に表示、UI spec §5.5) */
  scopeAnnouncement: string;
}

export const DAILY_CONTEXT_MOCK: DailyContextMock = {
  todaySchedule: [
    { time: "10:00", label: "朝の打ち合わせ" },
    { time: "12:30", label: "昼食 (一緒に外食)" },
    { time: "15:00", label: "買い物 (週末準備)" },
    { time: "19:00", label: "夕食 (家)" },
  ],
  todayEvents: [
    { tag: "気持ち", summary: "朝の会話で少しすれ違いがあった" },
    { tag: "予定", summary: "夕方の買い物の優先順位を整理したい" },
  ],
  contextHintLabel: "◇ 今日のスケジュール見ながら",
  scopeAnnouncement: "今日の話で入るよ",
};
