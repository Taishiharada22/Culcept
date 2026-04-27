/**
 * Travel Mode の mock 文脈 (preview 用、L1-f)
 *
 * 正本: Core UX v1.1 §2.1 (3 Presence Mode 定義) / §2.3 (昇格モード原則)
 *       UI spec §4.3 Travel 列 (各 S の Travel 差分) / §5.3-5.11 Travel 列差分
 *
 * 規約 (layout plan §4.6):
 *   - 通常モードと UI 構造を共有 (TravelMode.tsx は外枠差分のみ)
 *   - v1.1 §2.3「Daily/Travel は昇格モード」原則: Travel 単独起動 preview ではなく、
 *     通常 → Travel 昇格を mock 切替で表現
 *   - v1.1 §11.5「何でも Daily/Travel にしない」: 起動条件は明示 signal
 *     (例: 複数日の外出検出、手動切替) に限定。昇格閾値は §9.3.2 保留論点
 *
 * 旅程 / 行先 / 旅プラン整理の mock。S5/S7 Travel で参照される。
 */

export interface TravelContextMock {
  /** 旅行先（mock） */
  destination: string;
  /** 旅程（mock、複数日） */
  itinerary: ReadonlyArray<{ day: string; label: string }>;
  /** 旅プラン整理メモ（mock） */
  planNotes: ReadonlyArray<{ tag: string; summary: string }>;
  /** Travel 文脈ヒントラベル (S5 で本文カード先頭に表示、UI spec §5.8 / §4.3.6) */
  contextHintLabel: string;
  /** Travel スコープ告知 (S2 で本文カード冒頭に表示、UI spec §5.5 / §4.3.3) */
  scopeAnnouncement: string;
  /** S5 片側フォーカス降格時の説明（preview 上の補助ラベル、UI spec §4.3.6 / §5.8） */
  focusSideDemotionNote: string;
  /** S7 F-2 主の Brief タイトル (UI spec §4.3.8 / §5.10 Travel 列) */
  briefTitle: string;
  /** S7 F-1 副次同伴 1 行 (独立カード化禁止、提案カード内最終行、§7.10) */
  f1AccompanyLine: string;
}

export const TRAVEL_CONTEXT_MOCK: TravelContextMock = {
  destination: "京都",
  itinerary: [
    { day: "Day 1", label: "移動 + 宿チェックイン (夕方)" },
    { day: "Day 2", label: "嵐山 + 夜は静かめに" },
    { day: "Day 3", label: "市内散策 + 夕方帰路" },
  ],
  planNotes: [
    { tag: "ペース", summary: "Day 2 の朝はゆっくり (前日移動疲れ想定)" },
    { tag: "温度差", summary: "歩く距離の希望にややズレあり" },
    { tag: "主導権", summary: "計画はたいし主導、現地アレンジはみさき" },
  ],
  contextHintLabel: "◆ 複数日で考えると",
  scopeAnnouncement: "旅行の話で入るよ",
  focusSideDemotionNote:
    "片側フォーカスは下段に降格中（計画の一貫性を前面化）。関係シグナル明確時は前面化に再昇格",
  briefTitle: "◆ 旅プラン整理:",
  f1AccompanyLine: "— 二人のペース差を抱えつつ進む前提で —",
};
