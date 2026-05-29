/**
 * Slice 1 — Calendar Outfit Dashboard View-Model 型
 *
 * 設計方針:
 *   - 参照画像 6 section (intro / date+weather+SYNC / 今日の予定 / おすすめコーデ /
 *     提案理由 / ワードローブ分析) の **mock VM**。
 *   - 実 engine (`@/lib/shared/outfitEngine` の TodayProposal / SyncScore / GapAnalysis) を
 *     **写像した独立型**。Slice 1 では engine / `/calendar` / shared type を一切 import しない
 *     (= CEO Slice 1 禁止事項)。Slice 2 で実 VM へ差し替える時の receiver shape を先取りする。
 *   - 「今日の予定」 section の card は **実 anchors から runtime 生成**するため VM には含めない
 *     (= TodayScheduleSection が ExternalAnchor から導出)。
 *
 * 不変原則:
 *   - presentational pure。副作用なし、現在時刻参照なし。
 *   - 警告 metaphor を持ち込まない (= band は色 hint のみ、文言は中立)。
 */

/** SYNC band — 実 engine の SyncScore.band を写像 (excellent / good / caution / risk) */
export type SyncBandKey = "excellent" | "good" | "caution" | "risk";

/**
 * 状態トーン — 値を色分けするための中立的な分類。
 *   good=肯定的 / caution=やや不足 / accent=特筆 / neutral=中立。
 *   「警告」ではなく「気付きの濃淡」。 色 class は _palette に閉じる。
 */
export type CalendarOutfitStatusTone = "good" | "caution" | "accent" | "neutral";

/** 用途バッジのトーン (オフィス向け=violet / カフェ=emerald / ディナー=rose) */
export type CalendarOutfitBadgeTone = "violet" | "emerald" | "rose";

/** 天気サマリー (section ②) */
export interface CalendarOutfitWeatherVM {
  /** 天気 emoji (☀️ ☁️ 🌧️ など) */
  icon: string;
  /** 天気ラベル (晴れ / 曇り / 雨 など) */
  label: string;
  /** 最高気温 °C */
  tempMax: number;
  /** 最低気温 °C */
  tempMin: number;
  /** 降水確率 0-100 */
  pop: number;
}

/** SYNC スコア表示 (section ②、薄いピル) */
export interface CalendarOutfitSyncVM {
  /** 0-100 */
  score: number;
  bandKey: SyncBandKey;
  /** 最適 / 良好 / 注意 / 要調整 */
  bandLabel: string;
}

/**
 * アイテムのシルエット形 (section ④ flat-lay の SVG silhouette 種別)。
 * 実アイテム画像が無い Slice 1 では、この形 + color で SVG プレースホルダーを描く。
 */
export type CalendarOutfitItemShape =
  | "top" // ニット / カットソー
  | "blouse" // ブラウス / シャツ
  | "bottom" // パンツ / スラックス
  | "skirt" // スカート
  | "outer" // ジャケット / 羽織り
  | "shoes" // スニーカー / フラット
  | "heels" // ヒール / パンプス
  | "bag" // バッグ
  | "watch"; // 腕時計 / 小物

/** コーデ 1 点を構成するアイテム (section ④ card 内) */
export interface CalendarOutfitItemVM {
  id: string;
  /** トップス / ボトムス / アウター など */
  category: string;
  /** アイテム名 */
  label: string;
  /** flat-lay silhouette の形 */
  shape: CalendarOutfitItemShape;
  /** silhouette の塗り色 (hex) */
  color: string;
  /** 任意の emoji hint */
  emoji?: string;
}

/** おすすめコーデ 1 枚 (section ④ carousel card) */
export interface CalendarOutfitProposalVM {
  id: string;
  /** カード見出し (きれいめオフィス / スマートカジュアル など) */
  title: string;
  items: ReadonlyArray<CalendarOutfitItemVM>;
  /** 0-100 */
  syncScore: number;
  syncBandKey: SyncBandKey;
  /** ムードタグ (任意、きれいめ / リラックス など) */
  moodTag?: string;
  /** 用途バッジ (任意、オフィス向け / カフェ作業に最適 / ディナーにおすすめ) */
  badge?: { label: string; tone: CalendarOutfitBadgeTone };
}

/** 提案理由の主要因子 1 つ (section ⑤、icon + label + value の横並び) */
export interface CalendarOutfitReasonFactor {
  id: string;
  /** 絵文字アイコン */
  icon: string;
  /** ラベル (気温 / 移動量 / 環境 / 予定 / 気分) */
  label: string;
  /** 値 (26° 快適 / やや多め / リラックス など) */
  value: string;
  /** 値の色トーン (任意) */
  tone?: CalendarOutfitStatusTone;
}

/** 提案理由 (section ⑤) */
export interface CalendarOutfitReasonVM {
  headline: string;
  body: string;
  /** 主要因子 (section ⑤ の主役、icon + label + value を横並び) */
  factors: ReadonlyArray<CalendarOutfitReasonFactor>;
  /** 判断軸チップ (実 engine の AxisChip を写像、body と共に詳細開示内) */
  axisChips: ReadonlyArray<{ label: string }>;
}

/** ワードローブ分析の stat 1 枚 (section ⑥、5 枚) */
export interface CalendarOutfitStatVM {
  id: string;
  label: string;
  value: string;
  caption?: string;
  /** 絵文字アイコン (任意、small card 上部) */
  icon?: string;
  /** 値の色トーン (任意) */
  tone?: CalendarOutfitStatusTone;
}

/** Calendar Outfit Dashboard 全体の VM (mock) */
export interface CalendarOutfitVM {
  /** section ① intro 文 */
  intro: string;
  /** section ② 天気 */
  weather: CalendarOutfitWeatherVM;
  /** section ② SYNC */
  sync: CalendarOutfitSyncVM;
  /** section ④ コーデ carousel (通常 3 枚) */
  proposals: ReadonlyArray<CalendarOutfitProposalVM>;
  /** section ⑤ 提案理由 */
  reason: CalendarOutfitReasonVM;
  /** section ⑥ ワードローブ分析 (5 枚) */
  wardrobeStats: ReadonlyArray<CalendarOutfitStatVM>;
}

/**
 * section ③ 「今日の予定」 card の VM。
 * 実 ExternalAnchor から TodayScheduleSection 内で導出される (= mock VM には含めない)。
 */
export interface CalendarOutfitScheduleItemVM {
  id: string;
  /** "HH:MM" */
  time: string;
  title: string;
  /** 場所カテゴリ由来の絵文字アイコン (🏠 🏢 ☕ など) */
  icon: string;
  /** 場所主名 (任意) */
  location?: string;
  /** 場所 hover 用 full label (任意) */
  locationFull?: string;
  /** 固定予定か (rigidity === "hard") */
  rigid: boolean;
}
