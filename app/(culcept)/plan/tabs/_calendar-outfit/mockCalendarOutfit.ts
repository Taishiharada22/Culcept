/**
 * Slice 1 — Calendar Outfit Dashboard mock data
 *
 * CEO Slice 1 制約:
 *   - AI 呼び出し / DB / weather 実取得 / generateTodayProposal 実呼び出しは禁止。
 *   - ここは **完全に静的・決定論的な mock**。乱数・現在時刻・I/O を使わない。
 *   - Slice 2 で `@/lib/shared/outfitEngine` の generateTodayProposal 結果 → VM 変換に差し替える。
 *
 * 文言規約:
 *   - 「おすすめ」 は section 見出しで使うが、これは観測アプリの提案 UI 慣習に沿う表示語。
 *     (CalendarTab.tsx 本体には載らない。child file 内に閉じる。)
 *   - 警告・危険・最適化 等の煽り語は使わない。
 *
 * 色 hex は silhouette の塗り用 (落ち着いた中間色)。 警告色は使わない。
 */

import type { CalendarOutfitVM } from "./types";

/** Slice 1 固定 mock VM (決定論的、 副作用なし) */
export const MOCK_CALENDAR_OUTFIT_VM: CalendarOutfitVM = {
  intro:
    "今日のあなたの予定と空模様から、しっくりくる装いをそっと並べてみました。",

  weather: {
    icon: "☀️",
    label: "晴れ",
    tempMax: 26,
    tempMin: 18,
    pop: 10,
  },

  sync: {
    score: 84,
    bandKey: "good",
    bandLabel: "良好",
  },

  // 中央 (index 1) を主役にする想定で並べる。
  proposals: [
    {
      id: "mock-outfit-office",
      title: "きれいめオフィス",
      moodTag: "きちんと感",
      badge: { label: "オフィス向け", tone: "violet" },
      syncScore: 79,
      syncBandKey: "good",
      items: [
        { id: "of-blouse", category: "トップス", label: "オフホワイト ブラウス", shape: "blouse", color: "#f1ede6" },
        { id: "of-bottom", category: "ボトムス", label: "ネイビー スラックス", shape: "bottom", color: "#3b4a63" },
        { id: "of-outer", category: "アウター", label: "グレージュ ジャケット", shape: "outer", color: "#a89e93" },
        { id: "of-heels", category: "シューズ", label: "ベージュ パンプス", shape: "heels", color: "#c8b6a3" },
        { id: "of-bag", category: "バッグ", label: "レザー トート", shape: "bag", color: "#6b5848" },
      ],
    },
    {
      id: "mock-outfit-smart",
      title: "スマートカジュアル",
      moodTag: "リラックス",
      badge: { label: "カフェ作業に最適", tone: "emerald" },
      syncScore: 84,
      syncBandKey: "good",
      items: [
        { id: "sc-top", category: "トップス", label: "ライトベージュ ニット", shape: "top", color: "#e3d6c3" },
        { id: "sc-bottom", category: "ボトムス", label: "アイボリー ワイドパンツ", shape: "bottom", color: "#ddd3c4" },
        { id: "sc-shoes", category: "シューズ", label: "ホワイト スニーカー", shape: "shoes", color: "#eceae6" },
        { id: "sc-bag", category: "バッグ", label: "キャメル ショルダー", shape: "bag", color: "#b08850" },
        { id: "sc-watch", category: "小物", label: "シルバー ウォッチ", shape: "watch", color: "#b9c0c9" },
      ],
    },
    {
      id: "mock-outfit-feminine",
      title: "大人フェミニン",
      moodTag: "やわらか",
      badge: { label: "ディナーにおすすめ", tone: "rose" },
      syncScore: 76,
      syncBandKey: "good",
      items: [
        { id: "fm-blouse", category: "トップス", label: "ローズベージュ ブラウス", shape: "blouse", color: "#dcc4bd" },
        { id: "fm-skirt", category: "ボトムス", label: "モカ フレアスカート", shape: "skirt", color: "#8a6f5e" },
        { id: "fm-outer", category: "アウター", label: "ライト カーディガン", shape: "outer", color: "#cdbfae" },
        { id: "fm-heels", category: "シューズ", label: "ダーク ヒール", shape: "heels", color: "#5a4a44" },
        { id: "fm-bag", category: "バッグ", label: "ミニ ハンドバッグ", shape: "bag", color: "#9a7b6a" },
      ],
    },
  ],

  reason: {
    headline: "晴れて暖かい一日。カフェ作業にもなじむ、軽やかなきれいめに。",
    body:
      "最高 26°C と暖かく、日中の移動もやや多め。会議が 1 件あるためきちんと感を残しつつ、午後のカフェ作業ではリラックスできる軽さを優先しました。最近の着用から少し離れたニュアンスカラーでまとめています。",
    factors: [
      { id: "rf-temp", icon: "🌡️", label: "気温", value: "26° 快適", tone: "good" },
      { id: "rf-move", icon: "🚶", label: "移動量", value: "やや多め", tone: "caution" },
      { id: "rf-place", icon: "☕", label: "環境", value: "カフェ作業", tone: "neutral" },
      { id: "rf-tpo", icon: "🤝", label: "予定", value: "会議あり", tone: "accent" },
      { id: "rf-mood", icon: "🎨", label: "気分", value: "ニュアンス", tone: "accent" },
    ],
    axisChips: [
      { label: "気温に対応" },
      { label: "TPO: 会議 + カフェ" },
      { label: "最近未着用の色" },
      { label: "手持ちで完結" },
    ],
  },

  wardrobeStats: [
    { id: "stat-top", icon: "👕", label: "トップス", value: "余裕あり", tone: "good" },
    { id: "stat-bottom", icon: "👖", label: "ボトムス", value: "良好", tone: "good" },
    { id: "stat-rain", icon: "☔", label: "防水アイテム", value: "やや不足", tone: "caution" },
    { id: "stat-walk", icon: "👟", label: "歩きやすさ", value: "良好", tone: "good" },
    { id: "stat-color", icon: "🎨", label: "カラー相性", value: "とても良い", tone: "accent" },
  ],
};
