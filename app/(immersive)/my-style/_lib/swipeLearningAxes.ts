// app/my-style/_lib/swipeLearningAxes.ts
// スワイプ学習エンジンの軸定義と型

export type LearningPhase = 1 | 2 | 3 | 4;

export type AxisDefinition = {
  key: string;
  label: string;
  poleALabel: string; // -1 側
  poleBLabel: string; // +1 側
  phase: LearningPhase;
};

export type AxisState = {
  value: number;       // -1.0 ~ +1.0
  confidence: number;  // 0.0 ~ 1.0
  sampleCount: number;
};

export type SwipeHistoryEntry = {
  cardId: string;
  tags: string[];
  direction: "left" | "right" | "up";
  timestamp: string;
};

export type SwipeLearningState = {
  version: 1;
  axes: Record<string, AxisState>;
  currentPhase: LearningPhase;
  totalSwipes: number;
  swipeHistory: SwipeHistoryEntry[]; // 直近50件のみ保持
  tagLikes: Record<string, number>;
  tagDislikes: Record<string, number>;
  styleLaneScores: Record<string, number>;
  lastSwipedAt: string;
  currentContext?: string; // "daily" | "date" | "work" | "play"
  contextAxes?: Record<string, Record<string, AxisState>>; // context → axis key → state
};

// ── Phase 1: 大まかな方向性 (8軸) ─────────────────
// 差が大きいカードを出して大枠を絞る
const PHASE1_AXES: AxisDefinition[] = [
  { key: "casual_mode",       label: "カジュアル ⟷ モード",       poleALabel: "カジュアル",   poleBLabel: "モード",       phase: 1 },
  { key: "kirei_street",      label: "きれいめ ⟷ ストリート",     poleALabel: "きれいめ",     poleBLabel: "ストリート",   phase: 1 },
  { key: "feminine_sharp",    label: "フェミニン ⟷ シャープ",     poleALabel: "フェミニン",   poleBLabel: "シャープ",     phase: 1 },
  { key: "simple_decorative", label: "シンプル ⟷ 装飾的",         poleALabel: "シンプル",     poleBLabel: "装飾的",       phase: 1 },
  { key: "classic_trend",     label: "定番派 ⟷ 流行派",           poleALabel: "定番派",       poleBLabel: "流行派",       phase: 1 },
  { key: "tight_oversized",   label: "タイト ⟷ オーバーサイズ",   poleALabel: "タイト",       poleBLabel: "オーバーサイズ", phase: 1 },
  { key: "warm_cool",         label: "暖色 ⟷ 寒色",               poleALabel: "暖色",         poleBLabel: "寒色",         phase: 1 },
  { key: "minimal_maximal",   label: "シンプル ⟷ 華やか",         poleALabel: "シンプル",     poleBLabel: "華やか",       phase: 1 },
];

// ── Phase 2: 同系統内での精密化 (8軸) ──────────────
const PHASE2_AXES: AxisDefinition[] = [
  { key: "sweet_spicy",           label: "スウィート ⟷ スパイシー",   poleALabel: "スウィート",   poleBLabel: "スパイシー",   phase: 2 },
  { key: "mature_youthful",       label: "大人 ⟷ ヤング",             poleALabel: "大人",         poleBLabel: "ヤング",       phase: 2 },
  { key: "structured_drapey",     label: "ハリ ⟷ とろみ",             poleALabel: "ハリ",         poleBLabel: "とろみ",       phase: 2 },
  { key: "pale_vivid",            label: "淡色 ⟷ ビビッド",           poleALabel: "淡色",         poleBLabel: "ビビッド",     phase: 2 },
  { key: "slim_wide",             label: "スリム ⟷ ワイド",           poleALabel: "スリム",       poleBLabel: "ワイド",       phase: 2 },
  { key: "achromatic_chromatic",  label: "無彩色 ⟷ 有彩色",           poleALabel: "無彩色",       poleBLabel: "有彩色",       phase: 2 },
  { key: "short_long",            label: "ショート丈 ⟷ ロング丈",     poleALabel: "ショート丈",   poleBLabel: "ロング丈",     phase: 2 },
  { key: "light_heavy",           label: "ライト ⟷ ヘビー",           poleALabel: "ライト",       poleBLabel: "ヘビー",       phase: 2 },
];

// ── Phase 3: 微差の学習 (6軸) ──────────────────────
const PHASE3_AXES: AxisDefinition[] = [
  { key: "matte_shiny",        label: "マット ⟷ ツヤ",               poleALabel: "マット",           poleBLabel: "ツヤ",             phase: 3 },
  { key: "natural_synthetic",   label: "天然 ⟷ 合成",                 poleALabel: "天然素材",         poleBLabel: "合成素材",         phase: 3 },
  { key: "high_low_contrast",   label: "高コントラスト ⟷ 低",         poleALabel: "高コントラスト",   poleBLabel: "低コントラスト",   phase: 3 },
  { key: "nukenkan",            label: "抜け感あり ⟷ 隙なし",         poleALabel: "抜け感あり",       poleBLabel: "隙なし",           phase: 3 },
  { key: "season_ss_aw",        label: "SS感 ⟷ AW感",                 poleALabel: "SS感",             poleBLabel: "AW感",             phase: 3 },
  { key: "clean_distressed",    label: "クリーン ⟷ ダメージ",         poleALabel: "クリーン",         poleBLabel: "ダメージ",         phase: 3 },
];

// ── Phase 4: A/B 比較による精密判定 (4軸) ─────────────
const PHASE4_AXES: AxisDefinition[] = [
  { key: "ab_silhouette_prefer",  label: "コンパクト ⟷ ルーズ",         poleALabel: "コンパクト",   poleBLabel: "ルーズ",       phase: 4 },
  { key: "ab_color_strategy",     label: "統一配色 ⟷ コントラスト配色", poleALabel: "統一",         poleBLabel: "コントラスト", phase: 4 },
  { key: "ab_material_priority",  label: "見た目優先 ⟷ 触感優先",       poleALabel: "見た目",       poleBLabel: "触感",         phase: 4 },
  { key: "ab_detail_density",     label: "引き算 ⟷ 足し算",             poleALabel: "引き算",       poleBLabel: "足し算",       phase: 4 },
];

export const AXIS_DEFINITIONS: AxisDefinition[] = [
  ...PHASE1_AXES,
  ...PHASE2_AXES,
  ...PHASE3_AXES,
  ...PHASE4_AXES,
];

export const PHASE_LABELS: Record<LearningPhase, { label: string; desc: string }> = {
  1: { label: "Phase 1: 方向性", desc: "大まかなスタイルの方向を掴みます" },
  2: { label: "Phase 2: 詳細化", desc: "同系統内で細かい好みを探ります" },
  3: { label: "Phase 3: 微調整", desc: "素材感・コントラスト・抜け感を精密化します" },
  4: { label: "Phase 4: A/B比較", desc: "似たアイテムを比較して精密な好みを探ります" },
};

export function getAxesForPhase(phase: LearningPhase): AxisDefinition[] {
  return AXIS_DEFINITIONS.filter((a) => a.phase === phase);
}

export function getAxesUpToPhase(phase: LearningPhase): AxisDefinition[] {
  return AXIS_DEFINITIONS.filter((a) => a.phase <= phase);
}
